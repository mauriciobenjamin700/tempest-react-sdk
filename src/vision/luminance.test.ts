import { describe, expect, it, vi } from "vitest";
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

describe("computeImageLuminance — source shapes", () => {
    it("reads a video's natural size from videoWidth/videoHeight", () => {
        const video = Object.create(HTMLVideoElement.prototype) as HTMLVideoElement;
        Object.defineProperties(video, {
            videoWidth: { value: 4 },
            videoHeight: { value: 4 },
        });
        const canvas = makeSolidCanvas(255, 255, 255, 4);
        expect(computeImageLuminance(video, canvas)).toBeCloseTo(255, 0);
    });

    it("returns 0 for an unloaded video", () => {
        const video = Object.create(HTMLVideoElement.prototype) as HTMLVideoElement;
        Object.defineProperties(video, {
            videoWidth: { value: 0 },
            videoHeight: { value: 0 },
        });
        expect(computeImageLuminance(video)).toBe(0);
    });

    it("reads a canvas source from its width/height", () => {
        const source = makeSolidCanvas(0, 0, 0, 4);
        source.width = 4;
        source.height = 4;
        expect(computeImageLuminance(source, makeSolidCanvas(0, 0, 0, 4))).toBe(0);
    });

    it("falls back to width/height when naturalWidth is 0", () => {
        const img = {
            naturalWidth: 0,
            naturalHeight: 0,
            width: 4,
            height: 4,
        } as HTMLImageElement;
        expect(computeImageLuminance(img, makeSolidCanvas(255, 255, 255, 4))).toBeCloseTo(255, 0);
    });

    it("returns 0 when no 2D context is available", () => {
        const target = document.createElement("canvas");
        target.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
        expect(computeImageLuminance(makeSource(4), target)).toBe(0);
    });

    it("reads an ImageBitmap from its width/height", () => {
        const bitmap = { width: 4, height: 4, close: () => undefined } as ImageBitmap;
        expect(computeImageLuminance(bitmap, makeSolidCanvas(255, 255, 255, 4))).toBeCloseTo(
            255,
            0,
        );
    });

    it("returns 0 for a closed (zero-sized) ImageBitmap", () => {
        const bitmap = { width: 0, height: 0, close: () => undefined } as ImageBitmap;
        expect(computeImageLuminance(bitmap)).toBe(0);
    });

    it("reads a real <img> natural size ahead of its layout size", () => {
        const img = document.createElement("img");
        Object.defineProperties(img, {
            naturalWidth: { value: 4 },
            naturalHeight: { value: 4 },
        });
        img.width = 999;
        img.height = 999;
        expect(computeImageLuminance(img, makeSolidCanvas(0, 0, 0, 4))).toBe(0);
    });

    it("allocates its own canvas when none is passed", () => {
        const created: HTMLCanvasElement[] = [];
        const realCreate = document.createElement.bind(document);
        const spy = vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            const el = realCreate(tag) as HTMLCanvasElement;
            if (tag === "canvas") {
                el.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
                created.push(el);
            }
            return el;
        }) as typeof document.createElement);

        expect(computeImageLuminance(makeSource(4))).toBe(0);
        expect(created).toHaveLength(1);
        spy.mockRestore();
    });
});
