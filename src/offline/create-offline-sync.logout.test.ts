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
}

interface Gate {
    promise: Promise<void>;
    release: () => void;
}

function gate(): Gate {
    let release: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
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

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeSync(overrides: Partial<OfflineSyncConfig<{ id: string }, Dto>> = {}) {
    const watermark = memoryWatermark("wm-before");
    const config: OfflineSyncConfig<{ id: string }, Dto> = {
        databaseName: `sync-logout-${Math.random().toString(36).slice(2)}`,
        watermark,
        deliver: vi.fn(async () => undefined),
        pullPage: vi.fn(async (): Promise<PullPage<Dto>> => ({
            items: [{ id: "a-remote" }],
            nextCursor: null,
            serverTime: "wm-of-a",
        })),
        applyRemote: vi.fn(async () => undefined),
        ...overrides,
    };
    return { sync: createOfflineSync(config), config, watermark };
}

describe("createOfflineSync — logout fences an in-flight flush", () => {
    it("delivers no entry of the ended session after clearOutbox, and applies none of its pull", async () => {
        const first = gate();
        const delivered: string[] = [];
        const deliver = vi.fn(async (entry: OutboxEntry<{ id: string }>) => {
            delivered.push(entry.recordId);
            if (entry.recordId === "a1") await first.promise;
        });
        const onEntryDelivered = vi.fn();
        const { sync, config, watermark } = makeSync({ deliver, onEntryDelivered });
        await sync.enqueue("create", "a1", { id: "a1" });
        await sync.enqueue("create", "a2", { id: "a2" });
        await sync.enqueue("create", "a3", { id: "a3" });

        const run = sync.flush("manual");
        await settle();
        expect(delivered).toEqual(["a1"]);

        sync.resetWatermark();
        await sync.clearOutbox();
        first.release();
        const summary = await run;

        expect(delivered).toEqual(["a1"]);
        expect(onEntryDelivered).not.toHaveBeenCalled();
        expect(config.pullPage).not.toHaveBeenCalled();
        expect(config.applyRemote).not.toHaveBeenCalled();
        expect(watermark.get()).toBeNull();
        expect(summary.interrupted).toBe(true);
        expect(await sync.pendingCount()).toBe(0);
    });

    it("requests no further page with the ended session's cursor and writes no watermark", async () => {
        const page = gate();
        const pullPage = vi.fn(async (_since: string | null, cursor: string | null) => {
            await page.promise;
            const result: PullPage<Dto> = {
                items: [],
                nextCursor: cursor === null ? "next" : null,
                serverTime: "wm-of-a",
            };
            return result;
        });
        const { sync, config, watermark } = makeSync({ pullPage });

        const run = sync.flush("manual");
        await settle();
        expect(pullPage).toHaveBeenCalledTimes(1);

        sync.resetWatermark();
        page.release();
        const summary = await run;

        expect(pullPage).toHaveBeenCalledTimes(1);
        expect(config.applyRemote).not.toHaveBeenCalled();
        expect(watermark.get()).toBeNull();
        expect(summary.interrupted).toBe(true);
    });

    it("applies no further pulled item once the watermark is reset mid-apply", async () => {
        const apply = gate();
        const applied: string[] = [];
        const applyRemote = vi.fn(async (item: Dto) => {
            applied.push(item.id);
            if (item.id === "a-1") await apply.promise;
        });
        const pullPage = vi.fn(async (): Promise<PullPage<Dto>> => ({
            items: [{ id: "a-1" }, { id: "a-2" }],
            nextCursor: null,
            serverTime: "wm-of-a",
        }));
        const { sync, watermark } = makeSync({ applyRemote, pullPage });

        const run = sync.flush("manual");
        await settle();
        expect(applied).toEqual(["a-1"]);

        sync.resetWatermark();
        apply.release();
        await run;

        expect(applied).toEqual(["a-1"]);
        expect(watermark.get()).toBeNull();
    });

    it("lets the next session flush at once instead of joining the abandoned run", async () => {
        const first = gate();
        const delivered: string[] = [];
        const deliver = vi.fn(async (entry: OutboxEntry<{ id: string }>) => {
            delivered.push(entry.recordId);
            if (entry.recordId === "a1") await first.promise;
        });
        const { sync } = makeSync({ deliver });
        await sync.enqueue("create", "a1", { id: "a1" });
        await sync.enqueue("create", "a2", { id: "a2" });

        const abandoned = sync.flush("manual");
        await settle();

        sync.resetWatermark();
        await sync.clearOutbox();
        expect(sync.getState().phase).toBe("idle");

        await sync.enqueue("create", "b1", { id: "b1" });
        const next = sync.flush("manual");
        expect(next).not.toBe(abandoned);
        const nextSummary = await next;

        expect(nextSummary.succeeded).toBe(1);
        expect(nextSummary.interrupted).toBeUndefined();
        expect(delivered).toEqual(["a1", "b1"]);
        expect(sync.getState().lastSummary).toBe(nextSummary);

        first.release();
        const abandonedSummary = await abandoned;

        expect(abandonedSummary.interrupted).toBe(true);
        expect(delivered).toEqual(["a1", "b1"]);
        expect(sync.getState().lastSummary).toBe(nextSummary);
        expect(sync.getState().phase).toBe("idle");
    });

    it("keeps single-flight for the new session while the abandoned run is still settling", async () => {
        const first = gate();
        const deliver = vi.fn(async (entry: OutboxEntry<{ id: string }>) => {
            if (entry.recordId === "a1") await first.promise;
        });
        const { sync } = makeSync({ deliver });
        await sync.enqueue("create", "a1", { id: "a1" });

        const abandoned = sync.flush("manual");
        await settle();
        await sync.clearOutbox();

        const second = gate();
        deliver.mockImplementation(async () => second.promise);
        await sync.enqueue("create", "b1", { id: "b1" });
        const next = sync.flush("manual");

        first.release();
        await abandoned;
        expect(sync.flush("manual")).toBe(next);
        expect(sync.getState().phase).toBe("syncing");

        second.release();
        await next;
        expect(sync.getState().phase).toBe("idle");
    });

    it("skips an entry another tab removed from the shared outbox after the run listed it", async () => {
        const first = gate();
        const delivered: string[] = [];
        const deliver = vi.fn(async (entry: OutboxEntry<{ id: string }>) => {
            delivered.push(entry.recordId);
            if (entry.recordId === "a1") await first.promise;
        });
        const databaseName = `sync-logout-shared-${Math.random().toString(36).slice(2)}`;
        const { sync } = makeSync({ deliver, databaseName });
        const otherTab = createOfflineSync<{ id: string }, Dto>({
            databaseName,
            watermark: memoryWatermark(),
            deliver: vi.fn(async () => undefined),
            pullPage: vi.fn(async () => ({ items: [], nextCursor: null, serverTime: null })),
            applyRemote: vi.fn(async () => undefined),
        });
        await sync.enqueue("create", "a1", { id: "a1" });
        await sync.enqueue("create", "a2", { id: "a2" });

        const run = sync.flush("manual");
        await settle();
        await otherTab.clearOutbox();
        first.release();
        const summary = await run;

        expect(delivered).toEqual(["a1"]);
        expect(summary.succeeded).toBe(1);
        otherTab.dispose();
        sync.dispose();
    });

    it("does not let a run whose Web Lock is granted after logout adopt the next session", async () => {
        const grant = gate();
        const originalLocks = (navigator as { locks?: unknown }).locks;
        Object.assign(navigator, {
            locks: {
                request: async (
                    _name: string,
                    _options: { ifAvailable?: boolean },
                    callback: (lock: unknown) => Promise<unknown>,
                ) => {
                    await grant.promise;
                    return callback({});
                },
            },
        });
        try {
            const { sync, config, watermark } = makeSync({ crossTab: true });
            await sync.enqueue("create", "a1", { id: "a1" });

            const run = sync.flush("manual");
            sync.resetWatermark();
            grant.release();
            const summary = await run;

            expect(config.deliver).not.toHaveBeenCalled();
            expect(config.pullPage).not.toHaveBeenCalled();
            expect(watermark.get()).toBeNull();
            expect(summary.interrupted).toBe(true);
            sync.dispose();
        } finally {
            if (originalLocks === undefined) delete (navigator as { locks?: unknown }).locks;
            else Object.assign(navigator, { locks: originalLocks });
        }
    });

    it("bookkeeps a delivery that was already in progress at logout without firing its callback", async () => {
        const first = gate();
        const deliver = vi.fn(async () => {
            await first.promise;
            throw new Error("late failure");
        });
        const onEntryFailed = vi.fn();
        const { sync } = makeSync({ deliver, onEntryFailed });
        await sync.enqueue("update", "a1", { id: "a1" });

        const run = sync.flush("manual");
        await settle();
        sync.resetWatermark();
        first.release();
        const summary = await run;

        expect(onEntryFailed).not.toHaveBeenCalled();
        expect(summary.failed).toBe(1);
        expect(summary.interrupted).toBe(true);
        const [entry] = await sync.listPending();
        expect(entry?.attempts).toBe(1);
    });
});
