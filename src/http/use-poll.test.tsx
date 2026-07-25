import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePoll } from "./use-poll";

describe("usePoll", () => {
    it("fetches on mount", async () => {
        const factory = vi.fn().mockResolvedValue(42);
        const { result } = renderHook(() => usePoll(factory, { interval: 100_000 }));
        await waitFor(() => expect(result.current.data).toBe(42));
        expect(factory).toHaveBeenCalled();
    });

    it("does not fetch when disabled", () => {
        const factory = vi.fn().mockResolvedValue(1);
        renderHook(() => usePoll(factory, { interval: 100_000, disabled: true }));
        expect(factory).not.toHaveBeenCalled();
    });

    it("calls onError on rejected factory", async () => {
        const factory = vi.fn().mockRejectedValue(new Error("boom"));
        const onError = vi.fn();
        renderHook(() => usePoll(factory, { interval: 100_000, onError }));
        await waitFor(() => expect(onError).toHaveBeenCalled());
    });
});

describe("usePoll — custom key, stopWhen and throttling", () => {
    it("stops polling once stopWhen is satisfied", async () => {
        vi.useFakeTimers();
        const factory = vi
            .fn<() => Promise<{ done: boolean }>>()
            .mockResolvedValueOnce({ done: false })
            .mockResolvedValue({ done: true });

        renderHook(() => usePoll(factory, { intervalMs: 20, stopWhen: (value) => value.done }));
        await vi.advanceTimersByTimeAsync(100);
        const callsAfterStop = factory.mock.calls.length;

        await vi.advanceTimersByTimeAsync(200);
        expect(factory.mock.calls.length).toBe(callsAfterStop);
        vi.useRealTimers();
    });

    it("stops on unmount", async () => {
        vi.useFakeTimers();
        const factory = vi.fn(async () => 1);
        const { unmount } = renderHook(() => usePoll(factory, { intervalMs: 20 }));
        await vi.advanceTimersByTimeAsync(50);
        const before = factory.mock.calls.length;

        unmount();
        await vi.advanceTimersByTimeAsync(200);
        expect(factory.mock.calls.length).toBe(before);
        vi.useRealTimers();
    });

    it("clears a pending timer when it becomes disabled", async () => {
        vi.useFakeTimers();
        const factory = vi.fn(async () => 1);
        const { rerender } = renderHook(
            ({ disabled }: { disabled: boolean }) => usePoll(factory, { intervalMs: 20, disabled }),
            { initialProps: { disabled: false } },
        );
        await vi.advanceTimersByTimeAsync(50);
        const before = factory.mock.calls.length;

        rerender({ disabled: true });
        await vi.advanceTimersByTimeAsync(200);
        expect(factory.mock.calls.length).toBe(before);
        vi.useRealTimers();
    });
});
