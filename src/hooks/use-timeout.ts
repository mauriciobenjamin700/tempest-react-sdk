import { useEffect, useRef } from "react";

/**
 * Run a callback after `delay` ms. Pass `null` to disable. Resets when
 * `delay` changes; the callback ref always points at the latest closure.
 *
 * @example
 * useTimeout(() => setShow(false), show ? 3000 : null);
 */
export function useTimeout(fn: () => void, delay: number | null): void {
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
        if (delay === null) return;
        const id = setTimeout(() => fnRef.current(), delay);
        return () => clearTimeout(id);
    }, [delay]);
}
