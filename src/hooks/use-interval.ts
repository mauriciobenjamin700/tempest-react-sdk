import { useEffect, useRef } from "react";

/**
 * Reactive `setInterval`. Pass `null` as `delay` to pause. `fn` is stored in
 * a ref so inline callbacks don't reset the interval on every render.
 *
 * @example
 * useInterval(() => poll(), enabled ? 5000 : null);
 */
export function useInterval(fn: () => void, delay: number | null): void {
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
        if (delay === null) return;
        const id = setInterval(() => fnRef.current(), delay);
        return () => clearInterval(id);
    }, [delay]);
}
