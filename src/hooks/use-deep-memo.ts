import { useRef } from "react";

function deepEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((value, index) => deepEqual(value, b[index]));
    }
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
        deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
}

/**
 * Memoize a value with a structural equality check. Use when an object/array
 * created during render is fed to `useEffect` dependencies and you want to
 * avoid spurious effect runs when only the reference changes.
 */
export function useDeepMemo<T>(value: T): T {
    const ref = useRef<T>(value);
    if (!deepEqual(ref.current, value)) {
        ref.current = value;
    }
    return ref.current;
}
