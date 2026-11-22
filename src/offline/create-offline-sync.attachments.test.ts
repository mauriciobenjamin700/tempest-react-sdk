import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSyncConfig,
    type OutboxEntry,
    type PullPage,
    type SyncState,
} from "./create-offline-sync";
import type { OutboxAttachment, OutboxAttachments } from "./outbox-attachments";

interface Visit {
    id: string;
    photoIds: string[];
}

interface Photo {
    id: string;
    blob: Blob | null;
    url: string | null;
}

/**
 * A tus server behind an `XMLHttpRequest` double. Creation answers
 * `Location: /api/uploads/<n>`, `HEAD` the offset it holds and `PATCH` advances
 * it, unless `failPatchAt` names the PATCH (1-based, counted across the
 * server's life) that answers `500` or `refusePost` makes creation answer `500`.
 * `beforePatch` runs as each PATCH is sent.
 */
class TusDouble {
    log: string[] = [];
    offsets = new Map<string, number>();
    created = 0;
    patches = 0;
    failPatchAt: number | null = null;
    refusePost = false;
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
        private reply: Record<string, string> = {};
        status = 0;
        responseText = "";
        withCredentials = false;
        upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;

        open(method: string, url: string): void {
            this.method = method;
            this.target = url;
        }
        setRequestHeader(): void {}
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
            server.log.push(`${this.method} ${this.target}`);
            void (async () => {
                let status = 204;
                if (this.method === "POST" && server.refusePost) {
                    status = 500;
                } else if (this.method === "POST") {
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

/**
 * The app side of the recipe: visits and photos in the app's own store, with
 * the attachment hooks reading and writing it.
 *
 * @param server - Receives a `deliver:<id>` line per delivery.
 * @returns The store, the hooks and spies on them.
 */
function appStore(server: TusDouble) {
    const photos = new Map<string, Photo>();
    const onUploaded = vi.fn(async (attachment: OutboxAttachment, url: string) => {
        const photo = photos.get(attachment.id);
        if (photo) photos.set(photo.id, { ...photo, url, blob: null });
    });
    const attachments: OutboxAttachments<Visit> = {
        list: (entry) =>
            (entry.payload?.photoIds ?? []).map((id) => {
                const photo = photos.get(id);
                return { id, blob: photo?.blob ?? null, uploadedUrl: photo?.url ?? null };
            }),
        upload: () => ({ endpoint: "/api/uploads", chunkSize: 4, retry: { retries: 0 } }),
        onUploaded,
    };
    const deliver = vi.fn(async (entry: OutboxEntry<Visit>) => {
        server.log.push(`deliver:${entry.recordId}`);
    });
    return { photos, attachments, onUploaded, deliver };
}

function makeSync(overrides: Partial<OfflineSyncConfig<Visit, never>>) {
    return createOfflineSync<Visit, never>({
        databaseName: `attachments-${Math.random().toString(36).slice(2)}`,
        watermark: { get: () => null, set: () => undefined, clear: () => undefined },
        deliver: async () => undefined,
        pullPage: async (): Promise<PullPage<never>> => ({
            items: [],
            nextCursor: null,
            serverTime: null,
        }),
        applyRemote: async () => undefined,
        ...overrides,
    });
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
}

let server: TusDouble;

beforeEach(() => {
    server = new TusDouble();
    installXhr(server);
    localStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe("createOfflineSync attachments — why the file is not an entry of its own", () => {
    it("lets a visit reach the server before the photo it points at when the photo is a separate record", async () => {
        const reached: string[] = [];
        const sync = makeSync({
            deliver: async (entry) => {
                if (entry.recordId === "photo-1") throw new Error("Failed to fetch");
                reached.push(entry.recordId);
            },
        });
        await sync.enqueue("create", "photo-1", { id: "photo-1", photoIds: [] });
        await sync.enqueue("create", "visit-1", { id: "visit-1", photoIds: ["photo-1"] });

        const summary = await sync.flush();

        expect(reached).toEqual(["visit-1"]);
        expect(summary).toMatchObject({ succeeded: 1, failed: 1, deferred: 0 });
    });
});

describe("createOfflineSync attachments", () => {
    it("uploads the pending photos before delivering and hands their URLs in entry.attachments", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcdefgh"]), url: null });
        app.photos.set("p2", { id: "p2", blob: new Blob(["ijk"]), url: null });
        const sync = makeSync({ deliver: app.deliver, attachments: app.attachments });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });

        const summary = await sync.flush();

        expect(summary).toMatchObject({ succeeded: 1, failed: 0 });
        expect(server.log.at(-1)).toBe("deliver:v1");
        expect(server.log.filter((line) => line.startsWith("POST"))).toHaveLength(2);
        expect(app.deliver.mock.calls[0][0].attachments).toEqual([
            { id: "p1", url: "http://localhost:3000/api/uploads/1" },
            { id: "p2", url: "http://localhost:3000/api/uploads/2" },
        ]);
        expect(app.onUploaded).toHaveBeenCalledTimes(2);
        expect(app.photos.get("p1")).toMatchObject({ blob: null, url: expect.any(String) });
        expect(await sync.pendingCount()).toBe(0);
    });

    it("does not upload again an attachment that already has its URL", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: null, url: "https://cdn.test/p1" });
        const sync = makeSync({ deliver: app.deliver, attachments: app.attachments });
        await sync.enqueue("update", "v1", { id: "v1", photoIds: ["p1"] });

        await sync.flush();

        expect(server.log).toEqual(["deliver:v1"]);
        expect(app.deliver.mock.calls[0][0].attachments).toEqual([
            { id: "p1", url: "https://cdn.test/p1" },
        ]);
    });

    it("fails the entry without delivering when the upload is refused, and defers the record's next edit", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcdefgh"]), url: null });
        server.refusePost = true;
        const sync = makeSync({ deliver: app.deliver, attachments: app.attachments });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });
        await sync.enqueue("update", "v1", { id: "v1", photoIds: ["p1"] });

        const summary = await sync.flush();

        expect(app.deliver).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ succeeded: 0, failed: 1, deferred: 1 });
        const [first] = await sync.listPending();
        expect(first.attempts).toBe(1);
        expect(sync.getState().phase).toBe("error");
    });

    it("resumes an interrupted upload from its offset on the next run, keyed by the attachment id", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcdefghijkl"]), url: null });
        server.failPatchAt = 2;
        const sync = makeSync({ deliver: app.deliver, attachments: app.attachments });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });

        expect((await sync.flush()).failed).toBe(1);
        expect(localStorage.getItem("tempest-upload:outbox-attachment:p1")).not.toBeNull();
        server.log = [];
        const second = await sync.flush();

        expect(second.succeeded).toBe(1);
        expect(server.created).toBe(1);
        expect(server.log[0]).toBe("HEAD http://localhost:3000/api/uploads/1");
        expect(server.offsets.get("http://localhost:3000/api/uploads/1")).toBe(12);
    });

    it("fails the entry when a pending attachment has no blob", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: null, url: null });
        const sync = makeSync({ deliver: app.deliver, attachments: app.attachments });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });

        const summary = await sync.flush();

        expect(app.deliver).not.toHaveBeenCalled();
        expect(summary.lastError).toBe("Attachment p1 has no blob and no uploadedUrl.");
    });

    it("uploads nothing for an entry held for its owner", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcd"]), url: null });
        let principal: string | null = "ana";
        const sync = makeSync({
            deliver: app.deliver,
            attachments: app.attachments,
            getPrincipal: () => principal,
        });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });
        principal = null;

        const summary = await sync.flush();

        expect(summary.held).toBe(1);
        expect(server.log).toEqual([]);
    });

    it("stops before delivering, without persisting the URL, when the session ends mid-upload", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcd"]), url: null });
        const sync = makeSync({ deliver: app.deliver, attachments: app.attachments });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });
        server.beforePatch = () => sync.resetWatermark();

        const summary = await sync.flush();

        expect(summary.interrupted).toBe(true);
        expect(app.deliver).not.toHaveBeenCalled();
        expect(app.onUploaded).not.toHaveBeenCalled();
        expect(await sync.pendingCount()).toBe(1);
    });

    it("uploads once for edits folded by coalesce, listing the newest payload", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcd"]), url: null });
        app.photos.set("p2", { id: "p2", blob: new Blob(["efgh"]), url: null });
        const list = vi.fn(app.attachments.list);
        const sync = makeSync({
            deliver: app.deliver,
            coalesce: true,
            attachments: { ...app.attachments, list },
        });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });
        await sync.enqueue("update", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        list.mockClear();

        const summary = await sync.flush();

        expect(summary).toMatchObject({ succeeded: 1, coalesced: 1 });
        expect(list.mock.calls[0][0].payload).toEqual({ id: "v1", photoIds: ["p1", "p2"] });
        expect(server.created).toBe(2);
        expect(app.deliver.mock.calls[0][0].attachments?.map((ref) => ref.id)).toEqual([
            "p1",
            "p2",
        ]);
    });

    it("calls the app's own onProgress after reporting the bytes in SyncState", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcdefgh"]), url: null });
        const onProgress = vi.fn();
        const sync = makeSync({
            deliver: app.deliver,
            attachments: {
                ...app.attachments,
                upload: () => ({ endpoint: "/api/uploads", chunkSize: 4, onProgress }),
            },
        });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });

        await sync.flush();

        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({ loaded: 8, total: 8 }),
        );
    });
});

describe("createOfflineSync attachments — bytes in SyncState", () => {
    it("reports the in-flight upload and the pending bytes, and clears both after the run", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcdefgh"]), url: null });
        app.photos.set("p2", { id: "p2", blob: new Blob(["ijk"]), url: null });
        const sync = makeSync({ deliver: app.deliver, attachments: app.attachments });
        const seen: SyncState[] = [];
        sync.subscribe((state) => seen.push(state));
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });

        expect(sync.getState().pendingBytes).toBe(11);
        await sync.flush();

        expect(seen).toContainEqual(expect.objectContaining({ uploadedBytes: 4, totalBytes: 8 }));
        expect(seen).toContainEqual(
            expect.objectContaining({ uploadedBytes: 0, totalBytes: 0, pendingBytes: 3 }),
        );
        expect(sync.getState()).toMatchObject({ uploadedBytes: 0, totalBytes: 0, pendingBytes: 0 });
    });

    it("counts a file listed by several queued edits once, and skips an entry whose list throws", async () => {
        const app = appStore(server);
        app.photos.set("p1", { id: "p1", blob: new Blob(["abcdefgh"]), url: null });
        const sync = makeSync({
            deliver: app.deliver,
            attachments: {
                ...app.attachments,
                list: (entry) => {
                    if (entry.recordId === "locked") throw new Error("Sessão expirada.");
                    return app.attachments.list(entry);
                },
            },
        });
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });
        await sync.enqueue("update", "v1", { id: "v1", photoIds: ["p1"] });
        await sync.enqueue("create", "locked", { id: "locked", photoIds: ["p1"] });

        expect(sync.getState().pendingBytes).toBe(8);
    });

    it("stays at zero pending bytes without attachments", async () => {
        const sync = makeSync({});
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1"] });

        expect(sync.getState().pendingBytes).toBe(0);
    });

    it("reads persisted from navigator.storage.persisted() and never asks for persistence", async () => {
        const persist = vi.fn(async () => true);
        vi.stubGlobal("navigator", {
            ...navigator,
            onLine: true,
            storage: { persisted: async () => true, persist },
        });
        const sync = makeSync({});
        await settle();

        expect(sync.getState().persisted).toBe(true);
        await sync.enqueue("create", "v1", { id: "v1", photoIds: [] });
        await sync.flush();
        expect(persist).not.toHaveBeenCalled();
    });

    it("reports persisted as null where the Storage API is missing or fails", async () => {
        const plain = makeSync({});
        await settle();
        expect(plain.getState().persisted).toBeNull();

        vi.stubGlobal("navigator", {
            ...navigator,
            onLine: true,
            storage: {
                persisted: async () => {
                    throw new Error("SecurityError");
                },
            },
        });
        const failing = makeSync({});
        await settle();
        expect(failing.getState().persisted).toBeNull();
    });
});
