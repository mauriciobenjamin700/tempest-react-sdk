import { describe, expect, it } from "vitest";
import {
    interpolatePalette,
    quantizeScale,
    SEQUENTIAL_BLUES,
    sequentialScale,
    thresholdScale,
} from "./scales";

describe("interpolatePalette", () => {
    it("returns the endpoints at t=0 and t=1", () => {
        const p = ["#000000", "#ffffff"];
        expect(interpolatePalette(p, 0)).toBe("rgb(0, 0, 0)");
        expect(interpolatePalette(p, 1)).toBe("#ffffff"); // last stop passed through
    });

    it("blends at the midpoint", () => {
        expect(interpolatePalette(["#000000", "#ffffff"], 0.5)).toBe("rgb(128, 128, 128)");
    });

    it("clamps out-of-range t", () => {
        expect(interpolatePalette(["#000000", "#ffffff"], -1)).toBe("rgb(0, 0, 0)");
        expect(interpolatePalette(["#000000", "#ffffff"], 2)).toBe("#ffffff");
    });
});

describe("sequentialScale", () => {
    it("maps min to the first stop and max to the last", () => {
        const scale = sequentialScale(0, 100, SEQUENTIAL_BLUES);
        expect(scale(0)).toBe(interpolatePalette(SEQUENTIAL_BLUES, 0));
        expect(scale(100)).toBe(interpolatePalette(SEQUENTIAL_BLUES, 1));
    });
});

describe("quantizeScale", () => {
    it("buckets values into palette entries", () => {
        const scale = quantizeScale(0, 100, ["#a", "#b", "#c", "#d"] as unknown as string[]);
        expect(scale(0)).toBe("#a");
        expect(scale(99)).toBe("#d");
        expect(scale(1000)).toBe("#d"); // clamped
        expect(scale(-5)).toBe("#a"); // clamped
    });
});

describe("thresholdScale", () => {
    it("assigns colors by threshold bands", () => {
        const scale = thresholdScale([10, 50], ["#low", "#mid", "#high"]);
        expect(scale(5)).toBe("#low");
        expect(scale(10)).toBe("#mid");
        expect(scale(49)).toBe("#mid");
        expect(scale(50)).toBe("#high");
        expect(scale(999)).toBe("#high");
    });
});

describe("scales — degenerate palettes and ranges", () => {
    it("falls back to black for an empty palette", () => {
        expect(interpolatePalette([], 0.5)).toBe("#000000");
    });

    it("returns the single stop of a one-color palette", () => {
        expect(interpolatePalette(["#123456"], 0.7)).toBe("#123456");
    });

    it("clamps t below 0 and above 1", () => {
        const palette = ["#000000", "#ffffff"];
        // Blended stops come back as `rgb(...)`; the clamped ends are exact.
        expect(interpolatePalette(palette, -1)).toBe("rgb(0, 0, 0)");
        expect(interpolatePalette(palette, 2)).toBe("#ffffff");
    });

    it("returns the last stop exactly at t = 1", () => {
        expect(interpolatePalette(["#000000", "#ff0000"], 1)).toBe("#ff0000");
    });

    it("treats a zero-width range as a single bucket", () => {
        const sequential = sequentialScale(5, 5);
        expect(typeof sequential(5)).toBe("string");

        const quantized = quantizeScale(5, 5, ["#aaaaaa", "#bbbbbb"]);
        expect(quantized(5)).toBe("#aaaaaa");
    });

    it("clamps quantize buckets at both ends", () => {
        const scale = quantizeScale(0, 10, ["#000000", "#888888", "#ffffff"]);
        expect(scale(-5)).toBe("#000000");
        expect(scale(50)).toBe("#ffffff");
    });
});

describe("an empty palette fails where it was built", () => {
    /*
     * Before this guard both factories indexed at `-1` and returned `undefined`
     * announced as `string`. That reaches the DOM as `fill="undefined"`, which
     * paints nothing and reports nothing — the caller sees a blank map and no
     * error to search for.
     */
    it("quantizeScale rejects it", () => {
        expect(() => quantizeScale(0, 100, [])).toThrow(/at least one colour/);
    });

    it("thresholdScale rejects it", () => {
        expect(() => thresholdScale([10, 50], [])).toThrow(/at least one colour/);
    });

    it("still accepts a single-colour palette", () => {
        expect(quantizeScale(0, 100, ["#abc"])(50)).toBe("#abc");
        expect(thresholdScale([10], ["#abc"])(999)).toBe("#abc");
    });
});
