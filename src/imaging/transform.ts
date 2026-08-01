/**
 * Resize, crop, rotate — the operations a PWA runs before an upload.
 *
 * Every one of them ends in a re-encode, which has a consequence worth
 * knowing: **the output carries no EXIF.** Location, camera serial and
 * timestamp do not survive a canvas round trip. For an app handling user
 * photos that is usually the point, and it is the reason `resizeImage` is
 * also the privacy step, not only the bandwidth step.
 */

import { createSurface, drawScaled, getContext } from "./canvas";
import { decodeImage } from "./decode";
import type {
    CropRect,
    EncodeOptions,
    ImageSource,
    ProcessedImage,
    ResizeFit,
    ResizeOptions,
} from "./types";
import { encodeImage } from "./encode";

/** Background used when a format cannot carry transparency. */
export const DEFAULT_BACKGROUND = "#ffffff";

/** Formats that have no alpha channel. */
const OPAQUE_TYPES = new Set(["image/jpeg", "image/jpg"]);

/**
 * Compute the drawing geometry for a fit mode.
 *
 * @param source Source dimensions.
 * @param box Requested box; a missing side is derived from the aspect ratio.
 * @param fit How to fit the box.
 * @param withoutEnlargement Never scale up.
 * @returns Surface size and where the image lands inside it.
 */
function layout(
    source: { width: number; height: number },
    box: { width?: number; height?: number },
    fit: ResizeFit,
    withoutEnlargement: boolean,
): {
    surface: { width: number; height: number };
    draw: { x: number; y: number; width: number; height: number };
} {
    const ratio = source.width / source.height;
    let targetWidth = box.width ?? (box.height !== undefined ? box.height * ratio : source.width);
    let targetHeight = box.height ?? (box.width !== undefined ? box.width / ratio : source.height);

    if (withoutEnlargement) {
        const scale = Math.min(1, source.width / targetWidth, source.height / targetHeight);
        targetWidth *= scale;
        targetHeight *= scale;
    }

    targetWidth = Math.max(1, Math.round(targetWidth));
    targetHeight = Math.max(1, Math.round(targetHeight));

    if (fit === "fill") {
        return {
            surface: { width: targetWidth, height: targetHeight },
            draw: { x: 0, y: 0, width: targetWidth, height: targetHeight },
        };
    }

    const scale =
        fit === "cover"
            ? Math.max(targetWidth / source.width, targetHeight / source.height)
            : Math.min(targetWidth / source.width, targetHeight / source.height);

    const drawWidth = Math.max(1, Math.round(source.width * scale));
    const drawHeight = Math.max(1, Math.round(source.height * scale));

    if (fit === "contain") {
        return {
            surface: { width: drawWidth, height: drawHeight },
            draw: { x: 0, y: 0, width: drawWidth, height: drawHeight },
        };
    }

    return {
        surface: { width: targetWidth, height: targetHeight },
        draw: {
            x: Math.round((targetWidth - drawWidth) / 2),
            y: Math.round((targetHeight - drawHeight) / 2),
            width: drawWidth,
            height: drawHeight,
        },
    };
}

/**
 * Resolve the background to paint before drawing.
 *
 * @param options The caller's options.
 * @returns A colour, or `undefined` to keep transparency.
 */
function backgroundFor(options: ResizeOptions): string | undefined {
    if (options.background !== undefined) return options.background;
    const type = options.type ?? "image/jpeg";
    if (OPAQUE_TYPES.has(type)) return DEFAULT_BACKGROUND;
    return options.fit === "pad" ? DEFAULT_BACKGROUND : undefined;
}

/**
 * Resize an image, re-encoding it.
 *
 * @example
 * ```ts
 * const resized = await resizeImage(file, { width: 1600, type: "image/webp" });
 * console.log(resized.width, resized.bytes, resized.type);
 * ```
 *
 * @param source Anything decodable.
 * @param options Target box, fit, format and quality.
 * @returns The encoded result.
 * @throws {@link ImageDecodeError} when the source cannot be decoded.
 * @throws {@link ImageEncodeError} when the canvas produces no bytes.
 */
export async function resizeImage(
    source: ImageSource,
    options: ResizeOptions = {},
): Promise<ProcessedImage> {
    const { bitmap } = await decodeImage(source);
    try {
        const geometry = layout(
            bitmap,
            { width: options.width, height: options.height },
            options.fit ?? "contain",
            options.withoutEnlargement !== false,
        );
        const surface = createSurface(geometry.surface.width, geometry.surface.height);
        drawScaled(bitmap, surface, geometry.draw, backgroundFor(options));
        return await encodeImage(surface, options);
    } finally {
        bitmap.close?.();
    }
}

/**
 * Crop a rectangle out of an image, in source pixels.
 *
 * The rectangle is clamped to the image, so a crop dragged past the edge
 * produces a smaller result instead of transparent padding.
 *
 * @example
 * ```ts
 * const badge = await cropImage(file, { x: 120, y: 80, width: 400, height: 400 });
 * ```
 *
 * @param source Anything decodable.
 * @param rect The region to keep.
 * @param options Format and quality.
 * @returns The encoded crop.
 * @throws {@link ImageDecodeError} when the source cannot be decoded.
 */
export async function cropImage(
    source: ImageSource,
    rect: CropRect,
    options: EncodeOptions = {},
): Promise<ProcessedImage> {
    const { bitmap } = await decodeImage(source);
    try {
        const x = Math.max(0, Math.min(Math.round(rect.x), bitmap.width - 1));
        const y = Math.max(0, Math.min(Math.round(rect.y), bitmap.height - 1));
        const width = Math.max(1, Math.min(Math.round(rect.width), bitmap.width - x));
        const height = Math.max(1, Math.min(Math.round(rect.height), bitmap.height - y));

        const surface = createSurface(width, height);
        const context = getContext(
            surface,
            OPAQUE_TYPES.has(options.type ?? "image/jpeg") ? DEFAULT_BACKGROUND : undefined,
        );
        context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
        return await encodeImage(surface, options);
    } finally {
        bitmap.close?.();
    }
}

/**
 * Rotate an image by a multiple of 90 degrees.
 *
 * Restricted to right angles on purpose: an arbitrary angle needs a
 * decision about the corners (crop, pad, or grow the canvas) that belongs
 * to the caller's design, not to a utility default.
 *
 * @example
 * ```ts
 * const upright = await rotateImage(file, 90);
 * ```
 *
 * @param source Anything decodable.
 * @param degrees `90`, `180`, `270` — or any multiple, normalised.
 * @param options Format and quality.
 * @returns The rotated image.
 * @throws {@link ImageDecodeError} when the source cannot be decoded.
 * @throws {@link RangeError} when the angle is not a multiple of 90.
 */
export async function rotateImage(
    source: ImageSource,
    degrees: number,
    options: EncodeOptions = {},
): Promise<ProcessedImage> {
    if (degrees % 90 !== 0) {
        throw new RangeError(
            `rotateImage takes multiples of 90 degrees; got ${degrees}. For an ` +
                "arbitrary angle, draw it yourself: the corner handling is a design " +
                "decision, not a default.",
        );
    }
    const turns = (((degrees / 90) % 4) + 4) % 4;
    const { bitmap } = await decodeImage(source);
    try {
        const swapped = turns % 2 === 1;
        const width = swapped ? bitmap.height : bitmap.width;
        const height = swapped ? bitmap.width : bitmap.height;

        const surface = createSurface(width, height);
        const context = getContext(
            surface,
            OPAQUE_TYPES.has(options.type ?? "image/jpeg") ? DEFAULT_BACKGROUND : undefined,
        );
        context.translate(width / 2, height / 2);
        context.rotate((turns * Math.PI) / 2);
        context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        return await encodeImage(surface, options);
    } finally {
        bitmap.close?.();
    }
}

/**
 * Mirror an image horizontally, vertically, or both.
 *
 * @example
 * ```ts
 * const selfie = await flipImage(capture, { horizontal: true });
 * ```
 *
 * @param source Anything decodable.
 * @param axes Which axes to mirror.
 * @param options Format and quality.
 * @returns The flipped image.
 * @throws {@link ImageDecodeError} when the source cannot be decoded.
 */
export async function flipImage(
    source: ImageSource,
    axes: { horizontal?: boolean; vertical?: boolean },
    options: EncodeOptions = {},
): Promise<ProcessedImage> {
    const { bitmap } = await decodeImage(source);
    try {
        const surface = createSurface(bitmap.width, bitmap.height);
        const context = getContext(
            surface,
            OPAQUE_TYPES.has(options.type ?? "image/jpeg") ? DEFAULT_BACKGROUND : undefined,
        );
        context.translate(
            axes.horizontal === true ? bitmap.width : 0,
            axes.vertical === true ? bitmap.height : 0,
        );
        context.scale(axes.horizontal === true ? -1 : 1, axes.vertical === true ? -1 : 1);
        context.drawImage(bitmap, 0, 0);
        return await encodeImage(surface, options);
    } finally {
        bitmap.close?.();
    }
}
