import { useCallback, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { QueryKey, UseQueryOptions } from "@tanstack/react-query";

import type { OffsetPage, OffsetParams } from "./pagination";

export interface UsePaginatedQueryOptions<T> extends Omit<
    UseQueryOptions<OffsetPage<T>, Error, OffsetPage<T>, QueryKey>,
    "queryKey" | "queryFn"
> {
    /** Base query key — the current page/sort is appended for cache isolation. */
    queryKey: QueryKey;
    /** Fetcher receiving the offset params; return the backend envelope. */
    queryFn: (params: OffsetParams) => Promise<OffsetPage<T>> | OffsetPage<T>;
    /** Initial 1-based page. Default: 1. */
    initialPage?: number;
    /** Page size. Default: 20. */
    pageSize?: number;
    /**
     * Query-param name for the page size. fastapi-pagination uses `"size"`
     * (default); SDK `BasePaginationFilterSchema` configs may use `"page_size"`.
     */
    sizeParam?: "size" | "page_size";
    /** Initial `order_by` (only sent when set). */
    orderBy?: string;
    /** Initial `ascending` (only sent when `orderBy` is set). Default: false. */
    ascending?: boolean;
}

export interface UsePaginatedQueryResult<T> {
    /** The current page envelope, or undefined while the first load is pending. */
    page: OffsetPage<T> | undefined;
    /** The rows of the current page (empty array while pending). */
    items: T[];
    /** Current 1-based page number (controlled by the hook). */
    pageNumber: number;
    /** Total page count from the last successful response. */
    pageCount: number;
    /** Total row count from the last successful response. */
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
    /** Jump to a specific 1-based page (clamped to >= 1). */
    setPage: (page: number) => void;
    /** Go to the next page when available. */
    next: () => void;
    /** Go to the previous page when available. */
    prev: () => void;
    /** Refetch the current page. */
    refetch: () => void;
}

/**
 * Offset-pagination hook over TanStack Query for the fastapi-pagination /
 * Tempest envelope (`{ items, total, page, size, pages }`).
 *
 * It owns the page state, sends `page` + the size param (`size` by default,
 * or `page_size` via `sizeParam`) plus optional `order_by`/`ascending` to your
 * fetcher, keeps the previous page visible while the next loads, and derives
 * `hasNext`/`hasPrev`/`pageCount`.
 *
 * @example
 * const users = usePaginatedQuery<User>({
 *     queryKey: ["users"],
 *     pageSize: 25,
 *     queryFn: (params) => usersService.listUsers(params),
 * });
 * // users.items, users.next(), users.hasNext, users.pageCount
 */
export function usePaginatedQuery<T>(
    options: UsePaginatedQueryOptions<T>,
): UsePaginatedQueryResult<T> {
    const {
        queryKey,
        queryFn,
        initialPage = 1,
        pageSize = 20,
        sizeParam = "size",
        orderBy,
        ascending = false,
        ...queryOptions
    } = options;

    const [pageNumber, setPageNumber] = useState(initialPage);

    const query = useQuery<OffsetPage<T>, Error>({
        ...queryOptions,
        queryKey: [...queryKey, { page: pageNumber, pageSize, sizeParam, orderBy, ascending }],
        queryFn: () => {
            const params: OffsetParams = { page: pageNumber, [sizeParam]: pageSize };
            if (orderBy) {
                params.order_by = orderBy;
                params.ascending = ascending;
            }
            return queryFn(params);
        },
        placeholderData: keepPreviousData,
    });

    const page = query.data;
    const pageCount = page?.pages ?? 0;
    const hasNext = pageNumber < pageCount;
    const hasPrev = pageNumber > 1;

    const setPage = useCallback((next: number) => setPageNumber(Math.max(1, next)), []);
    const next = useCallback(() => setPageNumber((p) => (p < pageCount ? p + 1 : p)), [pageCount]);
    const prev = useCallback(() => setPageNumber((p) => (p > 1 ? p - 1 : p)), []);

    return {
        page,
        items: page?.items ?? [],
        pageNumber,
        pageCount,
        total: page?.total ?? 0,
        hasNext,
        hasPrev,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        setPage,
        next,
        prev,
        refetch: () => void query.refetch(),
    };
}
