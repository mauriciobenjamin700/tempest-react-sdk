import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useResizeObserver } from "./use-resize-observer";

class ROMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(public callback: ResizeObserverCallback) {}
}

describe("useResizeObserver", () => {
    it("returns null until measured", () => {
        Object.defineProperty(globalThis, "ResizeObserver", {
            writable: true,
            value: ROMock,
        });
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            return useResizeObserver(ref);
        });
        expect(result.current).toBeNull();
    });
});
