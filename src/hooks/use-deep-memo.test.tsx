import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDeepMemo } from "./use-deep-memo";

describe("useDeepMemo", () => {
    it("returns the same reference when structurally equal", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: { a: number; b: number[] } }) => useDeepMemo(value),
            { initialProps: { value: { a: 1, b: [1, 2] } } },
        );
        const first = result.current;
        rerender({ value: { a: 1, b: [1, 2] } });
        expect(result.current).toBe(first);
    });

    it("updates when structurally different", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: { a: number } }) => useDeepMemo(value),
            { initialProps: { value: { a: 1 } } },
        );
        const first = result.current;
        rerender({ value: { a: 2 } });
        expect(result.current).not.toBe(first);
    });
});
