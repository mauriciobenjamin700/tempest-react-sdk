import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createLocalUploadStorage,
    createResumableUpload,
    type ResumableUpload,
} from "./resumable-upload";

/** One request the double saw. */
interface Seen {
    method: string;
    url: string;
    authorization: string | undefined;
    idempotencyKey: string | undefined;
}

/**
 * A tus server reached through an `XMLHttpRequest` double: creation answers
 * `Location: /api/uploads/<n>`, `HEAD` the offset it holds, `PATCH` advances
 * it. `beforePatch` runs as each `PATCH` is sent, so a test can act mid-run.
 */
class TusDouble {
    seen: Seen[] = [];
    offsets = new Map<string, number>();
    created = 0;
    patches = 0;
    beforePatch: ((n: number) => void) | null = null;
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
            queueMicrotask(() => {
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
                    server.beforePatch?.(server.patches);
                    const next = (server.offsets.get(this.target) ?? 0) + (body?.size ?? 0);
                    server.offsets.set(this.target, next);
                    this.reply = { "Upload-Offset": String(next) };
                }
                this.status = status;
                this.onload?.();
            });
        }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

const file = new File([new Uint8Array(12)], "report.pdf", {
    type: "application/pdf",
    lastModified: 1,
});

let server: TusDouble;

beforeEach(() => {
    localStorage.clear();
    server = new TusDouble();
    installXhr(server);
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

/**
 * Run `upload` as account A until its first chunk lands, pause it there, and
 * end A's session the way the docs tell `onSessionEnd` to:
 * `createLocalUploadStorage().clear()`.
 *
 * @param upload - The handle A started.
 * @returns A's upload URL and `Idempotency-Key`, and the requests made after
 *   the session ended.
 */
async function pauseAsAThenEndSession(upload: ResumableUpload): Promise<{
    urlOfA: string;
    keyOfA: string | undefined;
    afterEnd: () => Seen[];
}> {
    server.beforePatch = (n) => {
        if (n === 1) upload.pause();
    };
    await upload.start();
    server.beforePatch = null;
    const urlOfA = "http://localhost:3000/api/uploads/1";
    const keyOfA = server.seen.find((request) => request.method === "POST")?.idempotencyKey;
    createLocalUploadStorage().clear();
    const seen = server.seen.length;
    return { urlOfA, keyOfA, afterEnd: () => server.seen.slice(seen) };
}

describe("createResumableUpload — clear() ends the session for handles already attached (#528)", () => {
    /**
     * A session the SDK cannot see — an HttpOnly cookie, no `getToken`, no
     * `getPrincipal` — has `clear()` in `onSessionEnd` as its only teardown.
     * It deleted the records and stopped runs in flight, but a handle paused
     * before it kept A's `Idempotency-Key` in memory: B's `resume()` created
     * the upload with it, which an idempotency store not scoped by caller
     * answers with A's upload. Failed on c16aae0: B's `POST` carried A's key.
     */
    it("draws a new Idempotency-Key for a paused cookie-session handle after clear()", async () => {
        const upload = createResumableUpload({ endpoint: "/api/uploads", file, chunkSize: 4 });
        const { urlOfA, keyOfA, afterEnd } = await pauseAsAThenEndSession(upload);

        await upload.resume();

        const requests = afterEnd();
        expect(requests[0]?.method).toBe("POST");
        expect(requests[0]?.idempotencyKey).not.toBe(keyOfA);
        expect(requests.filter((request) => request.url === urlOfA)).toEqual([]);
    });

    it("draws a new Idempotency-Key for a paused token-bound handle after clear() and a switch", async () => {
        let token = "tok-A";
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getToken: () => token,
        });
        const { urlOfA, keyOfA, afterEnd } = await pauseAsAThenEndSession(upload);
        token = "tok-B";

        await upload.resume();

        const requests = afterEnd();
        expect(requests[0]).toMatchObject({ method: "POST", authorization: "Bearer tok-B" });
        expect(requests[0]?.idempotencyKey).not.toBe(keyOfA);
        expect(requests.filter((request) => request.url === urlOfA)).toEqual([]);
    });

    it("draws a new Idempotency-Key for a paused principal-bound handle after clear()", async () => {
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file,
            chunkSize: 4,
            getPrincipal: () => "user-1",
        });
        const { keyOfA, afterEnd } = await pauseAsAThenEndSession(upload);

        await upload.resume();

        expect(afterEnd()[0]?.idempotencyKey).not.toBe(keyOfA);
    });

    it("still resumes a paused handle with its own key when nothing was cleared", async () => {
        const upload = createResumableUpload({ endpoint: "/api/uploads", file, chunkSize: 4 });
        server.beforePatch = (n) => {
            if (n === 1) upload.pause();
        };
        await upload.start();
        server.beforePatch = null;
        const seen = server.seen.length;

        await expect(upload.resume()).resolves.toMatchObject({
            url: "http://localhost:3000/api/uploads/1",
        });

        const requests = server.seen.slice(seen);
        expect(requests[0]).toMatchObject({
            method: "HEAD",
            url: "http://localhost:3000/api/uploads/1",
        });
        expect(server.created).toBe(1);
    });

    it("finishes the new upload B started after clear() under B's own record", async () => {
        const upload = createResumableUpload({ endpoint: "/api/uploads", file, chunkSize: 4 });
        await pauseAsAThenEndSession(upload);

        await expect(upload.resume()).resolves.toMatchObject({
            url: "http://localhost:3000/api/uploads/2",
            size: 12,
        });
        expect(localStorage.length).toBe(0);
    });
});
