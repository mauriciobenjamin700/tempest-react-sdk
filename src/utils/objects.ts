/**
 * Determine whether a value is a plain object literal.
 *
 * Returns `false` for arrays, `null`, dates, maps, sets, and class instances.
 *
 * @internal
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Create a new object containing only the given `keys` from `obj`.
 *
 * Missing keys are skipped. The input is never mutated.
 *
 * @example
 * pick({ id: 1, name: "Ana", age: 30 }, ["id", "name"]);
 * // { id: 1, name: "Ana" }
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Create a new object with the given `keys` removed from `obj`.
 *
 * The input is never mutated.
 *
 * @example
 * omit({ id: 1, name: "Ana", age: 30 }, ["age"]);
 * // { id: 1, name: "Ana" }
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const exclude = new Set<PropertyKey>(keys);
    const result = {} as Record<PropertyKey, unknown>;
    for (const key of Object.keys(obj) as (keyof T)[]) {
        if (!exclude.has(key)) {
            result[key] = obj[key];
        }
    }
    return result as Omit<T, K>;
}

/**
 * Recursively merge `source` into `target`, returning a new object.
 *
 * - Plain objects are merged key by key, recursing into nested plain objects.
 * - Arrays and non-plain values (dates, class instances, primitives) replace
 *   the target value entirely — they are not merged element by element.
 * - Neither `target` nor `source` is mutated.
 *
 * @example
 * deepMerge(
 *   { a: 1, nested: { x: 1, y: 2 } },
 *   { nested: { y: 20, z: 30 } },
 * );
 * // { a: 1, nested: { x: 1, y: 20, z: 30 } }
 *
 * @example
 * deepMerge({ tags: ["a", "b"] }, { tags: ["c"] });
 * // { tags: ["c"] } (arrays replaced, not merged)
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
    if (!isPlainRecord(target) || !isPlainRecord(source)) {
        return (source === undefined ? target : (source as unknown as T)) as T;
    }
    const result: Record<string, unknown> = { ...target };
    for (const key of Object.keys(source)) {
        const sourceValue = (source as Record<string, unknown>)[key];
        const targetValue = result[key];
        if (isPlainRecord(targetValue) && isPlainRecord(sourceValue)) {
            result[key] = deepMerge(targetValue, sourceValue);
        } else {
            result[key] = sourceValue;
        }
    }
    return result as T;
}

/**
 * Check whether a value is considered "empty".
 *
 * Returns `true` for `null`, `undefined`, empty strings, empty arrays, empty
 * plain objects, and empty `Map`/`Set` instances. Returns `false` for numbers
 * (including `0` and `NaN`), booleans, and dates, which are never empty.
 *
 * @example
 * isEmpty(null);       // true
 * isEmpty("");         // true
 * isEmpty([]);         // true
 * isEmpty({});         // true
 * isEmpty(new Map());  // true
 * isEmpty(0);          // false
 * isEmpty(false);      // false
 * isEmpty(new Date()); // false
 */
export function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (value instanceof Map || value instanceof Set) return value.size === 0;
    if (isPlainRecord(value)) return Object.keys(value).length === 0;
    return false;
}
