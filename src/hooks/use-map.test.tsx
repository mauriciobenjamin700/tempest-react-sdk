import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMap } from "./use-map";

describe("useMap", () => {
    it("starts empty by default", () => {
        const { result } = renderHook(() => useMap<string, number>());
        expect(result.current.size).toBe(0);
    });

    it("accepts initial entries", () => {
        const { result } = renderHook(() => useMap<string, number>([["a", 1]]));
        expect(result.current.get("a")).toBe(1);
        expect(result.current.has("a")).toBe(true);
        expect(result.current.size).toBe(1);
    });

    it("set / delete / clear re-render reactively", () => {
        const { result } = renderHook(() => useMap<string, number>());
        act(() => result.current.set("a", 1));
        expect(result.current.get("a")).toBe(1);
        expect(result.current.size).toBe(1);

        act(() => result.current.delete("a"));
        expect(result.current.has("a")).toBe(false);
        expect(result.current.size).toBe(0);

        act(() => result.current.set("b", 2));
        act(() => result.current.clear());
        expect(result.current.size).toBe(0);
    });

    it("yields a fresh map reference after mutation", () => {
        const { result } = renderHook(() => useMap<string, number>());
        const first = result.current.map;
        act(() => result.current.set("a", 1));
        expect(result.current.map).not.toBe(first);
    });
});
