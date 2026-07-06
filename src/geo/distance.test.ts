import { describe, expect, it } from "vitest";
import { bearingDeg, EARTH_RADIUS_KM, haversineKm, pathLengthKm, toRadians } from "./distance";
import type { Coordinate } from "./types";

const SAO_PAULO: Coordinate = { latitude: -23.5505, longitude: -46.6333 };
const RIO: Coordinate = { latitude: -22.9068, longitude: -43.1729 };

describe("haversineKm", () => {
    it("is zero for identical points", () => {
        expect(haversineKm(SAO_PAULO, SAO_PAULO)).toBe(0);
    });

    it("matches the known SP↔RJ great-circle distance (~360 km)", () => {
        const km = haversineKm(SAO_PAULO, RIO);
        expect(km).toBeGreaterThan(355);
        expect(km).toBeLessThan(365);
    });

    it("is symmetric", () => {
        expect(haversineKm(SAO_PAULO, RIO)).toBeCloseTo(haversineKm(RIO, SAO_PAULO), 6);
    });

    it("uses the shared Earth radius constant", () => {
        expect(EARTH_RADIUS_KM).toBeCloseTo(6371.0088, 4);
    });
});

describe("toRadians", () => {
    it("converts 180° to π", () => {
        expect(toRadians(180)).toBeCloseTo(Math.PI, 10);
    });
});

describe("pathLengthKm", () => {
    it("returns 0 for empty and single-point paths", () => {
        expect(pathLengthKm([])).toBe(0);
        expect(pathLengthKm([SAO_PAULO])).toBe(0);
    });

    it("sums consecutive segments", () => {
        const mid: Coordinate = { latitude: -23.2, longitude: -45 };
        const total = pathLengthKm([SAO_PAULO, mid, RIO]);
        const parts = haversineKm(SAO_PAULO, mid) + haversineKm(mid, RIO);
        expect(total).toBeCloseTo(parts, 6);
    });
});

describe("bearingDeg", () => {
    it("returns a value in [0, 360)", () => {
        const b = bearingDeg(SAO_PAULO, RIO);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
    });

    it("points roughly east-north-east from SP to RJ", () => {
        // RJ is north-east of SP → bearing between north (0/360) and east (90).
        expect(bearingDeg(SAO_PAULO, RIO)).toBeGreaterThan(45);
        expect(bearingDeg(SAO_PAULO, RIO)).toBeLessThan(90);
    });
});
