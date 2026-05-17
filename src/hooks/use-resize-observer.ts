import { useEffect, useState } from "react";
import type { RefObject } from "react";

export interface ElementSize {
    width: number;
    height: number;
}

/**
 * Track size changes of a DOM element via `ResizeObserver`.
 * Returns `null` until the first measurement.
 */
export function useResizeObserver(ref: RefObject<Element | null>): ElementSize | null {
    const [size, setSize] = useState<ElementSize | null>(null);

    useEffect(() => {
        const target = ref.current;
        if (!target || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const box = entry.contentRect;
            setSize({ width: box.width, height: box.height });
        });

        observer.observe(target);
        return () => observer.disconnect();
    }, [ref]);

    return size;
}
