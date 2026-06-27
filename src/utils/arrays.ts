/**
 * Group items of a list into buckets keyed by the result of `key`.
 *
 * Items preserve their original order within each bucket.
 *
 * @example
 * groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? "even" : "odd"));
 * // { odd: [1, 3], even: [2, 4] }
 *
 * @example
 * groupBy([{ city: "SP" }, { city: "RJ" }, { city: "SP" }], (u) => u.city);
 * // { SP: [{ city: "SP" }, { city: "SP" }], RJ: [{ city: "RJ" }] }
 */
export function groupBy<T, K extends PropertyKey>(items: T[], key: (item: T) => K): Record<K, T[]> {
    const result = {} as Record<K, T[]>;
    for (const item of items) {
        const k = key(item);
        (result[k] ??= []).push(item);
    }
    return result;
}

/**
 * Remove duplicate items, keeping the first occurrence of each distinct key.
 *
 * Equality is determined by the value returned from `key` (compared with `===`).
 *
 * @example
 * uniqueBy([1, 2, 2, 3, 1], (n) => n); // [1, 2, 3]
 *
 * @example
 * uniqueBy(
 *   [{ id: 1, v: "a" }, { id: 1, v: "b" }, { id: 2, v: "c" }],
 *   (u) => u.id,
 * );
 * // [{ id: 1, v: "a" }, { id: 2, v: "c" }]
 */
export function uniqueBy<T>(items: T[], key: (item: T) => unknown): T[] {
    const seen = new Set<unknown>();
    const result: T[] = [];
    for (const item of items) {
        const k = key(item);
        if (!seen.has(k)) {
            seen.add(k);
            result.push(item);
        }
    }
    return result;
}

/**
 * Split a list into consecutive chunks of at most `size` items.
 *
 * The final chunk may be smaller than `size`. An empty input yields `[]`.
 *
 * @param items - The list to split.
 * @param size - Maximum chunk length; must be `>= 1`.
 * @throws {RangeError} When `size` is less than `1`.
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
 *
 * @example
 * chunk([], 3); // []
 */
export function chunk<T>(items: T[], size: number): T[][] {
    if (size < 1) {
        throw new RangeError(`chunk size must be >= 1, received ${size}`);
    }
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
}

/**
 * Build a numeric range from `start` (inclusive) to `end` (exclusive).
 *
 * - `step` defaults to `1` and may be negative for descending ranges.
 * - Returns an empty array when no progress can be made toward `end`
 *   (wrong-direction step, zero step, or `start === end`).
 *
 * @param start - First value of the range.
 * @param end - Exclusive upper (or lower, for negative step) bound.
 * @param step - Increment between values; defaults to `1`.
 *
 * @example
 * range(0, 5);        // [0, 1, 2, 3, 4]
 * range(0, 10, 2);    // [0, 2, 4, 6, 8]
 * range(5, 0, -1);    // [5, 4, 3, 2, 1]
 * range(0, 5, -1);    // [] (wrong direction)
 * range(3, 3);        // []
 */
export function range(start: number, end: number, step: number = 1): number[] {
    const result: number[] = [];
    if (step === 0) return result;
    if (step > 0) {
        for (let i = start; i < end; i += step) result.push(i);
    } else {
        for (let i = start; i > end; i += step) result.push(i);
    }
    return result;
}
