import { describe, expect, it } from "vitest";

import { backdropRects, placeCard, type TourRect } from "./tour-position";

const VIEWPORT = { width: 1000, height: 800 };
const CARD = { width: 320, height: 160 };

/** A target rect, spelled out only where it matters. */
const rect = (overrides: Partial<TourRect> = {}): TourRect => ({
    top: 300,
    left: 400,
    width: 120,
    height: 40,
    ...overrides,
});

describe("placeCard", () => {
    it("centres the card when there is no target", () => {
        const result = placeCard({ target: null, card: CARD, viewport: VIEWPORT });
        expect(result.placement).toBe("center");
        expect(result.left).toBe((VIEWPORT.width - CARD.width) / 2);
        expect(result.top).toBe((VIEWPORT.height - CARD.height) / 2);
    });

    it("centres when the step asks for it", () => {
        const result = placeCard({
            target: rect(),
            card: CARD,
            viewport: VIEWPORT,
            preferred: "center",
        });
        expect(result.placement).toBe("center");
    });

    it("defaults to below the target, horizontally centred on it", () => {
        const target = rect();
        const result = placeCard({ target, card: CARD, viewport: VIEWPORT });
        expect(result.placement).toBe("bottom");
        expect(result.top).toBe(target.top + target.height + 12);
        expect(result.left).toBe(target.left + target.width / 2 - CARD.width / 2);
    });

    it("flips to the opposite side before trying a different axis", () => {
        // No room below: the card goes above, which keeps the reading relationship.
        const target = rect({ top: VIEWPORT.height - 60 });
        const result = placeCard({ target, card: CARD, viewport: VIEWPORT });
        expect(result.placement).toBe("top");
    });

    it("flips left to right and right to left", () => {
        expect(
            placeCard({
                target: rect({ left: 10 }),
                card: CARD,
                viewport: VIEWPORT,
                preferred: "left",
            }).placement,
        ).toBe("right");
        expect(
            placeCard({
                target: rect({ left: VIEWPORT.width - 130 }),
                card: CARD,
                viewport: VIEWPORT,
                preferred: "right",
            }).placement,
        ).toBe("left");
    });

    it("falls back to a side when neither above nor below fits", () => {
        const target = rect({ top: 100, height: 600 });
        const result = placeCard({ target, card: CARD, viewport: VIEWPORT });
        expect(["left", "right"]).toContain(result.placement);
    });

    it("centres when nothing fits anywhere", () => {
        // A target larger than the viewport — real, and worse than a card in the middle.
        const target = rect({ top: 0, left: 0, width: VIEWPORT.width, height: VIEWPORT.height });
        expect(placeCard({ target, card: CARD, viewport: VIEWPORT }).placement).toBe("center");
    });

    it("never pushes the card off the left or right edge", () => {
        for (const left of [0, VIEWPORT.width - 20]) {
            const result = placeCard({ target: rect({ left }), card: CARD, viewport: VIEWPORT });
            expect(result.left).toBeGreaterThanOrEqual(8);
            expect(result.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - 8);
        }
    });

    it("never pushes the card off the top or bottom edge", () => {
        for (const preferred of ["left", "right"] as const) {
            for (const top of [0, VIEWPORT.height - 20]) {
                const result = placeCard({
                    target: rect({ top }),
                    card: CARD,
                    viewport: VIEWPORT,
                    preferred,
                });
                expect(result.top).toBeGreaterThanOrEqual(8);
                expect(result.top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height - 8);
            }
        }
    });

    it("survives a viewport smaller than the card", () => {
        const result = placeCard({
            target: rect(),
            card: CARD,
            viewport: { width: 200, height: 100 },
        });
        expect(Number.isFinite(result.top)).toBe(true);
        expect(Number.isFinite(result.left)).toBe(true);
    });
});

describe("backdropRects", () => {
    it("covers the whole viewport when there is no target", () => {
        expect(backdropRects(null, VIEWPORT)).toEqual([
            { top: 0, left: 0, width: 1000, height: 800 },
        ]);
    });

    it("returns four rects around a target in the middle", () => {
        expect(backdropRects(rect(), VIEWPORT, 0)).toHaveLength(4);
    });

    it("leaves the target uncovered", () => {
        const target = rect();
        const rects = backdropRects(target, VIEWPORT, 0);
        const centre = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
        const covering = rects.filter(
            (r) =>
                centre.x >= r.left &&
                centre.x <= r.left + r.width &&
                centre.y >= r.top &&
                centre.y <= r.top + r.height,
        );
        expect(covering).toEqual([]);
    });

    it("keeps the padding clear around the target", () => {
        const target = rect();
        const rects = backdropRects(target, VIEWPORT, 10);
        const above = rects[0];
        expect(above.height).toBe(target.top - 10);
    });

    it("drops the empty rects when the target touches an edge", () => {
        const rects = backdropRects(rect({ top: 0, left: 0 }), VIEWPORT, 0);
        expect(rects.every((r) => r.width > 0 && r.height > 0)).toBe(true);
        expect(rects).toHaveLength(2);
    });

    it("covers every pixel that is not the target", () => {
        const target = rect();
        const rects = backdropRects(target, VIEWPORT, 0);
        const probes = [
            { x: 5, y: 5 },
            { x: 995, y: 795 },
            { x: target.left - 5, y: target.top + 5 },
            { x: target.left + target.width + 5, y: target.top + 5 },
        ];
        for (const probe of probes) {
            const covered = rects.some(
                (r) =>
                    probe.x >= r.left &&
                    probe.x <= r.left + r.width &&
                    probe.y >= r.top &&
                    probe.y <= r.top + r.height,
            );
            expect(covered).toBe(true);
        }
    });
});
