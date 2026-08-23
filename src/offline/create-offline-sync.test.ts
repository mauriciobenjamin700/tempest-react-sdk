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
        pullPage: vi.fn(async (): Promise<PullPage<Dto>> => ({
            items: [],
            nextCursor: null,
            serverTime: null,
        })),
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

    it("keeps FIFO order when every enqueue lands in the same millisecond", async () => {
        // Date.now() frozen: with a plain timestamp all three entries would tie and
        // the order would fall to whatever the index returns — which is exactly the
        // flake this guards against, and why a create could ship after its update.
        const frozen = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
        const { sync } = makeSync({
            deliver: vi.fn(async () => {
                throw new Error("offline");
            }),
        });

        await sync.enqueue("create", "a", { id: "a" });
        await sync.enqueue("update", "b", { id: "b" });
        await sync.enqueue("delete", "c");

        const pending = await sync.listPending();
        expect(pending.map((entry) => entry.recordId)).toEqual(["a", "b", "c"]);
        expect(pending.map((entry) => entry.enqueuedAt)).toEqual([
            1_700_000_000_000, 1_700_000_000_001, 1_700_000_000_002,
        ]);

        frozen.mockRestore();
    });

    it("delivers in enqueue order after a same-millisecond burst", async () => {
        const frozen = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
        const delivered: string[] = [];
        const { sync } = makeSync({
            deliver: vi.fn(async (entry) => {
                delivered.push(entry.recordId);
            }),
        });

        await sync.enqueue("create", "first", { id: "first" });
        await sync.enqueue("update", "second", { id: "second" });
        await sync.enqueue("update", "third", { id: "third" });

        frozen.mockRestore();
        await sync.flush("manual");

        expect(delivered).toEqual(["first", "second", "third"]);
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

describe("createOfflineSync — environment guards", () => {
    it("uses navigator.onLine by default and skips the run when offline", async () => {
        const original = navigator.onLine;
        Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

        const { sync } = makeSync({ isOnline: undefined });
        await sync.enqueue("create", "r1", { id: "r1" });
        const summary = await sync.flush();
        expect(summary.skipped).toBe(true);
        expect(sync.getState().phase).toBe("offline");

        Object.defineProperty(navigator, "onLine", { configurable: true, value: original });
    });

    it("treats a missing navigator as online, and skips the cross-tab lock", async () => {
        vi.stubGlobal("navigator", undefined);
        const deliver = vi.fn(async () => undefined);
        const { sync } = makeSync({ isOnline: undefined, crossTab: true, deliver });

        await sync.enqueue("create", "r1", { id: "r1" });
        const summary = await sync.flush();

        expect(summary.skipped).toBe(false);
        expect(deliver).toHaveBeenCalledTimes(1);
        vi.unstubAllGlobals();
    });

    it("keeps the watermark in memory when there is no localStorage to hold it", async () => {
        vi.stubGlobal("localStorage", undefined);
        const { sync } = makeSync({
            watermark: { storageKey: "sync:wm" },
            pullPage: vi.fn(async () => ({
                items: [],
                nextCursor: null,
                serverTime: "2026-01-01",
            })),
        });

        const summary = await sync.flush();
        sync.resetWatermark();

        expect(summary.skipped).toBe(false);
        vi.unstubAllGlobals();
    });

    it("ignores a broadcast arriving after dispose", async () => {
        const channelName = `chan-${Math.random().toString(36).slice(2)}`;
        const { sync } = makeSync({ crossTab: true, broadcastChannelName: channelName });
        const listener = vi.fn();
        sync.subscribe(listener);
        listener.mockClear();

        sync.dispose();
        const peer = new BroadcastChannel(channelName);
        peer.postMessage({
            phase: "syncing",
            pending: 99,
            lastSummary: null,
            lastError: null,
            lastSyncedAt: null,
        });
        peer.close();
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(sync.getState().pending).not.toBe(99);
    });
});

/**
 * FIFO per record is a guarantee this engine spends code to keep.
 *
 * `nextEnqueuedAt` advances by 1ms on a tie precisely so a `create` is never
 * delivered after the `update` that depends on it. `push` used to break that the
 * moment anything failed: it moved on to the next entry regardless of which
 * record it belonged to.
 *
 * The damage needs a `PUT` upsert `deliver`, which the engine's own docs name as
 * the usual shape: the server creates the record from the *update* payload, and
 * the retried `create` then overwrites it with the older snapshot. The user's
 * edit is gone, and nothing reports it — `failed` goes back to 0 on the next run.
 */
describe("createOfflineSync — per-record delivery order", () => {
    it("leaves later entries for a record untried once one of them fails", async () => {
        const delivered: string[] = [];
        const { sync } = makeSync({
            deliver: vi.fn(async (entry: OutboxEntry<{ id: string }>) => {
                if (entry.op === "create") throw new Error("500 from server");
                delivered.push(`${entry.op}:${entry.recordId}`);
            }),
        });

        await sync.enqueue("create", "x", { id: "x" });
        await sync.enqueue("update", "x", { id: "x" });
        const summary = await sync.flush();

        expect(delivered).toEqual([]);
        expect(summary.failed).toBe(1);
        expect(summary.deferred).toBe(1);
        expect(await sync.pendingCount()).toBe(2);
    });

    it("does not let one blocked record hold up another", async () => {
        const delivered: string[] = [];
        const { sync } = makeSync({
            deliver: vi.fn(async (entry: OutboxEntry<{ id: string }>) => {
                if (entry.recordId === "x") throw new Error("rejected");
                delivered.push(entry.recordId);
            }),
        });

        await sync.enqueue("create", "x", { id: "x" });
        await sync.enqueue("create", "y", { id: "y" });
        await sync.enqueue("update", "x", { id: "x" });
        await sync.enqueue("update", "y", { id: "y" });
        const summary = await sync.flush();

        expect(delivered).toEqual(["y", "y"]);
        expect(summary.succeeded).toBe(2);
        expect(summary.failed).toBe(1);
        expect(summary.deferred).toBe(1);
    });

    it("delivers the queue in order once the failure clears", async () => {
        const delivered: string[] = [];
        let failing = true;
        const { sync } = makeSync({
            deliver: vi.fn(async (entry: OutboxEntry<{ id: string }>) => {
                if (failing && entry.op === "create") throw new Error("500 from server");
                delivered.push(`${entry.op}:${entry.recordId}`);
            }),
        });

        await sync.enqueue("create", "x", { id: "x" });
        await sync.enqueue("update", "x", { id: "x" });
        await sync.flush();
        expect(delivered).toEqual([]);

        failing = false;
        const second = await sync.flush();

        expect(delivered).toEqual(["create:x", "update:x"]);
        expect(second.deferred).toBe(0);
        expect(await sync.pendingCount()).toBe(0);
    });
});
