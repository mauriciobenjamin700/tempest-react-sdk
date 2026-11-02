import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempestAuth, type TempestAuth } from "../auth/create-tempest-auth";
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
}

type Auth = TempestAuth<{ id: string }, { email: string; password: string }>;

/**
 * A tus server reached through an `XMLHttpRequest` double: creation answers
 * `Location: /api/uploads/<n>`, `HEAD` the offset it holds, `PATCH` advances
 * it — unless `failPatchAt` names the PATCH (1-based) that answers `500`.
 * `beforePatch` runs as each PATCH is sent, so a test can act mid-run.
 */
class TusDouble {
    seen: Seen[] = [];
    offsets = new Map<string, number>();
    created = 0;
    patches = 0;
    failPatchAt: number | null = null;
    beforePatch: ((n: number) => Promise<void> | void) | null = null;
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
            });
            void (async () => {
                let status = 204;
                if (this.method === "POST") {
                    server.created += 1;
                    const location = `/api/uploads/${server.created}`;
                    server.offsets.set(`http://localhost:3000${location}`, 0);
                    status = 201;
                    this.reply = { Location: location };
                } else if (this.method === "HEAD") {
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
