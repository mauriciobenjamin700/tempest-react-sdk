import { describe, expect, it } from "vitest";
import { fitProjection } from "@/geo/projection";
import { geometriesBounds, geometryCentroid, geometryPath, lerpColor } from "./svg-utils";
import type { BrUfGeometry } from "./br-geo";

const projection = fitProjection(
    { minLatitude: -1, maxLatitude: 1, minLongitude: -1, maxLongitude: 1 },
    100,
    100,
);

const square = {
    type: "Polygon",
    coordinates: [
        [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ],
    ],
} as unknown as BrUfGeometry;

describe("geometriesBounds", () => {
    it("spans every geometry it is given", () => {
        const bounds = geometriesBounds([square]);
        expect(bounds.minLongitude).toBeLessThanOrEqual(-1);
        expect(bounds.maxLatitude).toBeGreaterThanOrEqual(1);
    });
});

describe("geometryPath", () => {
    it("emits a closed subpath for a polygon", () => {
        const path = geometryPath(square, projection);
        expect(path.startsWith("M")).toBe(true);
        expect(path.endsWith("Z")).toBe(true);
    });

    it("walks every polygon of a multipolygon", () => {
        const multi = {
            type: "MultiPolygon",
            coordinates: [
                (square as unknown as { coordinates: unknown }).coordinates,
                (square as unknown as { coordinates: unknown }).coordinates,
            ],
        } as unknown as BrUfGeometry;
        expect(geometryPath(multi, projection).match(/Z/g)).toHaveLength(2);
    });
});

describe("geometryCentroid", () => {
    it("averages the points of the outer ring", () => {
        const centroid = geometryCentroid(square, projection);
        expect(Number.isFinite(centroid.x)).toBe(true);
        expect(Number.isFinite(centroid.y)).toBe(true);
    });

    it("returns the origin for a geometry with no rings", () => {
        const empty = { type: "Polygon", coordinates: [] } as unknown as BrUfGeometry;
        expect(geometryCentroid(empty, projection)).toEqual({ x: 0, y: 0 });
    });

    it("picks the largest ring of a multipolygon", () => {
        const multi = {
            type: "MultiPolygon",
            coordinates: [
                [
                    [
                        [0, 0],
                        [0, 1],
                    ],
                ],
                (square as unknown as { coordinates: unknown }).coordinates,
            ],
        } as unknown as BrUfGeometry;
        const centroid = geometryCentroid(multi, projection);
        expect(Number.isFinite(centroid.x)).toBe(true);
        expect(Number.isFinite(centroid.y)).toBe(true);
    });
});

describe("lerpColor", () => {
    it("expands 3-digit hex colors", () => {
        expect(lerpColor("#000", "#fff", 1)).toBe("rgb(255, 255, 255)");
        expect(lerpColor("#000", "#fff", 0)).toBe("rgb(0, 0, 0)");
    });

    it("blends 6-digit hex colors at the midpoint", () => {
        expect(lerpColor("#000000", "#ffffff", 0.5)).toBe("rgb(128, 128, 128)");
    });
});
