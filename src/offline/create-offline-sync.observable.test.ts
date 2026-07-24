import { describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSyncConfig,
    type PullPage,
    type SyncState,
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

function makeSync(overrides: Partial<OfflineSyncConfig<{ id: string }, Dto>> = {}) {
    const config: OfflineSyncConfig<{ id: string }, Dto> = {
        databaseName: `obs-${Math.random().toString(36).slice(2)}`,
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

function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = (): void => {
            if (predicate()) return resolve();
            if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
            setTimeout(tick, 5);
        };
        tick();
    });
}

describe("createOfflineSync — observable state", () => {
    it("starts idle with zero pending", () => {
        const { sync } = makeSync();
        const state = sync.getState();
        expect(state.phase).toBe("idle");
        expect(state.lastSummary).toBeNull();
        expect(state.lastError).toBeNull();
    });

    it("notifies subscribers on enqueue and increments pending", async () => {
        const { sync } = makeSync();
        const seen: SyncState[] = [];
        sync.subscribe((s) => seen.push(s));
        await sync.enqueue("create", "r1", { id: "r1" });
        await waitFor(() => sync.getState().pending === 1);
        expect(sync.getState().pending).toBe(1);
        expect(seen.some((s) => s.pending === 1)).toBe(true);
    });

    it("transitions syncing → idle over a successful flush", async () => {
        const { sync } = makeSync();
        await sync.enqueue("create", "r1", { id: "r1" });
        const phases: string[] = [];
        sync.subscribe((s) => phases.push(s.phase));
        const summary = await sync.flush("manual");
        expect(summary.succeeded).toBe(1);
        expect(phases).toContain("syncing");
        expect(sync.getState().phase).toBe("idle");
        expect(sync.getState().pending).toBe(0);
        expect(sync.getState().lastSyncedAt).not.toBeNull();
    });

    it("ends in error phase with lastError when a delivery fails", async () => {
        const { sync } = makeSync({
            deliver: vi.fn(async () => {
                throw new Error("boom");
            }),
        });
        await sync.enqueue("create", "r1", { id: "r1" });
        const summary = await sync.flush("manual");
        expect(summary.failed).toBe(1);
        expect(summary.lastError).toBe("boom");
        expect(sync.getState().phase).toBe("error");
        expect(sync.getState().lastError).toBe("boom");
    });

    it("ends in offline phase and preserves lastSyncedAt when skipped", async () => {
        const { sync } = makeSync({ isOnline: () => false });
        await sync.enqueue("create", "r1", { id: "r1" });
        const summary = await sync.flush("manual");
        expect(summary.skipped).toBe(true);
        expect(sync.getState().phase).toBe("offline");
        expect(sync.getState().lastSyncedAt).toBeNull();
    });

    it("stops notifying after unsubscribe", async () => {
        const { sync } = makeSync();
        const listener = vi.fn();
        const unsubscribe = sync.subscribe(listener);
        unsubscribe();
        await sync.enqueue("create", "r1", { id: "r1" });
        await waitFor(() => sync.getState().pending === 1);
        expect(listener).not.toHaveBeenCalled();
    });

    it("resets pending to zero on clearOutbox", async () => {
        const { sync } = makeSync();
        await sync.enqueue("create", "r1", { id: "r1" });
        await sync.enqueue("create", "r2", { id: "r2" });
        await sync.clearOutbox();
        expect(sync.getState().pending).toBe(0);
    });
});
