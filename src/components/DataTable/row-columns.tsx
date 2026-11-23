import type { MouseEvent, ReactNode } from "react";
import type { TableColumn } from "../Table";
import { Checkbox } from "../Checkbox";
import { VisuallyHidden } from "../VisuallyHidden";
import styles from "./DataTable.module.css";

/** A row identity, as `rowKey` returns it. */
export type DataTableRowKey = string | number;

/** The Table column key of the built-in selection column. Not a field of any row. */
export const SELECTION_COLUMN_KEY = "__tempest_selection__";

/** The Table column key of the built-in actions column. Not a field of any row. */
export const ACTIONS_COLUMN_KEY = "__tempest_actions__";

/**
 * Keep a click inside a built-in cell from reaching the row's `onRowClick`.
 *
 * React bubbles synthetic events along the component tree, not the DOM, so this
 * also catches clicks inside a portalled menu opened from the cell: choosing
 * "Excluir" from a row menu must not also open the row.
 *
 * @param event - The click that reached the cell wrapper.
 */
function stopRowClick(event: MouseEvent): void {
    event.stopPropagation();
}

/** What {@link selectionColumn} needs from the table. */
export interface SelectionColumnInput<T> {
    /** The rows on screen; the header checkbox acts on these only. */
    pageRows: T[];
    /** Identity of a row on this page, by its index on the page. */
    keyOf: (row: T, pageIndex: number) => DataTableRowKey;
    /** The keys currently selected, across every page. */
    selectedKeys: readonly DataTableRowKey[];
    /** Receives the next full selection. */
    onSelectionChange: (keys: DataTableRowKey[]) => void;
    /** Accessible name of the header checkbox. */
    selectAllLabel: string;
    /** Accessible name of one row's checkbox. */
    rowLabel: (row: T, pageIndex: number) => string;
}

/**
 * The checkbox column that `selectable` prepends.
 *
 * The header box acts on **the page on screen**, and keeps keys selected on other
 * pages: "select all" that silently reaches rows the user has never seen is how a
 * bulk delete removes the wrong records. It reads `indeterminate` when only part
 * of the page is selected.
 *
 * @param input - The rows on screen, their keys and the controlled selection.
 * @returns A Table column whose key is no field of `T`.
 */
export function selectionColumn<T>({
    pageRows,
    keyOf,
    selectedKeys,
    onSelectionChange,
    selectAllLabel,
    rowLabel,
}: SelectionColumnInput<T>): TableColumn<T> {
    const selected = new Set<DataTableRowKey>(selectedKeys);
    const pageKeys = pageRows.map((row, index) => keyOf(row, index));
    const selectedOnPage = pageKeys.filter((key) => selected.has(key)).length;
    const allOnPage = pageKeys.length > 0 && selectedOnPage === pageKeys.length;

    function togglePage(): void {
        if (allOnPage) {
            const onPage = new Set(pageKeys);
            onSelectionChange(selectedKeys.filter((key) => !onPage.has(key)));
            return;
        }
        onSelectionChange([...selectedKeys, ...pageKeys.filter((key) => !selected.has(key))]);
    }

    function toggleRow(key: DataTableRowKey): void {
        onSelectionChange(
            selected.has(key)
                ? selectedKeys.filter((item) => item !== key)
                : [...selectedKeys, key],
        );
    }

    return {
        key: SELECTION_COLUMN_KEY,
        width: "1%",
        className: styles.selectionCell,
        header: (
            <span className={styles.cellControl} onClick={stopRowClick}>
                <Checkbox
                    aria-label={selectAllLabel}
                    checked={allOnPage}
                    indeterminate={selectedOnPage > 0 && !allOnPage}
                    disabled={pageKeys.length === 0}
                    onChange={togglePage}
                />
            </span>
        ),
        render: (row: T, index: number): ReactNode => {
            const key = keyOf(row, index);
            return (
                <span className={styles.cellControl} onClick={stopRowClick}>
                    <Checkbox
                        aria-label={rowLabel(row, index)}
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                    />
                </span>
            );
        },
    };
}

/**
 * The trailing column that `rowActions` appends.
 *
 * Its heading is visually hidden but present, so a screen reader still names the
 * column, and in the stacked mobile card no `data-label` is printed beside a
 * menu button that already says what it does.
 *
 * @param render - The caller's per-row content (a menu, a pair of buttons).
 * @param label - The accessible column heading.
 * @returns A Table column whose key is no field of `T`.
 */
export function actionsColumn<T>(render: (row: T) => ReactNode, label: string): TableColumn<T> {
    return {
        key: ACTIONS_COLUMN_KEY,
        align: "right",
        width: "1%",
        className: styles.actionsCell,
        header: <VisuallyHidden>{label}</VisuallyHidden>,
        render: (row: T): ReactNode => (
            <span className={styles.cellControl} onClick={stopRowClick}>
                {render(row)}
            </span>
        ),
    };
}
