import { useCallback, useState } from "react";

export interface UsePaginationResult {
    page: number;
    size: number;
    setPage: (page: number) => void;
    setSize: (size: number) => void;
    reset: () => void;
}

/**
 * Manage page/size state for paginated lists. Reset goes back to page 1
 * without touching the page size.
 *
 * @param initialPage - Starting page (default 1).
 * @param initialSize - Starting page size (default 50).
 * @returns Pagination state and setters.
 */
export function usePagination(initialPage = 1, initialSize = 50): UsePaginationResult {
    const [page, setPage] = useState<number>(initialPage);
    const [size, setSize] = useState<number>(initialSize);

    const reset = useCallback(() => setPage(1), []);

    return { page, size, setPage, setSize, reset };
}
