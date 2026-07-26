import { describe, expect, it } from "vitest";

import { clampOffset, computeCropRect, coverScale, maxOffset, outputSize } from "./crop-geometry";

const SQUARE_FRAME = { width: 300, height: 300 };

describe("coverScale", () => {
    it("uses the axis that would otherwise leave a gap", () => {
        // A wide image in a square frame is constrained by its height.
        expect(coverScale({ width: 800, height: 400 }, SQUARE_FRAME)).toBe(300 / 400);
        // A tall one is constrained by its width.
        expect(coverScale({ width: 400, height: 800 }, SQUARE_FRAME)).toBe(300 / 400);
    });

    it("returns 1 when the image already matches the frame", () => {
        expect(coverScale({ width: 300, height: 300 }, SQUARE_FRAME)).toBe(1);
    });

    it("scales a small image up rather than leaving it small", () => {
        expect(coverScale({ width: 100, height: 100 }, SQUARE_FRAME)).toBe(3);
    });

    it("returns 0 for an unusable size instead of Infinity or NaN", () => {
        expect(coverScale({ width: 0, height: 100 }, SQUARE_FRAME)).toBe(0);
        expect(coverScale({ width: 100, height: 100 }, { width: 0, height: 300 })).toBe(0);
    });
});

describe("maxOffset", () => {
    it("allows panning only along the axis with overflow", () => {
        expect(maxOffset({ width: 600, height: 300 }, SQUARE_FRAME)).toEqual({ x: 150, y: 0 });
    });

    it("allows nothing when the image exactly covers the frame", () => {
        expect(maxOffset({ width: 300, height: 300 }, SQUARE_FRAME)).toEqual({ x: 0, y: 0 });
    });

    it("never goes negative for an undersized image", () => {
        expect(maxOffset({ width: 100, height: 100 }, SQUARE_FRAME)).toEqual({ x: 0, y: 0 });
    });
});

describe("clampOffset", () => {
    const displayed = { width: 600, height: 400 };

    it("passes an in-range offset through", () => {
        expect(clampOffset({ x: 50, y: 20 }, displayed, SQUARE_FRAME)).toEqual({ x: 50, y: 20 });
    });

    it("clamps past the edge in both directions", () => {
        expect(clampOffset({ x: 9999, y: 9999 }, displayed, SQUARE_FRAME)).toEqual({
            x: 150,
            y: 50,
        });
        expect(clampOffset({ x: -9999, y: -9999 }, displayed, SQUARE_FRAME)).toEqual({
            x: -150,
            y: -50,
        });
    });

    it("pins an exactly-covering image to the centre — panning would expose background", () => {
        expect(clampOffset({ x: 40, y: -40 }, SQUARE_FRAME, SQUARE_FRAME)).toEqual({ x: 0, y: 0 });
    });
});

describe("computeCropRect", () => {
    it("takes the centre square of a wide image at zoom 1", () => {
        const crop = computeCropRect({
            image: { width: 800, height: 400 },
            frame: SQUARE_FRAME,
            zoom: 1,
            offset: { x: 0, y: 0 },
        });
        // Cover scale is 0.75, so the frame maps to a 400×400 region, centred.
        expect(crop).toEqual({ sx: 200, sy: 0, sWidth: 400, sHeight: 400 });
    });

    it("reads the whole image when it already matches the frame", () => {
        expect(
            computeCropRect({
                image: { width: 300, height: 300 },
                frame: SQUARE_FRAME,
                zoom: 1,
                offset: { x: 0, y: 0 },
            }),
        ).toEqual({ sx: 0, sy: 0, sWidth: 300, sHeight: 300 });
    });

    it("shrinks the region as zoom grows", () => {
        const crop = computeCropRect({
            image: { width: 800, height: 800 },
            frame: SQUARE_FRAME,
            zoom: 2,
            offset: { x: 0, y: 0 },
        });
        expect(crop.sWidth).toBe(400);
        expect(crop.sHeight).toBe(400);
        expect(crop.sx).toBe(200);
    });

    it("moves the region opposite to the pan, because panning moves the image", () => {
        const base = { image: { width: 800, height: 800 }, frame: SQUARE_FRAME, zoom: 2 };
        const centred = computeCropRect({ ...base, offset: { x: 0, y: 0 } });
        const panned = computeCropRect({ ...base, offset: { x: 75, y: 0 } });
        // Dragging the image right reveals what was to its left.
        expect(panned.sx).toBeLessThan(centred.sx);
    });

    it("never reads outside the image, however extreme the offset", () => {
        for (const offset of [
            { x: 99_999, y: 99_999 },
            { x: -99_999, y: -99_999 },
        ]) {
            const crop = computeCropRect({
                image: { width: 800, height: 600 },
                frame: SQUARE_FRAME,
                zoom: 3,
                offset,
            });
            expect(crop.sx).toBeGreaterThanOrEqual(0);
            expect(crop.sy).toBeGreaterThanOrEqual(0);
            expect(crop.sx + crop.sWidth).toBeLessThanOrEqual(800);
            expect(crop.sy + crop.sHeight).toBeLessThanOrEqual(600);
        }
    });

    it("keeps the frame's aspect ratio in the source region", () => {
        const crop = computeCropRect({
            image: { width: 1000, height: 1000 },
            frame: { width: 400, height: 200 },
            zoom: 1,
            offset: { x: 0, y: 0 },
        });
        expect(crop.sWidth / crop.sHeight).toBeCloseTo(2, 5);
    });

    it("returns an empty rect for an unusable size instead of NaN", () => {
        expect(
            computeCropRect({
                image: { width: 0, height: 0 },
                frame: SQUARE_FRAME,
                zoom: 1,
                offset: { x: 0, y: 0 },
            }),
        ).toEqual({ sx: 0, sy: 0, sWidth: 0, sHeight: 0 });
    });
});

describe("outputSize", () => {
    const crop = { sx: 0, sy: 0, sWidth: 1200, sHeight: 600 };

    it("exports at source resolution by default", () => {
        expect(outputSize(crop)).toEqual({ width: 1200, height: 600 });
    });

    it("leaves a crop already under the cap alone", () => {
        expect(outputSize(crop, 2000)).toEqual({ width: 1200, height: 600 });
    });

    it("caps the long edge and keeps the aspect ratio", () => {
        expect(outputSize(crop, 600)).toEqual({ width: 600, height: 300 });
    });

    it("caps by height when that is the long edge", () => {
        expect(outputSize({ sx: 0, sy: 0, sWidth: 400, sHeight: 1000 }, 500)).toEqual({
            width: 200,
            height: 500,
        });
    });

    it("rounds to whole pixels", () => {
        expect(outputSize({ sx: 0, sy: 0, sWidth: 333.3, sHeight: 111.1 })).toEqual({
            width: 333,
            height: 111,
        });
    });

    it("never returns a zero dimension", () => {
        expect(outputSize({ sx: 0, sy: 0, sWidth: 0.2, sHeight: 0.2 })).toEqual({
            width: 1,
            height: 1,
        });
    });

    it("ignores a nonsensical cap", () => {
        expect(outputSize(crop, 0)).toEqual({ width: 1200, height: 600 });
        expect(outputSize(crop, -5)).toEqual({ width: 1200, height: 600 });
    });
});
