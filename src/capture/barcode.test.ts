import jsQR from "jsqr";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { encodeQR, type QRMatrix } from "@/components/QRCode/qr-encode";

import {
    FakeBarcodeDetector,
    installBarcodeDetector,
    removeBarcodeDetector,
} from "../../test/audio-mocks";
import {
    ALL_BARCODE_FORMATS,
    DEFAULT_BARCODE_FORMATS,
    createBarcodeDetector,
    getSupportedBarcodeFormats,
    isBarcodeDetectionSupported,
    normalizeBarcode,
    type BarcodeDetectorLike,
} from "./barcode";

describe("barcode formats", () => {
    it("defaults to the three that matter in Brazil, and only those", () => {
        // Every extra symbology is more work per frame; fourteen makes a phone feel
        // broken.
        expect(DEFAULT_BARCODE_FORMATS).toEqual(["qr_code", "ean_13", "code_128"]);
    });

    it("knows every symbology the spec names", () => {
        expect(ALL_BARCODE_FORMATS).toContain("pdf417");
        expect(ALL_BARCODE_FORMATS).toContain("data_matrix");
        expect(ALL_BARCODE_FORMATS.length).toBe(14);
    });
});

describe("isBarcodeDetectionSupported", () => {
    it("is false where the API does not exist", () => {
        const undo = removeBarcodeDetector();
        try {
            expect(isBarcodeDetectionSupported()).toBe(false);
        } finally {
            undo();
        }
    });

    it("is true once the constructor is there", () => {
        const undo = installBarcodeDetector();
        try {
            expect(isBarcodeDetectionSupported()).toBe(true);
        } finally {
            undo();
        }
    });
});

describe("getSupportedBarcodeFormats", () => {
    let restore: () => void;
    afterEach(() => restore());

    it("returns nothing without a detector", async () => {
        restore = removeBarcodeDetector();
        await expect(getSupportedBarcodeFormats()).resolves.toEqual([]);
    });

    it("returns what the platform decoder reports", async () => {
        restore = installBarcodeDetector();
        FakeBarcodeDetector.supportedFormats = ["qr_code", "pdf417"];
        await expect(getSupportedBarcodeFormats()).resolves.toEqual(["qr_code", "pdf417"]);
    });

    it("drops anything not in the spec list", async () => {
        restore = installBarcodeDetector();
        FakeBarcodeDetector.supportedFormats = ["qr_code", "rss_expanded"];
        await expect(getSupportedBarcodeFormats()).resolves.toEqual(["qr_code"]);
    });

    it("returns nothing when the probe rejects", async () => {
        restore = installBarcodeDetector();
        FakeBarcodeDetector.formatsShouldReject = true;
        await expect(getSupportedBarcodeFormats()).resolves.toEqual([]);
    });

    it("returns nothing on an engine with no probe at all", async () => {
        restore = installBarcodeDetector({ withoutProbe: true });
        await expect(getSupportedBarcodeFormats()).resolves.toEqual([]);
    });
});

describe("createBarcodeDetector", () => {
    let restore: () => void;
    afterEach(() => restore());

    it("returns null without the API", () => {
        restore = removeBarcodeDetector();
        expect(createBarcodeDetector()).toBeNull();
    });

    it("builds one for the default formats", () => {
        restore = installBarcodeDetector();
        expect(createBarcodeDetector()).not.toBeNull();
        expect(FakeBarcodeDetector.instances[0].formats).toEqual(["qr_code", "ean_13", "code_128"]);
    });

    it("returns null instead of throwing when the engine refuses a format", () => {
        restore = installBarcodeDetector();
        FakeBarcodeDetector.constructorShouldThrow = true;
        // `NotSupportedError` out of a constructor reads like a bug in the caller's code.
        expect(createBarcodeDetector(["pdf417"])).toBeNull();
    });
});

describe("normalizeBarcode", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installBarcodeDetector();
    });
    afterEach(() => restore());

    it("keeps a known format and the geometry", () => {
        const box = new DOMRect(1, 2, 3, 4) as DOMRectReadOnly;
        const result = normalizeBarcode({
            rawValue: "7891234567895",
            format: "ean_13",
            boundingBox: box,
            cornerPoints: [{ x: 1, y: 2 }],
        });
        expect(result).toEqual({
            rawValue: "7891234567895",
            format: "ean_13",
            boundingBox: box,
            cornerPoints: [{ x: 1, y: 2 }],
        });
    });

    it("calls an unrecognised format unknown instead of passing it through", () => {
        const result = normalizeBarcode({ rawValue: "x", format: "rss_expanded" });
        expect(result.format).toBe("unknown");
    });

    it("calls a missing format unknown", () => {
        expect(normalizeBarcode({ rawValue: "x" }).format).toBe("unknown");
    });

    it("turns missing geometry into null and an empty list, not undefined", () => {
        const result = normalizeBarcode({ rawValue: "x" });
        expect(result.boundingBox).toBeNull();
        expect(result.cornerPoints).toEqual([]);
    });

    it("survives a detection with no value at all", () => {
        expect(normalizeBarcode({}).rawValue).toBe("");
    });

    it("honours a narrowed known-format list", () => {
        expect(normalizeBarcode({ rawValue: "x", format: "pdf417" }, ["ean_13"]).format).toBe(
            "unknown",
        );
    });
});

/**
 * Render a QR matrix as the RGBA bitmap a decoder expects, one pixel per module plus a
 * quiet zone. Mirrors the helper in `QRCode/qr-encode.test.ts`; kept local because
 * importing it would run that file's suite.
 */
function toBitmap(matrix: QRMatrix, scale = 4, margin = 4) {
    const side = (matrix.size + margin * 2) * scale;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < matrix.size; y++) {
        for (let x = 0; x < matrix.size; x++) {
            if (!matrix.modules[y][x]) continue;
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    const at = (((y + margin) * scale + dy) * side + (x + margin) * scale + dx) * 4;
                    data[at] = 0;
                    data[at + 1] = 0;
                    data[at + 2] = 0;
                }
            }
        }
    }
    return { data, width: side, height: side };
}

/**
 * The polyfill recipe the docs give for Safari, Firefox and desktop Linux, written
 * against {@link BarcodeDetectorLike} exactly as a consumer would.
 */
function jsqrDetector(): BarcodeDetectorLike {
    return {
        detect: async (source) => {
            const image = source as unknown as {
                data: Uint8ClampedArray;
                width: number;
                height: number;
            };
            const found = jsQR(image.data, image.width, image.height);
            return found ? [{ rawValue: found.data, format: "qr_code" }] : [];
        },
    };
}

describe("BarcodeDetectorLike as an injection seam", () => {
    /**
     * The claim this SDK makes is that shipping **no** decoder is survivable because
     * `detector` is a real seam. That claim is only worth anything if a real decoder
     * fits through it, so this drives one: the SDK's own `QRCode` encoder writes a Pix
     * payload, an independent implementation reads it back, and the result goes through
     * the same normalisation the native path uses.
     */
    it("carries a real decoder, closing the loop with the SDK's own QR encoder", async () => {
        const pix =
            "00020126360014BR.GOV.BCB.PIX0114+5511999999995204000053039865802BR5909Tempest6008Sao Paulo62070503***6304";
        const bitmap = toBitmap(encodeQR(pix, { level: "M" }));

        const found = await jsqrDetector().detect(bitmap as unknown as ImageBitmapSource);

        expect(found).toHaveLength(1);
        const scan = normalizeBarcode(found[0]);
        expect(scan.rawValue).toBe(pix);
        expect(scan.format).toBe("qr_code");
        expect(scan.cornerPoints).toEqual([]);
    });

    it("reports nothing, not an error, when the frame holds no symbol", async () => {
        const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 };

        await expect(jsqrDetector().detect(blank as unknown as ImageBitmapSource)).resolves.toEqual(
            [],
        );
    });
});
