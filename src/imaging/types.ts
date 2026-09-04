/**
 * Types for browser-side image processing.
 */

/**
 * Anything the module can decode.
 *
 * `HTMLVideoElement` reads the frame the element is **currently showing** —
 * `createImageBitmap` accepts it as a `CanvasImageSource`, so nothing here
 * special-cases it. Reading a chosen instant instead of the current one needs
 * the seek to be confirmed first, which is what `captureFrame` is for.
 */
export type ImageSource =
    | Blob
    | File
    | ImageBitmap
    | ImageData
    | HTMLImageElement
    | HTMLVideoElement
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

/** Options for {@link captureFrame}. */
export interface CaptureFrameOptions extends ResizeOptions {
    /**
     * Instant to capture, in milliseconds. Left out: the frame on screen now.
     *
     * Clamped to the video's duration. Seeking snaps to a frame boundary, so
     * the frame you get is the one **containing** this instant — the result
     * reports where it actually landed in {@link CapturedFrame.atMs}.
     */
    readonly atMs?: number;
    /**
     * Put `currentTime` and playback back where they were. Default `true`.
     *
     * Only relevant with `atMs`: capturing the current frame moves nothing.
     * Pass `false` when the capture is meant to leave the player parked on the
     * frame it took.
     */
    readonly restore?: boolean;
    /**
     * How long to wait for the seek and for the frame after it. Default `3000`.
     *
     * Reached means {@link FrameSeekError}, never a frame from the wrong
     * instant: a picture of the wrong moment is worse than an error, because
     * nothing downstream can tell.
     */
    readonly timeoutMs?: number;
    /** Abort the capture. Rejects with an `AbortError` `DOMException`. */
    readonly signal?: AbortSignal;
}

/** An encoded frame, and where in the video it came from. */
export interface CapturedFrame extends ProcessedImage {
    /**
     * The instant actually captured, in milliseconds.
     *
     * Not necessarily the `atMs` asked for: a seek lands on a frame boundary,
     * so a request for 12 500 ms in a 30 fps video captures 12 500 at best and
     * 12 466,67 in practice. Report this one, not the request.
     */
    readonly atMs: number;
    /**
     * Whether a newly presented frame was observed before the pixels were read.
     *
     * `true` only when `requestVideoFrameCallback` reported a frame going to
     * the compositor. Measured in Chromium, 2026-09-04: that callback fires
     * while a video **plays** and does **not** fire for a seek on a paused
     * element — so capturing from a playing video (a screen-recording print)
     * can be confirmed, and **capturing at an `atMs` reports `false`**, having
     * settled on `seeked` plus two animation frames instead.
     *
     * So `false` is the normal result for a seek, not a warning. It says the
     * capture is best effort by the standard of what browsers expose, and
     * treating it as a failure would reject the majority of correct captures.
     */
    readonly confirmed: boolean;
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
