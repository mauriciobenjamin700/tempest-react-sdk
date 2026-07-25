/* eslint-disable react-hooks/refs -- the structural cache is read and written during render by design (see the docstring) */
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
 *
 * The cache is a ref read and written during render. That is flagged by the React
 * Compiler rules and is nonetheless correct here: the write is idempotent — a
 * discarded render either wrote a structurally equal value or nothing at all — so
 * replaying the render cannot change the result.
 */
export function useDeepMemo<T>(value: T): T {
    const ref = useRef<T>(value);
    if (!deepEqual(ref.current, value)) {
        ref.current = value;
    }
    return ref.current;
}
