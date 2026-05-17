import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useToggle } from "./use-toggle";

describe("useToggle", () => {
    it("defaults to false", () => {
        const { result } = renderHook(() => useToggle());
        expect(result.current[0]).toBe(false);
    });

    it("toggle flips value", () => {
        const { result } = renderHook(() => useToggle());
        act(() => result.current[1].toggle());
        expect(result.current[0]).toBe(true);
        act(() => result.current[1].toggle());
        expect(result.current[0]).toBe(false);
    });

    it("setTrue / setFalse / set", () => {
        const { result } = renderHook(() => useToggle());
        act(() => result.current[1].setTrue());
        expect(result.current[0]).toBe(true);
        act(() => result.current[1].setFalse());
        expect(result.current[0]).toBe(false);
        act(() => result.current[1].set(true));
        expect(result.current[0]).toBe(true);
    });

    it("respects initial value", () => {
        const { result } = renderHook(() => useToggle(true));
        expect(result.current[0]).toBe(true);
    });
});
