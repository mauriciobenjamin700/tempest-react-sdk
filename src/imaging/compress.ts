/**
 * Fitting an image into a byte budget.
 *
 * The upload endpoint takes 2 MB. The user's phone produces 8. Guessing a
 * quality that "usually works" fails on exactly the photos that matter —
 * a detailed scene compresses worse than a flat one, so a fixed 0.7 lands
 * anywhere between 400 KB and 4 MB depending on the picture.
 *
 * Binary search on quality lands on the budget in a bounded number of
 * encodes, and reports what it settled on so the caller can log it.
 */

import type { CompressOptions, ImageSource, ProcessedImage } from "./types";
import { resizeImage } from "./transform";

/** Search steps when the caller does not choose. */
export const DEFAULT_COMPRESS_STEPS = 6;

/** Lowest quality worth producing by default. */
export const DEFAULT_MIN_QUALITY = 0.4;

/** Highest quality to start from by default. */
export const DEFAULT_MAX_QUALITY = 0.92;

/** What {@link compressToTarget} produced. */
export interface CompressedImage extends ProcessedImage {
    /** The quality it settled on. */
    readonly quality: number;
    /** How many encodes it took. */
    readonly attempts: number;
    /**
     * Whether the result actually fits the budget.
     *
     * `false` means the image could not reach it even at `minQuality` —
     * reported rather than thrown, because a 2.1 MB result against a 2 MB
     * budget is usually still worth uploading, and that call is the
     * caller's.
     */
    readonly withinBudget: boolean;
}

/**
 * Compress an image until it fits a byte budget.
 *
 * @example
 * ```ts
 * const upload = await compressToTarget(file, {
 *     maxBytes: 2 * 1024 * 1024,
 *     width: 2000,
 *     type: "image/webp",
 * });
 *
 * if (!upload.withinBudget) {
 *     console.warn(`still ${upload.bytes} bytes at quality ${upload.quality}`);
 * }
 * ```
 *
 * Resizing first is what usually does the work: halving the long edge
 * removes three quarters of the pixels, which no quality setting matches.
 * Pass `width`/`height` when the source is a full-resolution photo.
 *
 * @param source Anything decodable.
 * @param options Byte budget plus the usual resize and format options.
 * @returns The best result found, and whether it fits.
 * @throws {@link ImageDecodeError} when the source cannot be decoded.
 */
export async function compressToTarget(
    source: ImageSource,
    options: CompressOptions,
): Promise<CompressedImage> {
    const minQuality = options.minQuality ?? DEFAULT_MIN_QUALITY;
    const maxQuality = options.maxQuality ?? DEFAULT_MAX_QUALITY;
    const steps = Math.max(1, options.steps ?? DEFAULT_COMPRESS_STEPS);

    let low = minQuality;
    let high = maxQuality;
    let attempts = 0;

    let best = await resizeImage(source, { ...options, quality: maxQuality });
    attempts += 1;
    let bestQuality = maxQuality;

    if (best.bytes <= options.maxBytes) {
        return { ...best, quality: bestQuality, attempts, withinBudget: true };
    }

    let fitting: ProcessedImage | null = null;
    let fittingQuality = minQuality;

    for (let step = 0; step < steps; step += 1) {
        const quality = (low + high) / 2;
        const candidate = await resizeImage(source, { ...options, quality });
        attempts += 1;

        if (candidate.bytes <= options.maxBytes) {
            fitting = candidate;
            fittingQuality = quality;
            low = quality;
        } else {
            high = quality;
        }
    }

    if (fitting !== null) {
        return { ...fitting, quality: fittingQuality, attempts, withinBudget: true };
    }

    best = await resizeImage(source, { ...options, quality: minQuality });
    attempts += 1;
    bestQuality = minQuality;
    return {
        ...best,
        quality: bestQuality,
        attempts,
        withinBudget: best.bytes <= options.maxBytes,
    };
}
