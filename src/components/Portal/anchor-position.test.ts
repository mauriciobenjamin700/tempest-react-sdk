import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeAnchorPosition, useAnchorPosition } from "./anchor-position";
import type { AnchorGeometry } from "./anchor-position";

const base: AnchorGeometry = {
    anchor: { top: 100, left: 200, width: 40, height: 20 },
    width: 100,
    height: 50,
    viewportWidth: 1000,
    viewportHeight: 800,
    side: "bottom",
    align: "start",
    offset: 4,
    margin: 8,
};

describe("computeAnchorPosition", () => {
    it("places the layer on the requested side with the offset", () => {
        expect(computeAnchorPosition(base)).toEqual({ top: 124, left: 200, side: "bottom" });
        expect(computeAnchorPosition({ ...base, side: "top" })).toEqual({
            top: 46,
            left: 200,
            side: "top",
        });
        expect(computeAnchorPosition({ ...base, side: "right", align: "center" })).toEqual({
            top: 85,
            left: 244,
            side: "right",
        });
        expect(computeAnchorPosition({ ...base, side: "left", align: "end" })).toEqual({
            top: 70,
            left: 96,
            side: "left",
        });
    });

    it("aligns along the anchor edge", () => {
        expect(computeAnchorPosition({ ...base, align: "end" }).left).toBe(140);
        expect(computeAnchorPosition({ ...base, align: "center" }).left).toBe(170);
    });

    it("flips to the opposite side when the requested one overflows and the other fits", () => {
        const nearBottom = { ...base, anchor: { ...base.anchor, top: 760 } };
        expect(computeAnchorPosition(nearBottom)).toEqual({ top: 706, left: 200, side: "top" });
        const nearTop = { ...base, side: "top" as const, anchor: { ...base.anchor, top: 10 } };
        expect(computeAnchorPosition(nearTop).side).toBe("bottom");
        const nearRight = {
            ...base,
            side: "right" as const,
            anchor: { ...base.anchor, left: 900 },
        };
        expect(computeAnchorPosition(nearRight).side).toBe("left");
    });

    it("keeps the requested side and clamps when neither side fits", () => {
        const tall = { ...base, height: 790 };
        const result = computeAnchorPosition(tall);
        expect(result.side).toBe("bottom");
        expect(result.top).toBe(8);
    });

    it("clamps the cross axis inside the viewport margin", () => {
        const atRightEdge = { ...base, anchor: { ...base.anchor, left: 960 } };
        expect(computeAnchorPosition(atRightEdge).left).toBe(1000 - 100 - 8);
        const atLeftEdge = { ...base, align: "end" as const, anchor: { ...base.anchor, left: 0 } };
        expect(computeAnchorPosition(atLeftEdge).left).toBe(8);
    });
});

/**
 * An anchor at a fixed rect and a floating node with a fixed size, attached to the
 * document so their listeners and observers see real nodes.
 *
 * @param rect - Where the anchor is painted.
 * @returns The two nodes and a setter that moves the anchor.
 */
function buildNodes(rect: { top: number; left: number; width: number; height: number }): {
    anchor: HTMLElement;
    floating: HTMLElement;
    moveAnchor: (top: number) => void;
} {
    let current = { ...rect };
    const anchor = document.createElement("button");
    anchor.getBoundingClientRect = () =>
        ({
            ...current,
            right: current.left + current.width,
            bottom: current.top + current.height,
            x: current.left,
            y: current.top,
            toJSON: () => ({}),
        }) as DOMRect;
    const floating = document.createElement("div");
    Object.defineProperty(floating, "offsetWidth", { configurable: true, value: 100 });
    Object.defineProperty(floating, "offsetHeight", { configurable: true, value: 50 });
    document.body.append(anchor, floating);
    return {
        anchor,
        floating,
        moveAnchor: (top) => {
            current = { ...current, top };
        },
    };
}

describe("useAnchorPosition", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("returns undefined while disabled", () => {
        const { anchor, floating } = buildNodes({ top: 100, left: 200, width: 40, height: 20 });
        const { result } = renderHook(() =>
            useAnchorPosition({
                anchor,
                floating,
                side: "bottom",
                align: "start",
                offset: 4,
                enabled: false,
            }),
        );
        expect(result.current).toBeUndefined();
    });

    it("places the layer and writes the anchor width before measuring with matchWidth", () => {
        const { anchor, floating } = buildNodes({ top: 100, left: 200, width: 40, height: 20 });
        const { result } = renderHook(() =>
            useAnchorPosition({
                anchor,
                floating,
                side: "bottom",
                align: "start",
                offset: 4,
                enabled: true,
                matchWidth: true,
            }),
        );
        expect(floating.style.width).toBe("40px");
        expect(result.current).toMatchObject({ position: "fixed", top: 124, left: 200, width: 40 });
    });

    it("follows the anchor on scroll, coalescing a burst into one frame", () => {
        const frames: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const { anchor, floating, moveAnchor } = buildNodes({
            top: 100,
            left: 200,
            width: 40,
            height: 20,
        });
        const { result } = renderHook(() =>
            useAnchorPosition({
                anchor,
                floating,
                side: "bottom",
                align: "start",
                offset: 4,
                enabled: true,
            }),
        );
        const before = result.current;

        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
        expect(frames).toHaveLength(1);

        act(() => frames[0]?.(0));
        expect(result.current).toBe(before);

        moveAnchor(300);
        window.dispatchEvent(new Event("scroll"));
        act(() => frames[1]?.(0));
        expect(result.current?.top).toBe(324);
    });

    it("observes both boxes and cancels a pending frame on unmount", () => {
        const observed: Element[] = [];
        const disconnect = vi.fn();
        let notify: () => void = () => undefined;
        class FakeResizeObserver {
            constructor(callback: () => void) {
                notify = callback;
            }
            observe(target: Element): void {
                observed.push(target);
            }
            disconnect(): void {
                disconnect();
            }
        }
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        vi.stubGlobal("requestAnimationFrame", () => 7);
        const cancel = vi.fn();
        vi.stubGlobal("cancelAnimationFrame", cancel);
        const { anchor, floating } = buildNodes({ top: 100, left: 200, width: 40, height: 20 });
        const { unmount } = renderHook(() =>
            useAnchorPosition({
                anchor,
                floating,
                side: "bottom",
                align: "start",
                offset: 4,
                enabled: true,
            }),
        );
        expect(observed).toEqual([floating, anchor]);

        notify();
        unmount();
        expect(disconnect).toHaveBeenCalledOnce();
        expect(cancel).toHaveBeenCalledWith(7);
    });
});
