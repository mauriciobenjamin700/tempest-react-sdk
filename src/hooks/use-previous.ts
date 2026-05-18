import { useEffect, useRef } from "react";

/**
 * Return the value from the previous render. `undefined` on the first render.
 *
 * @example
 * const previousCount = usePrevious(count);
 * useEffect(() => {
 *     if (previousCount !== undefined && previousCount !== count) {
 *         analytics.track("count.changed", { from: previousCount, to: count });
 *     }
 * }, [count, previousCount]);
 */
export function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    }, [value]);
    return ref.current;
}
