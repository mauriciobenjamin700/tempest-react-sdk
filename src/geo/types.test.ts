import { describe, expect, it } from "vitest";
import {
    clampLatitude,
    isCoordinate,
    isValidLatitude,
    isValidLongitude,
    normalizeLongitude,
} from "./types";

describe("isValidLatitude", () => {
    it("accepts the valid range and rejects out-of-range / non-finite", () => {
        expect(isValidLatitude(-90)).toBe(true);
        expect(isValidLatitude(90)).toBe(true);
        expect(isValidLatitude(0)).toBe(true);
        expect(isValidLatitude(90.1)).toBe(false);
        expect(isValidLatitude(-91)).toBe(false);
        expect(isValidLatitude(NaN)).toBe(false);
        expect(isValidLatitude(Infinity)).toBe(false);
    });
});

describe("isValidLongitude", () => {
    it("accepts the valid range and rejects out-of-range", () => {
        expect(isValidLongitude(-180)).toBe(true);
        expect(isValidLongitude(180)).toBe(true);
        expect(isValidLongitude(181)).toBe(false);
        expect(isValidLongitude(NaN)).toBe(false);
    });
});

describe("isCoordinate", () => {
    it("guards valid coordinate objects", () => {
        expect(isCoordinate({ latitude: -23.5, longitude: -46.6 })).toBe(true);
    });

    it("rejects malformed / out-of-range / non-objects", () => {
        expect(isCoordinate(null)).toBe(false);
        expect(isCoordinate({})).toBe(false);
        expect(isCoordinate({ latitude: "1", longitude: 2 })).toBe(false);
        expect(isCoordinate({ latitude: 200, longitude: 2 })).toBe(false);
        expect(isCoordinate(42)).toBe(false);
    });
});

describe("clampLatitude", () => {
    it("clamps to [-90, 90]", () => {
        expect(clampLatitude(120)).toBe(90);
        expect(clampLatitude(-120)).toBe(-90);
        expect(clampLatitude(45)).toBe(45);
    });
});

describe("normalizeLongitude", () => {
    it("wraps across the antimeridian", () => {
        expect(normalizeLongitude(190)).toBeCloseTo(-170, 6);
        expect(normalizeLongitude(-190)).toBeCloseTo(170, 6);
        expect(normalizeLongitude(45)).toBeCloseTo(45, 6);
    });
});
