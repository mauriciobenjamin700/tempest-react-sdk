import { useCallback } from "react";
import { useLatestRef } from "./use-latest-ref";

/**
 * Returns a stable function reference that always invokes the latest
 * `callback` argument. Use to break dependency cycles in effects without
 * triggering re-runs when the callback identity changes.
 *
 * Built on {@link useLatestRef}, which owns the render-time assignment and the
 * reason it is not an effect: an effect would satisfy the React Compiler rules
 * but open a one-commit staleness window. What this adds is the callable with a
 * stable identity, so callers do not reach through `.current`. Prefer React's
 * `useEffectEvent` once it ships as stable.
 *
 * The ref is listed as a dependency because it is one — a stable object across
 * renders, so the returned identity never changes. Listing it is what lets the
 * exhaustive-deps rule verify that instead of taking an empty array on trust.
 */
export function useStableCallback<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
    const ref = useLatestRef(callback);
    return useCallback((...args: TArgs) => ref.current(...args), [ref]);
}
