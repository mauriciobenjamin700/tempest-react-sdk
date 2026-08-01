/**
 * Types for browser-side image processing.
 */

/** Anything the module can decode. */
export type ImageSource =
    | Blob
    | File
    | ImageBitmap
    | ImageData
    | HTMLImageElement
    | HTMLCanvasElement
    | OffscreenCanvas
    | string;

/** Encodable image formats. */
export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

/**
 * How a resize fits the requested box.
 *
 * - `contain`: the whole image fits inside the box; the result may be
 *   smaller than the box in one dimension.
 * - `cover`: the box is filled; the overflow is cropped, centred.
 * - `fill`: the image is stretched to the box, changing its aspect ratio.
 * - `pad`: like `contain`, but the result is exactly the box, with the
 *   remainder painted in `background`.
 */
export type ResizeFit = "contain" | "cover" | "fill" | "pad";

/** A decoded image, ready to draw. */
export interface DecodedImage {
    /** The pixels. */
    readonly bitmap: ImageBitmap;
    /** Width in pixels, after orientation was applied. */
    readonly width: number;
    /** Height in pixels, after orientation was applied. */
    readonly height: number;
}

/** What a file holds, without decoding all of it. */
export interface ImageInfo {
    readonly width: number;
    readonly height: number;
    /** MIME type as reported by the blob. */
    readonly type: string;
    /** Size in bytes. */
    readonly bytes: number;
    /** `width / height`. */
    readonly aspectRatio: number;
}

/** Options for {@link encodeImage}. */
export interface EncodeOptions {
    /** Output format. Defaults to `image/jpeg`. */
    readonly type?: ImageType;
    /** Quality for lossy formats, `0`-`1`. Defaults to `0.85`. */
    readonly quality?: number;
}

/** Options for {@link resizeImage}. */
export interface ResizeOptions extends EncodeOptions {
    /** Target width in pixels. */
    readonly width?: number;
    /** Target height in pixels. */
    readonly height?: number;
    /** How the image fits the box. Defaults to `contain`. */
    readonly fit?: ResizeFit;
    /** Fill colour for `pad`, and behind transparency when encoding JPEG. */
    readonly background?: string;
    /**
     * Never scale an image up.
     *
     * On by default: enlarging a photo adds no detail and multiplies the
     * bytes, which is the opposite of what a resize is usually for.
     */
    readonly withoutEnlargement?: boolean;
}

/** A rectangle in source pixels. */
export interface CropRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** The result of an operation that produced an encoded image. */
export interface ProcessedImage {
    /** The encoded bytes. */
    readonly blob: Blob;
    /** Output width. */
    readonly width: number;
    /** Output height. */
    readonly height: number;
    /** Output format actually produced — not necessarily the one asked for. */
    readonly type: string;
    /** Size in bytes. */
    readonly bytes: number;
}

/** Options for {@link compressToTarget}. */
export interface CompressOptions extends ResizeOptions {
    /** Byte budget the result must fit in. */
    readonly maxBytes: number;
    /** Lowest quality worth producing. Defaults to `0.4`. */
    readonly minQuality?: number;
    /** Highest quality to start from. Defaults to `0.92`. */
    readonly maxQuality?: number;
    /** Search steps. Defaults to `6`, which resolves quality to ~1%. */
    readonly steps?: number;
}
