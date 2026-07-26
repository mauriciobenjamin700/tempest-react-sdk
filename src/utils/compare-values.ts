/**
 * Compare two arbitrary cell values with stable, type-aware ordering.
 *
 * The comparator every table in the SDK sorts with, so `DataTable` and
 * `VirtualTable` agree on what "sorted" means. The type-aware branches exist
 * because the naive `String(a) < String(b)` gets the two most common cases wrong:
 * numbers would sort `10` before `9`, and dates would sort by their formatted
 * text. Strings fall back to `localeCompare` with `numeric: true`, so `"item 2"`
 * lands before `"item 10"`.
 *
 * `null` and `undefined` sort first, together — a missing value is not smaller
 * than another missing value.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns Negative when `a < b`, positive when `a > b`, zero when equal.
 */
export function compareValues(a: unknown, b: unknown): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}
