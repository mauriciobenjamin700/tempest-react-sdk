/**
 * Turning whatever the app has into pixels.
 *
 * A PWA receives images from a file input, a camera capture, a paste, a
 * fetch, or a canvas it drew itself. They all become an `ImageBitmap` here,
 * with the one correction that matters on phones applied: **EXIF
 * orientation**.
 *
 * A photo taken in portrait is usually stored landscape plus an orientation
 * tag. Decode it without honouring the tag and every user sees their photo
 * sideways — the single most reported bug in upload flows. `createImageBitmap`
 * accepts `imageOrientation: "from-image"`, and that is what this module
 * asks for.
 */

import { ImageDecodeError } from "./exceptions";
import type { DecodedImage, ImageInfo, ImageSource } from "./types";

/**
 * Decode any supported source into a bitmap, oriented as the photographer
 * held the camera.
 *
 * @example
 * ```ts
 * const { bitmap, width, height } = await decodeImage(file);
 * ```
 *
 * @param source A `Blob`/`File`, URL string, `ImageBitmap`, `ImageData`,
 *   `HTMLImageElement`, or a canvas.
 * @returns The decoded pixels and their dimensions.
 * @throws {@link ImageDecodeError} when the bytes are not a decodable image,
 *   or the URL cannot be fetched.
 */
export async function decodeImage(source: ImageSource): Promise<DecodedImage> {
    const bitmap = await toBitmap(source);
    return { bitmap, width: bitmap.width, height: bitmap.height };
}

/**
 * Decode a source into an `ImageBitmap`.
 *
 * @param source The image source.
 * @returns The bitmap.
 * @throws {@link ImageDecodeError} when decoding fails.
 */
async function toBitmap(source: ImageSource): Promise<ImageBitmap> {
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
        return source;
    }

    if (typeof source === "string") {
        let response: Response;
        try {
            response = await fetch(source);
        } catch (error) {
            throw new ImageDecodeError(`Could not fetch the image at ${source}`, {
                cause: error,
            });
        }
        if (!response.ok) {
            throw new ImageDecodeError(
                `Could not fetch the image at ${source}: ${response.status} ${response.statusText}`,
            );
        }
        return await toBitmap(await response.blob());
    }

    try {
        return await createImageBitmap(source as ImageBitmapSource, {
            imageOrientation: "from-image",
        });
    } catch (error) {
        throw new ImageDecodeError(
            `Could not decode the image: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }
}

/**
 * Read an image's dimensions, type and size.
 *
 * Decodes to measure, which is the only reliable way in a browser — there
 * is no header parser here, and guessing dimensions from a MIME type is not
 * a thing. Cheap enough for a preview, not for a thousand files in a loop.
 *
 * @example
 * ```ts
 * const info = await readImageInfo(file);
 * if (info.bytes > 5_000_000) {
 *     // ask before uploading
 * }
 * ```
 *
 * @param blob The image file.
 * @returns Its dimensions, MIME type, byte size and aspect ratio.
 * @throws {@link ImageDecodeError} when the blob is not a decodable image.
 */
export async function readImageInfo(blob: Blob): Promise<ImageInfo> {
    const { bitmap } = await decodeImage(blob);
    const info: ImageInfo = {
        width: bitmap.width,
        height: bitmap.height,
        type: blob.type,
        bytes: blob.size,
        aspectRatio: bitmap.height === 0 ? 0 : bitmap.width / bitmap.height,
    };
    bitmap.close?.();
    return info;
}
