import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Call `handler` when a `mousedown` / `touchstart` occurs outside the returned
 * ref's element. SSR-safe — listeners are only attached in the browser.
 *
 * @typeParam T - element type to attach the ref to.
 * @param handler - invoked on an outside interaction.
 * @returns A ref to attach to the element treated as "inside".
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
    handler: () => void,
): RefObject<T | null> {
    const ref = useRef<T>(null);
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (typeof document === "undefined") return;

        const listener = (event: MouseEvent | TouchEvent): void => {
            const target = event.target as Node | null;
            if (!ref.current || (target && ref.current.contains(target))) return;
            handlerRef.current();
        };

        document.addEventListener("mousedown", listener);
        document.addEventListener("touchstart", listener);
        return () => {
            document.removeEventListener("mousedown", listener);
            document.removeEventListener("touchstart", listener);
        };
    }, []);

    return ref;
}
