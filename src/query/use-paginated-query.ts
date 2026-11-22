import { useCallback, useState } from "react";
import { hashKey, keepPreviousData, useQuery } from "@tanstack/react-query";
import type { QueryKey, UseQueryOptions } from "@tanstack/react-query";

import { useLatestRef } from "@/hooks/use-latest-ref";

import type { OffsetPage, OffsetParams } from "./pagination";

export interface UsePaginatedQueryOptions<T> extends Omit<
    UseQueryOptions<OffsetPage<T>, Error, OffsetPage<T>, QueryKey>,
    "queryKey" | "queryFn"
> {
    /**
     * Base query key — the current page/sort is appended for cache isolation.
     * Put the applied filters here: when the key changes structurally, the page
     * goes back to 1 in the same render.
     */
    queryKey: QueryKey;
    /** Fetcher receiving the offset params; return the backend envelope. */
    queryFn: (params: OffsetParams) => Promise<OffsetPage<T>> | OffsetPage<T>;
    /** Initial 1-based page. Default: 1. Ignored when `page` is controlled. */
    initialPage?: number;
    /**
     * The current 1-based page, controlled — typically read from the URL. The
     * hook then holds no page of its own: `setPage`/`next`/`prev` report through
     * `onPageChange`, and a new `queryKey` does **not** reset the page, because
     * the caller owns it (write the filter and `page: 1` in the same update —
     * `useUrlState` does both in one URL change).
     */
    page?: number;
    /** Receives the page `setPage`/`next`/`prev` ask for. Pair it with `page`. */
    onPageChange?: (page: number) => void;
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
    /** Current 1-based page number (controlled by the hook; back to 1 on a new `queryKey`). */
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
 * It owns the page state — unless `page` is passed, and then the caller does
 * (the URL, via `useUrlState`) — sends `page` + the size param (`size` by default,
 * or `page_size` via `sizeParam`) plus optional `order_by`/`ascending` to your
 * fetcher, keeps the previous page visible while the next loads, and derives
 * `hasNext`/`hasPrev`/`pageCount`.
 *
 * A structurally different `queryKey` (compared with TanStack's `hashKey`) is a
 * different result set, so the page returns to 1. The reset is applied during
 * render rather than in an effect: an effect would let one render go out with the
 * new key and the old page, and that render is a request — on page 7 of an
 * unfiltered list, applying a filter used to ask for page 7 of a two-page result
 * and show an empty table (#356).
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
        page: controlledPage,
        onPageChange,
        pageSize = 20,
        sizeParam = "size",
        orderBy,
        ascending = false,
        ...queryOptions
    } = options;

    const keyHash = hashKey(queryKey);
    const [paging, setPaging] = useState({ keyHash, page: initialPage });
    if (paging.keyHash !== keyHash) setPaging({ keyHash, page: 1 });
    const ownPage = paging.keyHash === keyHash ? paging.page : 1;
    const pageNumber = controlledPage === undefined ? ownPage : Math.max(1, controlledPage);
    const onPageChangeRef = useLatestRef(onPageChange);
    const controlled = controlledPage !== undefined;

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

    const setPage = useCallback(
        (next: number) => {
            if (controlled) onPageChangeRef.current?.(Math.max(1, next));
            else setPaging((s) => ({ ...s, page: Math.max(1, next) }));
        },
        [controlled, onPageChangeRef],
    );
    const next = useCallback(() => {
        if (controlled) {
            if (pageNumber < pageCount) onPageChangeRef.current?.(pageNumber + 1);
            return;
        }
        setPaging((s) => (s.page < pageCount ? { ...s, page: s.page + 1 } : s));
    }, [controlled, pageNumber, pageCount, onPageChangeRef]);
    const prev = useCallback(() => {
        if (controlled) {
            if (pageNumber > 1) onPageChangeRef.current?.(pageNumber - 1);
            return;
        }
        setPaging((s) => (s.page > 1 ? { ...s, page: s.page - 1 } : s));
    }, [controlled, pageNumber, onPageChangeRef]);

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
