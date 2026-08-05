/**
 * @tempest-limits file-lines, props-count — windowing needs its own measurements
 * (rowHeight, height, overscan, scrollToIndex) on top of everything a table already
 * takes (data, columns, rowKey, initialSort, onRowClick, emptyMessage, caption). The
 * caption is not optional chrome — a virtualised grid without one is unreadable to a
 * screen reader.
 */
import {
    type HTMLAttributes,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { cn } from "@/utils/cn";
import { compareValues } from "@/utils/compare-values";

import type { TableAlign } from "../Table";
import styles from "./VirtualTable.module.css";

export type VirtualTableSortDirection = "asc" | "desc";

export interface VirtualTableSort<T> {
    key: keyof T;
    direction: VirtualTableSortDirection;
}

export interface VirtualTableColumn<T> {
    /** Property of the row this column reads from. Doubles as the cell key. */
    key: keyof T;
    /** Column heading. */
    header: ReactNode;
    /** Custom cell renderer. Defaults to `row[key]`. */
    render?: (row: T, index: number) => ReactNode;
    /** Enable click-to-sort on this column's header. */
    sortable?: boolean;
    /** Text alignment. */
    align?: TableAlign;
    /**
     * Column width. Recommended for every column: virtualized rows enter and
     * leave the DOM as you scroll, so letting the browser auto-size columns from
     * whatever is currently rendered makes them jump mid-scroll.
     */
    width?: string | number;
}

export interface VirtualTableProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Full dataset. Every row is accounted for; only the visible ones render. */
    data: T[];
    /** Column definitions. */
    columns: VirtualTableColumn<T>[];
    /**
     * Row height in px. Must be uniform and must match what the CSS produces,
     * because it is what maps scroll offset to row index.
     */
    rowHeight: number;
    /** Height of the scroll viewport — a number of px or any CSS length. */
    height: number | string;
    /** Rows rendered above and below the viewport. Default `4`. */
    overscan?: number;
    /** Stable key extractor. Defaults to the row's index in `data`. */
    rowKey?: (row: T, index: number) => string | number;
    /** Sort applied before any header interaction. */
    initialSort?: VirtualTableSort<T>;
    /** Called when a row is activated by click, `Enter` or `Space`. */
    onRowClick?: (row: T, index: number) => void;
    /** Content shown when `data` is empty. */
    emptyMessage?: ReactNode;
    /** Accessible name for the table. Rendered as a visually hidden `<caption>`. */
    caption?: ReactNode;
    /** Scroll this row into view whenever it changes. */
    scrollToIndex?: number;
}

/** Resolve a column's alignment to its CSS module class. */
function alignClass(align: TableAlign | undefined): string | undefined {
    if (align === "right") return styles.alignRight;
    if (align === "center") return styles.alignCenter;
    return undefined;
}

/**
 * A table that stays responsive at 10k+ rows by rendering only the visible window.
 *
 * `Table` renders every row it is given and `DataTable` paginates to keep that
 * count small; neither has an answer for "show me all 40 000 rows in one
 * scrollable grid". This does, at the cost of one constraint: **`rowHeight` must
 * be uniform**, since mapping a scroll offset to a row index is what makes the
 * window computable without measuring anything.
 *
 * It stays a real `<table>`. The window is produced by two spacer rows — one
 * above the visible slice, one below — instead of absolutely positioning rows.
 * That is deliberate: `position: absolute` on `<tr>` collapses table layout, so
 * every column width would have to be computed by hand, and the element would
 * stop being a table for assistive technology. With spacer rows the browser keeps
 * doing column layout and screen readers keep announcing a grid.
 *
 * Because only a slice is in the DOM, `aria-rowcount` on the table and
 * `aria-rowindex` on each row carry the real numbers — without them a screen
 * reader announces "row 3 of 20" while the user is on row 5003 of 40 000.
 *
 * @example
 * <VirtualTable
 *     data={rows}
 *     columns={[
 *         { key: "id", header: "#", width: 80, sortable: true },
 *         { key: "name", header: "Nome", width: 240, sortable: true },
 *         { key: "total", header: "Total", align: "right", width: 120, sortable: true },
 *     ]}
 *     rowHeight={40}
 *     height={480}
 *     rowKey={(row) => row.id}
 * />
 */
export function VirtualTable<T>({
    data,
    columns,
    rowHeight,
    height,
    overscan = 4,
    rowKey,
    initialSort,
    onRowClick,
    emptyMessage = "Nenhum registro encontrado.",
    caption,
    scrollToIndex,
    className,
    ...rest
}: VirtualTableProps<T>) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState<number>(0);
    const [viewport, setViewport] = useState<number>(0);
    const [sort, setSort] = useState<VirtualTableSort<T> | null>(initialSort ?? null);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        setViewport(element.clientHeight);
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => setViewport(element.clientHeight));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element || scrollToIndex == null) return;
        element.scrollTop = Math.max(0, Math.min(scrollToIndex, data.length - 1)) * rowHeight;
    }, [scrollToIndex, rowHeight, data.length]);

    const sorted = useMemo<T[]>(() => {
        if (!sort) return data;
        const factor = sort.direction === "asc" ? 1 : -1;
        return [...data].sort((a, b) => compareValues(a[sort.key], b[sort.key]) * factor);
    }, [data, sort]);

    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const windowSize = Math.ceil(viewport / rowHeight) + overscan * 2;
    const end = Math.min(sorted.length, start + windowSize);
    const slice = sorted.slice(start, end);

    /**
     * Advance a column through asc → desc → unsorted, and jump back to the top.
     *
     * The scroll reset happens here rather than in an effect keyed on the sort
     * state for two reasons: this is the actual event that invalidates the offset
     * (keeping it would leave the user at the same pixel of a different dataset,
     * which reads as the table having jumped somewhere random), and an effect would
     * also fire on mount — clobbering an initial `scrollToIndex`.
     */
    const toggleSort = useCallback((key: keyof T): void => {
        setSort((current) => {
            if (!current || current.key !== key) return { key, direction: "asc" };
            if (current.direction === "asc") return { key, direction: "desc" };
            return null;
        });
        const element = scrollRef.current;
        if (element) element.scrollTop = 0;
        setScrollTop(0);
    }, []);

    return (
        <div
            ref={scrollRef}
            className={cn(styles.scroll, className)}
            style={{ height }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            {...rest}
        >
            <table className={styles.table} aria-rowcount={sorted.length}>
                {caption ? <caption className={styles.caption}>{caption}</caption> : null}
                <thead className={styles.head}>
                    <tr>
                        {columns.map((column) => {
                            const isSorted = sort?.key === column.key;
                            return (
                                <th
                                    key={String(column.key)}
                                    scope="col"
                                    className={cn(styles.th, alignClass(column.align))}
                                    style={{ width: column.width }}
                                    aria-sort={
                                        isSorted
                                            ? sort?.direction === "asc"
                                                ? "ascending"
                                                : "descending"
                                            : column.sortable
                                              ? "none"
                                              : undefined
                                    }
                                >
                                    {column.sortable ? (
                                        <button
                                            type="button"
                                            className={styles.sortButton}
                                            onClick={() => toggleSort(column.key)}
                                        >
                                            {column.header}
                                            <span className={styles.sortIndicator} aria-hidden>
                                                {isSorted
                                                    ? sort?.direction === "asc"
                                                        ? "▲"
                                                        : "▼"
                                                    : "↕"}
                                            </span>
                                        </button>
                                    ) : (
                                        column.header
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {sorted.length === 0 ? (
                        <tr>
                            <td className={styles.emptyRow} colSpan={columns.length}>
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        <>
                            {start > 0 && <tr aria-hidden style={{ height: start * rowHeight }} />}
                            {slice.map((row, offset) => {
                                const index = start + offset;
                                return (
                                    <tr
                                        key={rowKey ? rowKey(row, index) : index}
                                        aria-rowindex={index + 1}
                                        className={cn(styles.tr, onRowClick && styles.clickable)}
                                        style={{ height: rowHeight }}
                                        tabIndex={onRowClick ? 0 : undefined}
                                        onClick={
                                            onRowClick ? () => onRowClick(row, index) : undefined
                                        }
                                        onKeyDown={
                                            onRowClick
                                                ? (event) => {
                                                      if (
                                                          event.key === "Enter" ||
                                                          event.key === " "
                                                      ) {
                                                          event.preventDefault();
                                                          onRowClick(row, index);
                                                      }
                                                  }
                                                : undefined
                                        }
                                    >
                                        {columns.map((column) => (
                                            <td
                                                key={String(column.key)}
                                                className={cn(styles.td, alignClass(column.align))}
                                                style={{ width: column.width }}
                                            >
                                                {column.render
                                                    ? column.render(row, index)
                                                    : ((row[column.key] as ReactNode) ?? null)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                            {end < sorted.length && (
                                <tr
                                    aria-hidden
                                    style={{ height: (sorted.length - end) * rowHeight }}
                                />
                            )}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
}
