import type { ReactNode } from "react";
import { useBreakpoint, type Breakpoint } from "@/hooks/use-breakpoint";

export interface ShowProps {
    /** Render children only when viewport width is `>=` this breakpoint. */
    above?: Breakpoint;
    /** Render children only when viewport width is `<` this breakpoint. */
    below?: Breakpoint;
    /** Render only on specific breakpoints. Wins over `above`/`below` when set. */
    only?: Breakpoint | Breakpoint[];
    children: ReactNode;
}

function shouldRender(
    current: Breakpoint,
    above: Breakpoint | undefined,
    below: Breakpoint | undefined,
    only: Breakpoint | Breakpoint[] | undefined,
    helpers: { above: (bp: Breakpoint) => boolean; below: (bp: Breakpoint) => boolean },
): boolean {
    if (only) {
        const list = Array.isArray(only) ? only : [only];
        return list.includes(current);
    }
    if (above && !helpers.above(above)) return false;
    if (below && !helpers.below(below)) return false;
    return true;
}

/**
 * Conditionally render children based on the viewport breakpoint.
 *
 * - `above` — render when viewport width is `>=` the given breakpoint.
 * - `below` — render when viewport width is `<` the given breakpoint.
 * - `only` — render only on the listed breakpoint(s).
 *
 * SSR-safe: first render uses `xs` (renders mobile content first); the
 * component re-renders once `useBreakpoint` has the real viewport width.
 */
export function Show({ above, below, only, children }: ShowProps): ReactNode {
    const bp = useBreakpoint();
    if (!shouldRender(bp.current, above, below, only, bp)) return null;
    return children;
}

export interface HideProps {
    /** Hide children when viewport width is `>=` this breakpoint. */
    above?: Breakpoint;
    /** Hide children when viewport width is `<` this breakpoint. */
    below?: Breakpoint;
    /** Hide on specific breakpoints. */
    only?: Breakpoint | Breakpoint[];
    children: ReactNode;
}

/** Inverse of `<Show>` — hides children when the condition matches. */
export function Hide({ above, below, only, children }: HideProps): ReactNode {
    const bp = useBreakpoint();
    if (shouldRender(bp.current, above, below, only, bp)) return null;
    return children;
}
