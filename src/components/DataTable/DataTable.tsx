/**
 * @tempest-limits file-lines, props-count, function-lines — the table does four jobs
 * a caller turns on independently — paging (pageSize), search (searchable,
 * searchKeys), sort (initialSort) and inline edit (onCellChange, editLabels) — over
 * one row model (data, columns, rowKey, emptyMessage). The body is long because
 * those four share the derived-rows pipeline: filter, then sort, then page, then map
 * to cells, in that order and off the same memo.
 *
 * Each of the four also runs in a second mode, where the caller owns the work and
 * the table only reports intent: totalItems/page/onPageChange, onSearchChange,
 * manualSort/onSortChange, loading/loadingRows. That doubles the props without
 * adding a fifth job — every manual prop short-circuits one stage of the same
 * pipeline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { compareValues } from "@/utils/compare-values";
import { usePagination } from "@/hooks";
import { useAnnounce } from "@/hooks/use-announce";
import { Table, type TableAlign, type TableColumn, type TablePriority } from "../Table";
import { Pagination } from "../Pagination";
import { SearchBar } from "../SearchBar";
import { EditableCell } from "./EditableCell";
import { LoadingRows } from "./LoadingRows";
import { useDevWarnings } from "./use-dev-warnings";
import { DEFAULT_EDIT_LABELS, type CellCommitMove, type DataTableEditLabels } from "./edit-labels";
import styles from "./DataTable.module.css";

export type SortDirection = "asc" | "desc";

export interface DataTableSort<T> {
    key: keyof T;
    direction: SortDirection;
}

/** Input types an editable column can use. */
export type DataTableEditorType = "text" | "number" | "date" | "email" | "tel" | "url";

/** One accepted cell edit, handed to `onCellChange`. */
export interface DataTableCellChange<T> {
    /** The row as it was before the edit. */
    row: T;
    /** Which column changed. */
    key: keyof T;
    /** The parsed new value. */
    value: unknown;
    /** The value that was displayed before the edit. */
    previous: unknown;
    /** Index of the row in the full `data` array. */
    rowIndex: number;
}

/**
 * Column definition for {@link DataTable}. Extends the headless {@link Table}
 * column shape with a typed `key`, opt-in sorting, opt-in inline editing, and the
 * visual options that are forwarded to the underlying Table cell.
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
    /**
     * Let cells in this column be edited in place. Requires `onCellChange` on the
     * table; without it the column stays read-only.
     */
    editable?: boolean;
    /** Editor input type. Default `"text"`. */
    editorType?: DataTableEditorType;
    /** Text the editor opens with. Defaults to `String(value ?? "")`. */
    formatEdit?: (row: T) => string;
    /**
     * Turn the typed string into the stored value. Defaults to the trimmed string,
     * or `Number(raw)` when `editorType` is `"number"`.
     */
    parse?: (raw: string, row: T) => unknown;
    /** Return a message to reject the edit, or `null` to accept it. */
    validate?: (value: unknown, row: T) => string | null;
}

export interface DataTableProps<T> extends HTMLAttributes<HTMLDivElement> {
    /**
     * The rows to work with.
     *
     * By default this is the **full** dataset and sorting, searching and paging
     * all happen in memory. Pass `totalItems` and it becomes the current page as
     * the server returned it, with those three delegated to the caller.
     */
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
    /**
     * Persist an accepted cell edit. Return a promise: while it is pending the cell
     * already shows the new value, and a rejection rolls that back and surfaces the
     * error in the cell. Without this prop no column is editable.
     */
    onCellChange?: (change: DataTableCellChange<T>) => void | Promise<void>;
    /** Override the PT-BR copy of the editing affordances. */
    editLabels?: Partial<DataTableEditLabels>;
    /**
     * Total row count across every page — the `total` of a paginated envelope.
     *
     * Passing it switches the table to **server mode**: `data` is read as the
     * current page, the page count comes from this number instead of
     * `data.length`, and sorting and searching are delegated to the caller
     * (see `manualSort` / `manualSearch`, which are implied here). Pair it with
     * `page` and `onPageChange`.
     */
    totalItems?: number;
    /** Current page, 1-based. Controlled — required in server mode. */
    page?: number;
    /** Called with the next page. Required whenever `page` is controlled. */
    onPageChange?: (page: number) => void;
    /**
     * Sorting is the caller's job: clicking a header reports through
     * `onSortChange` and the rows are left in the order they arrived.
     *
     * Implied by `totalItems`, because sorting the page in memory would sort
     * *that page only* while the header claims the whole table is ordered.
     */
    manualSort?: boolean;
    /** Called with the next sort state — `null` when the header cycles back to unsorted. */
    onSortChange?: (sort: DataTableSort<T> | null) => void;
    /**
     * Searching is the caller's job: typing reports through `onSearchChange` and
     * the rows are left as they arrived.
     *
     * Implied by `totalItems`. Filtering the current page would hide the rows
     * that do not match *on this page* and show nothing for a term that only
     * matches on page three — an empty table that looks like "no results".
     */
    manualSearch?: boolean;
    /** Called with the current search term (debouncing, if any, is the caller's). */
    onSearchChange?: (term: string) => void;
    /**
     * A fetch is in flight.
     *
     * With rows already on screen they stay put, dimmed and `aria-busy`, so the
     * page does not jump under the cursor between pages. With no rows yet it
     * renders placeholder lines at full height, which is a different statement
     * from `emptyMessage`: "loading" and "there is nothing" are not the same
     * screen.
     */
    loading?: boolean;
}

/** Identity of one cell, stable across re-renders and pagination. */
function cellId(rowKeyValue: string | number, columnKey: PropertyKey): string {
    return `${String(rowKeyValue)}::${String(columnKey)}`;
}

function headerText<T>(column: DataTableColumn<T>): string {
    return typeof column.header === "string" ? column.header : String(column.key);
}

/**
 * Stateful, headless data table built on top of {@link Table}. Adds
 * client-side searching, click-to-sort columns, pagination and opt-in inline
 * editing while delegating all table markup to the underlying Table component.
 *
 * - Clicking a sortable header cycles asc → desc → unsorted.
 * - Search matches a case-insensitive substring across `searchKeys`
 *   (or every string/number column when not provided).
 * - Pagination is hidden when the result fits on a single page.
 * - A column with `editable` renders a button that opens an inline editor;
 *   `Enter` commits, `Escape` discards, `Tab` walks to the next editable cell.
 *
 * Editing is strictly opt-in: with no `editable` column (or no `onCellChange`) the
 * rendered markup is byte-for-byte what it was before the feature existed, which
 * matters because the component is published.
 *
 * ## Optimistic, with a visible rollback
 *
 * An accepted edit is shown immediately and `onCellChange` runs in the background.
 * If it rejects, the cell returns to the old value **and** shows the reason as a
 * `role="alert"` tied to the cell. A silent revert is worse than no optimistic
 * update at all: the user watched their edit appear and has no reason to doubt it.
 *
 * The header memo depends on `columns`, `sort` and the editing state only:
 * `toggleSort` and the commit callbacks are recreated each render but always close
 * over the same setters, so including them would rebuild every header on every
 * render without changing behaviour. That is why `exhaustive-deps` is silenced on
 * that dependency array.
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
    onCellChange,
    editLabels,
    totalItems,
    page: controlledPage,
    onPageChange,
    manualSort,
    onSortChange,
    manualSearch,
    onSearchChange,
    loading = false,
    className,
    ...rest
}: DataTableProps<T>) {
    const [search, setSearch] = useState<string>("");
    const [sort, setSort] = useState<DataTableSort<T> | null>(initialSort ?? null);
    const { page: internalPage, setPage: setInternalPage } = usePagination(1, pageSize);
    const announce = useAnnounce();

    const serverMode = totalItems !== undefined;
    const sortIsManual = manualSort ?? serverMode;
    const searchIsManual = manualSearch ?? serverMode;
    const page = controlledPage ?? internalPage;

    const setPage = useCallback(
        (next: number) => {
            if (controlledPage === undefined) setInternalPage(next);
            onPageChange?.(next);
        },
        [controlledPage, setInternalPage, onPageChange],
    );

    useDevWarnings({ serverMode, controlledPage, onPageChange, sortIsManual, onSortChange });

    const [editing, setEditing] = useState<string | null>(null);
    const [refocus, setRefocus] = useState<string | null>(null);
    const [overrides, setOverrides] = useState<Record<string, unknown>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    const labels = useMemo<DataTableEditLabels>(
        () => ({ ...DEFAULT_EDIT_LABELS, ...editLabels }),
        [editLabels],
    );
    const editingEnabled = onCellChange !== undefined && columns.some((column) => column.editable);

    const effectiveSearchKeys = useMemo<(keyof T)[]>(() => {
        if (!searchable || searchIsManual) return [];
        if (searchKeys && searchKeys.length > 0) return searchKeys;
        return columns
            .filter((column) => {
                const sample = data.find((row) => row[column.key] != null);
                const value = sample ? sample[column.key] : undefined;
                return typeof value === "string" || typeof value === "number";
            })
            .map((column) => column.key);
    }, [searchable, searchIsManual, searchKeys, columns, data]);

    const filtered = useMemo<T[]>(() => {
        const term = search.trim().toLowerCase();
        if (!term || !searchable || searchIsManual) return data;
        return data.filter((row) =>
            effectiveSearchKeys.some((key) => {
                const value = row[key];
                return value != null && String(value).toLowerCase().includes(term);
            }),
        );
    }, [data, search, searchable, searchIsManual, effectiveSearchKeys]);

    const sorted = useMemo<T[]>(() => {
        if (!sort || sortIsManual) return filtered;
        const factor = sort.direction === "asc" ? 1 : -1;
        return [...filtered].sort((a, b) => compareValues(a[sort.key], b[sort.key]) * factor);
    }, [filtered, sort, sortIsManual]);

    const rowCount = totalItems ?? sorted.length;
    const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));

    /**
     * Clamp the current page when the dataset shrinks (e.g. after filtering).
     *
     * Skipped in server mode: `page` belongs to the caller there, and a clamp
     * fired against a `totalItems` that has not caught up with the new filter
     * yet would send them a page they did not ask for, mid-fetch.
     */
    useEffect(() => {
        if (!serverMode && page > totalPages) setPage(totalPages);
    }, [serverMode, page, totalPages, setPage]);

    const safePage = serverMode ? page : Math.min(page, totalPages);
    const pageRows = useMemo<T[]>(() => {
        if (serverMode) return sorted;
        const start = (safePage - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [serverMode, sorted, safePage, pageSize]);

    function toggleSort(key: keyof T): void {
        const current = sort;
        const next: DataTableSort<T> | null =
            !current || current.key !== key
                ? { key, direction: "asc" }
                : current.direction === "asc"
                  ? { key, direction: "desc" }
                  : null;
        setSort(next);
        onSortChange?.(next);
    }

    const absoluteIndex = useCallback(
        (pageIndex: number) => (safePage - 1) * pageSize + pageIndex,
        [safePage, pageSize],
    );

    /**
     * Every editable cell on the page, row-major — the order `Tab` walks.
     *
     * Row-major and not column-major because a row is the record a user is
     * correcting; walking down a column would make them re-find their place on
     * every keystroke.
     */
    const editableCellIds = useMemo<string[]>(() => {
        if (!editingEnabled) return [];
        const ids: string[] = [];
        pageRows.forEach((row, index) => {
            const key = rowKey(row, absoluteIndex(index));
            for (const column of columns) {
                if (column.editable) ids.push(cellId(key, column.key));
            }
        });
        return ids;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingEnabled, pageRows, columns, absoluteIndex]);

    const displayed = useCallback(
        (row: T, column: DataTableColumn<T>, id: string): unknown =>
            id in overrides ? overrides[id] : row[column.key],
        [overrides],
    );

    /**
     * Run the caller's `onCellChange` behind the optimistic update.
     *
     * Only the *success* is announced. The failure already renders as a
     * `role="alert"` inside the cell, which screen readers read on insertion —
     * announcing it again from the shared region would read it twice and put the
     * same text in the document twice.
     */
    const persist = useCallback(
        async (id: string, column: DataTableColumn<T>, change: DataTableCellChange<T>) => {
            setSaving((current) => ({ ...current, [id]: true }));
            try {
                await onCellChange?.(change);
                announce(labels.saved(headerText(column)));
            } catch (error) {
                setOverrides((current) => {
                    const next = { ...current };
                    delete next[id];
                    return next;
                });
                const message =
                    error instanceof Error && error.message
                        ? error.message
                        : labels.saveFailed(headerText(column));
                setErrors((current) => ({ ...current, [id]: message }));
            } finally {
                setSaving((current) => {
                    const next = { ...current };
                    delete next[id];
                    return next;
                });
            }
        },
        [onCellChange, announce, labels],
    );

    const moveFrom = useCallback(
        (id: string, move: CellCommitMove): void => {
            if (move === "none") {
                setEditing(null);
                setRefocus(id);
                return;
            }
            const index = editableCellIds.indexOf(id);
            const target = editableCellIds[index + (move === "next" ? 1 : -1)];
            if (target === undefined) {
                setEditing(null);
                setRefocus(id);
                return;
            }
            setEditing(target);
            setRefocus(null);
        },
        [editableCellIds],
    );

    /**
     * Parse, validate, stage optimistically, then save in the background.
     *
     * Validation runs before anything is staged, and a rejection leaves the editor
     * open with the message attached to the input — the user has to be able to fix
     * what they typed without retyping it.
     */
    const commit = useCallback(
        (
            row: T,
            column: DataTableColumn<T>,
            id: string,
            pageIndex: number,
            raw: string,
            move: CellCommitMove,
        ): void => {
            const previous = displayed(row, column, id);
            const currentText = column.formatEdit ? column.formatEdit(row) : String(previous ?? "");
            if (raw === currentText) {
                moveFrom(id, move);
                return;
            }

            const value = column.parse
                ? column.parse(raw, row)
                : column.editorType === "number"
                  ? Number(raw)
                  : raw.trim();

            const invalid = column.validate?.(value, row) ?? null;
            if (invalid) {
                setErrors((current) => ({ ...current, [id]: invalid }));
                return;
            }

            setErrors((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
            setOverrides((current) => ({ ...current, [id]: value }));
            moveFrom(id, move);
            void persist(id, column, {
                row,
                key: column.key,
                value,
                previous,
                rowIndex: absoluteIndex(pageIndex),
            });
        },
        [displayed, moveFrom, persist, absoluteIndex],
    );

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
                        aria-label={`Ordenar por ${headerText(column)}`}
                    >
                        {column.header}
                        <span className={styles.sortIndicator} aria-hidden>
                            {indicator}
                        </span>
                    </button>
                ) : (
                    column.header
                );

                const plainCell = (row: T): ReactNode => {
                    if (column.render) return column.render(row);
                    return (row[column.key] as ReactNode) ?? null;
                };

                /**
                 * Render an editable cell's content against the optimistic value.
                 *
                 * The row is shallow-patched rather than the value passed alongside it,
                 * because a column with a custom `render` (a `<Money>`, a badge) reads
                 * the row — handing it the stale row would show the old number under a
                 * cell the user just changed.
                 */
                const patchedCell = (row: T, value: unknown): ReactNode => {
                    const patched = { ...row, [column.key]: value } as T;
                    if (column.render) return column.render(patched);
                    return (patched[column.key] as ReactNode) ?? null;
                };

                const editable = editingEnabled && column.editable === true;

                return {
                    key: String(column.key),
                    header,
                    align: column.align,
                    priority: column.priority,
                    width: column.width,
                    render: editable
                        ? (row: T, index: number) => {
                              const id = cellId(rowKey(row, absoluteIndex(index)), column.key);
                              const value = displayed(row, column, id);
                              const text = column.formatEdit
                                  ? column.formatEdit(row)
                                  : String(value ?? "");
                              return (
                                  <EditableCell
                                      text={text}
                                      columnLabel={headerText(column)}
                                      rowNumber={index + 1}
                                      inputType={column.editorType ?? "text"}
                                      editing={editing === id}
                                      refocus={refocus === id}
                                      saving={saving[id] === true}
                                      error={errors[id] ?? null}
                                      errorId={`tempest-cell-error-${id.replace(/[^\w-]/g, "_")}`}
                                      labels={labels}
                                      onOpen={() => {
                                          setEditing(id);
                                          setRefocus(null);
                                      }}
                                      onCommit={(raw, move) =>
                                          commit(row, column, id, index, raw, move)
                                      }
                                      onCancel={() => {
                                          setEditing(null);
                                          setRefocus(id);
                                          setErrors((current) => {
                                              const next = { ...current };
                                              delete next[id];
                                              return next;
                                          });
                                      }}
                                  >
                                      {patchedCell(row, value)}
                                  </EditableCell>
                              );
                          }
                        : plainCell,
                };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            columns,
            sort,
            editingEnabled,
            editing,
            refocus,
            saving,
            errors,
            labels,
            overrides,
            absoluteIndex,
            commit,
        ],
    );

    const showSkeleton = loading && pageRows.length === 0;

    return (
        <div className={cn(styles.wrapper, className)} {...rest}>
            {searchable && (
                <SearchBar
                    value={search}
                    onChange={(value) => {
                        setSearch(value);
                        setPage(1);
                        onSearchChange?.(value);
                    }}
                    wrapperClassName={styles.search}
                />
            )}
            <div
                className={cn(loading && !showSkeleton && styles.pending)}
                aria-busy={loading || undefined}
                data-testid="tempest-datatable-body"
            >
                {showSkeleton ? (
                    <LoadingRows columns={tableColumns.length} rows={Math.min(pageSize, 8)} />
                ) : (
                    <Table
                        columns={tableColumns}
                        data={pageRows}
                        rowKey={(row, index) => rowKey(row, absoluteIndex(index))}
                        emptyMessage={emptyMessage}
                    />
                )}
            </div>
            {totalPages > 1 && (
                <Pagination
                    page={safePage}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    totalItems={rowCount}
                />
            )}
        </div>
    );
}
