import { useCallback, useRef } from "react";

/**
 * Returns a stable function reference that always invokes the latest
 * `callback` argument. Use to break dependency cycles in effects without
 * triggering re-runs when the callback identity changes.
 */
export function useStableCallback<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
    const ref = useRef(callback);
    ref.current = callback;
    return useCallback((...args: TArgs) => ref.current(...args), []);
}
