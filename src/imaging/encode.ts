/**
 * Getting bytes back out, and knowing which bytes you got.
 *
 * The trap here is silent: `canvas.toBlob(cb, "image/avif")` does not throw
 * on a browser without an AVIF encoder. It hands back a **PNG** with the
 * requested type ignored, and an app that trusted the request uploads
 * several megabytes where it planned for a few hundred kilobytes. Every
 * function here reports the type actually produced, and
 * :func:`supportsImageType` answers the question up front.
 */

import { getContext, type Surface } from "./canvas";
import { ImageEncodeError } from "./exceptions";
import type { EncodeOptions, ImageType, ProcessedImage } from "./types";

/** Quality used when the caller does not choose. */
export const DEFAULT_QUALITY = 0.85;

/** Format used when the caller does not choose. */
export const DEFAULT_TYPE: ImageType = "image/jpeg";

const supportCache = new Map<string, boolean>();

/**
 * Encode a surface into image bytes.
 *
 * @param surface The canvas to encode.
 * @param options Format and quality.
 * @returns The blob plus the dimensions and the type actually produced.
 * @throws {@link ImageEncodeError} when the canvas produces nothing.
 */
export async function encodeImage(
    surface: Surface,
    options: EncodeOptions = {},
): Promise<ProcessedImage> {
    const type = options.type ?? DEFAULT_TYPE;
    const quality = options.quality ?? DEFAULT_QUALITY;

    const blob = await surfaceToBlob(surface, type, quality);
    if (blob === null) {
        throw new ImageEncodeError(
            `The canvas produced no bytes for ${type}. The image may be too large ` +
                "for this browser's canvas limits.",
        );
    }

    return {
        blob,
        width: surface.width,
        height: surface.height,
        type: blob.type || type,
        bytes: blob.size,
    };
}

/**
 * Encode a surface, whichever kind it is.
 *
 * `OffscreenCanvas` and `HTMLCanvasElement` disagree on how to hand back
 * bytes — one returns a promise, the other takes a callback.
 *
 * @param surface The canvas.
 * @param type MIME type to request.
 * @param quality Quality for lossy formats.
 * @returns The blob, or `null` when the canvas produced nothing.
 */
async function surfaceToBlob(
    surface: Surface,
    type: string,
    quality: number,
): Promise<Blob | null> {
    if ("convertToBlob" in surface) {
        return await surface.convertToBlob({ type, quality });
    }
    return await new Promise<Blob | null>((resolve) => {
        surface.toBlob((blob) => resolve(blob), type, quality);
    });
}

/**
 * Whether this browser can actually encode a format.
 *
 * Asks for a 1x1 image in that type and checks what came back, because
 * that is the only answer that counts: a browser that "supports" WebP for
 * display may still not encode it.
 *
 * @example
 * ```ts
 * const type = (await supportsImageType("image/webp")) ? "image/webp" : "image/jpeg";
 * const resized = await resizeImage(file, { width: 1200, type });
 * ```
 *
 * @param type The format to test.
 * @returns Whether encoding produces that type. Cached per type.
 */
export async function supportsImageType(type: ImageType): Promise<boolean> {
    const cached = supportCache.get(type);
    if (cached !== undefined) return cached;

    let supported: boolean;
    try {
        const { createSurface } = await import("./canvas");
        const surface = createSurface(1, 1);
        getContext(surface);
        const blob = await surfaceToBlob(surface, type, 0.5);
        supported = blob !== null && blob.type === type;
    } catch {
        supported = false;
    }

    supportCache.set(type, supported);
    return supported;
}

/**
 * Pick the smallest format this browser can actually produce.
 *
 * @example
 * ```ts
 * const type = await bestSupportedType(["image/avif", "image/webp", "image/jpeg"]);
 * ```
 *
 * @param preferences Formats in preference order.
 * @returns The first supported one, falling back to `image/jpeg`, which
 *   every canvas implementation encodes.
 */
export async function bestSupportedType(
    preferences: readonly ImageType[] = ["image/webp", "image/jpeg"],
): Promise<ImageType> {
    for (const type of preferences) {
        if (await supportsImageType(type)) return type;
    }
    return "image/jpeg";
}

/**
 * Clear the format-support cache.
 *
 * Only useful in tests: browser support does not change at runtime.
 */
export function resetImageTypeSupportCache(): void {
    supportCache.clear();
}
