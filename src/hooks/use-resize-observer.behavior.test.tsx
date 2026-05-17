import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useResizeObserver } from "./use-resize-observer";

let captured: ((entries: { contentRect: DOMRect }[]) => void) | null = null;
class ROMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(callback: (entries: { contentRect: DOMRect }[]) => void) {
        captured = callback;
    }
}

describe("useResizeObserver behavior", () => {
    it("emits width/height after resize", () => {
        Object.defineProperty(globalThis, "ResizeObserver", {
            writable: true,
            value: ROMock,
        });
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            ref.current = document.createElement("div");
            return useResizeObserver(ref);
        });
        act(() => {
            captured?.([{ contentRect: { width: 100, height: 50 } as DOMRect }]);
        });
        expect(result.current).toEqual({ width: 100, height: 50 });
    });
});
