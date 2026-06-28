import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useListState } from "./use-list-state";

describe("useListState", () => {
    it("defaults to empty list", () => {
        const { result } = renderHook(() => useListState<number>());
        expect(result.current[0]).toEqual([]);
    });

    it("append / prepend", () => {
        const { result } = renderHook(() => useListState<number>([1]));
        act(() => result.current[1].append(2, 3));
        expect(result.current[0]).toEqual([1, 2, 3]);
        act(() => result.current[1].prepend(0));
        expect(result.current[0]).toEqual([0, 1, 2, 3]);
    });

    it("insert", () => {
        const { result } = renderHook(() => useListState<number>([1, 4]));
        act(() => result.current[1].insert(1, 2, 3));
        expect(result.current[0]).toEqual([1, 2, 3, 4]);
    });

    it("remove multiple indices", () => {
        const { result } = renderHook(() => useListState<number>([1, 2, 3, 4]));
        act(() => result.current[1].remove(0, 2));
        expect(result.current[0]).toEqual([2, 4]);
    });

    it("reorder", () => {
        const { result } = renderHook(() => useListState<string>(["a", "b", "c"]));
        act(() => result.current[1].reorder({ from: 0, to: 2 }));
        expect(result.current[0]).toEqual(["b", "c", "a"]);
    });

    it("setItem / setState / apply / clear", () => {
        const { result } = renderHook(() => useListState<number>([1, 2, 3]));
        act(() => result.current[1].setItem(1, 20));
        expect(result.current[0]).toEqual([1, 20, 3]);
        act(() => result.current[1].apply((n) => n * 2));
        expect(result.current[0]).toEqual([2, 40, 6]);
        act(() => result.current[1].setState([9]));
        expect(result.current[0]).toEqual([9]);
        act(() => result.current[1].clear());
        expect(result.current[0]).toEqual([]);
    });

    it("handlers are stable across renders", () => {
        const { result, rerender } = renderHook(() => useListState<number>());
        const first = result.current[1];
        rerender();
        expect(result.current[1]).toBe(first);
    });
});
