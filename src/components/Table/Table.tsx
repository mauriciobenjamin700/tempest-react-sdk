import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Table.module.css";

export type TableAlign = "left" | "right" | "center";
export type TablePriority = "always" | "tablet" | "desktop";

export interface TableColumn<T> {
    key: string;
    header: ReactNode;
    /** Render the cell content. Defaults to `row[key]` if not provided. */
    render?: (row: T, index: number) => ReactNode;
    align?: TableAlign;
    width?: string | number;
    className?: string;
    /**
     * Visibility priority: `always` (default) shows on every viewport,
     * `tablet` hides below md (< 768px), `desktop` hides below lg (< 1024px).
     */
    priority?: TablePriority;
}

export interface TableProps<T> {
    columns: TableColumn<T>[];
    data: T[];
    rowKey: (row: T, index: number) => string | number;
    onRowClick?: (row: T) => void;
    emptyMessage?: ReactNode;
    className?: string;
    /**
     * Stack mode — render rows as label/value cards on mobile (< md).
     * Better than horizontal scroll when each row has 3+ columns of dense data.
     */
    stackOnMobile?: boolean;
}

function priorityClass(priority: TablePriority | undefined): string | undefined {
    if (priority === "tablet") return styles.priorityTablet;
    if (priority === "desktop") return styles.priorityDesktop;
    return undefined;
}

/**
 * Lightweight table with declarative columns + mobile niceties.
 *
 * - `priority` per column lets less-important data hide on narrow viewports.
 * - `stackOnMobile` re-renders each row as a label/value card on mobile,
 *   avoiding horizontal scroll for dense data.
 */
export function Table<T>({
    columns,
    data,
    rowKey,
    onRowClick,
    emptyMessage = "Nenhum registro encontrado.",
    className,
    stackOnMobile = false,
}: TableProps<T>) {
    return (
        <div className={cn(styles.scroll, stackOnMobile && styles.stackable, className)}>
            <table className={styles.table}>
                <thead className={cn(stackOnMobile && styles.stackableHead)}>
                    <tr>
                        {columns.map((column) => (
                            <th
                                key={column.key}
                                className={cn(
                                    styles.th,
                                    column.align === "right" && styles.alignRight,
                                    column.align === "center" && styles.alignCenter,
                                    priorityClass(column.priority),
                                )}
                                style={{ width: column.width }}
                            >
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td className={styles.emptyRow} colSpan={columns.length}>
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        data.map((row, index) => (
                            <tr
                                key={rowKey(row, index)}
                                className={cn(
                                    styles.tr,
                                    onRowClick && styles.clickable,
                                    stackOnMobile && styles.stackableRow,
                                )}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                            >
                                {columns.map((column) => {
                                    const content = column.render
                                        ? column.render(row, index)
                                        : (row as Record<string, ReactNode>)[column.key];
                                    return (
                                        <td
                                            key={column.key}
                                            className={cn(
                                                styles.td,
                                                column.align === "right" && styles.alignRight,
                                                column.align === "center" && styles.alignCenter,
                                                priorityClass(column.priority),
                                                column.className,
                                            )}
                                            data-label={
                                                typeof column.header === "string"
                                                    ? column.header
                                                    : undefined
                                            }
                                        >
                                            {content}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
