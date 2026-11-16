import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempestAuth, type TempestAuth } from "../auth/create-tempest-auth";
import { TempestApiError } from "./errors";
import {
    createLocalUploadStorage,
    createResumableUpload,
    ResumableUploadSupersededError,
    uploadFingerprint,
} from "./resumable-upload";

interface Seen {
    method: string;
    url: string;
    authorization: string | undefined;
    idempotencyKey: string | undefined;
}

type Auth = TempestAuth<{ id: string }, { email: string; password: string }>;

/**
 * A tus server reached through an `XMLHttpRequest` double: creation answers
 * `Location: /api/uploads/<n>`, `HEAD` the offset it holds, `PATCH` advances
 * it — unless `failPatchAt` names the PATCH (1-based) that answers `500`.
 * `beforePatch` runs as each PATCH is sent, so a test can act mid-run;
 * `beforeHead` and `beforePost` do the same for the probe and the creation,
 * and `refusePost` makes the creation answer `403` with an error envelope.
 */
class TusDouble {
    seen: Seen[] = [];
    offsets = new Map<string, number>();
    created = 0;
    patches = 0;
    failPatchAt: number | null = null;
    beforePatch: ((n: number) => Promise<void> | void) | null = null;
    beforeHead: (() => Promise<void> | void) | null = null;
    beforePost: (() => Promise<void> | void) | null = null;
    refusePost = false;
}

/**
 * Stub `XMLHttpRequest` with a double that answers from `server`.
 *
 * @param server - The tus double the requests reach.
 */
function installXhr(server: TusDouble): void {
    class FakeXhr {
        private method = "";
        private target = "";
        private headers: Record<string, string> = {};
        status = 0;
        responseText = "";
        withCredentials = false;
        upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        private reply: Record<string, string> = {};

        open(method: string, url: string): void {
            this.method = method;
            this.target = url;
        }
        setRequestHeader(name: string, value: string): void {
            this.headers[name] = value;
        }
        getResponseHeader(name: string): string | null {
            const found = Object.entries(this.reply).find(
                ([key]) => key.toLowerCase() === name.toLowerCase(),
            );
            return found ? found[1] : null;
        }
        abort(): void {
            this.onabort?.();
        }
        send(body?: Blob): void {
            server.seen.push({
                method: this.method,
                url: this.target,
                authorization: this.headers.Authorization,
                idempotencyKey: this.headers["Idempotency-Key"],
            });
            void (async () => {
                let status = 204;
                if (this.method === "POST" && server.refusePost) {
                    await server.beforePost?.();
                    status = 403;
                    this.responseText = JSON.stringify({ detail: "Cota de A esgotada." });
                } else if (this.method === "POST") {
                    await server.beforePost?.();
                    server.created += 1;
                    const location = `/api/uploads/${server.created}`;
                    server.offsets.set(`http://localhost:3000${location}`, 0);
                    status = 201;
                    this.reply = { Location: location };
                } else if (this.method === "HEAD") {
                    await server.beforeHead?.();
                    status = 200;
                    this.reply = {
                        "Upload-Offset": String(server.offsets.get(this.target) ?? 0),
                    };
                } else if (this.method === "PATCH") {
                    server.patches += 1;
                    await server.beforePatch?.(server.patches);
                    if (server.patches === server.failPatchAt) {
                        status = 500;
                    } else {
                        const next = (server.offsets.get(this.target) ?? 0) + (body?.size ?? 0);
                        server.offsets.set(this.target, next);
                        this.reply = { "Upload-Offset": String(next) };
                    }
                }
                this.status = status;
                this.onload?.();
            })();
        }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

/**
 * An auth backend for two accounts whose refresh rotates the access token.
 *
 * @returns A fetcher for `createTempestAuth`.
 */
function authBackend(): typeof fetch {
    let rotations = 0;
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const body = init?.body ? (JSON.parse(String(init.body)) as { email?: string }) : {};
        if (path === "/api/auth/login") {
            const who = body.email === "b@x.test" ? "B" : "A";
            return json({ access_token: `${who}-tok-1`, refresh_token: `${who}-ref` });
        }
        rotations += 1;
        return json({ access_token: `A-tok-r${rotations}`, refresh_token: "A-ref" });
    }) as unknown as typeof fetch;
}

const file = new File([new Uint8Array(12)], "nota.webm", { lastModified: 1 });

describe("createResumableUpload — getToken from createTempestAuth binds to its session", () => {
    let auth: Auth;
    let tus: TusDouble;

    beforeEach(async () => {
        localStorage.clear();
        auth = createTempestAuth({ baseURL: "https://api.example.com", fetcher: authBackend() });
        await auth.login({ email: "a@x.test", password: "x" });
        tus = new TusDouble();
        installXhr(tus);
    });

    afterEach(() => {
        auth.dispose();
        vi.unstubAllGlobals();
    });

    async function abandonFirstChunk(getToken: () => string | null): Promise<void> {
        tus.failPatchAt = 2;
        await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken,
            retry: { shouldRetry: () => false },
        })
            .start()
            .catch(() => undefined);
        tus.failPatchAt = null;
    }

    it("resumes after a token rotation instead of starting over", async () => {
        await abandonFirstChunk(auth.getToken);
        await auth.refresh();
        expect(auth.getToken()).toBe("A-tok-r1");
        tus.seen = [];

        const result = await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: auth.getToken,
        }).start();

        expect(result?.url).toBe("http://localhost:3000/api/uploads/1");
        expect(tus.seen[0]).toMatchObject({ method: "HEAD", authorization: "Bearer A-tok-r1" });
        expect(tus.seen.filter((request) => request.method === "POST")).toEqual([]);
    });

    it("does not adopt the record of the session before the switch", async () => {
        await abandonFirstChunk(auth.getToken);
        await auth.login({ email: "b@x.test", password: "x" });
        tus.seen = [];

        await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: auth.getToken,
        }).start();

        expect(tus.seen.filter((request) => request.url.endsWith("/api/uploads/1"))).toEqual([]);
        expect(tus.seen[0]).toMatchObject({ method: "POST", authorization: "Bearer B-tok-1" });
    });

    it("stops a run before B's token reaches A's upload when the tab switches mid-run", async () => {
        tus.beforePatch = async (n) => {
            if (n === 1) await auth.login({ email: "b@x.test", password: "x" });
        };

        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file,
                chunkSize: 4,
                getToken: auth.getToken,
            }).start(),
        ).rejects.toBeInstanceOf(ResumableUploadSupersededError);

        const toUpload = tus.seen.filter((request) => request.url.endsWith("/api/uploads/1"));
        expect(toUpload.map((request) => request.authorization)).not.toContain("Bearer B-tok-1");
    });

    it("keeps binding to the token for a getter that only wraps auth.getToken", async () => {
        await abandonFirstChunk(() => auth.getToken());
        await auth.refresh();
        tus.seen = [];

        await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: () => auth.getToken(),
        }).start();

        expect(tus.seen[0]).toMatchObject({ method: "POST" });
        expect(
            await createLocalUploadStorage().get(uploadFingerprint("/api/uploads", file)),
        ).toBeNull();
    });
});

/**
 * #561 (C2), as audit run-8 reproduced it: account A restored from the refresh
 * cookie (no `login()`), left an upload bound by `getToken: auth.getToken`
 * half-done and signed out; account B, restored the same way, picked the same
 * file. Both sessions answered `sessionKey()` `"unlineaged"`, so B's first
 * request was a `HEAD` to A's upload URL with B's bearer. Failed against
 * ca630df.
 */
describe("createResumableUpload — sessions restored by refresh() do not share uploads", () => {
    let tus: TusDouble;
    const cookie = { owner: "A" };
    let issued = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/refresh") {
            issued += 1;
            return json({ access_token: `${cookie.owner}-tok-${issued}` });
        }
        return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    beforeEach(() => {
        localStorage.clear();
        cookie.owner = "A";
        tus = new TusDouble();
        installXhr(tus);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("does not resume A's upload for B when both were restored from the cookie (C2)", async () => {
        const auth: Auth = createTempestAuth({
            baseURL: "https://api.example.com",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.refresh();
        tus.failPatchAt = 2;
        await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: auth.getToken,
            retry: { shouldRetry: () => false },
        })
            .start()
            .catch(() => undefined);
        tus.failPatchAt = null;
        await auth.logout();
        cookie.owner = "B";
        await auth.refresh();
        tus.seen = [];

        await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: auth.getToken,
        }).start();

        expect(tus.seen.filter((request) => request.url.endsWith("/api/uploads/1"))).toEqual([]);
        expect(tus.seen[0]).toMatchObject({
            method: "POST",
            authorization: `Bearer B-tok-${issued}`,
        });
        auth.dispose();
    });
});

/**
 * #579, as audit run-9 reproduced it: account A was restored from the refresh
 * cookie and left an upload half-done; account B's sign-in replaced the cookie
 * without A logging out, and the next `refresh()` counted B's token as a
 * rotation of A. Same lineage, same key, so B resumed A's upload: `HEAD` to
 * A's URL with B's bearer. Failed against 8e18770.
 */
describe("createResumableUpload — a refresh that redeems another account does not resume its upload", () => {
    let tus: TusDouble;
    const cookie = { owner: "A" };
    let issued = 0;

    function jwtOf(sub: string, n: number): string {
        const encode = (value: unknown): string =>
            btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
        return `${encode({ alg: "HS256" })}.${encode({ sub, n })}.sig`;
    }

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/refresh") {
            issued += 1;
            return json({ access_token: jwtOf(cookie.owner, issued) });
        }
        return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    beforeEach(() => {
        localStorage.clear();
        cookie.owner = "A";
        tus = new TusDouble();
        installXhr(tus);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("starts a new upload for B instead of sending B's bearer to A's upload URL (#579)", async () => {
        const auth: Auth = createTempestAuth({
            baseURL: "https://api.example.com",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.refresh();
        tus.failPatchAt = 2;
        await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: auth.getToken,
            retry: { shouldRetry: () => false },
        })
            .start()
            .catch(() => undefined);
        tus.failPatchAt = null;
        cookie.owner = "B";
        await auth.refresh();
        tus.seen = [];

        await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: auth.getToken,
        }).start();

        expect(tus.seen.filter((request) => request.url.endsWith("/api/uploads/1"))).toEqual([]);
        expect(tus.seen[0]).toMatchObject({
            method: "POST",
            authorization: `Bearer ${jwtOf("B", issued)}`,
        });
        auth.dispose();
    });
});

/**
 * #642, audit run-15 §7: a tus answer of account A that lands after the session
 * moved to B. The chunk loop checked the session before each request, never
 * when an answer arrived, so A's error envelope reached B's `catch`, a probe
 * answered after the switch let the creation go out with B's bearer and A's
 * `Idempotency-Key`, and A's record — upload URL and key — stayed in B's
 * storage. Failed against b3b9337.
 */
describe("createResumableUpload — an answer of the session before the switch (#642)", () => {
    let auth: Auth;
    let tus: TusDouble;
    const recordKey = uploadFingerprint("/api/uploads", file);

    beforeEach(async () => {
        localStorage.clear();
        auth = createTempestAuth({ baseURL: "https://api.example.com", fetcher: authBackend() });
        await auth.login({ email: "a@x.test", password: "x" });
        tus = new TusDouble();
        installXhr(tus);
    });

    afterEach(() => {
        auth.dispose();
        vi.unstubAllGlobals();
    });

    function upload(chunkSize = 4) {
        return createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize,
            getToken: auth.getToken,
            retry: { shouldRetry: () => false },
        });
    }

    it("rejects A's refused chunk that lands after login(B) with the supersession, not A's envelope", async () => {
        tus.failPatchAt = 1;
        tus.beforePatch = async () => {
            await auth.login({ email: "b@x.test", password: "x" });
        };

        const outcome = upload()
            .start()
            .catch((error: unknown) => error);

        expect(await outcome).toBeInstanceOf(ResumableUploadSupersededError);
    });

    it("rejects A's refused creation that lands after login(B)", async () => {
        tus.refusePost = true;
        tus.beforePost = async () => {
            await auth.login({ email: "b@x.test", password: "x" });
        };

        const outcome = await upload()
            .start()
            .catch((error: unknown) => error);

        expect(outcome).toBeInstanceOf(ResumableUploadSupersededError);
        expect(outcome).not.toBeInstanceOf(TempestApiError);
    });

    it("does not complete A's upload as B, and forgets A's record, when the last chunk lands after the switch", async () => {
        tus.beforePatch = async () => {
            await auth.login({ email: "b@x.test", password: "x" });
        };

        await expect(upload(12).start()).rejects.toBeInstanceOf(ResumableUploadSupersededError);

        expect(await createLocalUploadStorage().get(recordKey)).toBeNull();
    });

    it("stops instead of creating as B with A's Idempotency-Key when the probe lands after the switch", async () => {
        tus.failPatchAt = 2;
        await upload()
            .start()
            .catch(() => undefined);
        tus.failPatchAt = null;
        const keyOfA = (await createLocalUploadStorage().get(recordKey))?.idempotencyKey;
        expect(keyOfA).toBeTruthy();
        tus.seen = [];
        tus.beforeHead = async () => {
            tus.beforeHead = null;
            await auth.login({ email: "b@x.test", password: "x" });
        };

        await expect(upload().start()).rejects.toBeInstanceOf(ResumableUploadSupersededError);

        expect(tus.seen.filter((request) => request.method === "POST")).toEqual([]);
        expect(tus.seen.map((request) => request.idempotencyKey)).not.toContain(keyOfA);
        expect(await createLocalUploadStorage().get(recordKey)).toBeNull();
    });

    it("keeps a record B wrote under the same key", async () => {
        tus.beforePatch = async (n) => {
            if (n !== 1) return;
            await auth.login({ email: "b@x.test", password: "x" });
            await createLocalUploadStorage().set(recordKey, {
                url: "http://localhost:3000/api/uploads/of-B",
                offset: 0,
                size: file.size,
                idempotencyKey: "key-of-B",
                updatedAt: 1,
            });
        };

        await expect(upload().start()).rejects.toBeInstanceOf(ResumableUploadSupersededError);

        expect((await createLocalUploadStorage().get(recordKey))?.idempotencyKey).toBe("key-of-B");
    });

    /**
     * Security audit run-16 (deferred unit): `abort({ discard: true })` on a
     * handle kept from before the switch sent the tus `DELETE` with the bearer
     * of whoever is signed in now and deleted the record under the file
     * fingerprint without checking whose it was — the default key is the same
     * for the same file, so it could be B's own resume record.
     */
    async function abandonedHandleOfA() {
        tus.failPatchAt = 2;
        const handle = upload();
        await handle.start().catch(() => undefined);
        tus.failPatchAt = null;
        tus.seen = [];
        return handle;
    }

    it("does not send the discarding DELETE with B's bearer from A's handle after the switch", async () => {
        const handle = await abandonedHandleOfA();
        await auth.login({ email: "b@x.test", password: "x" });

        await handle.abort({ discard: true });

        expect(tus.seen.filter((request) => request.method === "DELETE")).toEqual([]);
        expect(await createLocalUploadStorage().get(recordKey)).toBeNull();
    });

    it("keeps B's record under the same key when A's handle discards after the switch", async () => {
        const handle = await abandonedHandleOfA();
        await auth.login({ email: "b@x.test", password: "x" });
        await createLocalUploadStorage().set(recordKey, {
            url: "http://localhost:3000/api/uploads/of-B",
            offset: 0,
            size: file.size,
            idempotencyKey: "key-of-B",
            updatedAt: 1,
        });

        await handle.abort({ discard: true });

        expect((await createLocalUploadStorage().get(recordKey))?.idempotencyKey).toBe("key-of-B");
        expect(tus.seen.filter((request) => request.method === "DELETE")).toEqual([]);
    });

    it("still discards on the server and locally while the same session is signed in", async () => {
        const handle = await abandonedHandleOfA();

        await handle.abort({ discard: true });

        expect(tus.seen.filter((request) => request.method === "DELETE")).toEqual([
            expect.objectContaining({ authorization: "Bearer A-tok-1" }),
        ]);
        expect(await createLocalUploadStorage().get(recordKey)).toBeNull();
    });

    it("still finishes an anonymous upload", async () => {
        await auth.logout();

        const result = await createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
        }).start();

        expect(result?.size).toBe(12);
        expect(tus.seen.every((request) => request.authorization === undefined)).toBe(true);
    });
});
