import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useIntersectionObserver } from "./use-intersection-observer";

class IOMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(public callback: IntersectionObserverCallback) {}
    trigger(entries: Partial<IntersectionObserverEntry>[]): void {
        this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
    }
}

describe("useIntersectionObserver", () => {
    it("returns null until observed", () => {
        Object.defineProperty(globalThis, "IntersectionObserver", {
            writable: true,
            value: IOMock,
        });
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            return useIntersectionObserver(ref);
        });
        expect(result.current).toBeNull();
    });
});
