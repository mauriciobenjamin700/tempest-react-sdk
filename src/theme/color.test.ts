import { describe, expect, it } from "vitest";

import {
    contrastRatio,
    createColorScale,
    hexToOklch,
    hexToRgb,
    hexToRgbaString,
    oklchToHex,
    readableForeground,
    relativeLuminance,
    rgbToHex,
} from "./color";

describe("hexToRgb", () => {
    it("parses 6-digit hex", () => {
        expect(hexToRgb("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
    });

    it("expands 3-digit shorthand", () => {
        expect(hexToRgb("#fff")).toEqual({ r: 1, g: 1, b: 1 });
    });

    it("accepts hex without the leading hash and uppercase digits", () => {
        expect(hexToRgb("00FF00")).toEqual({ r: 0, g: 1, b: 0 });
    });

    it("truncates 8-digit hex to its rgb part", () => {
        expect(hexToRgb("#0000ffcc")).toEqual({ r: 0, g: 0, b: 1 });
    });

    it("throws on a malformed value", () => {
        expect(() => hexToRgb("#12x45g")).toThrow(/Invalid hex color/);
    });
});

describe("rgbToHex", () => {
    it("round-trips a color", () => {
        expect(rgbToHex(1, 0, 0.5)).toBe("#ff0080");
    });

    it("clamps out-of-range channels", () => {
        expect(rgbToHex(2, -1, 0)).toBe("#ff0000");
    });
});

describe("hexToOklch", () => {
    it("maps white to full lightness and no chroma", () => {
        const { l, c } = hexToOklch("#ffffff");
        expect(l).toBeCloseTo(1, 2);
        expect(c).toBeLessThan(0.001);
    });

    it("maps black to zero lightness", () => {
        expect(hexToOklch("#000000").l).toBeCloseTo(0, 5);
    });

    it("reports a positive hue angle for a blue", () => {
        const { h, c } = hexToOklch("#0066ff");
        expect(c).toBeGreaterThan(0.1);
        expect(h).toBeGreaterThan(0);
        expect(h).toBeLessThan(360);
    });

    it("keeps grays hue-neutral instead of emitting NaN", () => {
        expect(hexToOklch("#808080").h).toBe(0);
    });
});

describe("oklchToHex", () => {
    it("round-trips through OKLCH within one 8-bit step", () => {
        for (const hex of ["#0066ff", "#16a34a", "#f59e0b", "#7c3aed", "#101828"]) {
            const back = oklchToHex(hexToOklch(hex));
            const original = hexToRgb(hex);
            const result = hexToRgb(back);
            expect(Math.abs(original.r - result.r)).toBeLessThan(0.01);
            expect(Math.abs(original.g - result.g)).toBeLessThan(0.01);
            expect(Math.abs(original.b - result.b)).toBeLessThan(0.01);
        }
    });

    it("desaturates instead of clipping when chroma leaves sRGB", () => {
        const hex = oklchToHex({ l: 0.6, c: 0.4, h: 150 });
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        const { c } = hexToOklch(hex);
        expect(c).toBeLessThan(0.4);
    });

    it("treats negative chroma as zero", () => {
        expect(oklchToHex({ l: 1, c: -1, h: 0 })).toBe("#ffffff");
    });
});

describe("createColorScale", () => {
    it("returns all ten steps as hex", () => {
        const scale = createColorScale("#0066ff");
        expect(Object.keys(scale)).toHaveLength(10);
        for (const value of Object.values(scale)) {
            expect(value).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it("ramps light to dark in light mode", () => {
        const scale = createColorScale("#0066ff", "light");
        expect(relativeLuminance(scale[50])).toBeGreaterThan(relativeLuminance(scale[500]));
        expect(relativeLuminance(scale[500])).toBeGreaterThan(relativeLuminance(scale[900]));
    });

    it("inverts the ramp in dark mode", () => {
        const scale = createColorScale("#0066ff", "dark");
        expect(relativeLuminance(scale[50])).toBeLessThan(relativeLuminance(scale[900]));
    });

    it("keeps the source hue across the whole ramp", () => {
        const source = hexToOklch("#7c3aed");
        const scale = createColorScale("#7c3aed");
        for (const step of [100, 500, 900] as const) {
            expect(Math.abs(hexToOklch(scale[step]).h - source.h)).toBeLessThan(2);
        }
    });

    it("produces a muted ramp from a muted input", () => {
        const vivid = createColorScale("#0066ff");
        const muted = createColorScale("#5b6b80");
        expect(hexToOklch(muted[500]).c).toBeLessThan(hexToOklch(vivid[500]).c);
    });

    it("puts the brand color itself at step 500", () => {
        for (const hex of ["#7c3aed", "#0066ff", "#e11d48", "#059669", "#d97706"]) {
            const scale = createColorScale(hex);
            const source = hexToRgb(hex);
            const anchored = hexToRgb(scale[500]);
            expect(Math.abs(source.r - anchored.r)).toBeLessThan(0.02);
            expect(Math.abs(source.g - anchored.g)).toBeLessThan(0.02);
            expect(Math.abs(source.b - anchored.b)).toBeLessThan(0.02);
        }
    });

    it("anchors step 500 in the dark ramp too", () => {
        const scale = createColorScale("#7c3aed", "dark");
        const source = hexToOklch("#7c3aed");
        expect(hexToOklch(scale[500]).l).toBeCloseTo(source.l, 2);
    });

    it("stays monotonic for a very light brand", () => {
        const scale = createColorScale("#fde047");
        const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
        const luminance = steps.map((step) => relativeLuminance(scale[step]));
        for (let i = 1; i < luminance.length; i += 1) {
            expect(luminance[i]).toBeLessThan(luminance[i - 1]);
        }
    });

    it("stays monotonic for a very dark brand", () => {
        const scale = createColorScale("#0b1020");
        const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
        const luminance = steps.map((step) => relativeLuminance(scale[step]));
        for (let i = 1; i < luminance.length; i += 1) {
            expect(luminance[i]).toBeLessThan(luminance[i - 1]);
        }
    });

    it("still spans a usable range from a light brand", () => {
        const scale = createColorScale("#fde047");
        expect(relativeLuminance(scale[900])).toBeLessThan(relativeLuminance(scale[500]) / 2);
    });

    it("stays achromatic for a gray input", () => {
        const scale = createColorScale("#808080");
        expect(hexToOklch(scale[500]).c).toBeLessThan(0.01);
        expect(hexToOklch(scale[900]).c).toBeLessThan(0.01);
    });
});

describe("contrast helpers", () => {
    it("computes the canonical black-on-white ratio", () => {
        expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    });

    it("is symmetric", () => {
        expect(contrastRatio("#0066ff", "#ffffff")).toBeCloseTo(
            contrastRatio("#ffffff", "#0066ff"),
            6,
        );
    });

    it("picks white text over a dark brand", () => {
        expect(readableForeground("#003d99")).toBe("#ffffff");
    });

    it("picks dark text over a light brand", () => {
        expect(readableForeground("#fde047")).toBe("#101828");
    });

    it("honours custom candidates", () => {
        expect(readableForeground("#000000", "#eeeeee", "#111111")).toBe("#eeeeee");
    });
});

describe("hexToRgbaString", () => {
    it("emits modern rgb syntax with alpha", () => {
        expect(hexToRgbaString("#0066ff", 0.35)).toBe("rgb(0 102 255 / 0.35)");
    });

    it("clamps alpha into range", () => {
        expect(hexToRgbaString("#000000", 5)).toBe("rgb(0 0 0 / 1)");
    });
});
