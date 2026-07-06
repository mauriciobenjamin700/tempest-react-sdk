import { describe, expect, it } from "vitest";
import { durationFactor, estimateTravel } from "./estimate";
import type { Coordinate } from "./types";

const A: Coordinate = { latitude: -23.5505, longitude: -46.6333 };
const B: Coordinate = { latitude: -23.5629, longitude: -46.6544 };

describe("durationFactor", () => {
    it("returns the default per-mode factors", () => {
        expect(durationFactor("car")).toBe(1.0);
        expect(durationFactor("motorcycle")).toBe(0.95);
        expect(durationFactor("bus")).toBe(1.6);
    });

    it("honors overrides", () => {
        expect(durationFactor("car", { car: 1.2 })).toBe(1.2);
    });
});

describe("estimateTravel", () => {
    it("produces a heuristic estimate with non-negative fields", () => {
        const est = estimateTravel(A, B, "car");
        expect(est.mode).toBe("car");
        expect(est.source).toBe("heuristic");
        expect(est.distance_km).toBeGreaterThan(0);
        expect(est.duration_minutes).toBeGreaterThan(0);
    });

    it("scales distance by the circuity factor", () => {
        const base = estimateTravel(A, B, "car", { circuityFactor: 1 });
        const scaled = estimateTravel(A, B, "car", { circuityFactor: 2 });
        expect(scaled.distance_km).toBeCloseTo(base.distance_km * 2, 6);
    });

    it("makes buses slower than cars over the same leg", () => {
        const car = estimateTravel(A, B, "car");
        const bus = estimateTravel(A, B, "bus");
        expect(bus.duration_minutes).toBeGreaterThan(car.duration_minutes);
    });

    it("throws on non-positive speed or circuity", () => {
        expect(() => estimateTravel(A, B, "car", { carSpeedKmh: 0 })).toThrow(RangeError);
        expect(() => estimateTravel(A, B, "car", { circuityFactor: -1 })).toThrow(RangeError);
    });
});
