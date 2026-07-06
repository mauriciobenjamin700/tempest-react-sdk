import { describe, expect, it } from "vitest";
import { boundingBox, boundsCenter, expandBounds } from "./bounds";
import type { Coordinate } from "./types";

const POINTS: Coordinate[] = [
    { latitude: -23.5, longitude: -46.6 },
    { latitude: -22.9, longitude: -43.1 },
    { latitude: -24.0, longitude: -47.0 },
];

describe("boundingBox", () => {
    it("returns null for an empty list", () => {
        expect(boundingBox([])).toBeNull();
    });

    it("encloses every point", () => {
        const box = boundingBox(POINTS);
        expect(box).toEqual({
            minLatitude: -24.0,
            maxLatitude: -22.9,
            minLongitude: -47.0,
            maxLongitude: -43.1,
        });
    });

    it("handles a single point (zero span)", () => {
        const box = boundingBox([POINTS[0]]);
        expect(box).toEqual({
            minLatitude: -23.5,
            maxLatitude: -23.5,
            minLongitude: -46.6,
            maxLongitude: -46.6,
        });
    });
});

describe("boundsCenter", () => {
    it("returns the geometric center", () => {
        const center = boundsCenter(boundingBox(POINTS)!);
        expect(center.latitude).toBeCloseTo(-23.45, 6);
        expect(center.longitude).toBeCloseTo(-45.05, 6);
    });
});

describe("expandBounds", () => {
    it("grows the box outward by the ratio", () => {
        const box = { minLatitude: 0, maxLatitude: 10, minLongitude: 0, maxLongitude: 20 };
        const grown = expandBounds(box, 0.1);
        expect(grown.minLatitude).toBeCloseTo(-1, 6);
        expect(grown.maxLatitude).toBeCloseTo(11, 6);
        expect(grown.minLongitude).toBeCloseTo(-2, 6);
        expect(grown.maxLongitude).toBeCloseTo(22, 6);
    });

    it("applies an absolute floor when the span is zero", () => {
        const box = { minLatitude: 5, maxLatitude: 5, minLongitude: 5, maxLongitude: 5 };
        const grown = expandBounds(box);
        expect(grown.maxLatitude).toBeGreaterThan(grown.minLatitude);
        expect(grown.maxLongitude).toBeGreaterThan(grown.minLongitude);
    });
});
