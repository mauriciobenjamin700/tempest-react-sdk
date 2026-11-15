import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deepEqual, useDeepMemo } from "./use-deep-memo";

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
            { initialProps: { value: { a: 1 } as Record<string, number> } },
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

describe("deepEqual — objects whose state is not in their own keys", () => {
    it("tells two Sets with different members apart", () => {
        expect(deepEqual(new Set(["ovino"]), new Set(["caprino"]))).toBe(false);
        expect(deepEqual(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    });

    it("treats two Sets with the same members as equal, in any order", () => {
        expect(deepEqual(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    });

    it("compares Set members by SameValueZero, like Set.has", () => {
        expect(deepEqual(new Set([NaN]), new Set([NaN]))).toBe(true);
        expect(deepEqual(new Set([{ a: 1 }]), new Set([{ a: 1 }]))).toBe(false);
    });

    it("tells two Maps with different keys or values apart", () => {
        expect(deepEqual(new Map([["a", 1]]), new Map())).toBe(false);
        expect(deepEqual(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
        expect(deepEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    });

    it("compares Map values structurally", () => {
        expect(deepEqual(new Map([["a", { x: [1] }]]), new Map([["a", { x: [1] }]]))).toBe(true);
    });

    it("tells two Dates at different instants apart, and equal instants together", () => {
        expect(deepEqual(new Date(0), new Date(1))).toBe(false);
        expect(deepEqual(new Date(0), new Date(0))).toBe(true);
        expect(deepEqual(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
    });

    it("tells two RegExps apart by source and flags", () => {
        expect(deepEqual(/a/, /b/)).toBe(false);
        expect(deepEqual(/a/g, /a/i)).toBe(false);
        expect(deepEqual(/a/g, /a/g)).toBe(true);
    });

    it("compares binary data byte by byte", () => {
        expect(deepEqual(new Uint8Array([1]).buffer, new Uint8Array([2]).buffer)).toBe(false);
        expect(
            deepEqual(
                new DataView(new Uint8Array([1]).buffer),
                new DataView(new Uint8Array([2]).buffer),
            ),
        ).toBe(false);
        expect(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    });

    it("never treats values of different types as equal", () => {
        expect(deepEqual(new Set(), {})).toBe(false);
        expect(deepEqual(new Map(), new Set())).toBe(false);
        expect(deepEqual(new Date(0), {})).toBe(false);
        expect(deepEqual(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
    });

    it("compares an instance with no own keys, such as a URL, by identity", () => {
        expect(deepEqual(new URL("https://a.test"), new URL("https://b.test"))).toBe(false);
    });

    it("keeps comparing class instances with own fields structurally", () => {
        class Point {
            constructor(
                public x: number,
                public y: number,
            ) {}
        }
        expect(deepEqual(new Point(1, 2), new Point(1, 2))).toBe(true);
        expect(deepEqual(new Point(1, 2), new Point(1, 3))).toBe(false);
    });

    it("hands useDeepMemo a new reference when only a Set member changed", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: Set<string> }) => useDeepMemo(value),
            {
                initialProps: { value: new Set(["ovino"]) },
            },
        );
        const first = result.current;
        rerender({ value: new Set(["caprino"]) });
        expect(result.current).not.toBe(first);
    });
});
