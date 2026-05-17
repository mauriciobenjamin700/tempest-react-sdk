import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdle } from "./use-idle";

describe("useIdle", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("becomes idle after timeout", () => {
        const { result } = renderHook(() => useIdle(1000));
        expect(result.current).toBe(false);
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(result.current).toBe(true);
    });

    it("resets on activity", () => {
        const { result } = renderHook(() => useIdle(1000));
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(result.current).toBe(true);
        act(() => {
            window.dispatchEvent(new MouseEvent("mousemove"));
        });
        expect(result.current).toBe(false);
    });
});
