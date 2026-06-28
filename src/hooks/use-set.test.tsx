import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSet } from "./use-set";

describe("useSet", () => {
    it("starts empty by default", () => {
        const { result } = renderHook(() => useSet<number>());
        expect(result.current.size).toBe(0);
    });

    it("accepts initial values", () => {
        const { result } = renderHook(() => useSet<number>([1, 2]));
        expect(result.current.has(1)).toBe(true);
        expect(result.current.size).toBe(2);
    });

    it("add / delete / clear reactively", () => {
        const { result } = renderHook(() => useSet<number>());
        act(() => result.current.add(1));
        expect(result.current.has(1)).toBe(true);
        expect(result.current.size).toBe(1);

        act(() => result.current.delete(1));
        expect(result.current.has(1)).toBe(false);

        act(() => result.current.add(2));
        act(() => result.current.clear());
        expect(result.current.size).toBe(0);
    });

    it("toggle adds then removes", () => {
        const { result } = renderHook(() => useSet<string>());
        act(() => result.current.toggle("x"));
        expect(result.current.has("x")).toBe(true);
        act(() => result.current.toggle("x"));
        expect(result.current.has("x")).toBe(false);
    });

    it("does not re-add an existing value", () => {
        const { result } = renderHook(() => useSet<number>([1]));
        act(() => result.current.add(1));
        expect(result.current.size).toBe(1);
    });
});
