import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePagination } from "./use-pagination";

describe("usePagination", () => {
    it("starts at page 1 with size 50 by default", () => {
        const { result } = renderHook(() => usePagination());
        expect(result.current.page).toBe(1);
        expect(result.current.size).toBe(50);
    });

    it("respects initial values", () => {
        const { result } = renderHook(() => usePagination(3, 25));
        expect(result.current.page).toBe(3);
        expect(result.current.size).toBe(25);
    });

    it("setPage / setSize update state", () => {
        const { result } = renderHook(() => usePagination());
        act(() => result.current.setPage(5));
        act(() => result.current.setSize(10));
        expect(result.current.page).toBe(5);
        expect(result.current.size).toBe(10);
    });

    it("reset returns page to 1, keeps size", () => {
        const { result } = renderHook(() => usePagination(1, 25));
        act(() => result.current.setPage(7));
        act(() => result.current.reset());
        expect(result.current.page).toBe(1);
        expect(result.current.size).toBe(25);
    });
});
