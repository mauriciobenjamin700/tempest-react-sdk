/** @generated Vendored from @mauriciobenjamin700/ort-vision-sdk-web. Do not hand-edit — regenerate with `npm run vendor:vision`. */
/**
 * Frame-brightness helpers — measure the mean luminance of an already-decoded
 * frame (`<img>`, `<video>`, `<canvas>`, `ImageBitmap` or `OffscreenCanvas`) so
 * a UI can reject underexposed captures before paying the cost of downstream
 * inference.
 *
 * These are framework-agnostic pure functions; {@link useLiveLuminance} wires
 * {@link computeImageLuminance} into a React `requestAnimationFrame` loop for
 * live camera feedback.
 */

/**
 * Longest edge (in pixels) the source is downsampled to before sampling.
 * Averaging over a small downsample is statistically equivalent for a
 * brightness threshold and orders of magnitude faster than reading every pixel
 * of a full-resolution camera frame.
 */
export const LUMINANCE_SAMPLE_MAX_EDGE = 256;

/**
 * Drawable source we can sample luminance from.
 *
 * The list tracks what `CanvasRenderingContext2D.drawImage` accepts and we can
 * read a pixel size off, which is what the implementation actually needs.
 * `ImageBitmap` matters for the decode-downscaled path: `createImageBitmap(blob,
 * { resizeWidth })` is how a caller avoids materialising a full-resolution
 * phone photo, and the frame it hands back is the frame whose brightness has to
 * be checked.
 */
export type LuminanceSource =
    HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/**
 * Natural pixel size of the source (`0`/`0` while it is still unloaded).
 *
 * `ImageBitmap` and `OffscreenCanvas` both expose plain `width`/`height`, so
 * they fall through to the same branch as a canvas — but they are named
 * explicitly rather than left to the `naturalWidth || width` fallback, which
 * only reads as intentional for an `<img>`.
 */
function sourceSize(source: LuminanceSource): { width: number; height: number } {
    if (source instanceof HTMLVideoElement) {
        return { width: source.videoWidth, height: source.videoHeight };
    }
    if (source instanceof HTMLImageElement) {
        return {
            width: source.naturalWidth || source.width,
            height: source.naturalHeight || source.height,
        };
    }
    return { width: source.width, height: source.height };
}

/**
 * Mean BT.709 luminance (`0.2126*R + 0.7152*G + 0.0722*B`) of a decoded frame,
 * scaled to `0..255`. See {@link LuminanceSource} for what counts as one.
 *
 * The source is downsampled so its longest edge is at most
 * {@link LUMINANCE_SAMPLE_MAX_EDGE} before pixels are read. The 2D context is
 * created with `willReadFrequently` so repeated sampling (live feedback) stays
 * on the fast path.
 *
 * Pass `reusableCanvas` to avoid allocating a fresh canvas every frame in a hot
 * loop; when omitted a one-shot detached canvas is created.
 *
 * @param source - the decoded frame to sample.
 * @param reusableCanvas - optional canvas reused across frames to avoid GC churn.
 * @returns The mean luminance in `0..255`, or `0` when the source is unloaded
 *   (zero-sized) or a 2D context is unavailable.
 */
export function computeImageLuminance(
    source: LuminanceSource,
    reusableCanvas?: HTMLCanvasElement,
): number {
    const { width: srcW, height: srcH } = sourceSize(source);
    if (srcW === 0 || srcH === 0) return 0;

    const scale = Math.min(1, LUMINANCE_SAMPLE_MAX_EDGE / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = reusableCanvas ?? document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(source, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    const pixelCount = w * h;
    for (let i = 0; i < data.length; i += 4) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / pixelCount;
}

/**
 * Whether a measured luminance clears a brightness threshold.
 *
 * `threshold` is intentionally required — a sensible value is
 * application-specific (it depends on the model, the lighting the model was
 * trained on, and the acceptable false-reject rate), so the SDK does not bake
 * in a default.
 *
 * @param luminance - measured mean luminance in `0..255`.
 * @param threshold - minimum acceptable luminance in `0..255`.
 * @returns `true` when `luminance >= threshold`.
 */
export function isLuminanceAcceptable(luminance: number, threshold: number): boolean {
    return luminance >= threshold;
}

/**
 * Error raised when a captured frame is too dark to be analysed reliably.
 * Carries the measured luminance and the threshold it failed so callers can
 * surface actionable feedback.
 */
export class LowLuminanceError extends Error {
    /** Measured mean luminance, `0..255`. */
    readonly luminance: number;
    /** Threshold that was checked against, `0..255`. */
    readonly threshold: number;

    /**
     * @param luminance - the measured mean luminance in `0..255`.
     * @param threshold - the threshold the measurement failed to reach.
     */
    constructor(luminance: number, threshold: number) {
        super("Image is too dark to analyse. Capture again in a brighter environment.");
        this.name = "LowLuminanceError";
        this.luminance = luminance;
        this.threshold = threshold;
    }
}
