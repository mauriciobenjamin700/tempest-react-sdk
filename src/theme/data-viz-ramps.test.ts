import { describe, expect, it } from "vitest";

import { contrastRatio, hexToOklch } from "./color";
import {
    buildDivergingRamp,
    buildRamp,
    DIVERGING_ARM_STEPS,
    hueOf,
    ordinalStart,
    SEQUENTIAL_STEPS,
} from "./data-viz-ramps";

const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#0b0d12";
const BLUE = hueOf("#2563eb");
const RED = hueOf("#dc2626");

/** OKLCH lightness of each step. */
const lightnesses = (ramp: string[]) => ramp.map((hex) => hexToOklch(hex).l);

/** Smallest gap between consecutive lightnesses. */
function minGap(ramp: string[]): number {
    const ls = lightnesses(ramp);
    return Math.min(...ls.slice(1).map((l, i) => Math.abs(l - ls[i])));
}

describe("hueOf", () => {
    it("reads the SDK's blue and red as opposing hues", () => {
        expect(BLUE).toBeGreaterThan(200);
        expect(BLUE).toBeLessThan(300);
        expect(RED).toBeLessThan(60);
    });
});

describe("buildRamp", () => {
    it("emits the requested number of steps", () => {
        expect(buildRamp(BLUE, "light")).toHaveLength(SEQUENTIAL_STEPS);
        expect(buildRamp(BLUE, "light", { steps: 5 })).toHaveLength(5);
    });

    it("returns token order: index 0 is the near-zero end, per mode", () => {
        // Light canvas: near-zero is the lightest step. Dark canvas: the darkest.
        // A fixed light→dark order would put token 1 at opposite ends of the scale
        // depending on the mode, and a dark theme would paint heatmaps inverted.
        const light = lightnesses(buildRamp(BLUE, "light"));
        expect(light).toEqual([...light].sort((a, b) => b - a));
        const dark = lightnesses(buildRamp(BLUE, "dark"));
        expect(dark).toEqual([...dark].sort((a, b) => a - b));
    });

    it("matches what colors.css declares for each mode", () => {
        // The generated ramp and the hand-written tokens are two sources of the same
        // scale; if they disagree on direction a generated theme inverts every heatmap.
        expect(buildRamp(BLUE, "light")[0]).toBe("#dde8fe");
        expect(buildRamp(BLUE, "dark")[0]).toBe("#172849");
    });

    it("keeps every adjacent step visibly apart", () => {
        // The validator's floor for an ordinal ramp; below it two steps read as one.
        expect(minGap(buildRamp(BLUE, "light"))).toBeGreaterThanOrEqual(0.06);
        expect(minGap(buildRamp(BLUE, "dark"))).toBeGreaterThanOrEqual(0.06);
    });

    it("stays on a single hue — a ramp that drifts hue is not sequential", () => {
        const hues = buildRamp(BLUE, "light").map((hex) => hexToOklch(hex).h);
        expect(Math.max(...hues) - Math.min(...hues)).toBeLessThan(2);
    });

    it("selects a different band per mode rather than flipping one", () => {
        const light = lightnesses(buildRamp(BLUE, "light"));
        const dark = lightnesses(buildRamp(BLUE, "dark"));
        // A flip would make the dark band the exact reverse of the light one.
        expect(dark).not.toEqual([...light].reverse());
    });

    it("peaks chroma mid-ramp, so the ends stay believable", () => {
        const chromas = buildRamp(BLUE, "light").map((hex) => hexToOklch(hex).c);
        const mid = chromas[Math.floor(chromas.length / 2)];
        expect(mid).toBeGreaterThan(chromas[0]);
        expect(mid).toBeGreaterThan(chromas[chromas.length - 1]);
    });

    it("emits valid hex at every step", () => {
        for (const mode of ["light", "dark"] as const) {
            for (const step of buildRamp(mode === "light" ? BLUE : RED, mode)) {
                expect(step).toMatch(/^#[0-9a-f]{6}$/);
            }
        }
    });
});

describe("ordinalStart", () => {
    it("skips the steps that recede into the light surface", () => {
        const ramp = buildRamp(BLUE, "light");
        const index = ordinalStart(ramp, LIGHT_SURFACE);
        expect(contrastRatio(ramp[index], LIGHT_SURFACE)).toBeGreaterThanOrEqual(2);
        expect(index).toBeGreaterThan(0);
    });

    it("every step from there on also clears the floor", () => {
        const ramp = buildRamp(BLUE, "light");
        for (const step of ramp.slice(ordinalStart(ramp, LIGHT_SURFACE))) {
            expect(contrastRatio(step, LIGHT_SURFACE)).toBeGreaterThanOrEqual(2);
        }
    });

    it("needs no reordering on a dark surface — token order already starts there", () => {
        const ramp = buildRamp(BLUE, "dark");
        const index = ordinalStart(ramp, DARK_SURFACE);
        expect(contrastRatio(ramp[index], DARK_SURFACE)).toBeGreaterThanOrEqual(2);
        // Same ordinal start in both modes, which is why the token is a constant.
        expect(index).toBe(ordinalStart(buildRamp(BLUE, "light"), LIGHT_SURFACE));
    });

    it("returns 0 when every step already clears the floor", () => {
        expect(ordinalStart(["#000000", "#111111"], LIGHT_SURFACE)).toBe(0);
    });

    it("falls back to the last step rather than -1 when none clears it", () => {
        expect(ordinalStart(["#fefefe", "#fdfdfd"], LIGHT_SURFACE)).toBe(1);
    });
});

describe("buildDivergingRamp", () => {
    const ramp = buildDivergingRamp({
        coolHue: BLUE,
        warmHue: RED,
        mid: "#e4e7ec",
        mode: "light",
    });

    it("gives both arms the same number of steps", () => {
        expect(ramp.cool).toHaveLength(DIVERGING_ARM_STEPS);
        expect(ramp.warm).toHaveLength(DIVERGING_ARM_STEPS);
    });

    it("keeps the midpoint neutral — a hue there would read as a third category", () => {
        expect(hexToOklch(ramp.mid).c).toBeLessThan(0.03);
    });

    it("puts each arm on its own hue", () => {
        const coolHues = ramp.cool.map((h) => hexToOklch(h).h);
        const warmHues = ramp.warm.map((h) => hexToOklch(h).h);
        expect(Math.abs(coolHues[0] - BLUE)).toBeLessThan(2);
        expect(Math.abs(warmHues[warmHues.length - 1] - RED)).toBeLessThan(3);
    });

    it("runs each arm from its extreme toward the midpoint", () => {
        // Cool arm darkest first, warm arm darkest last: read end to end, the whole
        // scale goes dark → light → dark.
        const coolLs = lightnesses(ramp.cool);
        const warmLs = lightnesses(ramp.warm);
        expect(coolLs).toEqual([...coolLs].sort((a, b) => a - b));
        expect(warmLs).toEqual([...warmLs].sort((a, b) => b - a));
    });

    it("keeps the arms perceptually balanced, so neither side looks wider", () => {
        const coolSpan = Math.abs(lightnesses(ramp.cool).at(-1)! - lightnesses(ramp.cool)[0]);
        const warmSpan = Math.abs(lightnesses(ramp.warm).at(-1)! - lightnesses(ramp.warm)[0]);
        expect(Math.abs(coolSpan - warmSpan)).toBeLessThan(0.06);
    });

    it("selects its own steps for dark mode", () => {
        const dark = buildDivergingRamp({
            coolHue: BLUE,
            warmHue: RED,
            mid: "#262d3f",
            mode: "dark",
        });
        expect(dark.cool).not.toEqual(ramp.cool);
        expect(hexToOklch(dark.mid).l).toBeLessThan(hexToOklch(ramp.mid).l);
    });
});
