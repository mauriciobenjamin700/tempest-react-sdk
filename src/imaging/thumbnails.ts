/**
 * Producing several sizes from one decode.
 *
 * A gallery needs a grid thumbnail, a list avatar and a detail view. Doing
 * that with three `resizeImage` calls decodes the same photo three times,
 * which on a 12-megapixel picture is most of the cost — the decode dominates,
 * not the scaling.
 */

import { createSurface, drawScaled } from "./canvas";
import { decodeImage } from "./decode";
import { encodeImage } from "./encode";
import type { EncodeOptions, ImageSource, ProcessedImage } from "./types";

/** One requested size. */
export interface ThumbnailSpec {
    /** Name to find it by in the result. */
    readonly name: string;
    /** Longest edge in pixels. */
    readonly size: number;
    /** Format and quality, overriding the shared options. */
    readonly encode?: EncodeOptions;
}

/** A produced thumbnail. */
export interface Thumbnail extends ProcessedImage {
    readonly name: string;
}

/**
 * Produce several sizes from a single decode.
 *
 * @example
 * ```ts
 * const [thumb, card] = await createThumbnails(file, [
 *     { name: "thumb", size: 96 },
 *     { name: "card", size: 480 },
 * ]);
 * ```
 *
 * Sizes are the **longest edge**, and the aspect ratio is kept, so a
 * portrait and a landscape photo both fit the same grid cell without a
 * separate calculation per orientation.
 *
 * @param source Anything decodable.
 * @param specs The sizes to produce.
 * @param options Shared format and quality.
 * @returns One result per spec, in the order requested.
 * @throws {@link ImageDecodeError} when the source cannot be decoded.
 */
export async function createThumbnails(
    source: ImageSource,
    specs: readonly ThumbnailSpec[],
    options: EncodeOptions = {},
): Promise<Thumbnail[]> {
    const { bitmap } = await decodeImage(source);
    try {
        const results: Thumbnail[] = [];
        for (const spec of specs) {
            const scale = Math.min(1, spec.size / Math.max(bitmap.width, bitmap.height));
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));

            const surface = createSurface(width, height);
            drawScaled(bitmap, surface, { x: 0, y: 0, width, height });
            const encoded = await encodeImage(surface, { ...options, ...spec.encode });
            results.push({ ...encoded, name: spec.name });
        }
        return results;
    } finally {
        bitmap.close?.();
    }
}
