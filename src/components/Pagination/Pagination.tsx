import { useMemo } from "react";
import { cn } from "@/utils/cn";
import styles from "./Pagination.module.css";

export interface PaginationProps {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    pageSize?: number;
    onPageSizeChange?: (size: number) => void;
    pageSizeOptions?: number[];
    /** Total items count; if provided, renders the summary text. */
    totalItems?: number;
    /** Max number of numbered page buttons to show. Default 7. */
    siblingCount?: number;
    className?: string;
}

function buildRange(page: number, totalPages: number, siblings: number): (number | "...")[] {
    const totalSlots = siblings + 4;
    if (totalPages <= totalSlots) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const start = Math.max(2, page - Math.floor(siblings / 2));
    const end = Math.min(totalPages - 1, start + siblings - 1);
    const range: (number | "...")[] = [1];
    if (start > 2) range.push("...");
    for (let i = start; i <= end; i++) range.push(i);
    if (end < totalPages - 1) range.push("...");
    range.push(totalPages);
    return range;
}

/**
 * Numeric pagination controls. Pair with {@link usePagination} for state.
 */
export function Pagination({
    page,
    totalPages,
    onPageChange,
    pageSize,
    onPageSizeChange,
    pageSizeOptions = [10, 25, 50, 100],
    totalItems,
    siblingCount = 3,
    className,
}: PaginationProps) {
    const pages = useMemo(
        () => buildRange(page, totalPages, siblingCount),
        [page, totalPages, siblingCount],
    );

    if (totalPages <= 1 && !onPageSizeChange) return null;

    return (
        <div className={cn(styles.wrapper, className)}>
            <div className={styles.summary}>
                {typeof totalItems === "number"
                    ? `${totalItems} resultado${totalItems === 1 ? "" : "s"}`
                    : `Página ${page} de ${totalPages}`}
            </div>
            <div className={styles.controls}>
                <button
                    type="button"
                    className={styles.page}
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    aria-label="Página anterior"
                >
                    ‹
                </button>
                {pages.map((entry, index) =>
                    entry === "..." ? (
                        <span
                            key={`ellipsis-${index}`}
                            className={cn(styles.ellipsis, styles.numeric)}
                        >
                            …
                        </span>
                    ) : (
                        <button
                            type="button"
                            key={entry}
                            className={cn(
                                styles.page,
                                styles.numeric,
                                entry === page && styles.active,
                            )}
                            onClick={() => onPageChange(entry)}
                            aria-current={entry === page ? "page" : undefined}
                        >
                            {entry}
                        </button>
                    ),
                )}
                <button
                    type="button"
                    className={styles.page}
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    aria-label="Próxima página"
                >
                    ›
                </button>
                {onPageSizeChange && (
                    <select
                        className={styles.sizeSelect}
                        value={pageSize}
                        onChange={(event) => onPageSizeChange(Number(event.target.value))}
                        aria-label="Itens por página"
                    >
                        {pageSizeOptions.map((opt) => (
                            <option key={opt} value={opt}>
                                {opt} / página
                            </option>
                        ))}
                    </select>
                )}
            </div>
        </div>
    );
}
