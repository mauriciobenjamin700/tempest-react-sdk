import { describe, expect, it } from "vitest";
import {
    computeImageLuminance,
    isLuminanceAcceptable,
    LowLuminanceError,
    LUMINANCE_SAMPLE_MAX_EDGE,
} from "./luminance";

/** A drawable source of a given natural size (jsdom cannot rasterize a real one). */
function makeSource(size = 8): HTMLImageElement {
    return {
        naturalWidth: size,
        naturalHeight: size,
        width: size,
        height: size,
    } as HTMLImageElement;
}

/** A canvas whose 2D context is stubbed to return solid-`rgb` pixels, so the
 *  test exercises the averaging math without a real canvas raster backend. */
function makeSolidCanvas(r: number, g: number, b: number, size = 8): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = 255;
    }
    const ctx = {
        drawImage: () => undefined,
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: pixels.subarray(0, w * h * 4),
        }),
    } as unknown as CanvasRenderingContext2D;
    canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
    return canvas;
}

describe("computeImageLuminance", () => {
    it("returns ~255 for solid white", () => {
        expect(computeImageLuminance(makeSource(), makeSolidCanvas(255, 255, 255))).toBeCloseTo(
            255,
            0,
        );
    });

    it("returns ~0 for solid black", () => {
        expect(computeImageLuminance(makeSource(), makeSolidCanvas(0, 0, 0))).toBe(0);
    });

    it("returns ~128 for mid-gray", () => {
        expect(computeImageLuminance(makeSource(), makeSolidCanvas(128, 128, 128))).toBeCloseTo(
            128,
            0,
        );
    });

    it("returns 0 for a zero-sized source", () => {
        const canvas = document.createElement("canvas");
        canvas.width = 0;
        canvas.height = 0;
        expect(computeImageLuminance(canvas)).toBe(0);
    });

    it("exposes the sample max-edge constant", () => {
        expect(LUMINANCE_SAMPLE_MAX_EDGE).toBe(256);
    });
});

describe("isLuminanceAcceptable", () => {
    it("is true at and above the threshold", () => {
        expect(isLuminanceAcceptable(70, 70)).toBe(true);
        expect(isLuminanceAcceptable(71, 70)).toBe(true);
    });

    it("is false below the threshold", () => {
        expect(isLuminanceAcceptable(69.9, 70)).toBe(false);
    });
});

describe("LowLuminanceError", () => {
    it("carries the measured luminance and threshold", () => {
        const err = new LowLuminanceError(12, 70);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe("LowLuminanceError");
        expect(err.luminance).toBe(12);
        expect(err.threshold).toBe(70);
        expect(err.message).toMatch(/too dark/i);
    });
});
