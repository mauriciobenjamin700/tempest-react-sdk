/** A width/height pair in pixels. */
export interface Size {
    width: number;
    height: number;
}

/** A pan offset in frame pixels, measured from the centered position. */
export interface Offset {
    x: number;
    y: number;
}

/** The source rectangle to read out of the natural-size image. */
export interface CropRect {
    sx: number;
    sy: number;
    sWidth: number;
    sHeight: number;
}

/**
 * Scale that makes `image` exactly cover `frame` with no empty space.
 *
 * `max` rather than `min`: a crop frame must never show background, so the
 * constraining axis is the one that would leave a gap.
 *
 * @param image - Natural image size.
 * @param frame - Crop frame size.
 * @returns The cover scale, or `0` when either dimension is unusable.
 */
export function coverScale(image: Size, frame: Size): number {
    if (image.width <= 0 || image.height <= 0 || frame.width <= 0 || frame.height <= 0) return 0;
    return Math.max(frame.width / image.width, frame.height / image.height);
}

/**
 * The largest pan offset that keeps the image covering the frame.
 *
 * Zero on an axis means the image is exactly as wide (or tall) as the frame
 * there, so panning along it would expose background.
 *
 * @param displayed - On-screen image size, after scale and zoom.
 * @param frame - Crop frame size.
 * @returns Maximum absolute offset per axis.
 */
export function maxOffset(displayed: Size, frame: Size): Offset {
    return {
        x: Math.max(0, (displayed.width - frame.width) / 2),
        y: Math.max(0, (displayed.height - frame.height) / 2),
    };
}

/**
 * Clamp a pan offset so the frame stays fully covered.
 *
 * This is what stops the single most common defect in a cropper: dragging or
 * zooming until the frame shows empty space, which then bakes transparent or
 * black bands into the exported image.
 *
 * @param offset - Desired offset.
 * @param displayed - On-screen image size, after scale and zoom.
 * @param frame - Crop frame size.
 * @returns The offset, clamped per axis.
 */
export function clampOffset(offset: Offset, displayed: Size, frame: Size): Offset {
    const max = maxOffset(displayed, frame);
    return {
        x: normalizeZero(Math.min(max.x, Math.max(-max.x, offset.x))),
        y: normalizeZero(Math.min(max.y, Math.max(-max.y, offset.y))),
    };
}

/**
 * Turn `-0` into `0`.
 *
 * Clamping a negative offset against a zero maximum yields `-0`, which compares
 * equal to `0` under `===` but not under `Object.is`. Left alone it leaks into
 * state comparisons and into the `translate()` string, so it is normalized once
 * here rather than guarded at every call site.
 */
function normalizeZero(value: number): number {
    return value === 0 ? 0 : value;
}

/**
 * Map the crop frame back onto the natural-size image.
 *
 * The frame is what the user sees; the export has to read the corresponding
 * region of the *original* pixels, so every on-screen quantity is divided back
 * out by the effective scale. Working in natural pixels — instead of exporting
 * whatever the preview happens to be sized at — is what keeps a 4000 px photo
 * from being downsampled to the width of a 320 px preview.
 *
 * @param params.image - Natural image size.
 * @param params.frame - Crop frame size.
 * @param params.zoom - Zoom multiplier over the cover scale (`1` = cover).
 * @param params.offset - Pan offset in frame pixels.
 * @returns The source rectangle, clamped to the image bounds.
 */
export function computeCropRect({
    image,
    frame,
    zoom,
    offset,
}: {
    image: Size;
    frame: Size;
    zoom: number;
    offset: Offset;
}): CropRect {
    const scale = coverScale(image, frame) * zoom;
    if (scale <= 0) return { sx: 0, sy: 0, sWidth: 0, sHeight: 0 };

    const sWidth = frame.width / scale;
    const sHeight = frame.height / scale;

    // A positive offset moves the image right/down on screen, which means the
    // visible region moves left/up within the source — hence the subtraction.
    const centerX = image.width / 2 - offset.x / scale;
    const centerY = image.height / 2 - offset.y / scale;

    const sx = Math.max(0, Math.min(image.width - sWidth, centerX - sWidth / 2));
    const sy = Math.max(0, Math.min(image.height - sHeight, centerY - sHeight / 2));

    return { sx, sy, sWidth, sHeight };
}

/**
 * Output size for a crop, honoring an optional cap on the long edge.
 *
 * Exporting at the frame's own size would tie file size to whatever the preview
 * happened to measure. Exporting at full source resolution is right by default,
 * but a 12 MP phone photo cropped for a 96 px avatar is megabytes of waste — so
 * `maxSize` caps the long edge while preserving the aspect ratio.
 *
 * @param crop - The source rectangle being exported.
 * @param maxSize - Cap on the longest output edge, if any.
 * @returns Integer output dimensions, at least 1 px per axis.
 */
export function outputSize(crop: CropRect, maxSize?: number): Size {
    const width = crop.sWidth;
    const height = crop.sHeight;
    if (!maxSize || maxSize <= 0 || (width <= maxSize && height <= maxSize)) {
        return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    }
    const ratio = maxSize / Math.max(width, height);
    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio)),
    };
}
