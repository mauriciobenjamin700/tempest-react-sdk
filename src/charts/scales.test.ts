import { describe, expect, it } from "vitest";

import {
    divergingScale,
    DIVERGING_STEP_COUNT,
    ORDINAL_START_STEP,
    scaleSteps,
    sequentialScale,
    SEQUENTIAL_STEP_COUNT,
} from "./scales";

/** The step number out of a `var(--tempest-chart-<kind>-N)` reference. */
function step(token: string): number {
    const match = /-(\d+)\)$/.exec(token);
    return match ? Number(match[1]) : NaN;
}

describe("sequentialScale", () => {
    const color = sequentialScale({ min: 0, max: 100 });

    it("returns a themed token, not a hex — so dark mode follows", () => {
        expect(color(50)).toMatch(/^var\(--tempest-chart-sequential-\d\)$/);
    });

    it("maps the domain ends to the ramp ends", () => {
        expect(step(color(0))).toBe(1);
        expect(step(color(100))).toBe(SEQUENTIAL_STEP_COUNT);
    });

    it("increases monotonically across the domain", () => {
        const steps = [0, 20, 40, 60, 80, 100].map((v) => step(color(v)));
        expect(steps).toEqual([...steps].sort((a, b) => a - b));
    });

    it("clamps values outside the domain instead of running off the ramp", () => {
        expect(step(color(-999))).toBe(1);
        expect(step(color(999))).toBe(SEQUENTIAL_STEP_COUNT);
    });

    it("handles a reversed domain", () => {
        const reversed = sequentialScale({ min: 100, max: 0 });
        expect(step(reversed(0))).toBe(1);
        expect(step(reversed(100))).toBe(SEQUENTIAL_STEP_COUNT);
    });

    it("puts a flat domain in the middle rather than dividing by zero", () => {
        const flat = sequentialScale({ min: 7, max: 7 });
        expect(Number.isNaN(step(flat(7)))).toBe(false);
        expect(step(flat(7))).toBe(Math.round((1 + SEQUENTIAL_STEP_COUNT) / 2));
    });

    it("survives NaN without painting NaN", () => {
        expect(step(color(Number.NaN))).toBe(1);
    });

    it("starts at the ordinal-safe step when asked, so no step hides in the surface", () => {
        const ordinal = sequentialScale({ min: 0, max: 100, ordinal: true });
        expect(step(ordinal(0))).toBe(ORDINAL_START_STEP);
        expect(step(ordinal(100))).toBe(SEQUENTIAL_STEP_COUNT);
    });

    it("still uses the whole remaining ramp in ordinal mode", () => {
        const ordinal = sequentialScale({ min: 0, max: 4, ordinal: true });
        const used = new Set([0, 1, 2, 3, 4].map((v) => step(ordinal(v))));
        expect(used.size).toBe(SEQUENTIAL_STEP_COUNT - ORDINAL_START_STEP + 1);
    });
});

describe("divergingScale", () => {
    const mid = Math.ceil(DIVERGING_STEP_COUNT / 2);
    const color = divergingScale({ min: -100, max: 100 });

    it("puts the centre on the neutral midpoint", () => {
        expect(step(color(0))).toBe(mid);
    });

    it("sends negatives to the cool arm and positives to the warm one", () => {
        expect(step(color(-100))).toBeLessThan(mid);
        expect(step(color(100))).toBeGreaterThan(mid);
    });

    it("reaches both extremes", () => {
        expect(step(color(-100))).toBe(1);
        expect(step(color(100))).toBe(DIVERGING_STEP_COUNT);
    });

    it("honours a centre that is not zero", () => {
        const budget = divergingScale({ min: 80, max: 130, center: 100 });
        expect(step(budget(100))).toBe(mid);
        expect(step(budget(80))).toBe(1);
        expect(step(budget(130))).toBe(DIVERGING_STEP_COUNT);
    });

    it("scales each arm against its own range, so a small side is not flattened", () => {
        // −5…+80 around 0: the negatives must still use the whole cool arm, which is
        // what breaks if both arms are scaled by the wider one.
        const skewed = divergingScale({ min: -5, max: 80 });
        expect(step(skewed(-5))).toBe(1);
        expect(step(skewed(-2.5))).toBeGreaterThan(1);
        expect(step(skewed(-2.5))).toBeLessThan(mid);
    });

    it("stays on the midpoint when one arm has no range at all", () => {
        const positiveOnly = divergingScale({ min: 0, max: 50 });
        expect(step(positiveOnly(0))).toBe(mid);
        expect(step(positiveOnly(50))).toBe(DIVERGING_STEP_COUNT);
    });

    it("clamps beyond the domain", () => {
        expect(step(color(-9999))).toBe(1);
        expect(step(color(9999))).toBe(DIVERGING_STEP_COUNT);
    });

    it("treats NaN as no deviation instead of painting NaN", () => {
        expect(step(color(Number.NaN))).toBe(mid);
    });

    it("never emits a step outside the scale", () => {
        for (let v = -120; v <= 120; v += 3) {
            const n = step(color(v));
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(DIVERGING_STEP_COUNT);
        }
    });
});

describe("scaleSteps", () => {
    it("lists every sequential step in order, for a legend", () => {
        const steps = scaleSteps("sequential");
        expect(steps).toHaveLength(SEQUENTIAL_STEP_COUNT);
        expect(steps.map(step)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("lists every diverging step, midpoint included", () => {
        expect(scaleSteps("diverging")).toHaveLength(DIVERGING_STEP_COUNT);
    });

    it("emits themed tokens", () => {
        expect(scaleSteps("diverging")[0]).toBe("var(--tempest-chart-diverging-1)");
    });
});
