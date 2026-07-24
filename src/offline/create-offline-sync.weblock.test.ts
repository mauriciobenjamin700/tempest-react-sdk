import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSync,
    type OfflineSyncConfig,
    type PullPage,
    type WatermarkStore,
} from "./create-offline-sync";

interface Dto {
    id: string;
}

function memoryWatermark(): WatermarkStore {
    let value: string | null = null;
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

const originalLocks = (navigator as { locks?: unknown }).locks;

function stubLocks(available: boolean): void {
    Object.assign(navigator, {
        locks: {
            request: vi.fn(
                async (
                    _name: string,
                    _opts: { ifAvailable?: boolean },
                    callback: (lock: unknown) => Promise<unknown>,
                ) => callback(available ? {} : null),
            ),
        },
    });
}

const engines: OfflineSync<unknown>[] = [];

function makeSync(overrides: Partial<OfflineSyncConfig<{ id: string }, Dto>> = {}) {
    const config: OfflineSyncConfig<{ id: string }, Dto> = {
        databaseName: `wl-${Math.random().toString(36).slice(2)}`,
        broadcastChannelName: `wl-${Math.random().toString(36).slice(2)}`,
        crossTab: true,
        watermark: memoryWatermark(),
        deliver: vi.fn(async () => undefined),
        pullPage: vi.fn(
            async (): Promise<PullPage<Dto>> => ({ items: [], nextCursor: null, serverTime: null }),
        ),
        applyRemote: vi.fn(async () => undefined),
        ...overrides,
    };
    const sync = createOfflineSync(config);
    engines.push(sync as OfflineSync<unknown>);
    return { sync, config };
}

afterEach(() => {
    for (const sync of engines.splice(0)) sync.dispose();
    if (originalLocks === undefined) delete (navigator as { locks?: unknown }).locks;
    else Object.assign(navigator, { locks: originalLocks });
    vi.restoreAllMocks();
});

describe("createOfflineSync — cross-tab flush lock (Web Locks)", () => {
    it("runs the sync when the lock is acquired", async () => {
        stubLocks(true);
        const { sync, config } = makeSync();
        await sync.enqueue("create", "r1", { id: "r1" });
        const summary = await sync.flush("manual");
        expect(config.deliver).toHaveBeenCalledTimes(1);
        expect(summary.succeeded).toBe(1);
        expect(navigator.locks.request).toHaveBeenCalled();
    });

    it("skips the run when the lock is held by another tab", async () => {
        stubLocks(false);
        const { sync, config } = makeSync();
        await sync.enqueue("create", "r1", { id: "r1" });
        const summary = await sync.flush("manual");
        expect(config.deliver).not.toHaveBeenCalled();
        expect(summary.succeeded).toBe(0);
        expect(summary.skipped).toBe(false);
        expect(sync.getState().phase).toBe("idle");
    });

    it("falls back to a direct run when Web Locks are unavailable", async () => {
        delete (navigator as { locks?: unknown }).locks;
        const { sync, config } = makeSync();
        await sync.enqueue("create", "r1", { id: "r1" });
        await sync.flush("manual");
        expect(config.deliver).toHaveBeenCalledTimes(1);
    });
});
