import { afterEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "./errors";
import { createResumableUpload, type ResumableUpload } from "./resumable-upload";

/**
 * How many requests a test lets the client send before it stops the run from
 * outside. Without the fix the loop never ends on its own (#569 measured
 * more than 1500 requests in 4 s), so the cap is what keeps a regression a
 * failing test instead of a hung one.
 */
const REQUEST_CAP = 60;

/** One request the double saw. */
interface Seen {
    method: string;
    headers: Record<string, string>;
}

/**
 * A tus server whose `PATCH` answers `204` but never moves the offset: it
 * echoes back whatever `Upload-Offset` it was sent, the way the `303` case of
 * #568's measurement did (the redirect turned the chunk into a body-less `GET`
 * answered `200` with the same offset).
 */
class StalledServer {
    seen: Seen[] = [];
    handle: ResumableUpload | null = null;
    /** Status of the stalled `PATCH` answer. */
    patchStatus = 204;
    /** The real offset the server holds, for `HEAD`. */
    held = 0;

    answer(method: string, headers: Record<string, string>, _bodySize: number): Reply {
        this.seen.push({ method, headers });
        if (method === "POST") return { status: 201, headers: { Location: "/api/uploads/abc" } };
        if (method === "HEAD")
            return { status: 200, headers: { "Upload-Offset": String(this.held) } };
        return {
            status: this.patchStatus,
            headers: { "Upload-Offset": headers["Upload-Offset"] ?? "0" },
        };
    }

    count(method: string): number {
        return this.seen.filter((request) => request.method === method).length;
    }
}

interface Reply {
    status: number;
    headers: Record<string, string>;
}

let server: StalledServer;

/** Stub `XMLHttpRequest` with a double bound to the current {@link server}. */
function installXhr(): void {
    class FakeXhr {
        private method = "";
        private headers: Record<string, string> = {};
        private reply: Record<string, string> = {};
        private aborted = false;
        status = 0;
        responseText = "";
        withCredentials = false;
        upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;

        open(method: string): void {
            this.method = method;
        }
        setRequestHeader(name: string, value: string): void {
            this.headers[name] = value;
        }
        getResponseHeader(name: string): string | null {
            return this.reply[name] ?? null;
        }
        abort(): void {
            this.aborted = true;
            this.onabort?.();
        }
        send(body?: Blob): void {
            const reply = server.answer(this.method, this.headers, body?.size ?? 0);
            if (server.seen.length >= REQUEST_CAP) server.handle?.pause();
            queueMicrotask(() => {
                if (this.aborted) return;
                this.status = reply.status;
                this.reply = reply.headers;
                this.onload?.();
            });
        }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

/**
 * Start an upload of `size` bytes against the current {@link server}.
 *
 * @param retries - The `retry.retries` option.
 * @returns The settled outcome: the error it rejected with, or `"resolved"`.
 */
async function run(retries: number | undefined, size = 8): Promise<unknown> {
    installXhr();
    const handle = createResumableUpload({
        endpoint: "/api/uploads",
        file: new Blob([new Uint8Array(size)]),
        chunkSize: 4,
        storage: null,
        retry: retries === undefined ? { initialDelay: 0 } : { retries, initialDelay: 0 },
    });
    server.handle = handle;
    try {
        await handle.start();
        return "resolved";
    } catch (error) {
        return error;
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createResumableUpload — a write the server confirms without moving the offset (#569)", () => {
    it("rejects with UPLOAD_OFFSET_STALLED after one PATCH when retries is 0, instead of looping", async () => {
        server = new StalledServer();
        const outcome = await run(0);

        expect(server.seen.length, "requests sent before the run settled").toBeLessThan(
            REQUEST_CAP,
        );
        expect(isApiError(outcome)).toBe(true);
        expect(outcome).toMatchObject({ status: 204, code: "UPLOAD_OFFSET_STALLED" });
        expect(server.count("PATCH")).toBe(1);
    });

    it("spends the retry budget on it — one PATCH per attempt, each after a HEAD resync — then rejects", async () => {
        server = new StalledServer();
        const outcome = await run(3);

        expect(outcome).toMatchObject({ code: "UPLOAD_OFFSET_STALLED" });
        expect(server.count("PATCH")).toBe(3);
        expect(server.count("HEAD")).toBe(2);
    });

    it("is bounded by the default retry budget too", async () => {
        server = new StalledServer();
        const outcome = await run(undefined);

        expect(outcome).toMatchObject({ code: "UPLOAD_OFFSET_STALLED" });
        expect(server.count("PATCH")).toBe(5);
    });

    it("treats a 200 answer with the same offset the same way", async () => {
        server = new StalledServer();
        server.patchStatus = 200;
        const outcome = await run(0);

        expect(outcome).toMatchObject({ status: 200, code: "UPLOAD_OFFSET_STALLED" });
    });

    it("treats an offset that went backwards as stalled too", async () => {
        server = new StalledServer();
        server.answer = (method, headers, bodySize): Reply => {
            server.seen.push({ method, headers });
            if (method === "POST")
                return { status: 201, headers: { Location: "/api/uploads/abc" } };
            const sent = Number(headers["Upload-Offset"]);
            const next = sent === 0 ? bodySize : sent - 2;
            return { status: 204, headers: { "Upload-Offset": String(next) } };
        };

        const outcome = await run(0);

        expect(outcome).toMatchObject({ code: "UPLOAD_OFFSET_STALLED" });
        expect(server.count("PATCH")).toBe(2);
    });

    it("recovers when the resync finds the server did take the bytes", async () => {
        server = new StalledServer();
        const original = server.answer.bind(server);
        let patches = 0;
        server.answer = (method, headers, bodySize): Reply => {
            if (method === "PATCH" && ++patches === 1) return original(method, headers, bodySize);
            if (method === "PATCH") {
                const next = Number(headers["Upload-Offset"]) + bodySize;
                server.held = next;
                server.seen.push({ method, headers });
                return { status: 204, headers: { "Upload-Offset": String(next) } };
            }
            return original(method, headers, bodySize);
        };

        const outcome = await run(5);

        expect(outcome).toBe("resolved");
        expect(server.count("HEAD")).toBe(1);
    });

    it("still accepts a partial write that moved the offset forward", async () => {
        server = new StalledServer();
        server.answer = (method, headers, bodySize): Reply => {
            server.seen.push({ method, headers });
            if (method === "POST")
                return { status: 201, headers: { Location: "/api/uploads/abc" } };
            const next = Number(headers["Upload-Offset"]) + Math.min(bodySize, 1);
            return { status: 204, headers: { "Upload-Offset": String(next) } };
        };

        const outcome = await run(0);

        expect(outcome).toBe("resolved");
        expect(server.count("PATCH")).toBe(8);
    });
});
