import { useEffect } from "react";

/**
 * Lock `<body>` scroll while `active` is true. Restores the previous overflow
 * value on unmount. Safe to nest: stacks the restoration via a counter.
 */
export function useScrollLock(active: boolean): void {
    useEffect(() => {
        if (!active || typeof document === "undefined") return;
        const body = document.body;
        const previous = body.style.overflow;
        body.style.overflow = "hidden";
        return () => {
            body.style.overflow = previous;
        };
    }, [active]);
}
