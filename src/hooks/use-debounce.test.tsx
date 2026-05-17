import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./use-debounce";

describe("useDebounce", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("returns the initial value immediately", () => {
        const { result } = renderHook(() => useDebounce("a", 200));
        expect(result.current).toBe("a");
    });

    it("updates only after the delay", () => {
        const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounce(v, 200), {
            initialProps: { v: "a" },
        });
        rerender({ v: "b" });
        expect(result.current).toBe("a");
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(result.current).toBe("b");
    });
});
