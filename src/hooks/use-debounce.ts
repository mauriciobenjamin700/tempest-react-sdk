import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value. Returns the latest value once `delay` ms
 * have elapsed without further changes.
 *
 * @param value - The value to debounce.
 * @param delay - Delay in milliseconds (default 300).
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}
