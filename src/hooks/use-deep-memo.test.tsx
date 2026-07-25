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

describe("useDeepMemo — structural mismatches", () => {
    it("treats an array and an object as different", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: unknown }) => useDeepMemo(value),
            {
                initialProps: { value: [1, 2] as unknown },
            },
        );
        const first = result.current;
        rerender({ value: { 0: 1, 1: 2 } as unknown });
        expect(result.current).not.toBe(first);
    });

    it("treats arrays of different length as different", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: number[] }) => useDeepMemo(value),
            {
                initialProps: { value: [1, 2] },
            },
        );
        const first = result.current;
        rerender({ value: [1, 2, 3] });
        expect(result.current).not.toBe(first);
    });

    it("treats objects with a different key count as different", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: Record<string, number> }) => useDeepMemo(value),
            { initialProps: { value: { a: 1 } } },
        );
        const first = result.current;
        rerender({ value: { a: 1, b: 2 } });
        expect(result.current).not.toBe(first);
    });

    it("treats a primitive and an object as different", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: unknown }) => useDeepMemo(value),
            {
                initialProps: { value: { a: 1 } as unknown },
            },
        );
        const first = result.current;
        rerender({ value: 5 as unknown });
        expect(result.current).not.toBe(first);
    });
});
