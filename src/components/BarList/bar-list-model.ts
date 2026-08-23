// The arithmetic behind BarList, kept out of the component so the decisions that
// are easy to get wrong — an empty total, a negative value, what "100% wide"
// means — are testable without rendering anything.

import { percentOf } from "@/utils/numbers";

/** One entry of a {@link BarList}. */
export interface BarListItem {
    /** What the row is called. */
    label: string;
    /** The measured amount. */
    value: number;
    /** Override the bar colour. Defaults to the chart series token for its position. */
    color?: string;
}

/** How the list orders itself before drawing. */
export type BarListSort = "desc" | "asc" | "none";

/** One row, with everything the component needs to draw it. */
export interface BarListRow extends BarListItem {
    /** Share of the total, 0–100. */
    percentage: number;
    /** Bar width relative to the largest row, 0–100. */
    width: number;
    /** Position in the original palette cycle. */
    index: number;
}

/** What {@link buildBarListRows} needs to reduce a list into rows. */
export interface BuildBarListRowsOptions {
    /** The rows as given. */
    items: readonly BarListItem[];
    /** Ordering to apply. `"none"` keeps the caller's order. Default `"desc"`. */
    sort?: BarListSort;
    /** Keep at most this many rows. */
    max?: number;
    /** Aggregate what `max` cut into one row with this label. */
    otherLabel?: string;
}

/**
 * Order, truncate and measure the rows.
 *
 * Two different numbers come out of this, and conflating them is the classic bug
 * in a hand-written bar list:
 *
 * - `percentage` is the row's share of the **total**, which is what the label
 *   claims when it reads "32%".
 * - `width` is relative to the **largest** row, so the biggest bar fills the
 *   track. Scaling width by the total instead leaves every bar short in a list of
 *   many small values, and the chart stops being readable exactly when it has the
 *   most rows.
 *
 * The total counts positive values only. A negative amount draws no bar (a bar of
 * negative width does not exist) and reports 0%, but its number is still shown —
 * hiding the row would be worse than showing an odd one.
 *
 * @param options - The rows and how to reduce them.
 * @returns The rows to draw, in order.
 */
export function buildBarListRows(options: BuildBarListRowsOptions): BarListRow[] {
    const { items, sort = "desc", max, otherLabel } = options;
    const usable = items.filter((item) => Number.isFinite(item.value));
    const total = usable.reduce((sum, item) => sum + Math.max(item.value, 0), 0);

    const ordered =
        sort === "none"
            ? [...usable]
            : [...usable].sort((a, b) => (sort === "asc" ? a.value - b.value : b.value - a.value));

    const limit = max !== undefined && max > 0 ? max : ordered.length;
    const kept = ordered.slice(0, limit);
    const cut = otherLabel === undefined ? [] : ordered.slice(limit);

    const shown: BarListItem[] =
        otherLabel !== undefined && cut.length > 1
            ? [
                  ...kept,
                  { label: otherLabel, value: cut.reduce((sum, item) => sum + item.value, 0) },
              ]
            : [...kept, ...cut];

    const largest = shown.reduce((high, item) => Math.max(high, item.value), 0);

    return shown.map((item, index) => ({
        ...item,
        index,
        percentage: percentOf(Math.max(item.value, 0), total),
        width: percentOf(Math.max(item.value, 0), largest),
    }));
}
