/** Where the card sits relative to the highlighted element. */
export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

/** A rectangle in viewport coordinates. */
export interface TourRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

/** Viewport size the placement is solved against. */
export interface TourViewport {
    width: number;
    height: number;
}

/** Gap between the highlighted element and the card. */
const OFFSET = 12;

/** Smallest margin the card keeps from the viewport edge. */
const MARGIN = 8;

/** Clamp a value into a range, tolerating a range narrower than the value. */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** Does the card fit on this side of the target? */
function fits(
    placement: TourPlacement,
    target: TourRect,
    card: { width: number; height: number },
    viewport: TourViewport,
): boolean {
    switch (placement) {
        case "top":
            return target.top - OFFSET - card.height >= MARGIN;
        case "bottom":
            return target.top + target.height + OFFSET + card.height <= viewport.height - MARGIN;
        case "left":
            return target.left - OFFSET - card.width >= MARGIN;
        case "right":
            return target.left + target.width + OFFSET + card.width <= viewport.width - MARGIN;
        default:
            return true;
    }
}

/** Sides tried, in order, when the preferred one does not fit. */
const FALLBACKS: Record<Exclude<TourPlacement, "center">, TourPlacement[]> = {
    bottom: ["bottom", "top", "right", "left"],
    top: ["top", "bottom", "right", "left"],
    right: ["right", "left", "bottom", "top"],
    left: ["left", "right", "bottom", "top"],
};

/**
 * Place the tour card next to the highlighted element.
 *
 * The preferred side is tried first and the opposite one second, because flipping
 * a "below" card to "above" keeps the reading relationship with the target;
 * jumping to a side would move the card across the screen for no reason the reader
 * can see.
 *
 * Nothing fitting anywhere ends at `center`: a card pinned half off-screen is worse
 * than a card in the middle, and this happens for real whenever the target is
 * taller than the viewport.
 *
 * The result is always clamped inside the viewport, so the card cannot be pushed
 * off the edge by a target near a corner.
 *
 * @param params.target - The highlighted element's rect, viewport coordinates.
 * @param params.card - Measured card size.
 * @param params.viewport - Viewport size.
 * @param params.preferred - Placement the step asked for. Default `"bottom"`.
 * @returns The chosen placement and the card's top/left.
 */
export function placeCard({
    target,
    card,
    viewport,
    preferred = "bottom",
}: {
    target: TourRect | null;
    card: { width: number; height: number };
    viewport: TourViewport;
    preferred?: TourPlacement;
}): { placement: TourPlacement; top: number; left: number } {
    const centered = {
        placement: "center" as TourPlacement,
        top: Math.max(MARGIN, (viewport.height - card.height) / 2),
        left: Math.max(MARGIN, (viewport.width - card.width) / 2),
    };

    // No target — a step whose element is not on the page still has to show its
    // message, so it is shown centered rather than dropped.
    if (!target || preferred === "center") return centered;

    const order = FALLBACKS[preferred as Exclude<TourPlacement, "center">] ?? FALLBACKS.bottom;
    const placement = order.find((candidate) => fits(candidate, target, card, viewport));
    if (!placement) return centered;

    const horizontalCenter = target.left + target.width / 2 - card.width / 2;
    const verticalCenter = target.top + target.height / 2 - card.height / 2;

    const raw =
        placement === "top"
            ? { top: target.top - OFFSET - card.height, left: horizontalCenter }
            : placement === "bottom"
              ? { top: target.top + target.height + OFFSET, left: horizontalCenter }
              : placement === "left"
                ? { top: verticalCenter, left: target.left - OFFSET - card.width }
                : { top: verticalCenter, left: target.left + target.width + OFFSET };

    return {
        placement,
        top: clamp(raw.top, MARGIN, viewport.height - card.height - MARGIN),
        left: clamp(raw.left, MARGIN, viewport.width - card.width - MARGIN),
    };
}

/**
 * The four backdrop rectangles that surround the highlighted element.
 *
 * Four rects rather than one overlay with a `box-shadow` hole: a box-shadow is not
 * hit-testable, so the "dimmed" area would not block clicks — and blocking the rest
 * of the page while leaving the highlighted control usable is the whole behaviour a
 * coachmark needs. Any rect that comes out empty is dropped, which is what happens
 * when the target touches an edge.
 *
 * @param target - Highlighted rect, or `null` for a full-screen backdrop.
 * @param viewport - Viewport size.
 * @param padding - Extra space kept clear around the target.
 */
export function backdropRects(
    target: TourRect | null,
    viewport: TourViewport,
    padding = 4,
): TourRect[] {
    if (!target) {
        return [{ top: 0, left: 0, width: viewport.width, height: viewport.height }];
    }
    const top = Math.max(0, target.top - padding);
    const left = Math.max(0, target.left - padding);
    const right = Math.min(viewport.width, target.left + target.width + padding);
    const bottom = Math.min(viewport.height, target.top + target.height + padding);

    return [
        { top: 0, left: 0, width: viewport.width, height: top },
        { top: bottom, left: 0, width: viewport.width, height: viewport.height - bottom },
        { top, left: 0, width: left, height: bottom - top },
        { top, left: right, width: viewport.width - right, height: bottom - top },
    ].filter((rect) => rect.width > 0 && rect.height > 0);
}
