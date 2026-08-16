import type { HTMLAttributes } from "react";

import { cn } from "@/utils/cn";

import { buildBarListRows, type BarListItem, type BarListSort } from "./bar-list-model";
import styles from "./BarList.module.css";

export type { BarListItem, BarListSort } from "./bar-list-model";

export interface BarListProps extends Omit<HTMLAttributes<HTMLUListElement>, "children"> {
    /** The rows. Entries whose value is not finite are dropped. */
    items: readonly BarListItem[];
    /** Render the number. Defaults to the value as-is. */
    valueFormatter?: (value: number) => string;
    /** Show each row's share of the total next to its value. Default `false`. */
    showPercentage?: boolean;
    /** Ordering. Default `"desc"`, which is what a ranking means. */
    sort?: BarListSort;
    /** Keep at most this many rows. */
    max?: number;
    /**
     * Label for one aggregated row holding everything `max` cut off.
     *
     * Without it, `max` simply truncates. The aggregate row only appears when more
     * than one row was cut — collapsing a single row into "others" hides its name
     * for nothing.
     */
    otherLabel?: string;
}

/**
 * A ranked distribution: label, proportional bar, value, optional share.
 *
 * The most common chart on an admin panel, and the one the SDK kept sending
 * people to write by hand — `Progress` is a single bar and `Sparkline` is a time
 * series, so a "users per plan" block ended up reimplemented per screen, each
 * with its own CSS and its own `.sort()`.
 *
 * It is a **list**, not a picture: `<ul>` / `<li>` with the value written as
 * text, the bar `aria-hidden` behind it. A screen reader reads "Free, 128, 62%"
 * because that text is there, not because an `aria-label` restates a drawing.
 * Which is also why the label never sits on top of the bar — text over a tinted
 * fill has to be re-verified against that fill, and the SDK has been caught by
 * that twice.
 *
 * Bar width is relative to the **largest** row, so the biggest bar fills the
 * track; the percentage is the row's share of the **total**. They are different
 * numbers on purpose: a width scaled by the total leaves every bar short in a
 * long list, which is when the chart is needed most.
 *
 * @example
 * <BarList
 *     items={[{ label: "Free", value: 128 }, { label: "Pro", value: 32 }]}
 *     valueFormatter={(n) => `${n} ativos`}
 *     showPercentage
 *     max={5}
 *     otherLabel="Outros"
 * />
 *
 * @param props - Items plus presentation.
 * @returns The list.
 */
export function BarList({
    items,
    valueFormatter,
    showPercentage = false,
    sort = "desc",
    max,
    otherLabel,
    className,
    ...rest
}: BarListProps) {
    const rows = buildBarListRows(items, sort, max, otherLabel);

    return (
        <ul className={cn(styles.list, className)} {...rest}>
            {rows.map((row) => (
                <li key={`${row.label}-${row.index}`} className={styles.item}>
                    <div className={styles.line}>
                        <span className={styles.label}>{row.label}</span>
                        <span className={styles.value}>
                            {valueFormatter ? valueFormatter(row.value) : row.value}
                            {showPercentage && (
                                <span className={styles.percentage}>
                                    {Math.round(row.percentage)}%
                                </span>
                            )}
                        </span>
                    </div>
                    <div className={styles.track} aria-hidden="true">
                        <div
                            className={styles.fill}
                            style={{
                                width: `${row.width}%`,
                                backgroundColor:
                                    row.color ?? `var(--tempest-chart-${(row.index % 8) + 1})`,
                            }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}
