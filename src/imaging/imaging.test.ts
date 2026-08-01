/**
 * Unit tests for the imaging module.
 *
 * jsdom has no canvas, no encoders and no `createImageBitmap`, so the canvas
 * API is stubbed here and what is under test is the logic around it: fit
 * geometry, crop clamping, format reporting, the byte-budget search and the
 * error translation. The claims that need real pixels — EXIF orientation,
 * filtering quality, what a browser will actually encode — are covered by
 * `e2e/imaging.spec.ts`, which runs in Chromium against the built `dist/`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface DrawCall {
    readonly args: number[];
}

const state = {
    encodeType: "" as string,
    quality: 0 as number,
    /** Bytes returned per encode; a function so a test can vary by quality. */
    sizeFor: (quality: number) => Math.round(quality * 1_000_000),
    fills: [] as string[],
    draws: [] as DrawCall[],
    decodeFails: false,
    bitmapSize: { width: 400, height: 200 },
};

class FakeContext {
    imageSmoothingEnabled = false;
    imageSmoothingQuality = "low";
    fillStyle = "";

    fillRect(): void {
        state.fills.push(this.fillStyle);
    }
    drawImage(...args: unknown[]): void {
        state.draws.push({ args: args.slice(1).map(Number) });
    }
    translate(): void {}
    rotate(): void {}
    scale(): void {}
}

class FakeOffscreenCanvas {
    constructor(
        public width: number,
        public height: number,
    ) {}
    getContext(): FakeContext {
        return new FakeContext();
    }
    async convertToBlob(options: { type: string; quality: number }): Promise<Blob> {
        state.encodeType = options.type;
        state.quality = options.quality;
        const size = state.sizeFor(options.quality);
        return new Blob([new Uint8Array(size)], { type: options.type });
    }
}

beforeEach(() => {
    state.encodeType = "";
    state.quality = 0;
    state.sizeFor = (quality: number) => Math.round(quality * 1_000_000);
    state.fills = [];
    state.draws = [];
    state.decodeFails = false;
    state.bitmapSize = { width: 400, height: 200 };

    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.stubGlobal("createImageBitmap", async () => {
        if (state.decodeFails) throw new Error("not an image");
        return {
            width: state.bitmapSize.width,
            height: state.bitmapSize.height,
            close: () => undefined,
        };
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const source = new Blob([new Uint8Array(64)], { type: "image/jpeg" });

describe("imaging · resize geometry", () => {
    it("derives the missing side from the aspect ratio", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 200 });
        expect([result.width, result.height]).toEqual([200, 100]);
    });

    it("fits inside the box with contain", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 100, height: 100, fit: "contain" });
        expect([result.width, result.height]).toEqual([100, 50]);
    });

    it("fills the box with cover", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 100, height: 100, fit: "cover" });
        expect([result.width, result.height]).toEqual([100, 100]);
    });

    it("stretches with fill", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, {
            width: 300,
            height: 300,
            fit: "fill",
            withoutEnlargement: false,
        });
        expect([result.width, result.height]).toEqual([300, 300]);
    });

    it("shrinks a fill box rather than enlarging the image", async () => {
        /**
         * A 400x200 source asked for 300x300: the height would have to grow.
         * The no-enlargement guard scales the whole box down instead, keeping
         * the requested 1:1 shape — the same choice sharp makes.
         */
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 300, height: 300, fit: "fill" });
        expect([result.width, result.height]).toEqual([200, 200]);
    });

    it("pads to the exact box", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, {
            width: 100,
            height: 100,
            fit: "pad",
            type: "image/png",
        });
        expect([result.width, result.height]).toEqual([100, 100]);
        expect(state.fills.length).toBeGreaterThan(0);
    });

    it("never enlarges by default", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 4000 });
        expect(result.width).toBe(400);
    });

    it("enlarges when explicitly allowed", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 4000, withoutEnlargement: false });
        expect(result.width).toBe(4000);
    });
});

describe("imaging · transparency", () => {
    it("paints a background for JPEG, which has no alpha", async () => {
        const { resizeImage } = await import("./transform");
        await resizeImage(source, { width: 100, type: "image/jpeg" });
        expect(state.fills).toContain("#ffffff");
    });

    it("keeps transparency for PNG", async () => {
        const { resizeImage } = await import("./transform");
        await resizeImage(source, { width: 100, type: "image/png" });
        expect(state.fills).toEqual([]);
    });

    it("honours an explicit background", async () => {
        const { resizeImage } = await import("./transform");
        await resizeImage(source, { width: 100, type: "image/png", background: "#ff0000" });
        expect(state.fills).toContain("#ff0000");
    });
});

describe("imaging · crop, rotate, flip", () => {
    it("clamps a crop to the image", async () => {
        const { cropImage } = await import("./transform");
        const result = await cropImage(source, { x: 380, y: 0, width: 200, height: 500 });
        expect([result.width, result.height]).toEqual([20, 200]);
    });

    it("swaps the sides on a quarter turn", async () => {
        const { rotateImage } = await import("./transform");
        const result = await rotateImage(source, 90);
        expect([result.width, result.height]).toEqual([200, 400]);
    });

    it("keeps the sides on a half turn", async () => {
        const { rotateImage } = await import("./transform");
        const result = await rotateImage(source, 180);
        expect([result.width, result.height]).toEqual([400, 200]);
    });

    it("normalises a negative angle", async () => {
        const { rotateImage } = await import("./transform");
        const result = await rotateImage(source, -90);
        expect([result.width, result.height]).toEqual([200, 400]);
    });

    it("refuses an angle that is not a right angle", async () => {
        const { rotateImage } = await import("./transform");
        await expect(rotateImage(source, 45)).rejects.toBeInstanceOf(RangeError);
    });

    it("mirrors without changing the size", async () => {
        const { flipImage } = await import("./transform");
        const result = await flipImage(source, { horizontal: true, vertical: true });
        expect([result.width, result.height]).toEqual([400, 200]);
    });
});

describe("imaging · encoding", () => {
    it("reports the type actually produced", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 100, type: "image/webp" });
        expect(result.type).toBe("image/webp");
        expect(state.encodeType).toBe("image/webp");
    });

    it("detects a silent format fallback", async () => {
        const { resetImageTypeSupportCache, supportsImageType } = await import("./encode");
        resetImageTypeSupportCache();

        const original = FakeOffscreenCanvas.prototype.convertToBlob;
        FakeOffscreenCanvas.prototype.convertToBlob = async function fallback() {
            return new Blob([new Uint8Array(8)], { type: "image/png" });
        };

        expect(await supportsImageType("image/avif")).toBe(false);
        FakeOffscreenCanvas.prototype.convertToBlob = original;
        resetImageTypeSupportCache();
    });

    it("caches the support answer", async () => {
        const { resetImageTypeSupportCache, supportsImageType } = await import("./encode");
        resetImageTypeSupportCache();
        const spy = vi.spyOn(FakeOffscreenCanvas.prototype, "convertToBlob");

        await supportsImageType("image/webp");
        await supportsImageType("image/webp");

        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
        resetImageTypeSupportCache();
    });

    it("falls back to JPEG when nothing preferred is supported", async () => {
        const { bestSupportedType, resetImageTypeSupportCache } = await import("./encode");
        resetImageTypeSupportCache();

        const original = FakeOffscreenCanvas.prototype.convertToBlob;
        FakeOffscreenCanvas.prototype.convertToBlob = async function fallback() {
            return new Blob([new Uint8Array(8)], { type: "image/png" });
        };

        expect(await bestSupportedType(["image/avif", "image/webp"])).toBe("image/jpeg");
        FakeOffscreenCanvas.prototype.convertToBlob = original;
        resetImageTypeSupportCache();
    });
});

describe("imaging · byte budget", () => {
    it("returns the first encode when it already fits", async () => {
        const { compressToTarget } = await import("./compress");
        const result = await compressToTarget(source, { maxBytes: 5_000_000, width: 200 });
        expect(result.attempts).toBe(1);
        expect(result.withinBudget).toBe(true);
        expect(result.quality).toBeCloseTo(0.92, 5);
    });

    it("searches down to a quality that fits", async () => {
        const { compressToTarget } = await import("./compress");
        const result = await compressToTarget(source, { maxBytes: 700_000, width: 200 });
        expect(result.withinBudget).toBe(true);
        expect(result.bytes).toBeLessThanOrEqual(700_000);
        expect(result.quality).toBeLessThan(0.92);
        expect(result.attempts).toBeLessThanOrEqual(8);
    });

    it("reports a budget it cannot reach instead of throwing", async () => {
        const { compressToTarget } = await import("./compress");
        const result = await compressToTarget(source, { maxBytes: 1_000, width: 200 });
        expect(result.withinBudget).toBe(false);
        expect(result.quality).toBeCloseTo(0.4, 5);
    });

    it("honours a custom search range", async () => {
        const { compressToTarget } = await import("./compress");
        const result = await compressToTarget(source, {
            maxBytes: 1_000,
            width: 200,
            minQuality: 0.1,
            maxQuality: 0.5,
            steps: 2,
        });
        expect(result.quality).toBeCloseTo(0.1, 5);
        expect(result.attempts).toBeLessThanOrEqual(4);
    });
});

describe("imaging · thumbnails", () => {
    it("scales the longest edge and keeps the ratio", async () => {
        const { createThumbnails } = await import("./thumbnails");
        const produced = await createThumbnails(source, [
            { name: "thumb", size: 100 },
            { name: "card", size: 200 },
        ]);
        expect(produced.map((entry) => [entry.name, entry.width, entry.height])).toEqual([
            ["thumb", 100, 50],
            ["card", 200, 100],
        ]);
    });

    it("never enlarges a small source", async () => {
        state.bitmapSize = { width: 50, height: 50 };
        const { createThumbnails } = await import("./thumbnails");
        const [only] = await createThumbnails(source, [{ name: "thumb", size: 400 }]);
        expect(only?.width).toBe(50);
    });

    it("decodes once for every size", async () => {
        const decode = vi.fn(async () => ({
            width: 400,
            height: 200,
            close: () => undefined,
        }));
        vi.stubGlobal("createImageBitmap", decode);

        const { createThumbnails } = await import("./thumbnails");
        await createThumbnails(source, [
            { name: "a", size: 100 },
            { name: "b", size: 200 },
            { name: "c", size: 300 },
        ]);
        expect(decode).toHaveBeenCalledTimes(1);
    });

    it("takes a per-size format", async () => {
        const { createThumbnails } = await import("./thumbnails");
        const [only] = await createThumbnails(
            source,
            [{ name: "thumb", size: 100, encode: { type: "image/png" } }],
            { type: "image/jpeg" },
        );
        expect(only?.type).toBe("image/png");
    });
});

describe("imaging · decoding", () => {
    it("reads dimensions, type and size", async () => {
        const { readImageInfo } = await import("./decode");
        const info = await readImageInfo(source);
        expect(info.width).toBe(400);
        expect(info.height).toBe(200);
        expect(info.type).toBe("image/jpeg");
        expect(info.aspectRatio).toBe(2);
    });

    it("reports an undecodable source", async () => {
        state.decodeFails = true;
        const { decodeImage } = await import("./decode");
        const { ImageDecodeError } = await import("./exceptions");
        await expect(decodeImage(source)).rejects.toBeInstanceOf(ImageDecodeError);
    });

    it("fetches a URL source", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(new Uint8Array(8))),
        );
        const { decodeImage } = await import("./decode");
        const decoded = await decodeImage("/photo.jpg");
        expect(decoded.width).toBe(400);
    });

    it("reports a URL that cannot be fetched", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
        );
        const { decodeImage } = await import("./decode");
        await expect(decodeImage("/missing.jpg")).rejects.toThrow(/404/);
    });

    it("reports a network failure on a URL source", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );
        const { decodeImage } = await import("./decode");
        await expect(decodeImage("/offline.jpg")).rejects.toThrow(/Could not fetch/);
    });
});

describe("imaging · HTMLCanvasElement fallback", () => {
    /**
     * A browser without OffscreenCanvas — older Safari, and any worker-less
     * context — still has to work. The element path takes a callback where
     * the offscreen one returns a promise.
     */
    function stubElementCanvas(): void {
        vi.stubGlobal("OffscreenCanvas", undefined);
        vi.stubGlobal("document", {
            createElement: () => ({
                width: 0,
                height: 0,
                getContext: () => new FakeContext(),
                toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => {
                    state.encodeType = type;
                    state.quality = quality;
                    callback(new Blob([new Uint8Array(state.sizeFor(quality))], { type }));
                },
            }),
        });
    }

    it("draws and encodes through a canvas element", async () => {
        stubElementCanvas();
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source, { width: 100, type: "image/png" });
        expect(result.width).toBe(100);
        expect(result.type).toBe("image/png");
    });

    it("reports a null blob from the callback form", async () => {
        vi.stubGlobal("OffscreenCanvas", undefined);
        vi.stubGlobal("document", {
            createElement: () => ({
                width: 0,
                height: 0,
                getContext: () => new FakeContext(),
                toBlob: (callback: (blob: Blob | null) => void) => callback(null),
            }),
        });

        const { resizeImage } = await import("./transform");
        const { ImageEncodeError } = await import("./exceptions");
        await expect(resizeImage(source, { width: 10 })).rejects.toBeInstanceOf(ImageEncodeError);
    });

    it("says so when the canvas has no 2-D context", async () => {
        vi.stubGlobal("OffscreenCanvas", undefined);
        vi.stubGlobal("document", {
            createElement: () => ({ width: 0, height: 0, getContext: () => null }),
        });

        const { createSurface, getContext } = await import("./canvas");
        const { ImagingUnavailableError } = await import("./exceptions");
        expect(() => getContext(createSurface(4, 4))).toThrow(ImagingUnavailableError);
    });
});

describe("imaging · flip axes", () => {
    it("mirrors horizontally only", async () => {
        const { flipImage } = await import("./transform");
        const result = await flipImage(source, { horizontal: true });
        expect([result.width, result.height]).toEqual([400, 200]);
    });

    it("mirrors vertically only", async () => {
        const { flipImage } = await import("./transform");
        const result = await flipImage(source, { vertical: true });
        expect([result.width, result.height]).toEqual([400, 200]);
    });

    it("accepts no axes at all, producing a copy", async () => {
        const { flipImage } = await import("./transform");
        const result = await flipImage(source, {});
        expect([result.width, result.height]).toEqual([400, 200]);
    });

    it("keeps a chosen format through a crop", async () => {
        const { cropImage } = await import("./transform");
        const result = await cropImage(
            source,
            { x: 0, y: 0, width: 10, height: 10 },
            {
                type: "image/png",
            },
        );
        expect(result.type).toBe("image/png");
    });

    it("resizes with no options at all", async () => {
        const { resizeImage } = await import("./transform");
        const result = await resizeImage(source);
        expect([result.width, result.height]).toEqual([400, 200]);
    });
});

describe("imaging · errors", () => {
    it("carries literal names that survive minification", async () => {
        const {
            ImageDecodeError,
            ImageEncodeError,
            ImagingError,
            ImagingUnavailableError,
            UnsupportedImageTypeError,
        } = await import("./exceptions");

        expect(new ImagingError("x").name).toBe("ImagingError");
        expect(new ImageDecodeError("x").name).toBe("ImageDecodeError");
        expect(new ImageEncodeError("x").name).toBe("ImageEncodeError");
        expect(new UnsupportedImageTypeError("x").name).toBe("UnsupportedImageTypeError");
        expect(new ImagingUnavailableError("x").name).toBe("ImagingUnavailableError");
        expect(new ImageDecodeError("x")).toBeInstanceOf(ImagingError);
    });

    it("says so when there is no canvas at all", async () => {
        vi.stubGlobal("OffscreenCanvas", undefined);
        vi.stubGlobal("document", undefined);

        const { createSurface } = await import("./canvas");
        const { ImagingUnavailableError } = await import("./exceptions");
        expect(() => createSurface(10, 10)).toThrow(ImagingUnavailableError);
    });

    it("reports a canvas that produces no bytes", async () => {
        const original = FakeOffscreenCanvas.prototype.convertToBlob;
        FakeOffscreenCanvas.prototype.convertToBlob = async function empty() {
            return null as unknown as Blob;
        };

        const { encodeImage } = await import("./encode");
        const { ImageEncodeError } = await import("./exceptions");
        const surface = new FakeOffscreenCanvas(10, 10) as unknown as OffscreenCanvas;

        await expect(encodeImage(surface)).rejects.toBeInstanceOf(ImageEncodeError);
        FakeOffscreenCanvas.prototype.convertToBlob = original;
    });
});
