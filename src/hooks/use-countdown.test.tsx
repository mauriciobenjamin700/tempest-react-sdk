import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "./use-countdown";

const EPOCH = new Date("2026-01-01T00:00:00Z").getTime();

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useCountdown", () => {
    it("reports the full duration at the start", () => {
        const { result } = renderHook(() => useCountdown(5000, EPOCH));
        expect(result.current).toBe(5000);
    });

    it("decreases as the clock advances", () => {
        const { result } = renderHook(() => useCountdown(5000, EPOCH));

        act(() => void vi.advanceTimersByTime(1000));
        expect(result.current).toBe(4000);

        act(() => void vi.advanceTimersByTime(2000));
        expect(result.current).toBe(2000);
    });

    it("clamps at zero and stops its interval", () => {
        const { result } = renderHook(() => useCountdown(2000, EPOCH));

        act(() => void vi.advanceTimersByTime(5000));
        expect(result.current).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("starts at zero for a window that already elapsed, scheduling nothing", () => {
        const { result } = renderHook(() => useCountdown(1000, EPOCH - 9999));
        expect(result.current).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("derives from the clock, so a remount resumes instead of restarting", () => {
        const first = renderHook(() => useCountdown(10_000, EPOCH));
        act(() => void vi.advanceTimersByTime(6000));
        expect(first.result.current).toBe(4000);
        first.unmount();

        // A hook decrementing a counter in state would report 10_000 here.
        const second = renderHook(() => useCountdown(10_000, EPOCH));
        expect(second.result.current).toBe(4000);
    });

    it("honours a custom tick cadence", () => {
        const { result } = renderHook(() => useCountdown(1000, EPOCH, { tickMs: 100 }));

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current).toBe(900);

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current).toBe(800);
    });

    it("restarts when the window is reopened", () => {
        const { result, rerender } = renderHook(({ startedAt }) => useCountdown(3000, startedAt), {
            initialProps: { startedAt: EPOCH },
        });

        act(() => void vi.advanceTimersByTime(2000));
        expect(result.current).toBe(1000);

        rerender({ startedAt: Date.now() });
        expect(result.current).toBe(3000);
    });

    it("clears its interval on unmount", () => {
        const { unmount } = renderHook(() => useCountdown(60_000, EPOCH));
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
