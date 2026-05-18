import { useEffect, useRef, useState } from "react";

/**
 * Return a value that updates at most once every `delay` ms. Complements
 * `useDebounce` — throttle emits on the leading edge and again after the
 * interval; debounce only emits after a period of stillness.
 *
 * @example
 * const throttledScroll = useThrottle(scrollY, 100);
 */
export function useThrottle<T>(value: T, delay: number): T {
    const [throttled, setThrottled] = useState<T>(value);
    const lastEmitRef = useRef<number>(0);
    const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const now = Date.now();
        const elapsed = now - lastEmitRef.current;
        if (elapsed >= delay) {
            lastEmitRef.current = now;
            setThrottled(value);
        } else {
            if (pendingRef.current) clearTimeout(pendingRef.current);
            pendingRef.current = setTimeout(() => {
                lastEmitRef.current = Date.now();
                setThrottled(value);
            }, delay - elapsed);
        }
        return () => {
            if (pendingRef.current) clearTimeout(pendingRef.current);
        };
    }, [value, delay]);

    return throttled;
}
