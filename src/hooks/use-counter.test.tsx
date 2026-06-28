import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCounter } from "./use-counter";

describe("useCounter", () => {
    it("defaults to 0", () => {
        const { result } = renderHook(() => useCounter());
        expect(result.current[0]).toBe(0);
    });

    it("increment / decrement", () => {
        const { result } = renderHook(() => useCounter(5));
        act(() => result.current[1].increment());
        expect(result.current[0]).toBe(6);
        act(() => result.current[1].decrement());
        expect(result.current[0]).toBe(5);
    });

    it("clamps to max", () => {
        const { result } = renderHook(() => useCounter(0, { max: 1 }));
        act(() => result.current[1].increment());
        act(() => result.current[1].increment());
        expect(result.current[0]).toBe(1);
    });

    it("clamps to min", () => {
        const { result } = renderHook(() => useCounter(0, { min: 0 }));
        act(() => result.current[1].decrement());
        expect(result.current[0]).toBe(0);
    });

    it("clamps initial value into range", () => {
        const { result } = renderHook(() => useCounter(100, { min: 0, max: 10 }));
        expect(result.current[0]).toBe(10);
    });

    it("set clamps and reset restores clamped initial", () => {
        const { result } = renderHook(() => useCounter(5, { min: 0, max: 10 }));
        act(() => result.current[1].set(50));
        expect(result.current[0]).toBe(10);
        act(() => result.current[1].reset());
        expect(result.current[0]).toBe(5);
    });
});
