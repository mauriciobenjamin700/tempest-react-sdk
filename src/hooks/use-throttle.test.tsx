import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThrottle } from "./use-throttle";

describe("useThrottle", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("emits the initial value immediately", () => {
        const { result } = renderHook(({ value }: { value: number }) => useThrottle(value, 100), {
            initialProps: { value: 1 },
        });
        expect(result.current).toBe(1);
    });

    it("ignores rapid updates within the delay window", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: number }) => useThrottle(value, 100),
            { initialProps: { value: 1 } },
        );
        rerender({ value: 2 });
        rerender({ value: 3 });
        // Last value still pending — initial value emitted.
        expect(result.current).toBe(1);
    });

    it("emits the trailing value after the delay", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: number }) => useThrottle(value, 100),
            { initialProps: { value: 1 } },
        );
        rerender({ value: 2 });
        rerender({ value: 5 });
        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(result.current).toBe(5);
    });
});
