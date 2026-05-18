import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInterval } from "./use-interval";

describe("useInterval", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("calls the function on the given delay", () => {
        const fn = vi.fn();
        renderHook(() => useInterval(fn, 100));
        act(() => {
            vi.advanceTimersByTime(350);
        });
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("pauses when delay is null", () => {
        const fn = vi.fn();
        renderHook(() => useInterval(fn, null));
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(fn).not.toHaveBeenCalled();
    });

    it("clears the interval on unmount", () => {
        const fn = vi.fn();
        const { unmount } = renderHook(() => useInterval(fn, 100));
        act(() => {
            vi.advanceTimersByTime(100);
        });
        unmount();
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("uses the latest callback without resetting", () => {
        let counter = 0;
        const { rerender } = renderHook(
            ({ value }: { value: number }) =>
                useInterval(() => {
                    counter = value;
                }, 100),
            { initialProps: { value: 1 } },
        );
        rerender({ value: 42 });
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(counter).toBe(42);
    });
});
