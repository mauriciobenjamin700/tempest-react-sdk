import { describe, expect, it } from "vitest";
import { fitProjection, projectMercator, unprojectMercator } from "./projection";
import type { Coordinate, GeoBounds } from "./types";

describe("projectMercator", () => {
    it("maps the origin (0,0) to the plane center (0.5, 0.5)", () => {
        const p = projectMercator({ latitude: 0, longitude: 0 });
        expect(p.x).toBeCloseTo(0.5, 6);
        expect(p.y).toBeCloseTo(0.5, 6);
    });

    it("maps the antimeridian corners to the plane edges", () => {
        expect(projectMercator({ latitude: 0, longitude: -180 }).x).toBeCloseTo(0, 6);
        expect(projectMercator({ latitude: 0, longitude: 180 }).x).toBeCloseTo(1, 6);
    });

    it("grows y southward (north has smaller y)", () => {
        const north = projectMercator({ latitude: 40, longitude: 0 });
        const south = projectMercator({ latitude: -40, longitude: 0 });
        expect(north.y).toBeLessThan(south.y);
    });
});

describe("unprojectMercator", () => {
    it("round-trips within tolerance", () => {
        const coord: Coordinate = { latitude: -23.5505, longitude: -46.6333 };
        const back = unprojectMercator(projectMercator(coord));
        expect(back.latitude).toBeCloseTo(coord.latitude, 6);
        expect(back.longitude).toBeCloseTo(coord.longitude, 6);
    });
});

describe("fitProjection", () => {
    const bounds: GeoBounds = {
        minLatitude: -1,
        maxLatitude: 1,
        minLongitude: -1,
        maxLongitude: 1,
    };

    it("keeps projected points inside the viewport", () => {
        const projection = fitProjection(bounds, 400, 300, { padding: 20 });
        const p = projection.project({ latitude: 0, longitude: 0 });
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(400);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(300);
    });

    it("centers the mid-coordinate near the viewport center", () => {
        const projection = fitProjection(bounds, 400, 400, { padding: 0 });
        const p = projection.project({ latitude: 0, longitude: 0 });
        expect(p.x).toBeCloseTo(200, 0);
        expect(p.y).toBeCloseTo(200, 0);
    });
});
