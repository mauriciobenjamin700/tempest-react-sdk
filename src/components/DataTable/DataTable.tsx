import { useEffect, useMemo, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { usePagination } from "@/hooks";
import { Table, type TableAlign, type TableColumn, type TablePriority } from "../Table";
import { Pagination } from "../Pagination";
import { SearchBar } from "../SearchBar";
import styles from "./DataTable.module.css";

export type SortDirection = "asc" | "desc";

export interface DataTableSort<T> {
    key: keyof T;
    direction: SortDirection;
}

/**
 * Column definition for {@link DataTable}. Extends the headless {@link Table}
 * column shape with a typed `key`, opt-in sorting, and the visual options that
 * are forwarded to the underlying Table cell.
 */
export interface DataTableColumn<T> {
    /** Property of the row this column reads from. Doubles as the cell key. */
    key: keyof T;
    /** Column heading. */
    header: ReactNode;
    /** Custom cell renderer. Defaults to `String(row[key])`. */
    render?: (row: T) => ReactNode;
    /** Enable click-to-sort on this column's header. */
    sortable?: boolean;
    /** Text alignment forwarded to the Table cell. */
    align?: TableAlign;
    /** Responsive visibility priority forwarded to the Table cell. */
    priority?: TablePriority;
    /** Fixed column width forwarded to the Table cell. */
    width?: string | number;
}

export interface DataTableProps<T> extends HTMLAttributes<HTMLDivElement> {
    /** Full, unfiltered dataset. Sorting/filtering/pagination happen client-side. */
    data: T[];
    /** Column definitions. */
    columns: DataTableColumn<T>[];
    /** Rows per page. Default 10. */
    pageSize?: number;
    /** Render a search input above the table. Default false. */
    searchable?: boolean;
    /**
     * Keys to match the search term against. When omitted, every column whose
     * value is a string or number is searched.
     */
    searchKeys?: (keyof T)[];
    /** Initial sort applied before any header interaction. */
    initialSort?: DataTableSort<T>;
    /** Stable key extractor for rows. Defaults to the row index. */
    rowKey?: (row: T, index: number) => string | number;
    /** Content shown when no rows match. */
    emptyMessage?: ReactNode;
}

/**
 * Compare two arbitrary cell values with stable, type-aware ordering:
 * numbers numerically, dates by timestamp, everything else by `localeCompare`.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns Negative when `a < b`, positive when `a > b`, zero when equal.
 */
function compareValues(a: unknown, b: unknown): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "boolean" && typeof b === "boolean") {
        return Number(a) - Number(b);
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Stateful, headless data table built on top of {@link Table}. Adds
 * client-side searching, click-to-sort columns, and pagination while
 * delegating all table markup to the underlying Table component.
 *
 * - Clicking a sortable header cycles asc → desc → unsorted.
 * - Search matches a case-insensitive substring across `searchKeys`
 *   (or every string/number column when not provided).
 * - Pagination is hidden when the result fits on a single page.
 */
export function DataTable<T>({
    data,
    columns,
    pageSize = 10,
    searchable = false,
    searchKeys,
    initialSort,
    rowKey = (_row, index) => index,
    emptyMessage,
    className,
    ...rest
}: DataTableProps<T>) {
    const [search, setSearch] = useState<string>("");
    const [sort, setSort] = useState<DataTableSort<T> | null>(initialSort ?? null);
    const { page, setPage } = usePagination(1, pageSize);

    const effectiveSearchKeys = useMemo<(keyof T)[]>(() => {
        if (searchKeys && searchKeys.length > 0) return searchKeys;
        return columns
            .filter((column) => {
                const sample = data.find((row) => row[column.key] != null);
                const value = sample ? sample[column.key] : undefined;
                return typeof value === "string" || typeof value === "number";
            })
            .map((column) => column.key);
    }, [searchKeys, columns, data]);

    const filtered = useMemo<T[]>(() => {
        const term = search.trim().toLowerCase();
        if (!term || !searchable) return data;
        return data.filter((row) =>
            effectiveSearchKeys.some((key) => {
                const value = row[key];
                return value != null && String(value).toLowerCase().includes(term);
            }),
        );
    }, [data, search, searchable, effectiveSearchKeys]);

    const sorted = useMemo<T[]>(() => {
        if (!sort) return filtered;
        const factor = sort.direction === "asc" ? 1 : -1;
        return [...filtered].sort((a, b) => compareValues(a[sort.key], b[sort.key]) * factor);
    }, [filtered, sort]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

    // Clamp the current page when the dataset shrinks (e.g. after filtering).
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages, setPage]);

    const safePage = Math.min(page, totalPages);
    const pageRows = useMemo<T[]>(() => {
        const start = (safePage - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [sorted, safePage, pageSize]);

    function toggleSort(key: keyof T): void {
        setSort((current) => {
            if (!current || current.key !== key) return { key, direction: "asc" };
            if (current.direction === "asc") return { key, direction: "desc" };
            return null;
        });
    }

    const tableColumns = useMemo<TableColumn<T>[]>(
        () =>
            columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const indicator = isSorted ? (sort?.direction === "asc" ? " ▲" : " ▼") : "";
                const header = column.sortable ? (
                    <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleSort(column.key)}
                        aria-label={`Ordenar por ${
                            typeof column.header === "string" ? column.header : String(column.key)
                        }`}
                    >
                        {column.header}
                        <span className={styles.sortIndicator} aria-hidden>
                            {indicator}
                        </span>
                    </button>
                ) : (
                    column.header
                );

                return {
                    key: String(column.key),
                    header,
                    align: column.align,
                    priority: column.priority,
                    width: column.width,
                    render: column.render
                        ? (row: T) => column.render!(row)
                        : (row: T) => (row[column.key] as ReactNode) ?? null,
                };
            }),
        // toggleSort is stable enough for this memo; sort drives header re-render.
        [columns, sort],
    );

    return (
        <div className={cn(styles.wrapper, className)} {...rest}>
            {searchable && (
                <SearchBar
                    value={search}
                    onChange={(value) => {
                        setSearch(value);
                        setPage(1);
                    }}
                    wrapperClassName={styles.search}
                />
            )}
            <Table
                columns={tableColumns}
                data={pageRows}
                rowKey={(row, index) => rowKey(row, (safePage - 1) * pageSize + index)}
                emptyMessage={emptyMessage}
            />
            {totalPages > 1 && (
                <Pagination
                    page={safePage}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    totalItems={sorted.length}
                />
            )}
        </div>
    );
}
