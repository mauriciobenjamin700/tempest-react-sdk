import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPress } from "./use-long-press";

function dispatchPointer(node: HTMLElement, type: string, x = 0, y = 0): void {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { clientX: x, clientY: y });
    node.dispatchEvent(event);
}

describe("useLongPress", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fires after delay when held", () => {
        const fn = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);
        const ref: RefObject<HTMLDivElement | null> = { current: el };
        renderHook(() => useLongPress(ref, fn, { delay: 500 }));
        act(() => {
            dispatchPointer(el, "pointerdown", 0, 0);
            vi.advanceTimersByTime(600);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        document.body.removeChild(el);
    });

    it("cancels when pointerup before delay", () => {
        const fn = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);
        const ref: RefObject<HTMLDivElement | null> = { current: el };
        renderHook(() => useLongPress(ref, fn, { delay: 500 }));
        act(() => {
            dispatchPointer(el, "pointerdown", 0, 0);
            vi.advanceTimersByTime(200);
            dispatchPointer(el, "pointerup", 0, 0);
            vi.advanceTimersByTime(500);
        });
        expect(fn).not.toHaveBeenCalled();
        document.body.removeChild(el);
    });

    it("cancels when pointer moves beyond moveThreshold", () => {
        const fn = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);
        const ref: RefObject<HTMLDivElement | null> = { current: el };
        renderHook(() => useLongPress(ref, fn, { delay: 500, moveThreshold: 5 }));
        act(() => {
            dispatchPointer(el, "pointerdown", 0, 0);
            dispatchPointer(el, "pointermove", 100, 100);
            vi.advanceTimersByTime(600);
        });
        expect(fn).not.toHaveBeenCalled();
        document.body.removeChild(el);
    });
});
