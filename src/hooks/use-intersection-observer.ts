import { useEffect, useState } from "react";
import type { RefObject } from "react";

export interface UseIntersectionObserverOptions extends IntersectionObserverInit {
    /** Stop observing after the first intersection (one-shot). Default: false. */
    once?: boolean;
}

/**
 * Track whether the referenced element intersects the viewport. Useful for
 * lazy-loading images, "load more" sentinels, and animation triggers.
 *
 * @returns `IntersectionObserverEntry | null`. `null` until the first observation.
 */
export function useIntersectionObserver(
    ref: RefObject<Element | null>,
    options: UseIntersectionObserverOptions = {},
): IntersectionObserverEntry | null {
    const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
    const { once = false, root, rootMargin, threshold } = options;

    useEffect(() => {
        const target = ref.current;
        if (!target || typeof IntersectionObserver === "undefined") return;

        const observer = new IntersectionObserver(
            ([nextEntry]) => {
                if (!nextEntry) return;
                setEntry(nextEntry);
                if (once && nextEntry.isIntersecting) observer.unobserve(target);
            },
            { root, rootMargin, threshold },
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [ref, once, root, rootMargin, threshold]);

    return entry;
}
