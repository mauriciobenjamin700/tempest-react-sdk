import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from "react";

/** Pan/zoom transform state. */
export interface MapTransform {
    /** Zoom factor (1 = fit). */
    k: number;
    /** X translation in pixels. */
    x: number;
    /** Y translation in pixels. */
    y: number;
}

const MIN_K = 1;
const MAX_K = 12;

export interface UseMapZoom {
    /** SVG `transform` string for the content `<g>`. */
    transform: string;
    /** Current zoom factor. */
    zoom: number;
    /** True when panned/zoomed away from the initial fit. */
    isTransformed: boolean;
    /** Reset to the initial fit. */
    reset: () => void;
    /** Handlers to spread on the `<svg>` element. */
    handlers: {
        onWheel?: (e: WheelEvent) => void;
        onPointerDown?: (e: PointerEvent) => void;
        onPointerMove?: (e: PointerEvent) => void;
        onPointerUp?: (e: PointerEvent) => void;
        onPointerLeave?: (e: PointerEvent) => void;
        onDoubleClick?: () => void;
        style?: { cursor: string; touchAction: string };
    };
}

/**
 * Wheel-zoom (anchored at the cursor) + drag-pan for an SVG map. Returns a
 * `transform` to apply to a content `<g>` and handlers for the `<svg>`. A no-op
 * (identity transform, empty handlers) when `enabled` is false.
 */
export function useMapZoom(enabled: boolean): UseMapZoom {
    const [t, setT] = useState<MapTransform>({ k: 1, x: 0, y: 0 });
    const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

    const reset = useCallback(() => setT({ k: 1, x: 0, y: 0 }), []);

    const onWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setT((prev) => {
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            const k = Math.max(MIN_K, Math.min(MAX_K, prev.k * factor));
            const scale = k / prev.k;
            return { k, x: cx - (cx - prev.x) * scale, y: cy - (cy - prev.y) * scale };
        });
    }, []);

    const onPointerDown = useCallback((e: PointerEvent) => {
        drag.current = { x: e.clientX, y: e.clientY, ox: 0, oy: 0 };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    }, []);

    const onPointerMove = useCallback((e: PointerEvent) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        drag.current.x = e.clientX;
        drag.current.y = e.clientY;
        setT((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    }, []);

    const endDrag = useCallback((e: PointerEvent) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
    }, []);

    if (!enabled) {
        return {
            transform: "",
            zoom: 1,
            isTransformed: false,
            reset,
            handlers: {},
        };
    }

    const isTransformed = t.k !== 1 || t.x !== 0 || t.y !== 0;
    return {
        transform: `translate(${t.x} ${t.y}) scale(${t.k})`,
        zoom: t.k,
        isTransformed,
        reset,
        handlers: {
            onWheel,
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerLeave: endDrag,
            onDoubleClick: reset,
            style: { cursor: isTransformed ? "grab" : "default", touchAction: "none" },
        },
    };
}
