import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimeout } from "./use-timeout";

describe("useTimeout", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fires the callback after the delay", () => {
        const fn = vi.fn();
        renderHook(() => useTimeout(fn, 100));
        act(() => {
            vi.advanceTimersByTime(99);
        });
        expect(fn).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("disables when delay is null", () => {
        const fn = vi.fn();
        renderHook(() => useTimeout(fn, null));
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(fn).not.toHaveBeenCalled();
    });

    it("clears on unmount", () => {
        const fn = vi.fn();
        const { unmount } = renderHook(() => useTimeout(fn, 100));
        unmount();
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(fn).not.toHaveBeenCalled();
    });
});
