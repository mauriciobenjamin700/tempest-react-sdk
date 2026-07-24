import { describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSyncConfig,
    type OutboxEntry,
    type PullPage,
    type WatermarkStore,
} from "./create-offline-sync";

interface Dto {
    id: string;
    deleted?: boolean;
}

function memoryWatermark(initial: string | null = null): WatermarkStore {
    let value = initial;
    return {
        get: () => value,
        set: (next) => {
            value = next;
        },
        clear: () => {
            value = null;
        },
    };
}

function makeSync(overrides: Partial<OfflineSyncConfig<{ id: string }, Dto>> = {}) {
    const config: OfflineSyncConfig<{ id: string }, Dto> = {
        databaseName: `sync-${Math.random().toString(36).slice(2)}`,
        watermark: memoryWatermark(),
        deliver: vi.fn(async () => undefined),
        pullPage: vi.fn(
            async (): Promise<PullPage<Dto>> => ({
                items: [],
                nextCursor: null,
                serverTime: null,
            }),
        ),
        applyRemote: vi.fn(async () => undefined),
        ...overrides,
    };
    return { sync: createOfflineSync(config), config };
}

describe("createOfflineSync", () => {
    it("enqueues mutations and counts them", async () => {
        const { sync } = makeSync();
        await sync.enqueue("create", "r1", { id: "r1" });
        await sync.enqueue("delete", "r2");
        expect(await sync.pendingCount()).toBe(2);
        const pending = await sync.listPending();
        expect(pending.map((e) => e.recordId)).toEqual(["r1", "r2"]);
    });

    it("delivers queued entries and clears them on success", async () => {
        const { sync, config } = makeSync();
        await sync.enqueue("create", "r1", { id: "r1" });

        const summary = await sync.flush("manual");

        expect(config.deliver).toHaveBeenCalledTimes(1);
        expect(summary.succeeded).toBe(1);
        expect(summary.failed).toBe(0);
        expect(summary.skipped).toBe(false);
        expect(await sync.pendingCount()).toBe(0);
    });

    it("keeps failed entries queued and bumps attempts", async () => {
        const onEntryFailed = vi.fn();
        const { sync } = makeSync({
            deliver: vi.fn(async () => {
                throw new Error("boom");
            }),
            onEntryFailed,
        });
        await sync.enqueue("update", "r1", { id: "r1" });

        const summary = await sync.flush();

        expect(summary.failed).toBe(1);
        expect(await sync.pendingCount()).toBe(1);
        const [entry] = await sync.listPending();
        expect(entry.attempts).toBe(1);
        expect(entry.lastError).toBe("boom");
        expect(onEntryFailed).toHaveBeenCalledOnce();
    });

    it("pulls the delta, applies items and advances the watermark", async () => {
        const watermark = memoryWatermark();
        const applyRemote = vi.fn(async () => undefined);
        const pullPage = vi
            .fn<(since: string | null, cursor: string | null) => Promise<PullPage<Dto>>>()
            .mockResolvedValueOnce({
                items: [{ id: "a" }],
                nextCursor: "c1",
                serverTime: "t1",
            })
            .mockResolvedValueOnce({
                items: [{ id: "b" }],
                nextCursor: null,
                serverTime: "t2",
            });
        const { sync } = makeSync({ watermark, applyRemote, pullPage });

        await sync.flush();

        expect(pullPage).toHaveBeenCalledTimes(2);
        expect(applyRemote).toHaveBeenCalledTimes(2);
        expect(watermark.get()).toBe("t2");
    });

    it("skips the run while offline", async () => {
        const { sync, config } = makeSync({ isOnline: () => false });
        await sync.enqueue("create", "r1", { id: "r1" });

        const summary = await sync.flush("online-event");

        expect(summary.skipped).toBe(true);
        expect(config.deliver).not.toHaveBeenCalled();
        expect(config.pullPage).not.toHaveBeenCalled();
        expect(await sync.pendingCount()).toBe(1);
    });

    it("collapses concurrent flushes into one run", async () => {
        let openGate!: () => void;
        const gate = new Promise<void>((resolve) => {
            openGate = resolve;
        });
        const deliver = vi.fn((_entry: OutboxEntry<{ id: string }>) => gate);
        const { sync, config } = makeSync({ deliver });
        await sync.enqueue("create", "r1", { id: "r1" });

        const first = sync.flush();
        const second = sync.flush();
        expect(first).toBe(second);

        openGate();
        await Promise.all([first, second]);
        expect(deliver).toHaveBeenCalledTimes(1);
        expect(config.pullPage).toHaveBeenCalledTimes(1);
    });

    it("clears the outbox and resets the watermark", async () => {
        const watermark = memoryWatermark("t9");
        const { sync } = makeSync({ watermark });
        await sync.enqueue("create", "r1", { id: "r1" });

        await sync.clearOutbox();
        sync.resetWatermark();

        expect(await sync.pendingCount()).toBe(0);
        expect(watermark.get()).toBeNull();
    });
});

describe("createOfflineSync — callbacks, watermark and options", () => {
    it("notifies onEntryDelivered for each successful entry", async () => {
        const onEntryDelivered = vi.fn();
        const { sync } = makeSync({ onEntryDelivered });
        await sync.enqueue("create", "r1", { id: "r1" });
        await sync.flush();
        expect(onEntryDelivered).toHaveBeenCalledWith(expect.objectContaining({ recordId: "r1" }));
    });

    it("notifies onEntryFailed and records the message in the summary", async () => {
        const onEntryFailed = vi.fn();
        const { sync } = makeSync({
            deliver: vi.fn(async () => {
                throw new Error("server said no");
            }),
            onEntryFailed,
        });
        await sync.enqueue("update", "r2", { id: "r2" });
        const summary = await sync.flush();

        expect(onEntryFailed).toHaveBeenCalled();
        expect(summary.failed).toBe(1);
        expect(summary.lastError).toBe("server said no");
        expect(sync.getState().lastError).toBe("server said no");
    });

    it("falls back to a generic message for a non-Error rejection", async () => {
        const { sync } = makeSync({
            deliver: vi.fn(async () => {
                throw "nope";
            }),
        });
        await sync.enqueue("delete", "r3");
        const summary = await sync.flush();
        expect(summary.lastError).toBe("delivery failed");
    });

    it("keeps the previous watermark when the server sends none", async () => {
        const watermark = memoryWatermark("2026-01-01T00:00:00Z");
        const { sync } = makeSync({ watermark });
        await sync.flush();
        expect(watermark.get()).toBe("2026-01-01T00:00:00Z");
    });

    it("walks every page of the delta before advancing the watermark", async () => {
        const watermark = memoryWatermark();
        const pages: PullPage<Dto>[] = [
            { items: [{ id: "a" }], nextCursor: "c1", serverTime: null },
            { items: [{ id: "b" }], nextCursor: null, serverTime: "2026-02-02T00:00:00Z" },
        ];
        const pullPage = vi.fn(async () => pages.shift() as PullPage<Dto>);
        const applyRemote = vi.fn(async () => undefined);
        const { sync } = makeSync({ watermark, pullPage, applyRemote });

        await sync.flush();
        expect(pullPage).toHaveBeenCalledTimes(2);
        expect(applyRemote).toHaveBeenCalledTimes(2);
        expect(watermark.get()).toBe("2026-02-02T00:00:00Z");
    });

    it("accepts a localStorage-backed watermark descriptor", async () => {
        window.localStorage.clear();
        const { sync } = makeSync({
            watermark: { storageKey: "wm-test" },
            pullPage: vi.fn(async () => ({
                items: [],
                nextCursor: null,
                serverTime: "2026-03-03T00:00:00Z",
            })),
        });
        await sync.flush();
        expect(window.localStorage.getItem("wm-test")).toBe("2026-03-03T00:00:00Z");

        sync.resetWatermark();
        expect(window.localStorage.getItem("wm-test")).toBeNull();
    });

    it("honours a custom table name, version and id prefix", async () => {
        const { sync } = makeSync({ tableName: "queue", version: 2, idPrefix: "job" });
        const id = await sync.enqueue("create", "r4", { id: "r4" });
        expect(id.startsWith("job")).toBe(true);
        expect(await sync.pendingCount()).toBe(1);
    });

    it("lists pending entries in enqueue order", async () => {
        const { sync } = makeSync({
            deliver: vi.fn(async () => {
                throw new Error("offline");
            }),
        });
        await sync.enqueue("create", "first", { id: "first" });
        await sync.enqueue("create", "second", { id: "second" });
        const pending = await sync.listPending();
        expect(pending.map((entry) => entry.recordId)).toEqual(["first", "second"]);
    });

    it("dispose() is safe without a broadcast channel and keeps state readable", async () => {
        const { sync } = makeSync();
        await sync.enqueue("create", "r5", { id: "r5" });

        sync.dispose();
        sync.dispose();
        expect(sync.getState().pending).toBe(1);
        expect(await sync.pendingCount()).toBe(1);
    });
});
