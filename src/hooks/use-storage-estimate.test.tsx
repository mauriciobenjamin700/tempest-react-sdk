import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    estimateStorage,
    requestPersistentStorage,
    useStorageEstimate,
} from "./use-storage-estimate";

const originalStorage = (navigator as { storage?: unknown }).storage;

afterEach(() => {
    if (originalStorage === undefined) {
        delete (navigator as { storage?: unknown }).storage;
    } else {
        Object.assign(navigator, { storage: originalStorage });
    }
});

function mockStorage(overrides: Record<string, unknown>): void {
    Object.assign(navigator, { storage: overrides });
}

describe("estimateStorage", () => {
    it("returns nulls when unsupported", async () => {
        delete (navigator as { storage?: unknown }).storage;
        expect(await estimateStorage()).toEqual({ usage: null, quota: null });
    });

    it("reads usage and quota", async () => {
        mockStorage({ estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 1000 }) });
        expect(await estimateStorage()).toEqual({ usage: 100, quota: 1000 });
    });
});

describe("requestPersistentStorage", () => {
    it("returns false when unsupported", async () => {
        delete (navigator as { storage?: unknown }).storage;
        expect(await requestPersistentStorage()).toBe(false);
    });

    it("short-circuits when already persisted", async () => {
        const persist = vi.fn();
        mockStorage({
            persist,
            persisted: vi.fn().mockResolvedValue(true),
        });
        expect(await requestPersistentStorage()).toBe(true);
        expect(persist).not.toHaveBeenCalled();
    });

    it("requests persistence when not yet granted", async () => {
        mockStorage({
            persist: vi.fn().mockResolvedValue(true),
            persisted: vi.fn().mockResolvedValue(false),
        });
        expect(await requestPersistentStorage()).toBe(true);
    });
});

describe("useStorageEstimate", () => {
    it("populates usage, quota and ratio", async () => {
        mockStorage({
            estimate: vi.fn().mockResolvedValue({ usage: 250, quota: 1000 }),
            persisted: vi.fn().mockResolvedValue(false),
        });
        const { result } = renderHook(() => useStorageEstimate());
        await waitFor(() => expect(result.current.usage).toBe(250));
        expect(result.current.quota).toBe(1000);
        expect(result.current.ratio).toBeCloseTo(0.25);
        expect(result.current.persisted).toBe(false);
    });

    it("marks unsupported when the Storage API is absent", async () => {
        delete (navigator as { storage?: unknown }).storage;
        const { result } = renderHook(() => useStorageEstimate());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.supported).toBe(false);
        expect(result.current.ratio).toBeNull();
    });

    it("requestPersist updates persisted state", async () => {
        mockStorage({
            estimate: vi.fn().mockResolvedValue({ usage: 1, quota: 2 }),
            persist: vi.fn().mockResolvedValue(true),
            persisted: vi.fn().mockResolvedValue(false),
        });
        const { result } = renderHook(() => useStorageEstimate());
        await waitFor(() => expect(result.current.loading).toBe(false));
        await act(async () => {
            const granted = await result.current.requestPersist();
            expect(granted).toBe(true);
        });
        expect(result.current.persisted).toBe(true);
    });
});

describe("useStorageEstimate — polling and partial support", () => {
    it("treats missing usage/quota fields as unknown and yields no ratio", async () => {
        mockStorage({ estimate: vi.fn().mockResolvedValue({}) });
        const { result } = renderHook(() => useStorageEstimate());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.usage).toBeNull();
        expect(result.current.quota).toBeNull();
        expect(result.current.ratio).toBeNull();
    });

    it("yields no ratio when the quota is zero", async () => {
        mockStorage({ estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 0 }) });
        const { result } = renderHook(() => useStorageEstimate());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.ratio).toBeNull();
    });

    it("leaves persisted null when the API lacks persisted()", async () => {
        mockStorage({ estimate: vi.fn().mockResolvedValue({ usage: 1, quota: 2 }) });
        const { result } = renderHook(() => useStorageEstimate());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.persisted).toBeNull();
    });

    it("re-reads on the poll interval and stops on unmount", async () => {
        vi.useFakeTimers();
        const estimate = vi.fn().mockResolvedValue({ usage: 1, quota: 2 });
        mockStorage({ estimate });
        const { unmount } = renderHook(() => useStorageEstimate({ pollMs: 50 }));

        await vi.advanceTimersByTimeAsync(120);
        const callsWhileMounted = estimate.mock.calls.length;
        expect(callsWhileMounted).toBeGreaterThan(1);

        unmount();
        await vi.advanceTimersByTimeAsync(200);
        expect(estimate.mock.calls.length).toBe(callsWhileMounted);
        vi.useRealTimers();
    });

    it("does not poll when the API is unsupported", async () => {
        vi.useFakeTimers();
        delete (navigator as { storage?: unknown }).storage;
        const { result } = renderHook(() => useStorageEstimate({ pollMs: 10 }));
        await vi.advanceTimersByTimeAsync(100);
        expect(result.current.supported).toBe(false);
        expect(result.current.loading).toBe(false);
        vi.useRealTimers();
    });

    it("refresh() is a no-op when unsupported", async () => {
        delete (navigator as { storage?: unknown }).storage;
        const { result } = renderHook(() => useStorageEstimate());
        await act(async () => {
            await result.current.refresh();
        });
        expect(result.current.usage).toBeNull();
    });

    it("requestPersistentStorage returns false without persist()", async () => {
        mockStorage({ estimate: vi.fn().mockResolvedValue({}) });
        expect(await requestPersistentStorage()).toBe(false);
    });
});
