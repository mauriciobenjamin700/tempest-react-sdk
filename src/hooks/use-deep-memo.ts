/* eslint-disable react-hooks/refs -- the structural cache is read and written during render by design (see the docstring) */
import { useRef } from "react";

/**
 * View any binary value as its bytes, so a buffer, a typed array and a `DataView`
 * compare by content.
 *
 * @param value - An `ArrayBuffer` or an `ArrayBuffer` view.
 * @returns The bytes the value covers.
 */
function bytesOf(value: ArrayBuffer | ArrayBufferView): Uint8Array {
    return value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/**
 * Structural equality, the comparison `useDeepMemo` and `useDraftFilters` share.
 * Internal: not re-exported from the barrel.
 *
 * Comparing `Object.keys` alone is wrong for every object whose state lives in
 * internal slots: `Object.keys(new Set(["a"]))` is `[]`, so a keys-only version
 * treated two different `Set`s, `Map`s, `Date`s or `URL`s as equal — a multi-select
 * filter kept in a `Set` was never dirty and `apply()` never published it. So:
 *
 * - Values with different prototypes are never equal (`new Set()` is not `{}`,
 *   `Uint8Array` is not `Int8Array`).
 * - `Set`: same size, and every member of one is in the other by SameValueZero
 *   (`Set.prototype.has`) — object members compare by reference.
 * - `Map`: same size, every key present by SameValueZero, values compared
 *   structurally.
 * - `Date` by instant (`getTime`, so two invalid dates are equal), `RegExp` by
 *   `source` and `flags`, `ArrayBuffer` and its views byte by byte.
 * - Any other non-plain instance with no own enumerable keys (`URL`, `Blob`,
 *   `File`, `Error`, `Promise`) has nothing visible to compare, so it is equal
 *   only to itself. Instances that do carry own fields keep the structural
 *   comparison, as do arrays and plain objects.
 * - Objects compare by key **set**, not key count: with the counts equal, every
 *   own enumerable key of one must be an own key of the other. Counting alone
 *   made `{ a: undefined }` equal to `{ b: undefined }`, since a missing key reads
 *   as `undefined` too — a renamed filter left `useDraftFilters` clean. The check
 *   is `Object.hasOwn`, one lookup per key; `propertyIsEnumerable` would also
 *   catch a non-enumerable own key of the same name, but measured ~40% slower
 *   (#645), for a shape a plain value object never has.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns Whether both values have the same shape and leaves.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    const prototype: unknown = Object.getPrototypeOf(a);
    if (prototype !== Object.getPrototypeOf(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((value, index) => deepEqual(value, b[index]));
    }
    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false;
        for (const member of a) if (!b.has(member)) return false;
        return true;
    }
    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false;
        for (const [key, value] of a)
            if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
        return true;
    }
    if (a instanceof Date && b instanceof Date) return Object.is(a.getTime(), b.getTime());
    if (a instanceof RegExp && b instanceof RegExp)
        return a.source === b.source && a.flags === b.flags;
    if (
        (a instanceof ArrayBuffer || ArrayBuffer.isView(a)) &&
        (b instanceof ArrayBuffer || ArrayBuffer.isView(b))
    ) {
        const aBytes = bytesOf(a);
        const bBytes = bytesOf(b);
        if (aBytes.length !== bBytes.length) return false;
        return aBytes.every((byte, index) => byte === bBytes[index]);
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    if (aKeys.length === 0 && prototype !== Object.prototype && prototype !== null) return false;
    return aKeys.every(
        (key) =>
            Object.hasOwn(b, key) &&
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
