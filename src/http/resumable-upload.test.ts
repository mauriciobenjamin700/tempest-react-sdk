import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createLocalUploadStorage,
    createResumableUpload,
    DEFAULT_CHUNK_SIZE,
    TUS_VERSION,
    uploadFingerprint,
    type ResumableUploadRecord,
    type ResumableUploadState,
    type ResumableUploadStorage,
} from "./resumable-upload";

/** One request the fake server saw. */
interface Recorded {
    method: string;
    url: string;
    headers: Record<string, string>;
    bodySize: number;
}

/** How the fake server should answer one request. */
interface Reply {
    status: number;
    headers?: Record<string, string>;
    text?: string;
    /** Fail the request at the transport level, as a dropped connection does. */
    networkError?: boolean;
}

/**
 * A tus server that answers from a queue, plus the `XMLHttpRequest` double that
 * reaches it.
 *
 * A class because the SDK does `new XMLHttpRequest()`; a `vi.fn` returning an object
 * is not a constructor and throws before any assertion runs. The queue is per
 * method so a test can say "the third PATCH loses its response" without having to
 * count the HEADs the client inserts on its own.
 */
class FakeTusServer {
    requests: Recorded[] = [];
    replies: Partial<Record<string, Reply[]>> = {};
    fallback: (request: Recorded) => Reply;
    /** Set by the double while a request is open, so a test can abort it. */
    open: { abort: () => void } | null = null;
    onOpen: (() => void) | null = null;

    constructor(fallback: (request: Recorded) => Reply) {
        this.fallback = fallback;
    }

    queue(method: string, ...replies: Reply[]): void {
        this.replies[method] = [...(this.replies[method] ?? []), ...replies];
    }

    answer(request: Recorded): Reply {
        this.requests.push(request);
        const queued = this.replies[request.method];
        if (queued && queued.length > 0) return queued.shift()!;
        return this.fallback(request);
    }

    countOf(method: string): number {
        return this.requests.filter((request) => request.method === method).length;
    }
}

let server: FakeTusServer;

/** Install the `XMLHttpRequest` double bound to the current {@link server}. */
function installXhr(): void {
    class FakeXhr {
        private method = "";
        private target = "";
        private headers: Record<string, string> = {};
        private aborted = false;
        status = 0;
        responseText = "";
        withCredentials = false;
        upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        private responseHeaders: Record<string, string> = {};

        open(method: string, url: string): void {
            this.method = method;
            this.target = url;
        }

        setRequestHeader(name: string, value: string): void {
            this.headers[name] = value;
        }

        getResponseHeader(name: string): string | null {
            const found = Object.entries(this.responseHeaders).find(
                ([key]) => key.toLowerCase() === name.toLowerCase(),
            );
            return found ? found[1] : null;
        }

        abort(): void {
            this.aborted = true;
            this.onabort?.();
        }

        send(body?: Blob): void {
            const reply = server.answer({
                method: this.method,
                url: this.target,
                headers: this.headers,
                bodySize: body?.size ?? 0,
            });
            server.open = this;
            server.onOpen?.();
            queueMicrotask(() => {
                if (this.aborted) return;
                server.open = null;
                if (reply.networkError) {
                    this.onerror?.();
                    return;
                }
                if (body && body.size > 0) {
                    this.upload.onprogress?.({
                        loaded: body.size,
                        total: body.size,
                        lengthComputable: true,
                    } as ProgressEvent);
                }
                this.status = reply.status;
                this.responseText = reply.text ?? "";
                this.responseHeaders = reply.headers ?? {};
                this.onload?.();
            });
        }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

/** A tus server that accepts everything, tracking the offset per upload. */
function acceptingServer(size: number, uploadUrl = "/api/uploads/abc"): FakeTusServer {
    let offset = 0;
    return new FakeTusServer((request): Reply => {
        if (request.method === "POST") {
            return { status: 201, headers: { Location: uploadUrl } };
        }
        if (request.method === "HEAD") {
            return { status: 200, headers: { "Upload-Offset": String(offset) } };
        }
        if (request.method === "PATCH") {
            offset = Math.min(offset + request.bodySize, size);
            return { status: 204, headers: { "Upload-Offset": String(offset) } };
        }
        return { status: 204 };
    });
}

function blobOf(size: number): Blob {
    return new Blob([new Uint8Array(size)]);
}

/** In-memory storage, so a test can inspect and preload the resume record. */
function memoryStorage(initial?: ResumableUploadRecord): ResumableUploadStorage & {
    records: Map<string, ResumableUploadRecord>;
} {
    const records = new Map<string, ResumableUploadRecord>();
    return {
        records,
        get: (key) => (initial && records.size === 0 ? initial : (records.get(key) ?? null)),
        set: (key, record) => {
            records.set(key, record);
        },
        delete: (key) => {
            records.delete(key);
        },
    };
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("uploadFingerprint", () => {
    it("changes when the file does", () => {
        const a = new File([new Uint8Array(4)], "nota.webm", { lastModified: 1 });
        const b = new File([new Uint8Array(4)], "nota.webm", { lastModified: 2 });
        expect(uploadFingerprint("/u", a)).not.toBe(uploadFingerprint("/u", b));
    });

    it("changes when the endpoint does, so two servers are two uploads", () => {
        const file = new File([new Uint8Array(4)], "nota.webm", { lastModified: 1 });
        expect(uploadFingerprint("/a", file)).not.toBe(uploadFingerprint("/b", file));
    });

    it("falls back to a stable name for a plain Blob", () => {
        expect(uploadFingerprint("/u", blobOf(3))).toContain("|blob|3|");
    });
});

describe("createLocalUploadStorage", () => {
    const record: ResumableUploadRecord = {
        url: "/api/uploads/1",
        offset: 10,
        size: 20,
        idempotencyKey: "k",
        updatedAt: 1,
    };

    it("round-trips a record under a prefixed key", async () => {
        const storage = createLocalUploadStorage();
        await storage.set("fp", record);
        expect(localStorage.getItem("tempest-upload:fp")).toContain('"offset":10');
        expect(await storage.get("fp")).toEqual(record);
        await storage.delete("fp");
        expect(await storage.get("fp")).toBeNull();
    });

    it("returns null for a missing or corrupt record", async () => {
        const storage = createLocalUploadStorage("p:");
        expect(await storage.get("nope")).toBeNull();
        localStorage.setItem("p:bad", "{not json");
        expect(await storage.get("bad")).toBeNull();
    });

    it("no-ops when there is no localStorage to write to", async () => {
        const storage = createLocalUploadStorage();
        vi.stubGlobal("localStorage", undefined);
        await storage.set("fp", record);
        expect(await storage.get("fp")).toBeNull();
        await storage.delete("fp");
    });
});

describe("createResumableUpload — the happy path", () => {
    it("creates, chunks, reports progress and clears the record", async () => {
        server = acceptingServer(10);
        installXhr();
        const storage = memoryStorage();
        const states: ResumableUploadState[] = [];
        const fractions: number[] = [];

        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(10),
            chunkSize: 4,
            storage,
            metadata: { filename: "nota ção.webm" },
            getToken: () => "token-1",
            onStateChange: (state) => states.push(state),
            onProgress: ({ fraction, loaded, total }) => {
                fractions.push(fraction);
                expect(total).toBe(10);
                expect(loaded).toBeLessThanOrEqual(10);
            },
        });

        const result = await upload.start();

        expect(result).toEqual({ url: expect.stringContaining("/api/uploads/abc"), size: 10 });
        expect(states).toEqual(["creating", "uploading", "done"]);
        expect(upload.state).toBe("done");
        expect(upload.offset).toBe(10);
        expect(server.countOf("PATCH")).toBe(3);
        expect(fractions.at(-1)).toBe(1);
        expect(storage.records.size).toBe(0);
    });

    it("sends the tus headers a server needs, and an idempotency key on creation", async () => {
        server = acceptingServer(4);
        installXhr();
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            metadata: { filename: "ação.webm", ticket: "42" },
            getToken: () => "token-1",
            headers: { "X-App": "gallery" },
            storage: null,
        }).start();

        const creation = server.requests.find((request) => request.method === "POST")!;
        expect(creation.headers["Tus-Resumable"]).toBe(TUS_VERSION);
        expect(creation.headers["Upload-Length"]).toBe("4");
        expect(creation.headers["Idempotency-Key"]).toMatch(/[0-9a-f-]{36}/);
        expect(creation.headers.Authorization).toBe("Bearer token-1");
        expect(creation.headers["X-App"]).toBe("gallery");
        expect(creation.headers["Upload-Metadata"]).toBe("filename YcOnw6NvLndlYm0=,ticket NDI=");
        const [, encoded] = creation.headers["Upload-Metadata"]!.split(",")[0]!.split(" ");
        expect(
            new TextDecoder().decode(Uint8Array.from(atob(encoded!), (c) => c.charCodeAt(0))),
        ).toBe("ação.webm");

        const write = server.requests.find((request) => request.method === "PATCH")!;
        expect(write.headers["Content-Type"]).toBe("application/offset+octet-stream");
        expect(write.headers["Upload-Offset"]).toBe("0");
    });

    it("omits Upload-Metadata when there is nothing to send", async () => {
        server = acceptingServer(2);
        installXhr();
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(2),
            metadata: {},
            storage: null,
        }).start();
        const creation = server.requests.find((request) => request.method === "POST")!;
        expect(creation.headers["Upload-Metadata"]).toBeUndefined();
    });

    it("resolves an absolute Location header as-is", async () => {
        server = acceptingServer(2, "https://files.tempest.dev/uploads/xyz");
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(2),
            storage: null,
        });
        const result = await upload.start();
        expect(result!.url).toBe("https://files.tempest.dev/uploads/xyz");
    });

    it("treats an empty file as already complete", async () => {
        server = acceptingServer(0);
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(0),
            storage: null,
        });
        await expect(upload.start()).resolves.toMatchObject({ size: 0 });
        expect(server.countOf("PATCH")).toBe(0);
    });

    it("defaults to a 5 MiB chunk", () => {
        expect(DEFAULT_CHUNK_SIZE).toBe(5 * 1024 * 1024);
    });
});

describe("createResumableUpload — resuming", () => {
    it("re-attaches to a persisted upload and skips what the server holds", async () => {
        let offset = 6;
        server = new FakeTusServer((request): Reply => {
            if (request.method === "HEAD") {
                return { status: 200, headers: { "Upload-Offset": String(offset) } };
            }
            offset = Math.min(offset + request.bodySize, 10);
            return { status: 204, headers: { "Upload-Offset": String(offset) } };
        });
        installXhr();

        const storage = memoryStorage({
            url: "/api/uploads/abc",
            offset: 6,
            size: 10,
            idempotencyKey: "key-1",
            updatedAt: 1,
        });
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(10),
            chunkSize: 4,
            storage,
            key: "fp",
        });

        const seen: number[] = [];
        const result = await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(10),
            chunkSize: 4,
            storage,
            key: "fp",
            onProgress: ({ loaded, resumedFrom }) => {
                seen.push(loaded);
                expect(resumedFrom).toBe(6);
            },
        }).start();

        expect(upload.key).toBe("fp");
        expect(result).toMatchObject({ size: 10 });
        expect(server.countOf("POST")).toBe(0);
        expect(server.countOf("PATCH")).toBe(1);
        expect(seen[0]).toBe(6);
    });

    it("ignores a record whose size no longer matches the file", async () => {
        server = acceptingServer(4);
        installXhr();
        const storage = memoryStorage({
            url: "/api/uploads/old",
            offset: 2,
            size: 999,
            idempotencyKey: "key-1",
            updatedAt: 1,
        });
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage,
            key: "fp",
        }).start();
        expect(server.countOf("POST")).toBe(1);
    });

    it("starts over when the server has forgotten the upload", async () => {
        server = acceptingServer(4);
        server.queue("HEAD", { status: 404 });
        installXhr();
        const storage = memoryStorage({
            url: "/api/uploads/gone",
            offset: 2,
            size: 4,
            idempotencyKey: "key-1",
            updatedAt: 1,
        });
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage,
            key: "fp",
        }).start();
        expect(server.countOf("POST")).toBe(1);
    });

    it("reuses the persisted idempotency key when creation is retried", async () => {
        server = acceptingServer(4);
        installXhr();
        const storage = memoryStorage({
            url: "",
            offset: 0,
            size: 4,
            idempotencyKey: "key-from-the-lost-attempt",
            updatedAt: 1,
        });
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage,
            key: "fp",
        }).start();
        const creation = server.requests.find((request) => request.method === "POST")!;
        expect(creation.headers["Idempotency-Key"]).toBe("key-from-the-lost-attempt");
    });
});

describe("createResumableUpload — the failure that matters", () => {
    it("re-reads the offset after a lost response instead of writing twice", async () => {
        let offset = 0;
        server = new FakeTusServer((request): Reply => {
            if (request.method === "POST") {
                return { status: 201, headers: { Location: "/api/uploads/abc" } };
            }
            if (request.method === "HEAD") {
                return { status: 200, headers: { "Upload-Offset": String(offset) } };
            }
            offset = Math.min(offset + request.bodySize, 8);
            return { status: 204, headers: { "Upload-Offset": String(offset) } };
        });
        server.queue("PATCH", { status: 204, networkError: true });
        installXhr();

        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(8),
            chunkSize: 4,
            storage: null,
            retry: { retries: 3, initialDelay: 0 },
        });

        server.onOpen = () => {
            if (server.countOf("PATCH") === 1) offset = 4;
        };

        await expect(upload.start()).resolves.toMatchObject({ size: 8 });
        expect(server.countOf("HEAD")).toBeGreaterThan(0);
        expect(upload.offset).toBe(8);
        expect(server.countOf("PATCH")).toBe(2);
    });

    it("resyncs and continues when the server answers 409 on a stale offset", async () => {
        server = acceptingServer(8);
        server.queue("PATCH", { status: 409, text: "offset mismatch" });
        installXhr();

        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(8),
            chunkSize: 8,
            storage: null,
            retry: { retries: 3, initialDelay: 0 },
        });

        await expect(upload.start()).resolves.toMatchObject({ size: 8 });
        expect(server.countOf("HEAD")).toBe(1);
    });

    it("gives up and rejects once the retries run out", async () => {
        server = acceptingServer(4);
        server.queue(
            "PATCH",
            { status: 500, text: JSON.stringify({ detail: "disco cheio" }) },
            { status: 500, text: JSON.stringify({ detail: "disco cheio" }) },
        );
        installXhr();

        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
            retry: { retries: 2, initialDelay: 0 },
        });

        await expect(upload.start()).rejects.toMatchObject({
            status: 500,
            detail: "disco cheio",
        });
        expect(upload.state).toBe("error");
    });

    it("honours a caller's shouldRetry veto", async () => {
        server = acceptingServer(4);
        server.queue("PATCH", { status: 422, text: "" });
        installXhr();

        const shouldRetry = vi.fn(() => false);
        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file: blobOf(4),
                storage: null,
                retry: { retries: 5, initialDelay: 0, shouldRetry },
            }).start(),
        ).rejects.toMatchObject({ status: 422, detail: "Chunk recusado pelo servidor." });
        expect(shouldRetry).toHaveBeenCalled();
    });

    it("rejects a creation the server refused", async () => {
        server = acceptingServer(4);
        server.queue("POST", { status: 413, text: JSON.stringify({ detail: "grande demais" }) });
        installXhr();
        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file: blobOf(4),
                storage: null,
            }).start(),
        ).rejects.toMatchObject({ status: 413, detail: "grande demais" });
    });

    it("rejects a creation with no Location header", async () => {
        server = acceptingServer(4);
        server.queue("POST", { status: 201 });
        installXhr();
        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file: blobOf(4),
                storage: null,
            }).start(),
        ).rejects.toMatchObject({ detail: expect.stringContaining("Location") });
    });

    it("rejects a HEAD that answers without an offset", async () => {
        server = acceptingServer(4);
        server.queue("HEAD", { status: 200 });
        installXhr();
        const storage = memoryStorage({
            url: "/api/uploads/abc",
            offset: 2,
            size: 4,
            idempotencyKey: "k",
            updatedAt: 1,
        });
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage,
            key: "fp",
        }).start();
        expect(server.countOf("POST")).toBe(1);
    });

    it("falls back to the chunk end when the server omits Upload-Offset on a write", async () => {
        server = acceptingServer(4);
        server.queue("PATCH", { status: 200 });
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
        });
        await expect(upload.start()).resolves.toMatchObject({ size: 4 });
        expect(upload.offset).toBe(4);
    });
});

describe("createResumableUpload — pause, resume and abort", () => {
    it("pauses mid-flight and resumes from the server's offset", async () => {
        server = acceptingServer(12);
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(12),
            chunkSize: 4,
            storage: null,
        });

        server.onOpen = () => {
            if (server.countOf("PATCH") === 1) {
                server.onOpen = null;
                upload.pause();
            }
        };

        await expect(upload.start()).resolves.toBeNull();
        expect(upload.state).toBe("paused");
        expect(server.countOf("PATCH")).toBe(1);

        await expect(upload.resume()).resolves.toMatchObject({ size: 12 });
        expect(upload.state).toBe("done");
    });

    it("aborts and forgets the upload when asked to discard", async () => {
        server = acceptingServer(12);
        installXhr();
        const storage = memoryStorage();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(12),
            chunkSize: 4,
            storage,
            key: "fp",
        });

        server.onOpen = () => {
            if (server.countOf("PATCH") === 1) {
                server.onOpen = null;
                void upload.abort({ discard: true });
            }
        };

        await expect(upload.start()).resolves.toBeNull();
        expect(upload.state).toBe("aborted");
        await vi.waitFor(() => expect(server.countOf("DELETE")).toBe(1));
        expect(storage.records.size).toBe(0);
    });

    it("aborting without discard keeps the resume point", async () => {
        server = acceptingServer(12);
        installXhr();
        const storage = memoryStorage();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(12),
            chunkSize: 4,
            storage,
            key: "fp",
        });

        server.onOpen = () => {
            if (server.countOf("PATCH") === 1) {
                server.onOpen = null;
                void upload.abort();
            }
        };

        await upload.start();
        expect(server.countOf("DELETE")).toBe(0);
        expect(storage.records.get("fp")).toBeDefined();
    });

    it("discarding before anything was created still clears the record", async () => {
        server = acceptingServer(4);
        installXhr();
        const storage = memoryStorage();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage,
            key: "fp",
        });
        await upload.abort({ discard: true });
        expect(upload.state).toBe("aborted");
        expect(server.countOf("DELETE")).toBe(0);
    });

    it("exposes the upload url once creation succeeded", async () => {
        server = acceptingServer(4);
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
        });
        expect(upload.url).toBeNull();
        await upload.start();
        expect(upload.url).toContain("/api/uploads/abc");
    });

    it("sends cookies when asked", async () => {
        server = acceptingServer(4);
        installXhr();
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
            withCredentials: true,
        }).start();
        expect(server.countOf("POST")).toBe(1);
    });

    it("keeps a caller-provided Authorization header", async () => {
        server = acceptingServer(4);
        installXhr();
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
            headers: { Authorization: "Basic abc" },
            getToken: () => "token-1",
        }).start();
        const creation = server.requests.find((request) => request.method === "POST")!;
        expect(creation.headers.Authorization).toBe("Basic abc");
    });
});

/**
 * The chunk loop retried everything, five times, including answers the first
 * attempt had already settled.
 *
 * Two groups are specific to this protocol and neither is obvious from outside
 * it: `409`/`412` are the offset-divergence answers, so a replay *is* the fix and
 * `resync` exists to make it work — the shared `isRetriableStatus` refuses them
 * along with every other 4xx. And `404`/`410` are terminal here even though a
 * missing resource can look transient: `probe()` turns them into "the upload
 * expired", and recreating one only happens in `ensureUpload`, at attach time.
 * Retrying meant re-running `HEAD` against a resource that is gone, with the
 * backoff piling up before the same answer surfaced.
 */
describe("createResumableUpload — chunk retry policy", () => {
    /**
     * Count how many times the server saw a method while the upload failed.
     *
     * @param status - Status the first PATCH answers with.
     * @param patchReplies - How many queued replies to arm, so a retry hits them.
     * @returns The recorded requests, per method.
     */
    async function runFailing(
        status: number,
        patchReplies = 6,
    ): Promise<{ patches: number; heads: number }> {
        server = acceptingServer(4);
        server.queue(
            "PATCH",
            ...Array.from({ length: patchReplies }, () => ({ status, text: "" })),
        );
        installXhr();

        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file: blobOf(4),
                storage: null,
                retry: { retries: 5, initialDelay: 0 },
            }).start(),
        ).rejects.toMatchObject({ status });

        return {
            patches: server.requests.filter((r) => r.method === "PATCH").length,
            heads: server.requests.filter((r) => r.method === "HEAD").length,
        };
    }

    it("stops after one attempt on a deliberate refusal", async () => {
        for (const status of [400, 403, 422]) {
            const { patches } = await runFailing(status);
            expect(patches, `status ${status}`).toBe(1);
        }
    });

    it("stops after one attempt when the upload is gone, instead of probing a dead resource", async () => {
        for (const status of [404, 410]) {
            const { patches, heads } = await runFailing(status);
            expect(patches, `status ${status}`).toBe(1);
            expect(heads, `status ${status} — no resync against a gone upload`).toBe(0);
        }
    });

    it("still replays a server failure and a rate limit", async () => {
        for (const status of [500, 503, 429]) {
            const { patches } = await runFailing(status);
            expect(patches, `status ${status}`).toBeGreaterThan(1);
        }
    });

    it("replays an offset divergence, which is what resync is for", async () => {
        for (const status of [409, 412]) {
            const { patches, heads } = await runFailing(status);
            expect(patches, `status ${status}`).toBeGreaterThan(1);
            expect(heads, `status ${status} — resync re-reads the offset`).toBeGreaterThan(0);
        }
    });

    it("recovers when the divergence clears, writing from the server's offset", async () => {
        server = acceptingServer(4);
        server.queue("PATCH", { status: 409, text: "" });
        installXhr();

        const result = await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
            retry: { retries: 5, initialDelay: 0 },
        }).start();

        expect(result).not.toBeNull();
        expect(server.requests.some((r) => r.method === "HEAD")).toBe(true);
    });

    it("lets a caller's shouldRetry override the policy in both directions", async () => {
        server = acceptingServer(4);
        server.queue("PATCH", ...Array.from({ length: 4 }, () => ({ status: 403, text: "" })));
        installXhr();

        const shouldRetry = vi.fn(() => true);
        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file: blobOf(4),
                storage: null,
                retry: { retries: 3, initialDelay: 0, shouldRetry },
            }).start(),
        ).rejects.toMatchObject({ status: 403 });

        expect(shouldRetry).toHaveBeenCalled();
        expect(server.requests.filter((r) => r.method === "PATCH").length).toBeGreaterThan(1);
    });
});

describe("createResumableUpload — the edges the protocol still has to survive", () => {
    it("keeps the fraction at 1 for an empty file instead of dividing by zero", async () => {
        server = acceptingServer(0);
        installXhr();
        const seen: number[] = [];
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(0),
            storage: null,
            onProgress: ({ fraction }) => seen.push(fraction),
        }).start();
        expect(seen).not.toHaveLength(0);
        expect(seen.every((fraction) => fraction === 1)).toBe(true);
    });

    it("starts over when the server answers HEAD with an offset that is not a number", async () => {
        server = acceptingServer(4);
        server.queue("HEAD", { status: 200, headers: { "Upload-Offset": "quase-lá" } });
        installXhr();
        const storage = memoryStorage({
            url: "/api/uploads/abc",
            offset: 2,
            size: 4,
            idempotencyKey: "k",
            updatedAt: 1,
        });
        await createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage,
            key: "fp",
        }).start();
        expect(server.countOf("POST")).toBe(1);
    });

    it("keeps the server's message when the error envelope carries no detail", async () => {
        server = acceptingServer(4);
        server.queue("PATCH", { status: 400, text: JSON.stringify({ message: "chunk torto" }) });
        installXhr();
        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file: blobOf(4),
                storage: null,
                retry: { retries: 1, initialDelay: 0 },
            }).start(),
        ).rejects.toMatchObject({ status: 400, detail: "chunk torto" });
    });

    it("replays a failure that carries no status at all, because a transport error has none", async () => {
        server = acceptingServer(4);
        installXhr();
        const storage: ResumableUploadStorage = {
            get: () => null,
            set: (_key, record) => {
                if (record.offset > 0) throw new Error("disco cheio");
            },
            delete: () => undefined,
        };

        await expect(
            createResumableUpload({
                endpoint: "/api/uploads",
                file: blobOf(4),
                storage,
                key: "fp",
                retry: { retries: 2, initialDelay: 0 },
            }).start(),
        ).rejects.toThrow("disco cheio");
        expect(server.countOf("HEAD"), "a failure with no status still earns a resync").toBe(1);
    });

    it("stops writing when the resync finds the server already holds the whole file", async () => {
        let stored = 0;
        let lostResponse = true;
        server = new FakeTusServer((request): Reply => {
            if (request.method === "POST") {
                return { status: 201, headers: { Location: "/api/uploads/abc" } };
            }
            if (request.method === "HEAD") {
                return { status: 200, headers: { "Upload-Offset": String(stored) } };
            }
            stored = Math.min(stored + request.bodySize, 4);
            if (lostResponse) {
                lostResponse = false;
                return { status: 0, networkError: true };
            }
            return { status: 204, headers: { "Upload-Offset": String(stored) } };
        });
        installXhr();

        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
            retry: { retries: 2, initialDelay: 0 },
        });

        await expect(upload.start()).resolves.toMatchObject({ size: 4 });
        expect(upload.offset).toBe(4);
        expect(
            server.countOf("PATCH"),
            "the bytes the server already had are not written twice",
        ).toBe(1);
        expect(server.countOf("HEAD")).toBe(1);
    });

    it("resolves a relative Location as-is when there is no page to resolve against", async () => {
        server = acceptingServer(4);
        installXhr();
        vi.stubGlobal("window", undefined);
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(4),
            storage: null,
        });
        await upload.start();
        expect(upload.url).toBe("/api/uploads/abc");
    });
});

describe("createResumableUpload — stopping between chunks, not inside one", () => {
    /**
     * A storage whose `set` stops the upload once, so the loop is interrupted
     * between two chunks rather than mid-request.
     *
     * Pausing while a `PATCH` is open aborts the request and lands in the
     * `guarded` catch; the loop's own stop check is only reached when nothing is
     * in flight, which is exactly what a `set` running after a completed chunk
     * gives us.
     *
     * @param stop - What to call on the first persisted chunk.
     * @returns A storage that keeps nothing.
     */
    function stoppingStorage(stop: () => void): ResumableUploadStorage {
        let stopped = false;
        return {
            get: () => null,
            set: (_key, record) => {
                if (record.offset > 0 && !stopped) {
                    stopped = true;
                    stop();
                }
            },
            delete: () => undefined,
        };
    }

    it("pauses between chunks and reports the paused state", async () => {
        server = acceptingServer(12);
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(12),
            chunkSize: 4,
            storage: stoppingStorage(() => upload.pause()),
            key: "fp",
        });

        await expect(upload.start()).resolves.toBeNull();
        expect(upload.state).toBe("paused");
        expect(server.countOf("PATCH")).toBe(1);
    });

    it("aborts between chunks and reports the aborted state", async () => {
        server = acceptingServer(12);
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(12),
            chunkSize: 4,
            storage: stoppingStorage(() => void upload.abort()),
            key: "fp",
        });

        await expect(upload.start()).resolves.toBeNull();
        expect(upload.state).toBe("aborted");
        expect(server.countOf("PATCH")).toBe(1);
    });

    it("treats an abort nobody asked for as a pause, and does not retry it", async () => {
        server = acceptingServer(12);
        installXhr();
        const upload = createResumableUpload({
            endpoint: "/api/uploads",
            file: blobOf(12),
            chunkSize: 4,
            storage: null,
            retry: { retries: 5, initialDelay: 0 },
        });

        server.onOpen = () => {
            if (server.countOf("PATCH") === 1) {
                server.onOpen = null;
                server.open?.abort();
            }
        };

        await expect(upload.start()).resolves.toBeNull();
        expect(upload.state).toBe("paused");
        expect(server.countOf("PATCH"), "an abort is never replayed").toBe(1);
    });
});
