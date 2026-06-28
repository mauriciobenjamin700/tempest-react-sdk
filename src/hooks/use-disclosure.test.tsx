import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDisclosure } from "./use-disclosure";

describe("useDisclosure", () => {
    it("defaults to closed", () => {
        const { result } = renderHook(() => useDisclosure());
        expect(result.current[0]).toBe(false);
    });

    it("respects initial value", () => {
        const { result } = renderHook(() => useDisclosure(true));
        expect(result.current[0]).toBe(true);
    });

    it("open / close / toggle", () => {
        const { result } = renderHook(() => useDisclosure());
        act(() => result.current[1].open());
        expect(result.current[0]).toBe(true);
        act(() => result.current[1].close());
        expect(result.current[0]).toBe(false);
        act(() => result.current[1].toggle());
        expect(result.current[0]).toBe(true);
        act(() => result.current[1].toggle());
        expect(result.current[0]).toBe(false);
    });

    it("handlers are stable across renders", () => {
        const { result, rerender } = renderHook(() => useDisclosure());
        const first = result.current[1];
        rerender();
        expect(result.current[1]).toBe(first);
    });
});
