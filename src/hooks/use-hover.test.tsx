import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { describe, expect, it } from "vitest";
import { useHover } from "./use-hover";

describe("useHover", () => {
    it("returns true after mouseenter and false after mouseleave", () => {
        const el = document.createElement("div");
        document.body.appendChild(el);
        const ref: RefObject<HTMLDivElement | null> = { current: el };
        const { result } = renderHook(() => useHover(ref));
        expect(result.current).toBe(false);
        act(() => {
            el.dispatchEvent(new MouseEvent("mouseenter"));
        });
        expect(result.current).toBe(true);
        act(() => {
            el.dispatchEvent(new MouseEvent("mouseleave"));
        });
        expect(result.current).toBe(false);
        document.body.removeChild(el);
    });

    it("returns false when ref has no current", () => {
        const ref: RefObject<HTMLDivElement | null> = { current: null };
        const { result } = renderHook(() => useHover(ref));
        expect(result.current).toBe(false);
    });
});
