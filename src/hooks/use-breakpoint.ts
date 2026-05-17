import { useEffect, useState } from "react";

/**
 * Breakpoint keys exposed by the SDK. Values mirror the CSS tokens
 * `--tempest-bp-xs|sm|md|lg|xl|2xl` defined in `styles/colors.css`.
 */
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/** Pixel value paired with each breakpoint key. */
export const BREAKPOINTS: Record<Breakpoint, number> = {
    xs: 480,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    "2xl": 1536,
};

const ORDER: readonly Breakpoint[] = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;

function resolveCurrent(width: number): Breakpoint {
    let current: Breakpoint = "xs";
    for (const key of ORDER) {
        if (width >= BREAKPOINTS[key]) {
            current = key;
        }
    }
    return current;
}

export interface BreakpointHelpers {
    /** Current breakpoint key (the largest one whose min-width is matched). */
    current: Breakpoint;
    /** Window width in pixels at last update. `0` when SSR. */
    width: number;
    /** True when viewport width is `>=` the given breakpoint. */
    above: (bp: Breakpoint) => boolean;
    /** True when viewport width is `<` the given breakpoint. */
    below: (bp: Breakpoint) => boolean;
    /** Convenience flags mapping to typical device shapes. */
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
}

/**
 * Reactive viewport-breakpoint hook.
 *
 * Returns the current breakpoint key plus `above` / `below` helpers and
 * `isMobile` / `isTablet` / `isDesktop` flags. SSR-safe — returns `xs` /
 * `width: 0` on the server, then updates after mount.
 */
export function useBreakpoint(): BreakpointHelpers {
    const [width, setWidth] = useState<number>(() =>
        typeof window === "undefined" ? 0 : window.innerWidth,
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onResize = (): void => setWidth(window.innerWidth);
        onResize();
        window.addEventListener("resize", onResize, { passive: true });
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const current = resolveCurrent(width);
    const above = (bp: Breakpoint): boolean => width >= BREAKPOINTS[bp];
    const below = (bp: Breakpoint): boolean => width < BREAKPOINTS[bp];

    return {
        current,
        width,
        above,
        below,
        isMobile: below("md"),
        isTablet: above("md") && below("lg"),
        isDesktop: above("lg"),
    };
}
