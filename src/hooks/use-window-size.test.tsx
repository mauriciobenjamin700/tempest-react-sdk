import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWindowSize } from "./use-window-size";

describe("useWindowSize", () => {
    it("returns the current window dimensions", () => {
        const { result } = renderHook(() => useWindowSize());
        expect(result.current.width).toBe(window.innerWidth);
        expect(result.current.height).toBe(window.innerHeight);
    });

    it("updates on window resize", () => {
        const { result } = renderHook(() => useWindowSize());
        act(() => {
            Object.defineProperty(window, "innerWidth", { value: 1234, configurable: true });
            Object.defineProperty(window, "innerHeight", { value: 567, configurable: true });
            window.dispatchEvent(new Event("resize"));
        });
        expect(result.current.width).toBe(1234);
        expect(result.current.height).toBe(567);
    });
});
