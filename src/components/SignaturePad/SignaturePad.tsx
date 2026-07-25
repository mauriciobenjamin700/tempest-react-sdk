import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/utils/cn";
import { Button } from "../Button";
import styles from "./SignaturePad.module.css";

/** A single sampled point of a stroke, in CSS pixels relative to the canvas. */
interface Point {
    x: number;
    y: number;
}

/** Imperative handle exposed through `ref`. */
export interface SignaturePadHandle {
    /** Drop every stroke. */
    clear: () => void;
    /** Drop the last stroke. */
    undo: () => void;
    /** `true` while nothing has been drawn. */
    isEmpty: () => boolean;
    /** Export as a data URL. Returns `""` when the canvas is unavailable. */
    toDataURL: (type?: string, quality?: number) => string;
    /** Export as a `Blob` — what you actually upload. `null` when unavailable. */
    toBlob: (type?: string, quality?: number) => Promise<Blob | null>;
}

export interface SignaturePadProps {
    /** Drawing surface width in CSS pixels. Default `400`. */
    width?: number;
    /** Drawing surface height in CSS pixels. Default `160`. */
    height?: number;
    /**
     * Stroke color. Defaults to the canvas' computed `color`, which the
     * stylesheet binds to `--tempest-text` — so the signature follows the theme
     * (including dark mode) instead of being hardcoded black.
     */
    penColor?: string;
    /** Stroke width in CSS pixels. Default `2`. */
    penWidth?: number;
    /** Blocks drawing and dims the surface. */
    disabled?: boolean;
    /** Accessible name of the surface. Default `"Signature"`. */
    label?: string;
    /** Called on the first move of each stroke. */
    onBegin?: () => void;
    /** Called when a stroke ends, with the current image as a data URL. */
    onEnd?: (dataUrl: string) => void;
    /** Called whenever the emptiness changes — wire it to a submit button. */
    onEmptyChange?: (isEmpty: boolean) => void;
    /** Renders the Clear/Undo buttons. Default `true`. */
    showActions?: boolean;
    clearLabel?: string;
    undoLabel?: string;
    className?: string;
}

/**
 * Signature capture on a canvas — the "sign here" field of a delivery receipt,
 * a service order, a term of acceptance.
 *
 * Strokes are kept as point lists and the canvas is **redrawn** from them, which
 * is what makes `undo` possible at all: a canvas holds pixels, not history, so
 * removing the last stroke means replaying the rest.
 *
 * The backing store is scaled by `devicePixelRatio`, so the line is crisp on a
 * phone instead of the blurry 1x bitmap a naive canvas produces.
 *
 * @example
 * ```tsx
 * const pad = useRef<SignaturePadHandle>(null);
 * const [empty, setEmpty] = useState(true);
 *
 * async function submit() {
 *   const blob = await pad.current?.toBlob("image/png");
 *   if (blob) await api.upload("/receipts/42/signature", blob);
 * }
 *
 * <SignaturePad ref={pad} label="Assinatura do cliente" onEmptyChange={setEmpty} />
 * <Button disabled={empty} onClick={submit}>Enviar</Button>
 * ```
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
    {
        width = 400,
        height = 160,
        penColor,
        penWidth = 2,
        disabled = false,
        label = "Signature",
        onBegin,
        onEnd,
        onEmptyChange,
        showActions = true,
        clearLabel = "Clear",
        undoLabel = "Undo",
        className,
    },
    ref,
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokesRef = useRef<Point[][]>([]);
    const drawingRef = useRef(false);
    const [isEmpty, setIsEmpty] = useState(true);

    const resolvePenColor = useCallback((): string => {
        if (penColor) return penColor;
        const canvas = canvasRef.current;
        if (!canvas || typeof window === "undefined") return "#101828";
        return window.getComputedStyle(canvas).color || "#101828";
    }, [penColor]);

    /**
     * Repaint the whole surface from the stroke list, honouring the pixel ratio.
     *
     * A one-point stroke (a tap) gets a line back to its own origin: `stroke()`
     * over a path with a single point paints nothing, so without it a tap would
     * silently produce no dot while still counting as "not empty".
     */
    const redraw = useCallback((): void => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);

        context.lineWidth = penWidth;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = resolvePenColor();

        for (const stroke of strokesRef.current) {
            if (stroke.length === 0) continue;
            context.beginPath();
            context.moveTo(stroke[0].x, stroke[0].y);
            for (const point of stroke.slice(1)) {
                context.lineTo(point.x, point.y);
            }
            if (stroke.length === 1) context.lineTo(stroke[0].x, stroke[0].y);
            context.stroke();
        }
    }, [height, penWidth, resolvePenColor, width]);

    useEffect(() => {
        redraw();
    }, [redraw]);

    const setEmptiness = useCallback(
        (next: boolean): void => {
            setIsEmpty((current) => {
                if (current !== next) onEmptyChange?.(next);
                return next;
            });
        },
        [onEmptyChange],
    );

    const pointFrom = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
        const rect = canvasRef.current?.getBoundingClientRect();
        return {
            x: event.clientX - (rect?.left ?? 0),
            y: event.clientY - (rect?.top ?? 0),
        };
    }, []);

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLCanvasElement>): void => {
            if (disabled) return;
            drawingRef.current = true;
            strokesRef.current = [...strokesRef.current, [pointFrom(event)]];
            canvasRef.current?.setPointerCapture?.(event.pointerId);
            onBegin?.();
            setEmptiness(false);
            redraw();
        },
        [disabled, onBegin, pointFrom, redraw, setEmptiness],
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLCanvasElement>): void => {
            if (!drawingRef.current || disabled) return;
            const strokes = strokesRef.current;
            strokes[strokes.length - 1].push(pointFrom(event));
            redraw();
        },
        [disabled, pointFrom, redraw],
    );

    const handlePointerUp = useCallback(
        (event: ReactPointerEvent<HTMLCanvasElement>): void => {
            if (!drawingRef.current) return;
            drawingRef.current = false;
            canvasRef.current?.releasePointerCapture?.(event.pointerId);
            onEnd?.(canvasRef.current?.toDataURL() ?? "");
        },
        [onEnd],
    );

    const clear = useCallback((): void => {
        strokesRef.current = [];
        setEmptiness(true);
        redraw();
    }, [redraw, setEmptiness]);

    const undo = useCallback((): void => {
        strokesRef.current = strokesRef.current.slice(0, -1);
        setEmptiness(strokesRef.current.length === 0);
        redraw();
    }, [redraw, setEmptiness]);

    useImperativeHandle(
        ref,
        () => ({
            clear,
            undo,
            isEmpty: () => strokesRef.current.length === 0,
            toDataURL: (type, quality) => canvasRef.current?.toDataURL(type, quality) ?? "",
            toBlob: (type, quality) =>
                new Promise((resolve) => {
                    const canvas = canvasRef.current;
                    if (!canvas?.toBlob) {
                        resolve(null);
                        return;
                    }
                    canvas.toBlob((blob) => resolve(blob), type, quality);
                }),
        }),
        [clear, undo],
    );

    return (
        <div className={cn(styles.pad, disabled && styles.disabled, className)}>
            <canvas
                ref={canvasRef}
                role="img"
                aria-label={label}
                aria-disabled={disabled || undefined}
                className={styles.canvas}
                style={{ width, height, touchAction: "none" }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            />
            {showActions ? (
                <div className={styles.actions}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={undo}
                        disabled={disabled || isEmpty}
                    >
                        {undoLabel}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clear}
                        disabled={disabled || isEmpty}
                    >
                        {clearLabel}
                    </Button>
                </div>
            ) : null}
        </div>
    );
});
