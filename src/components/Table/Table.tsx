/**
 * @tempest-limits props-count — columns, data and rowKey are the model; onRowClick
 * and emptyMessage the interaction and the empty state; stackOnMobile and
 * scrollLabel are the two ways a table survives a phone, and the label is required
 * because a scroll region needs an accessible name.
 */
import { useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useScrollOverflow } from "@/hooks/use-scroll-overflow";
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
    /**
     * Accessible name for the scrollable region, used only while the table is
     * actually wider than its box. A focus stop that announces nothing is worse
     * than no focus stop, so name the table when the page holds several.
     */
    scrollLabel?: string;
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
    scrollLabel = "Tabela rolável horizontalmente",
}: TableProps<T>) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollable = useScrollOverflow(scrollRef, "horizontal");

    return (
        <div
            ref={scrollRef}
            className={cn(styles.scroll, stackOnMobile && styles.stackable, className)}
            tabIndex={scrollable ? 0 : undefined}
            role={scrollable ? "group" : undefined}
            aria-label={scrollable ? scrollLabel : undefined}
        >
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
