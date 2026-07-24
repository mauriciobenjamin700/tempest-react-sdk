import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSyncConfig,
    type PullPage,
    type WatermarkStore,
} from "./create-offline-sync";
import { useOfflineSync, useSyncStatus } from "./use-offline-sync";

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
        databaseName: `hook-${Math.random().toString(36).slice(2)}`,
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
    return createOfflineSync(config);
}

describe("useOfflineSync", () => {
    it("exposes reactive pending after enqueue", async () => {
        const sync = makeSync();
        const { result } = renderHook(() => useOfflineSync(sync, { flushOnOnline: false }));
        expect(result.current.pending).toBe(0);
        await act(async () => {
            await result.current.enqueue("create", "r1", { id: "r1" });
        });
        await waitFor(() => expect(result.current.pending).toBe(1));
    });

    it("reflects syncing then idle across a flush", async () => {
        const sync = makeSync();
        const { result } = renderHook(() => useOfflineSync(sync, { flushOnOnline: false }));
        await act(async () => {
            await result.current.enqueue("create", "r1", { id: "r1" });
        });
        await act(async () => {
            await result.current.flush("manual");
        });
        expect(result.current.phase).toBe("idle");
        expect(result.current.syncing).toBe(false);
        expect(result.current.pending).toBe(0);
    });

    it("flushes on mount when flushOnMount is set", async () => {
        const sync = makeSync();
        const flushSpy = vi.spyOn(sync, "flush");
        renderHook(() => useOfflineSync(sync, { flushOnMount: true, flushOnOnline: false }));
        await waitFor(() => expect(flushSpy).toHaveBeenCalledWith("boot"));
    });

    it("flushes on the online event when enabled", async () => {
        const sync = makeSync();
        const flushSpy = vi.spyOn(sync, "flush");
        renderHook(() => useOfflineSync(sync, { flushOnOnline: true }));
        act(() => {
            window.dispatchEvent(new Event("online"));
        });
        await waitFor(() => expect(flushSpy).toHaveBeenCalledWith("online-event"));
    });

    it("flushes on the configured interval", () => {
        vi.useFakeTimers();
        try {
            const sync = makeSync();
            const flushSpy = vi.spyOn(sync, "flush");
            renderHook(() => useOfflineSync(sync, { flushOnOnline: false, intervalMs: 1000 }));
            act(() => {
                vi.advanceTimersByTime(2500);
            });
            expect(flushSpy).toHaveBeenCalledWith("interval");
            expect(flushSpy.mock.calls.filter((c) => c[0] === "interval").length).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("useSyncStatus", () => {
    it("reports idle tone with no pending", () => {
        const sync = makeSync();
        const { result } = renderHook(() => useSyncStatus(sync));
        expect(result.current.tone).toBe("idle");
        expect(result.current.pending).toBe(0);
    });

    it("reports pending tone once mutations are queued", async () => {
        const sync = makeSync();
        const { result } = renderHook(() => useSyncStatus(sync));
        await act(async () => {
            await sync.enqueue("create", "r1", { id: "r1" });
        });
        await waitFor(() => expect(result.current.tone).toBe("pending"));
        expect(result.current.pending).toBe(1);
    });

    it("reports error tone after a failed delivery", async () => {
        const sync = makeSync({
            deliver: vi.fn(async () => {
                throw new Error("boom");
            }),
        });
        const { result } = renderHook(() => useSyncStatus(sync));
        await act(async () => {
            await sync.enqueue("create", "r1", { id: "r1" });
            await sync.flush("manual");
        });
        await waitFor(() => expect(result.current.tone).toBe("error"));
        expect(result.current.lastError).toBe("boom");
    });
});
