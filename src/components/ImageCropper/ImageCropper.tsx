/**
 * @tempest-limits file-lines, props-count, function-lines — pointer drag, wheel
 * zoom, aspect clamping and canvas export share one piece of geometry state, and the
 * props are the two halves of that: the frame (aspect, shape, maxZoom, label) and
 * the export (maxSize, outputType, outputQuality, onCropChange, ref). Threading the
 * geometry through props would duplicate the clamp maths.
 */
import {
    type HTMLAttributes,
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useId,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";

import { cn } from "@/utils/cn";

import {
    clampOffset,
    computeCropRect,
    coverScale,
    type Offset,
    outputSize,
    type Size,
} from "./crop-geometry";
import styles from "./ImageCropper.module.css";

/** Imperative handle for exporting the current crop. */
export interface ImageCropperHandle {
    /**
     * Render the current crop and resolve with it.
     *
     * Resolves `null` when the image has not loaded yet or the browser refuses to
     * encode — never throws, so a submit handler does not need a try/catch.
     */
    crop: () => Promise<Blob | null>;
    /** Recentre at zoom 1. */
    reset: () => void;
}

export interface ImageCropperProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** The image to crop: a `File`/`Blob` from an input, or a URL. */
    src: File | Blob | string;
    /** Crop aspect ratio as `width / height`. Default `1` (square). */
    aspect?: number;
    /** Maximum zoom over the cover scale. Default `4`. */
    maxZoom?: number;
    /**
     * Cap on the longest edge of the exported image, in px.
     *
     * Without it the export keeps the source resolution, which is right for a
     * document scan and wasteful for an avatar.
     */
    maxSize?: number;
    /** Output MIME type. Default `"image/png"`. */
    outputType?: string;
    /** Output quality for lossy types, `0`–`1`. Default `0.92`. */
    outputQuality?: number;
    /** Overlay shape. `"circle"` for an avatar, `"rect"` for a document. Default `"rect"`. */
    shape?: "rect" | "circle";
    /** Called whenever the crop changes, e.g. to enable a submit button. */
    onCropChange?: (state: { zoom: number; offset: Offset }) => void;
    /** Accessible name for the crop area. */
    label?: string;
    ref?: React.Ref<ImageCropperHandle>;
}

/** Pixels moved per arrow-key press. */
const KEY_STEP = 12;

/** Zoom added or removed per `+`/`-` press, and per wheel notch. */
const ZOOM_STEP = 0.15;

/**
 * Crop an image to a fixed aspect ratio.
 *
 * The frame stays put and the image pans and zooms behind it — the model an avatar
 * or document-photo flow wants, where the output shape is decided by the app and
 * the user only chooses what lands inside it. (A free-form draggable rectangle is a
 * different component; this one cannot produce an off-ratio crop by construction.)
 *
 * The export reads the *natural* pixels through a canvas, so a 4000 px photo is not
 * silently downsampled to whatever the on-screen preview measured. The image is
 * also always clamped to cover the frame, so an export can never contain the empty
 * bands you get from panning past an edge.
 *
 * Works by pointer, wheel and keyboard: arrows pan, `+`/`-` zoom, `0` resets.
 *
 * @example
 * const cropper = useRef<ImageCropperHandle>(null);
 *
 * <ImageCropper ref={cropper} src={file} aspect={1} shape="circle" maxSize={512} />
 * <Button onClick={async () => upload(await cropper.current?.crop())}>Salvar</Button>
 */
export function ImageCropper({
    src,
    aspect = 1,
    maxZoom = 4,
    maxSize,
    outputType = "image/png",
    outputQuality = 0.92,
    shape = "rect",
    onCropChange,
    label = "Área de recorte",
    className,
    ref,
    ...rest
}: ImageCropperProps) {
    /**
     * Id for the shortcut hint.
     *
     * Generated rather than derived from `label`: a label with spaces would produce
     * an id with spaces, and `aria-describedby` splits on whitespace — so the
     * description would silently never associate with the frame.
     */
    const hintId = `${useId()}-hint`;

    const frameRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const dragRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        from: Offset;
    } | null>(null);

    const [url, setUrl] = useState<string | null>(null);
    const [natural, setNatural] = useState<Size | null>(null);
    const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });

    /**
     * Resolve `src` to a displayable URL.
     *
     * A `File`/`Blob` needs `createObjectURL`, and the URL must be revoked when the
     * source changes or the component unmounts — otherwise every re-pick of a photo
     * leaks the previous one for the lifetime of the document.
     */
    useEffect(() => {
        if (typeof src === "string") {
            setUrl(src);
            return;
        }
        const objectUrl = URL.createObjectURL(src);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [src]);

    // A new source invalidates the previous framing.
    useEffect(() => {
        setNatural(null);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    }, [url]);

    /** Track the frame's rendered size — the crop math is all relative to it. */
    useEffect(() => {
        const element = frameRef.current;
        if (!element) return;
        const measure = () =>
            setFrame({ width: element.clientWidth, height: element.clientHeight });
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const scale = natural ? coverScale(natural, frame) * zoom : 0;

    /**
     * On-screen image size.
     *
     * Memoized because the pan callback depends on it: a fresh object every render
     * would rebuild that callback every render, and the pointer handlers close over
     * it during a drag.
     */
    const displayed = useMemo<Size>(
        () =>
            natural
                ? { width: natural.width * scale, height: natural.height * scale }
                : { width: 0, height: 0 },
        [natural, scale],
    );

    /** Apply a pan, clamped so the frame stays covered. */
    const pan = useCallback(
        (next: Offset) => {
            setOffset((current) => {
                const clamped = clampOffset(next, displayed, frame);
                if (clamped.x === current.x && clamped.y === current.y) return current;
                onCropChange?.({ zoom, offset: clamped });
                return clamped;
            });
        },
        [displayed, frame, onCropChange, zoom],
    );

    /**
     * Apply a zoom, then re-clamp the offset.
     *
     * Re-clamping is not optional: zooming *out* shrinks the image, so an offset
     * that was legal a moment ago can now expose background.
     */
    const applyZoom = useCallback(
        (next: number) => {
            const clampedZoom = Math.min(maxZoom, Math.max(1, next));
            setZoom(clampedZoom);
            if (!natural) return;
            const nextScale = coverScale(natural, frame) * clampedZoom;
            const nextDisplayed = {
                width: natural.width * nextScale,
                height: natural.height * nextScale,
            };
            setOffset((current) => {
                const clamped = clampOffset(current, nextDisplayed, frame);
                onCropChange?.({ zoom: clampedZoom, offset: clamped });
                return clamped;
            });
        },
        [frame, maxZoom, natural, onCropChange],
    );

    const reset = useCallback(() => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        onCropChange?.({ zoom: 1, offset: { x: 0, y: 0 } });
    }, [onCropChange]);

    /**
     * Draw the current crop and encode it.
     *
     * Returns `null` rather than throwing on the paths a caller cannot do anything
     * about: no image yet, no 2D context, or an encoder that declined.
     */
    const crop = useCallback(async (): Promise<Blob | null> => {
        const image = imageRef.current;
        if (!image || !natural) return null;

        const rect = computeCropRect({ image: natural, frame, zoom, offset });
        if (rect.sWidth <= 0 || rect.sHeight <= 0) return null;

        const out = outputSize(rect, maxSize);
        const canvas = document.createElement("canvas");
        canvas.width = out.width;
        canvas.height = out.height;
        const context = canvas.getContext("2d");
        if (!context) return null;

        context.drawImage(
            image,
            rect.sx,
            rect.sy,
            rect.sWidth,
            rect.sHeight,
            0,
            0,
            out.width,
            out.height,
        );

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), outputType, outputQuality);
        });
    }, [frame, maxSize, natural, offset, outputQuality, outputType, zoom]);

    useImperativeHandle(ref, () => ({ crop, reset }), [crop, reset]);

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (!natural) return;
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            from: offset,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        pan({
            x: drag.from.x + (event.clientX - drag.startX),
            y: drag.from.y + (event.clientY - drag.startY),
        });
    };

    const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
        const moves: Record<string, Offset> = {
            ArrowLeft: { x: -step, y: 0 },
            ArrowRight: { x: step, y: 0 },
            ArrowUp: { x: 0, y: -step },
            ArrowDown: { x: 0, y: step },
        };
        const move = moves[event.key];
        if (move) {
            event.preventDefault();
            pan({ x: offset.x + move.x, y: offset.y + move.y });
            return;
        }
        if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            applyZoom(zoom + ZOOM_STEP);
        } else if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            applyZoom(zoom - ZOOM_STEP);
        } else if (event.key === "0") {
            event.preventDefault();
            reset();
        }
    };

    return (
        <div className={cn(styles.wrapper, className)} {...rest}>
            <div
                ref={frameRef}
                className={cn(styles.frame, shape === "circle" && styles.circle)}
                style={{ aspectRatio: String(aspect) }}
                role="group"
                aria-label={label}
                aria-describedby={hintId}
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
                onWheel={(event) => {
                    event.preventDefault();
                    applyZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
                }}
            >
                {url && (
                    <img
                        ref={imageRef}
                        src={url}
                        alt=""
                        draggable={false}
                        className={styles.image}
                        style={{
                            width: displayed.width || undefined,
                            height: displayed.height || undefined,
                            transform: `translate(${offset.x}px, ${offset.y}px)`,
                        }}
                        onLoad={(event) => {
                            const element = event.currentTarget;
                            // A decode can succeed and still report no intrinsic size —
                            // an SVG without a viewBox is the common case. Accepting
                            // that would enable the controls over an image the crop
                            // maths can do nothing with.
                            if (element.naturalWidth > 0 && element.naturalHeight > 0) {
                                setNatural({
                                    width: element.naturalWidth,
                                    height: element.naturalHeight,
                                });
                            }
                        }}
                    />
                )}
            </div>

            <div className={styles.controls}>
                <input
                    type="range"
                    className={styles.zoom}
                    min={1}
                    max={maxZoom}
                    step={0.01}
                    value={zoom}
                    onChange={(event) => applyZoom(Number(event.target.value))}
                    aria-label="Zoom"
                    disabled={!natural}
                />
                <button type="button" className={styles.reset} onClick={reset} disabled={!natural}>
                    Centralizar
                </button>
            </div>

            <p id={hintId} className={styles.hint}>
                Arraste para reposicionar. Setas movem, <kbd>+</kbd> e <kbd>−</kbd> dão zoom,{" "}
                <kbd>0</kbd> centraliza.
            </p>
        </div>
    );
}
