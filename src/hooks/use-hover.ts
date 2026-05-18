import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Track whether the pointer is hovering over the referenced element.
 * Returns `false` on touch-only devices (no pointer hover).
 *
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * const hovered = useHover(ref);
 * return <div ref={ref}>{hovered ? "✨" : ""}</div>;
 */
export function useHover<T extends HTMLElement>(ref: RefObject<T | null>): boolean {
    const [hovered, setHovered] = useState<boolean>(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const onEnter = (): void => setHovered(true);
        const onLeave = (): void => setHovered(false);
        node.addEventListener("mouseenter", onEnter);
        node.addEventListener("mouseleave", onLeave);
        return () => {
            node.removeEventListener("mouseenter", onEnter);
            node.removeEventListener("mouseleave", onLeave);
        };
    }, [ref]);

    return hovered;
}
