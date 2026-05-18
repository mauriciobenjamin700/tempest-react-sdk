import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePrevious } from "./use-previous";

describe("usePrevious", () => {
    it("returns undefined on first render", () => {
        const { result } = renderHook(({ value }: { value: number }) => usePrevious(value), {
            initialProps: { value: 1 },
        });
        expect(result.current).toBeUndefined();
    });

    it("returns the previous value after re-render", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: number }) => usePrevious(value),
            { initialProps: { value: 1 } },
        );
        rerender({ value: 2 });
        expect(result.current).toBe(1);
        rerender({ value: 5 });
        expect(result.current).toBe(2);
    });

    it("works with reference types", () => {
        const a = { id: 1 };
        const b = { id: 2 };
        const { result, rerender } = renderHook(
            ({ value }: { value: typeof a }) => usePrevious(value),
            { initialProps: { value: a } },
        );
        rerender({ value: b });
        expect(result.current).toBe(a);
    });
});
