import { describe, expect, it } from "vitest";

import { areaPath, barRects, describeSeries, linePath, sparkPoints } from "./sparkline-geometry";

const BOX = { width: 100, height: 20, padding: 2 };

describe("sparkPoints", () => {
    it("spreads points evenly across the usable width", () => {
        const points = sparkPoints({ values: [0, 1, 2], ...BOX });
        expect(points.map((p) => p.x)).toEqual([2, 50, 98]);
    });

    it("inverts y — SVG grows down, a chart grows up", () => {
        const [low, high] = sparkPoints({ values: [0, 10], ...BOX });
        expect(low.y).toBeGreaterThan(high.y);
    });

    it("keeps every point inside the padded box", () => {
        for (const p of sparkPoints({ values: [5, -3, 99, 0], ...BOX })) {
            expect(p.x).toBeGreaterThanOrEqual(2);
            expect(p.x).toBeLessThanOrEqual(98);
            expect(p.y).toBeGreaterThanOrEqual(2);
            expect(p.y).toBeLessThanOrEqual(18);
        }
    });

    it("centres a flat series instead of pinning it to an edge", () => {
        const points = sparkPoints({ values: [7, 7, 7], ...BOX });
        expect(points.every((p) => p.y === 10)).toBe(true);
    });

    it("centres a single point horizontally too", () => {
        expect(sparkPoints({ values: [4], ...BOX })[0].x).toBe(50);
    });

    it("drops non-finite values rather than voiding the path", () => {
        // A NaN inside a `d` attribute silently blanks the whole path.
        const points = sparkPoints({ values: [1, Number.NaN, 3, Infinity], ...BOX });
        expect(points.map((p) => p.value)).toEqual([1, 3]);
    });

    it("keeps each point's index in the original series", () => {
        expect(sparkPoints({ values: [1, Number.NaN, 3], ...BOX }).map((p) => p.index)).toEqual([
            0, 2,
        ]);
    });

    it("honours an explicit domain, so several sparklines can be compared", () => {
        const shared = { ...BOX, min: 0, max: 100 };
        const low = sparkPoints({ values: [10], ...shared })[0];
        const high = sparkPoints({ values: [90], ...shared })[0];
        expect(low.y).toBeGreaterThan(high.y);
    });

    it("clamps a value outside an explicit domain", () => {
        const points = sparkPoints({ values: [-50, 150], ...BOX, min: 0, max: 100 });
        expect(points[0].y).toBe(18);
        expect(points[1].y).toBe(2);
    });

    it("returns nothing for an empty series or a zero-sized box", () => {
        expect(sparkPoints({ values: [], ...BOX })).toEqual([]);
        expect(sparkPoints({ values: [1, 2], width: 0, height: 20 })).toEqual([]);
    });
});

describe("linePath", () => {
    it("moves to the first point and lines to the rest", () => {
        const points = sparkPoints({ values: [0, 1], ...BOX });
        expect(linePath(points)).toBe(
            `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`,
        );
    });

    it("emits a zero-length segment for a lone point, so the cap still paints", () => {
        const [only] = sparkPoints({ values: [3], ...BOX });
        expect(linePath([only])).toBe(`M ${only.x} ${only.y} L ${only.x} ${only.y}`);
    });

    it("returns an empty string for no points", () => {
        expect(linePath([])).toBe("");
    });

    it("never emits NaN", () => {
        expect(linePath(sparkPoints({ values: [1, Number.NaN, 5], ...BOX }))).not.toContain("NaN");
    });
});

describe("areaPath", () => {
    it("closes the shape along the baseline", () => {
        const points = sparkPoints({ values: [1, 5], ...BOX });
        const d = areaPath(points, 18);
        expect(d.endsWith("Z")).toBe(true);
        expect(d).toContain("L 98 18");
        expect(d).toContain("L 2 18");
    });

    it("returns an empty string for no points", () => {
        expect(areaPath([], 18)).toBe("");
    });
});

describe("barRects", () => {
    const points = sparkPoints({ values: [1, 4, 2], ...BOX });

    it("leaves a gap between bars instead of filling the band", () => {
        const rects = barRects(points, { width: 100, baselineY: 18 });
        const band = 100 / points.length;
        expect(rects[0].width).toBeLessThan(band);
    });

    it("caps bar thickness so a short series does not become a block", () => {
        const wide = barRects(sparkPoints({ values: [1, 2], ...BOX }), {
            width: 400,
            baselineY: 18,
        });
        expect(wide[0].width).toBeLessThanOrEqual(24);
    });

    it("grows every bar from the baseline", () => {
        for (const rect of barRects(points, { width: 100, baselineY: 18 })) {
            expect(rect.y + rect.height).toBeCloseTo(18, 5);
        }
    });

    it("keeps a visible sliver for the smallest value", () => {
        const rects = barRects(sparkPoints({ values: [0, 100], ...BOX }), {
            width: 100,
            baselineY: 18,
        });
        expect(rects[0].height).toBeGreaterThanOrEqual(1);
    });

    it("returns nothing for no points", () => {
        expect(barRects([], { width: 100, baselineY: 18 })).toEqual([]);
    });
});

describe("describeSeries", () => {
    it("states the direction in words rather than leaving it to the shape", () => {
        expect(describeSeries([1, 2, 3])).toContain("subindo");
        expect(describeSeries([3, 2, 1])).toContain("descendo");
        expect(describeSeries([2, 5, 2])).toContain("estável");
    });

    it("reports the ends and the extremes", () => {
        const text = describeSeries([10, 40, 20]);
        expect(text).toContain("Início 10");
        expect(text).toContain("fim 20");
        expect(text).toContain("Mínimo 10");
        expect(text).toContain("máximo 40");
    });

    it("uses the caller's formatter", () => {
        expect(describeSeries([1000, 2000], (v) => `R$ ${v / 100}`)).toContain("R$ 10");
    });

    it("handles a single point and an empty series", () => {
        expect(describeSeries([5])).toBe("Valor único: 5");
        expect(describeSeries([])).toBe("Sem dados");
        expect(describeSeries([Number.NaN])).toBe("Sem dados");
    });

    it("ignores non-finite values in the summary", () => {
        expect(describeSeries([1, Number.NaN, 3])).toContain("2 pontos");
    });
});
