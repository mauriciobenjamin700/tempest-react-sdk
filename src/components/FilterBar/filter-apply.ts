// The other half of the filter model: evaluating a `Filter[]` instead of only
// describing it. `FilterBar` produces filters, `applyFilters` runs them over an
// in-memory list, and `filtersToQueryParams` (filter-query.ts) hands the same set
// to a paginated backend. Without these two the model stops one step short of
// useful and every app writes the eleven operator branches again.

import type { Filter, FilterOperator } from "./filter-model";
import { isComplete, isValueless } from "./filter-model";

/** Matches a plain `yyyy-mm-dd`, the shape `<input type="date">` produces. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read a property off a row without asserting the row's shape.
 *
 * `Filter.field` is a string chosen by the app's field list, so it cannot be a
 * `keyof T`; the lookup goes through an index signature and a missing property
 * yields `undefined`, which the operators treat as an empty value.
 *
 * @param item - The row being tested.
 * @param field - Property name from the filter.
 * @returns The property value, or `undefined` when the row has no such key.
 */
function readField(item: unknown, field: string): unknown {
    if (item == null || typeof item !== "object") return undefined;
    return (item as Record<string, unknown>)[field];
}

/**
 * Local `yyyy-mm-dd` for a value that represents a date, or `null`.
 *
 * Built from the local calendar parts rather than `toISOString`, which converts
 * to UTC first and therefore reports the next day for anything after 21:00 in
 * UTC-3. A `yyyy-mm-dd` string is returned untouched, so a filter value and a
 * row value that already agree never round-trip through `Date` at all.
 *
 * @param value - A `Date`, a date-ish string, or anything else.
 * @returns The day key, or `null` when the value does not denote a date.
 */
function dayKey(value: unknown): string | null {
    if (typeof value === "string" && DATE_ONLY.test(value)) return value;

    const date =
        value instanceof Date
            ? value
            : typeof value === "string" && value.trim() !== ""
              ? new Date(value)
              : null;
    if (date === null || Number.isNaN(date.getTime())) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Compare a row value against a filter value, in the row value's own type.
 *
 * The filter always carries strings — it comes from form inputs and from the
 * URL — while the row carries whatever the API returned. Comparing them as text
 * gets the two common cases wrong: `10` would sort before `9`, and a date would
 * be compared by however it happens to be formatted. So the row value picks the
 * comparison, and the filter value is coerced into it.
 *
 * Dates compare by **day**, not by instant: a row stamped `2026-03-05T13:00:00Z`
 * is `>= 2026-03-05`, which is what the person picking a date in the UI means.
 *
 * @param left - The row value.
 * @param right - The raw filter value.
 * @returns Negative, zero or positive, or `null` when the two cannot be compared.
 */
function compare(left: unknown, right: string): number | null {
    if (left == null) return null;

    if (typeof left === "number") {
        const parsed = Number(right);
        return Number.isNaN(parsed) ? null : left - parsed;
    }

    if (typeof left === "boolean") {
        const parsed = right === "true" ? true : right === "false" ? false : null;
        return parsed === null ? null : Number(left) - Number(parsed);
    }

    if (DATE_ONLY.test(right)) {
        const key = dayKey(left);
        return key === null ? null : key.localeCompare(right);
    }

    return String(left).localeCompare(right, undefined, { numeric: true });
}

/**
 * Equality in the row value's type, falling back to exact text.
 *
 * Case-sensitive on purpose: `eq` maps to a plain `WHERE column = value` on the
 * server side, so a case-insensitive client would quietly disagree with the
 * backend for the same filter. `contains` is the case-insensitive operator, and
 * it is also the default one for text fields, so the friendly behaviour is what
 * people get without asking.
 *
 * @param left - The row value.
 * @param right - The raw filter value.
 * @returns Whether the two are equal.
 */
function equals(left: unknown, right: string): boolean {
    const result = compare(left, right);
    if (result !== null) return result === 0;
    return String(left ?? "") === right;
}

/**
 * Is this row value empty?
 *
 * Empty means absent, blank text or an empty list — never falsy. `0` and `false`
 * are values somebody chose, and a filter that hid them would be reporting the
 * wrong count on every dashboard that tracks zeroes.
 *
 * @param value - The row value.
 * @returns Whether the value counts as empty.
 */
function isEmptyValue(value: unknown): boolean {
    if (value == null) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/**
 * The filter's value as a list, whatever arity the operator uses.
 *
 * @param filter - The filter to read.
 * @returns Its values, trimmed of nothing — a leading space may be meaningful text.
 */
function valuesOf(filter: Filter): string[] {
    if (filter.value === undefined) return [];
    return Array.isArray(filter.value) ? [...filter.value] : [String(filter.value)];
}

/**
 * Evaluate one operator against one row value.
 *
 * @param operator - The comparison to make.
 * @param left - The row value.
 * @param values - The filter values (one, two for `between`, many for `in`).
 * @returns Whether the row value satisfies the operator.
 */
function matchesOperator(operator: FilterOperator, left: unknown, values: string[]): boolean {
    switch (operator) {
        case "empty":
            return isEmptyValue(left);
        case "notEmpty":
            return !isEmptyValue(left);
        case "eq":
            return equals(left, values[0] ?? "");
        case "ne":
            return !equals(left, values[0] ?? "");
        case "contains":
            return String(left ?? "")
                .toLowerCase()
                .includes((values[0] ?? "").toLowerCase());
        case "in":
            return values.some((value) => equals(left, value));
        case "between": {
            const [first = "", second = ""] = values;
            const low = compare(left, first);
            const high = compare(left, second);
            if (low === null || high === null) return false;
            return low >= 0 && high <= 0;
        }
        default: {
            const result = compare(left, values[0] ?? "");
            if (result === null) return false;
            if (operator === "gt") return result > 0;
            if (operator === "gte") return result >= 0;
            if (operator === "lt") return result < 0;
            return result <= 0;
        }
    }
}

/**
 * Order the two values of a `between` so the range is never empty by accident.
 *
 * A person who picks the later date first means the range between the two dates,
 * not "no rows". The server-side `BETWEEN` needs `(lo, hi)` in order too, which
 * is why the normalisation lives here and is shared by `filtersToQueryParams`.
 *
 * @param values - The raw pair.
 * @returns The pair, ascending.
 */
export function orderRange(values: readonly string[]): string[] {
    const [first = "", second = ""] = values;
    if (DATE_ONLY.test(first) && DATE_ONLY.test(second)) {
        return first <= second ? [first, second] : [second, first];
    }
    const low = Number(first);
    const high = Number(second);
    if (!Number.isNaN(low) && !Number.isNaN(high)) {
        return low <= high ? [first, second] : [second, first];
    }
    return first.localeCompare(second, undefined, { numeric: true }) <= 0
        ? [first, second]
        : [second, first];
}

/**
 * Run a filter set over an in-memory list.
 *
 * Closes the loop `FilterBar` opens: the bar produces `Filter[]`, this applies
 * them. Filters combine with `AND`, matching the flat model the bar builds, and
 * an incomplete filter is skipped rather than treated as a match of nothing — a
 * half-filled form should not empty the table underneath it.
 *
 * Comparison follows the row's type, not the filter's: numbers compare
 * numerically, dates compare by day, and everything else compares as text with
 * `numeric: true` so `"item 2"` lands before `"item 10"`.
 *
 * A few behaviours differ from the SQL the server-side twin produces, and the
 * difference is deliberate rather than accidental:
 *
 * - `ne` matches rows whose value is absent. In SQL, `column <> 'x'` is `NULL`
 *   for a `NULL` column and the row drops out. Here "is not paid" shows the rows
 *   with no status at all, which is what the chip claims.
 * - `empty` matches `NULL`, blank text and empty lists; `__isnull` on the server
 *   only matches `NULL`. A column that stores `""` instead of `NULL` is where
 *   the two disagree.
 *
 * @example
 * const visible = applyFilters(orders, filters);
 *
 * @param items - The full list.
 * @param filters - Applied filters; incomplete ones are ignored.
 * @returns A new array with the rows that satisfy every complete filter.
 */
export function applyFilters<T>(items: readonly T[], filters: readonly Filter[]): T[] {
    const active = filters.filter(isComplete);
    if (active.length === 0) return [...items];

    return items.filter((item) =>
        active.every((filter) => {
            const left = readField(item, filter.field);
            if (isValueless(filter.operator)) {
                return matchesOperator(filter.operator, left, []);
            }
            const values =
                filter.operator === "between" ? orderRange(valuesOf(filter)) : valuesOf(filter);
            return matchesOperator(filter.operator, left, values);
        }),
    );
}
