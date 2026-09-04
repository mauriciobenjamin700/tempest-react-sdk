/**
 * `tempest-react-sdk/imaging` — image processing in the browser, for PWAs
 * that run at the edge.
 *
 * A PWA that takes photos has to do the work locally: it may be offline, the
 * connection may be metered, and the user's picture should not travel any
 * further than necessary. This module resizes, crops, rotates, re-encodes
 * and fits images into a byte budget without a server and without a
 * dependency — it is `createImageBitmap` and a canvas, with the traps
 * handled.
 *
 * Three of those traps are the reason it exists:
 *
 * - **EXIF orientation.** Phone photos are stored landscape with a rotation
 *   tag. Decoding without honouring it shows every portrait sideways.
 * - **Silent format fallback.** Asking a canvas for AVIF on a browser that
 *   cannot encode it returns a PNG, several times the size, with no error.
 * - **Steep downscales.** Handled by `imageSmoothingQuality = "high"` — the
 *   stepwise halving this module used to do was measured to cost 300 times
 *   more for a pixel-identical result, and was deleted.
 *
 * Re-encoding also drops EXIF, so `resizeImage` is the step that removes
 * GPS coordinates from a user's photo. That is usually what you want, and
 * it is worth knowing it happens.
 */

export { type Surface, type SurfaceContext, createSurface, drawScaled, getContext } from "./canvas";
export {
    DEFAULT_COMPRESS_STEPS,
    DEFAULT_MAX_QUALITY,
    DEFAULT_MIN_QUALITY,
    type CompressedImage,
    compressToTarget,
} from "./compress";
export { decodeImage, readImageInfo } from "./decode";
export {
    DEFAULT_QUALITY,
    DEFAULT_TYPE,
    bestSupportedType,
    encodeImage,
    supportsImageType,
} from "./encode";
export {
    FrameSeekError,
    ImageDecodeError,
    ImageEncodeError,
    ImagingError,
    ImagingUnavailableError,
    UnsupportedImageTypeError,
} from "./exceptions";
export { DEFAULT_FRAME_TIMEOUT_MS, captureFrame } from "./frame";
export { type Thumbnail, type ThumbnailSpec, createThumbnails } from "./thumbnails";
export { DEFAULT_BACKGROUND, cropImage, flipImage, resizeImage, rotateImage } from "./transform";
export type {
    CaptureFrameOptions,
    CapturedFrame,
    CompressOptions,
    CropRect,
    DecodedImage,
    EncodeOptions,
    ImageInfo,
    ImageSource,
    ImageType,
    ProcessedImage,
    ResizeFit,
    ResizeOptions,
} from "./types";
export {
    type ImageProcessingStatus,
    type UseImagePreviewResult,
    type UseImageProcessingResult,
    useImagePreview,
    useImageProcessing,
} from "./use-image-processing";
