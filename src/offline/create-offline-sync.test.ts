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
