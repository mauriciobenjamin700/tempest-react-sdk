import { useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";

/** Side of the anchor a floating layer is placed on. */
export type AnchorSide = "top" | "bottom" | "left" | "right";

/** Alignment of the floating layer along the anchor's edge. */
export type AnchorAlign = "start" | "center" | "end";

/** The viewport-relative box a placement is computed from. */
export interface AnchorRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

/** Everything {@link computeAnchorPosition} needs, all in CSS pixels. */
export interface AnchorGeometry {
    anchor: AnchorRect;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
    side: AnchorSide;
    align: AnchorAlign;
    offset: number;
    margin: number;
}

/** A resolved placement: viewport coordinates plus the side actually used. */
export interface AnchorPlacement {
    top: number;
    left: number;
    side: AnchorSide;
}

/** What {@link useAnchorPosition} keeps between measurements. */
interface MeasuredPlacement extends AnchorPlacement {
    /** The anchor's width, when the layer matches it. */
    width: number | undefined;
}

const OPPOSITE: Record<AnchorSide, AnchorSide> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
};

/** Distance kept between a floating layer and the viewport edge, in px. */
export const ANCHOR_VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, Math.max(min, max)));
}

function mainAxis(geometry: AnchorGeometry, side: AnchorSide): number {
    const { anchor, width, height, offset } = geometry;
    switch (side) {
        case "top":
            return anchor.top - offset - height;
        case "bottom":
            return anchor.top + anchor.height + offset;
        case "left":
            return anchor.left - offset - width;
        case "right":
        default:
            return anchor.left + anchor.width + offset;
    }
}

function fits(geometry: AnchorGeometry, side: AnchorSide): boolean {
    const { width, height, viewportWidth, viewportHeight, margin } = geometry;
    const start = mainAxis(geometry, side);
    const size = side === "top" || side === "bottom" ? height : width;
    const limit = side === "top" || side === "bottom" ? viewportHeight : viewportWidth;
    return start >= margin && start + size <= limit - margin;
}

function crossAxis(start: number, length: number, size: number, align: AnchorAlign): number {
    if (align === "start") return start;
    if (align === "end") return start + length - size;
    return start + (length - size) / 2;
}

/**
 * Place a floating layer next to its anchor, inside the viewport.
 *
 * The requested side wins when the layer fits there. When it does not and the
 * opposite side does, the layer flips — the case that matters is the action menu
 * of the last row of a table near the bottom of the screen, which would otherwise
 * open below the fold. When neither side fits, the requested one is kept and the
 * layer is clamped, because a partially visible menu the user can scroll to beats
 * one that jumps sides depending on a pixel.
 *
 * Both axes are then clamped to the viewport minus `margin`.
 *
 * @param geometry - The anchor box, the floating layer's size, the viewport, and
 * the requested placement.
 * @returns The viewport coordinates for a `position: fixed` layer, and the side
 * that was used after flipping.
 */
export function computeAnchorPosition(geometry: AnchorGeometry): AnchorPlacement {
    const { anchor, width, height, viewportWidth, viewportHeight, align, margin } = geometry;
    const requested = geometry.side;
    const flipped = OPPOSITE[requested];
    const side = !fits(geometry, requested) && fits(geometry, flipped) ? flipped : requested;
    const vertical = side === "top" || side === "bottom";
    const main = mainAxis(geometry, side);
    const top = vertical ? main : crossAxis(anchor.top, anchor.height, height, align);
    const left = vertical ? crossAxis(anchor.left, anchor.width, width, align) : main;
    return {
        top: clamp(top, margin, viewportHeight - height - margin),
        left: clamp(left, margin, viewportWidth - width - margin),
        side,
    };
}

/** Options of {@link useAnchorPosition}. */
export interface AnchorPositionOptions {
    /** Element the layer is anchored to. */
    anchor: HTMLElement | null;
    /** The floating layer itself, once mounted. */
    floating: HTMLElement | null;
    side: AnchorSide;
    align: AnchorAlign;
    /** Gap between anchor and layer, in px. */
    offset: number;
    /** When false the hook does nothing and returns `undefined`. */
    enabled: boolean;
    /**
     * Give the layer the anchor's width — a listbox under its input. Default
     * `false`.
     */
    matchWidth?: boolean;
}

/**
 * Keep a portalled layer glued to its anchor.
 *
 * Takes the floating element as a value rather than a ref, because `Portal`
 * renders `null` on its first pass and mounts in an effect: a layout effect keyed
 * off `open` would run while the layer does not exist and measure nothing. With
 * the node held in state (a callback ref), the effect runs on the render that has
 * it, and `useLayoutEffect` settles the position before the first paint.
 *
 * The size comes from `offsetWidth`/`offsetHeight`, not from
 * `getBoundingClientRect`, which reports the transformed box — the layers enter
 * with a `translate`/`scale` animation, and the transformed rect would place them
 * a few pixels off. The anchor's rect is the right one to read: it is where the
 * trigger is painted.
 *
 * Scroll (captured, so a scrolling table wrapper counts) and resize reposition the
 * layer on the next animation frame, so a menu open inside a table that scrolls
 * follows its row instead of floating where the row used to be. So does a change
 * in the size of either box, through a `ResizeObserver`: a combobox list flipped
 * above its input shrinks as the user types, and a multi-select field grows a
 * line as chips are added — without the observer the list would keep its old
 * top and float away from the field, or cover it.
 *
 * With `matchWidth` the anchor's width is written to the layer **before** its
 * height is read, so the height is measured at the width it will be painted at —
 * a list whose options wrap at the narrower width is taller.
 *
 * The unmeasured first pass is **not** hidden with `visibility: hidden`: an
 * element under it cannot take focus, and the menu's focus effect runs before
 * the measured re-render, so the first entry silently kept no focus (measured in
 * Chrome; jsdom does not enforce it). Nothing is painted at the unmeasured
 * position anyway — the layout effect re-renders before the browser paints.
 *
 * @param options - Anchor, floating node, placement, and whether it is active.
 * @returns A `position: fixed` style for the layer, or `undefined` when disabled.
 */
export function useAnchorPosition({
    anchor,
    floating,
    side,
    align,
    offset,
    enabled,
    matchWidth = false,
}: AnchorPositionOptions): CSSProperties | undefined {
    const [placement, setPlacement] = useState<MeasuredPlacement | null>(null);

    useLayoutEffect(() => {
        if (!enabled || !anchor || !floating) {
            setPlacement(null);
            return;
        }
        const update = (): void => {
            const rect = anchor.getBoundingClientRect();
            const width = matchWidth ? rect.width : undefined;
            if (width !== undefined) floating.style.setProperty("width", `${width}px`);
            const position = computeAnchorPosition({
                anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                width: floating.offsetWidth,
                height: floating.offsetHeight,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                side,
                align,
                offset,
                margin: ANCHOR_VIEWPORT_MARGIN,
            });
            const next: MeasuredPlacement = { ...position, width };
            setPlacement((current) =>
                current &&
                current.top === next.top &&
                current.left === next.left &&
                current.side === next.side &&
                current.width === next.width
                    ? current
                    : next,
            );
        };
        update();
        let frame = 0;
        const schedule = (): void => {
            if (frame !== 0) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                update();
            });
        };
        window.addEventListener("scroll", schedule, { capture: true, passive: true });
        window.addEventListener("resize", schedule);
        const observer =
            typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
        observer?.observe(floating);
        observer?.observe(anchor);
        return () => {
            observer?.disconnect();
            if (frame !== 0) cancelAnimationFrame(frame);
            window.removeEventListener("scroll", schedule, { capture: true });
            window.removeEventListener("resize", schedule);
        };
    }, [enabled, anchor, floating, side, align, offset, matchWidth]);

    if (!enabled) return undefined;
    return {
        position: "fixed",
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        width: placement?.width,
    };
}
