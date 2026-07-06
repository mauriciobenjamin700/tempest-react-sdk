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
