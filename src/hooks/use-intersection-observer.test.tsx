import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useIntersectionObserver } from "./use-intersection-observer";

class IOMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(public callback: IntersectionObserverCallback) {}
    trigger(entries: Partial<IntersectionObserverEntry>[]): void {
        this.callback(
            entries as IntersectionObserverEntry[],
            this as unknown as IntersectionObserver,
        );
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

describe("useIntersectionObserver — target and entry guards", () => {
    it("does nothing while the ref is empty", () => {
        const observe = vi.fn();
        class Spy extends IOMock {
            override observe = observe;
        }
        Object.defineProperty(globalThis, "IntersectionObserver", { writable: true, value: Spy });

        renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            return useIntersectionObserver(ref);
        });
        expect(observe).not.toHaveBeenCalled();
    });

    it("observes an attached element and stores the entry", () => {
        const instances: IOMock[] = [];
        class Tracked extends IOMock {
            constructor(callback: IntersectionObserverCallback) {
                super(callback);
                instances.push(this);
            }
        }
        Object.defineProperty(globalThis, "IntersectionObserver", {
            writable: true,
            value: Tracked,
        });

        const element = document.createElement("div");
        document.body.appendChild(element);
        const { result, rerender } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(element);
            return useIntersectionObserver(ref);
        });

        act(() => instances[0].trigger([{ isIntersecting: true }]));
        rerender();
        expect(result.current?.isIntersecting).toBe(true);

        act(() => instances[0].trigger([]));
        expect(result.current?.isIntersecting).toBe(true);
        element.remove();
    });

    it("unobserves after the first intersection when once is set", () => {
        const instances: IOMock[] = [];
        class Tracked extends IOMock {
            constructor(callback: IntersectionObserverCallback) {
                super(callback);
                instances.push(this);
            }
        }
        Object.defineProperty(globalThis, "IntersectionObserver", {
            writable: true,
            value: Tracked,
        });

        const element = document.createElement("div");
        document.body.appendChild(element);
        renderHook(() => {
            const ref = useRef<HTMLDivElement>(element);
            return useIntersectionObserver(ref, { once: true });
        });

        act(() => instances[0].trigger([{ isIntersecting: true }]));
        expect(instances[0].unobserve).toHaveBeenCalledWith(element);
        element.remove();
    });

    it("skips observation entirely without IntersectionObserver support", () => {
        const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
        Object.defineProperty(globalThis, "IntersectionObserver", {
            writable: true,
            value: undefined,
        });
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(document.createElement("div"));
            return useIntersectionObserver(ref);
        });
        expect(result.current).toBeNull();
        Object.defineProperty(globalThis, "IntersectionObserver", {
            writable: true,
            value: original,
        });
    });
});
