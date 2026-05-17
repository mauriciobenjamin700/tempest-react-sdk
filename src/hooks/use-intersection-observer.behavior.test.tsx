import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useIntersectionObserver } from "./use-intersection-observer";

let captured: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
class IOMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        captured = callback;
    }
}

describe("useIntersectionObserver behavior", () => {
    it("emits the latest entry to the consumer", () => {
        Object.defineProperty(globalThis, "IntersectionObserver", {
            writable: true,
            value: IOMock,
        });
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            ref.current = document.createElement("div");
            return useIntersectionObserver(ref);
        });
        act(() => {
            captured?.([{ isIntersecting: true } as IntersectionObserverEntry]);
        });
        expect(result.current?.isIntersecting).toBe(true);
    });
});
