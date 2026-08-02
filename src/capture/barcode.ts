/**
 * Symbologies the `BarcodeDetector` API names.
 *
 * Three of them carry the weight in Brazil: `ean_13` is the retail barcode on every
 * packaged product, `qr_code` is what a Pix "copia e cola" payload travels in, and
 * `code_128` is the label on a shipment. The rest are here because the spec has them
 * and asking for one costs nothing.
 */
export type BarcodeFormat =
    | "aztec"
    | "codabar"
    | "code_128"
    | "code_39"
    | "code_93"
    | "data_matrix"
    | "ean_13"
    | "ean_8"
    | "itf"
    | "pdf417"
    | "qr_code"
    | "upc_a"
    | "upc_e"
    | "unknown";

/** Every symbology in the spec, used to validate what a detector reports back. */
export const ALL_BARCODE_FORMATS: readonly BarcodeFormat[] = [
    "aztec",
    "codabar",
    "code_128",
    "code_39",
    "code_93",
    "data_matrix",
    "ean_13",
    "ean_8",
    "itf",
    "pdf417",
    "qr_code",
    "upc_a",
    "upc_e",
    "unknown",
];

/**
 * What a scanner looks for when you do not say.
 *
 * Deliberately three formats, not all fourteen. Every extra symbology is more work
 * per frame, and on a mid-range phone the difference between three and fourteen is the
 * difference between a scanner that locks on instantly and one that feels broken.
 */
export const DEFAULT_BARCODE_FORMATS: readonly BarcodeFormat[] = ["qr_code", "ean_13", "code_128"];

/** A corner of a detected symbol, in the source's pixel coordinates. */
export interface BarcodePoint {
    x: number;
    y: number;
}

/** One decoded symbol, normalised. */
export interface BarcodeScanResult {
    /** The decoded payload — a GTIN, a URL, a Pix BR Code. */
    rawValue: string;
    /** Which symbology it was read as. `"unknown"` when the engine does not say. */
    format: BarcodeFormat;
    /** Box in source pixels, or `null` when the engine reports none. */
    boundingBox: DOMRectReadOnly | null;
    /** Corners in source pixels, clockwise from top-left. Empty when unreported. */
    cornerPoints: readonly BarcodePoint[];
}

/**
 * The shape a detector resolves with, before normalisation.
 *
 * Every field is optional because a polyfill is allowed to report the value and no
 * geometry at all, and the native engines differ on `cornerPoints`.
 */
export interface DetectedBarcodeLike {
    rawValue?: string;
    format?: string;
    boundingBox?: DOMRectReadOnly;
    cornerPoints?: readonly BarcodePoint[];
}

/**
 * The slice of `BarcodeDetector` this SDK uses.
 *
 * Exported so a consumer can **inject a polyfill** where the native API is missing —
 * see {@link isBarcodeDetectionSupported} for why that matters — and so tests can hand
 * in a decoder without a camera. Anything with a `detect()` that resolves to objects
 * carrying a `rawValue` will do.
 */
export interface BarcodeDetectorLike {
    /**
     * Decode every symbol visible in the source.
     *
     * @param source - A `<video>`, a `<canvas>`, an `ImageBitmap`, a `Blob`…
     * @returns Every symbol found, or an empty array — finding nothing is not an error.
     */
    detect: (source: ImageBitmapSource) => Promise<readonly DetectedBarcodeLike[]>;
}

/** The constructor, as Chromium exposes it on the global scope. */
interface BarcodeDetectorConstructorLike {
    new (options?: { formats?: readonly string[] }): BarcodeDetectorLike;
    getSupportedFormats?: () => Promise<readonly string[]>;
}

/**
 * Read the constructor off the global scope, or `null` when the engine has none.
 *
 * Kept private: everything a consumer needs is covered by
 * {@link isBarcodeDetectionSupported}, {@link getSupportedBarcodeFormats} and
 * {@link createBarcodeDetector}.
 */
function barcodeDetectorConstructor(): BarcodeDetectorConstructorLike | null {
    const candidate = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    return typeof candidate === "function" ? (candidate as BarcodeDetectorConstructorLike) : null;
}

/**
 * Whether this browser can decode barcodes on its own.
 *
 * **Expect `false` on a lot of real devices, and design for it.** `BarcodeDetector` is
 * a Chromium-only API backed by a platform decoder, so it is there on Android and
 * ChromeOS, usually there on macOS, and **absent** on Chromium for Windows and Linux,
 * in Firefox, and in every browser on iOS (all of which are WebKit underneath,
 * including Chrome for iOS).
 *
 * This SDK ships **no** decoder of its own and no bundled fallback: a QR reader is
 * Reed–Solomon error correction plus perspective correction plus a finder-pattern
 * search, and the honest options are a WASM build every consumer of this SDK would pay
 * for, or nothing. So the escape hatch is injection instead — pass any
 * {@link BarcodeDetectorLike} (the `barcode-detector` polyfill, your own `zxing-wasm`
 * wrapper) as `detector` to `useBarcodeScanner`, and the SDK drives it exactly like
 * the native one.
 *
 * @returns `true` when `new BarcodeDetector()` will work.
 */
export function isBarcodeDetectionSupported(): boolean {
    return barcodeDetectorConstructor() !== null;
}

/**
 * Which symbologies this engine will actually decode.
 *
 * Worth asking rather than assuming: the format list belongs to the platform decoder,
 * not to the browser, so two Chromium builds on two operating systems answer
 * differently — and asking for a format the engine does not have makes the constructor
 * throw `NotSupportedError`, which reads like a bug in your code.
 *
 * @returns The supported formats, or an empty array when there is no detector.
 */
export async function getSupportedBarcodeFormats(): Promise<readonly BarcodeFormat[]> {
    const constructor = barcodeDetectorConstructor();
    if (!constructor || typeof constructor.getSupportedFormats !== "function") return [];
    try {
        const formats = await constructor.getSupportedFormats();
        return formats.filter((format): format is BarcodeFormat =>
            ALL_BARCODE_FORMATS.includes(format as BarcodeFormat),
        );
    } catch {
        return [];
    }
}

/**
 * Build a native detector for the given formats.
 *
 * @param formats - Symbologies to look for. Must be ones the engine supports.
 * @returns The detector, or `null` when the API is missing or refused the formats.
 */
export function createBarcodeDetector(
    formats: readonly BarcodeFormat[] = DEFAULT_BARCODE_FORMATS,
): BarcodeDetectorLike | null {
    const constructor = barcodeDetectorConstructor();
    if (!constructor) return null;
    try {
        return new constructor({ formats: [...formats] });
    } catch {
        return null;
    }
}

/**
 * Turn one raw detection into a {@link BarcodeScanResult}.
 *
 * An unrecognised `format` string becomes `"unknown"` rather than being passed through
 * as a lie about the union, and missing geometry becomes `null`/`[]` rather than
 * `undefined`, so a consumer never has to branch on three kinds of absence.
 *
 * @param raw - What the detector resolved with.
 * @param known - The formats considered valid. Defaults to the whole spec list.
 * @returns The normalised result.
 */
export function normalizeBarcode(
    raw: DetectedBarcodeLike,
    known: readonly BarcodeFormat[] = ALL_BARCODE_FORMATS,
): BarcodeScanResult {
    const format = raw.format as BarcodeFormat | undefined;
    return {
        rawValue: raw.rawValue ?? "",
        format: format !== undefined && known.includes(format) ? format : "unknown",
        boundingBox: raw.boundingBox ?? null,
        cornerPoints: raw.cornerPoints ?? [],
    };
}
