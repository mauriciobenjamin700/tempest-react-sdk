import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render on match changes.
 *
 * @param query - A standard CSS media query string, e.g. "(max-width: 768px)".
 * @returns True when the query matches.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const list = window.matchMedia(query);
        const handler = (event: MediaQueryListEvent): void => setMatches(event.matches);
        setMatches(list.matches);
        list.addEventListener("change", handler);
        return () => list.removeEventListener("change", handler);
    }, [query]);

    return matches;
}
