import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLatestRef } from "./use-latest-ref";

describe("useLatestRef", () => {
    it("exposes the initial value", () => {
        const { result } = renderHook(() => useLatestRef("first"));
        expect(result.current.current).toBe("first");
    });

    it("tracks the newest value across renders", () => {
        const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
            initialProps: { value: 1 },
        });

        rerender({ value: 2 });
        expect(result.current.current).toBe(2);

        rerender({ value: 3 });
        expect(result.current.current).toBe(3);
    });

    it("keeps the same ref object identity", () => {
        const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
            initialProps: { value: "a" },
        });

        const first = result.current;
        rerender({ value: "b" });
        expect(result.current).toBe(first);
    });

    it("is already current when a closure created on mount reads it later", () => {
        let read: (() => number) | undefined;

        const { rerender } = renderHook(
            ({ value }) => {
                const ref = useLatestRef(value);
                read ??= () => ref.current;
                return null;
            },
            { initialProps: { value: 10 } },
        );

        expect(read?.()).toBe(10);
        rerender({ value: 20 });
        // The closure was built on the first render and never re-created — this
        // is the whole point of the hook.
        expect(read?.()).toBe(20);
    });

    it("handles nullish and object values", () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: unknown }) => useLatestRef(value),
            { initialProps: { value: null as unknown } },
        );
        expect(result.current.current).toBeNull();

        const obj = { a: 1 };
        rerender({ value: obj });
        expect(result.current.current).toBe(obj);

        rerender({ value: undefined });
        expect(result.current.current).toBeUndefined();
    });
});
