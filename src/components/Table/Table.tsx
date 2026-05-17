import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Table.module.css";

export type TableAlign = "left" | "right" | "center";

export interface TableColumn<T> {
    key: string;
    header: ReactNode;
    /** Render the cell content. Defaults to `row[key]` if not provided. */
    render?: (row: T, index: number) => ReactNode;
    align?: TableAlign;
    width?: string | number;
    className?: string;
}

export interface TableProps<T> {
    columns: TableColumn<T>[];
    data: T[];
    rowKey: (row: T, index: number) => string | number;
    onRowClick?: (row: T) => void;
    emptyMessage?: ReactNode;
    className?: string;
}

/**
 * Lightweight table that maps a list of rows through declarative `columns`.
 * Provide `rowKey` so React reconciliation works. Rows become clickable when
 * `onRowClick` is supplied.
 */
export function Table<T>({
    columns,
    data,
    rowKey,
    onRowClick,
    emptyMessage = "Nenhum registro encontrado.",
    className,
}: TableProps<T>) {
    return (
        <div className={cn(styles.scroll, className)}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th
                                key={column.key}
                                className={cn(
                                    styles.th,
                                    column.align === "right" && styles.alignRight,
                                    column.align === "center" && styles.alignCenter,
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
                                className={cn(styles.tr, onRowClick && styles.clickable)}
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
                                                column.className,
                                            )}
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
