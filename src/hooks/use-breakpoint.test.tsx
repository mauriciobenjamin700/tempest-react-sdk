import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { BREAKPOINTS, useBreakpoint } from "./use-breakpoint";

function setWindowWidth(width: number): void {
    Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: width,
    });
}

function resize(width: number): void {
    setWindowWidth(width);
    window.dispatchEvent(new Event("resize"));
}

describe("useBreakpoint", () => {
    beforeEach(() => {
        setWindowWidth(1024);
    });

    it("exposes BREAKPOINTS map", () => {
        expect(BREAKPOINTS.md).toBe(768);
        expect(BREAKPOINTS["2xl"]).toBe(1536);
    });

    it("returns the largest matching breakpoint", () => {
        setWindowWidth(900);
        const { result } = renderHook(() => useBreakpoint());
        expect(result.current.current).toBe("md");
    });

    it("updates on resize", () => {
        setWindowWidth(500);
        const { result } = renderHook(() => useBreakpoint());
        expect(result.current.current).toBe("xs");
        act(() => resize(1300));
        expect(result.current.current).toBe("xl");
    });

    it("derives isMobile / isTablet / isDesktop", () => {
        setWindowWidth(500);
        const { result, rerender } = renderHook(() => useBreakpoint());
        expect(result.current.isMobile).toBe(true);
        expect(result.current.isDesktop).toBe(false);

        act(() => resize(800));
        rerender();
        expect(result.current.isTablet).toBe(true);

        act(() => resize(1200));
        rerender();
        expect(result.current.isDesktop).toBe(true);
    });

    it("above() and below() helpers", () => {
        setWindowWidth(900);
        const { result } = renderHook(() => useBreakpoint());
        expect(result.current.above("md")).toBe(true);
        expect(result.current.above("lg")).toBe(false);
        expect(result.current.below("lg")).toBe(true);
        expect(result.current.below("sm")).toBe(false);
    });

    it("removes the resize listener on unmount", () => {
        const removeSpy = vi.spyOn(window, "removeEventListener");
        const { unmount } = renderHook(() => useBreakpoint());
        unmount();
        expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    });
});
