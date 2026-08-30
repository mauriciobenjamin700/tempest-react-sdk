/**
 * @tempest-limits props-count — page/totalPages/onPageChange is the pager,
 * pageSize/onPageSizeChange/ pageSizeOptions is the size control that sits in the
 * same bar, and totalItems plus siblingCount decide the copy and how many page
 * buttons are rendered. They ship together because a footer that pages but cannot
 * resize is half a footer.
 */
import { useEffect, useMemo, useRef } from "react";
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
    /** Pages kept around the current one; ~`siblingCount + 4` buttons render. Default 3. */
    siblingCount?: number;
    /**
     * Below 640px, drop to `‹` / `›` plus the summary and hide the numbered
     * buttons and the size select. Default `true`.
     *
     * The default suits a desktop-first app, and costs the thing pagination is
     * for on a phone: reaching page 7 becomes six taps on "next" instead of one
     * tap on `7`. Pass `false` in a mobile-first app and the numbers stay at
     * every width — the row scrolls horizontally by itself rather than pushing
     * the page wider, and the current page is scrolled into view when it
     * changes.
     */
    compactOnMobile?: boolean;
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
 *
 * Narrow screens collapse to `‹` / `›` plus the summary by default, which turns
 * random access into sequential access — fine for a desktop-first app, wrong for
 * one whose traffic is phones. `compactOnMobile={false}` keeps the numbers at
 * every width: the row scrolls on its own instead of widening the page, and the
 * effect below keeps the current page inside the visible part of that row.
 *
 * The scroll is why this is one boolean rather than a `variant`. Simply
 * un-hiding the buttons would push a nine-button row past a 360px viewport and
 * give the whole document a horizontal scrollbar — the opt-out has to carry its
 * own layout, so it does.
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
    compactOnMobile = true,
    className,
}: PaginationProps) {
    const pages = useMemo(
        () => buildRange(page, totalPages, siblingCount),
        [page, totalPages, siblingCount],
    );
    const activePage = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (compactOnMobile) return;
        activePage.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }, [page, compactOnMobile]);

    if (totalPages <= 1 && !onPageSizeChange) return null;

    return (
        <div className={cn(styles.wrapper, className)} data-compact={String(compactOnMobile)}>
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
                            ref={entry === page ? activePage : undefined}
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
