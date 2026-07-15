/**
 * Frame-brightness helpers — measure the mean luminance of an already-decoded
 * `<img>`, `<video>` or `<canvas>` so a UI can reject underexposed captures
 * before paying the cost of downstream inference.
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

/** Drawable source we can sample luminance from — image, video, or canvas. */
export type LuminanceSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/** Natural pixel size of the source (`0`/`0` while it is still unloaded). */
function sourceSize(source: LuminanceSource): { width: number; height: number } {
    if (source instanceof HTMLVideoElement) {
        return { width: source.videoWidth, height: source.videoHeight };
    }
    if (source instanceof HTMLCanvasElement) {
        return { width: source.width, height: source.height };
    }
    return {
        width: source.naturalWidth || source.width,
        height: source.naturalHeight || source.height,
    };
}

/**
 * Mean BT.709 luminance (`0.2126*R + 0.7152*G + 0.0722*B`) of a decoded
 * `<img>`, `<video>` or `<canvas>`, scaled to `0..255`.
 *
 * The source is downsampled so its longest edge is at most
 * {@link LUMINANCE_SAMPLE_MAX_EDGE} before pixels are read. The 2D context is
 * created with `willReadFrequently` so repeated sampling (live feedback) stays
 * on the fast path.
 *
 * Pass `reusableCanvas` to avoid allocating a fresh canvas every frame in a hot
 * loop; when omitted a one-shot detached canvas is created.
 *
 * @param source - the image/video/canvas to sample.
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
