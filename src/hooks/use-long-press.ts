import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export interface UseLongPressOptions {
    /** Press duration in ms. Default `500`. */
    delay?: number;
    /** Pixel threshold — finger/mouse movement beyond this cancels the press. Default `10`. */
    moveThreshold?: number;
}

/**
 * Detect long-press / long-tap gestures. Fires `fn` after `delay` ms
 * while the element is held. Cancels on move beyond `moveThreshold` or
 * pointer up before `delay`.
 *
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * useLongPress(ref, () => openContextMenu(), { delay: 600 });
 */
export function useLongPress<T extends HTMLElement>(
    ref: RefObject<T | null>,
    fn: () => void,
    options: UseLongPressOptions = {},
): void {
    const { delay = 500, moveThreshold = 10 } = options;
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let startX = 0;
        let startY = 0;

        const cancel = (): void => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        const onDown = (event: PointerEvent): void => {
            startX = event.clientX;
            startY = event.clientY;
            cancel();
            timer = setTimeout(() => {
                timer = null;
                fnRef.current();
            }, delay);
        };

        const onMove = (event: PointerEvent): void => {
            if (timer === null) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.hypot(dx, dy) > moveThreshold) cancel();
        };

        node.addEventListener("pointerdown", onDown);
        node.addEventListener("pointermove", onMove);
        node.addEventListener("pointerup", cancel);
        node.addEventListener("pointercancel", cancel);
        node.addEventListener("pointerleave", cancel);
        return () => {
            cancel();
            node.removeEventListener("pointerdown", onDown);
            node.removeEventListener("pointermove", onMove);
            node.removeEventListener("pointerup", cancel);
            node.removeEventListener("pointercancel", cancel);
            node.removeEventListener("pointerleave", cancel);
        };
    }, [ref, delay, moveThreshold]);
}
