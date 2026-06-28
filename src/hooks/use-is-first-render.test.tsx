import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useIsFirstRender } from "./use-is-first-render";

describe("useIsFirstRender", () => {
    it("is true on the first render and false after", () => {
        const { result, rerender } = renderHook(() => useIsFirstRender());
        expect(result.current).toBe(true);
        rerender();
        expect(result.current).toBe(false);
        rerender();
        expect(result.current).toBe(false);
    });
});
