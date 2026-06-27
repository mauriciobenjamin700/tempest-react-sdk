import { useInfiniteQuery } from "@tanstack/react-query";
import type { InfiniteData, QueryKey, UseInfiniteQueryOptions } from "@tanstack/react-query";

import type { CursorPage, CursorParams } from "./pagination";

export interface UseCursorQueryOptions<T> extends Omit<
    UseInfiniteQueryOptions<
        CursorPage<T>,
        Error,
        InfiniteData<CursorPage<T>, string | null>,
        QueryKey,
        string | null
    >,
    "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"
> {
    /** Base query key — `limit`/sort is appended for cache isolation. */
    queryKey: QueryKey;
    /** Fetcher receiving the cursor params; return the backend envelope. */
    queryFn: (params: CursorParams) => Promise<CursorPage<T>> | CursorPage<T>;
    /** Batch size sent as `limit`. Default: 20. */
    limit?: number;
    /** Initial `order_by`. */
    orderBy?: string;
    /** Initial `ascending`. Default: false. */
    ascending?: boolean;
}

export interface UseCursorQueryResult<T> {
    /** All rows fetched so far, flattened across batches. */
    items: T[];
    /** The raw batches, in fetch order. */
    pages: CursorPage<T>[];
    hasNextPage: boolean;
    isLoading: boolean;
    isFetchingNextPage: boolean;
    error: Error | null;
    /** Fetch the next batch (no-op when exhausted). */
    fetchNextPage: () => void;
    /** Refetch from the first batch. */
    refetch: () => void;
}

/**
 * Cursor-pagination hook over TanStack Query's `useInfiniteQuery` for the
 * Tempest `CursorPaginationSchema` envelope
 * (`{ items, next_cursor, has_more, limit }`).
 *
 * The opaque `next_cursor` is fed straight back as the next page param; the
 * loop stops when `has_more` is false (or `next_cursor` is null).
 *
 * @example
 * const feed = useCursorQuery<Post>({
 *     queryKey: ["feed"],
 *     limit: 30,
 *     queryFn: (params) => postsService.listPosts(params),
 * });
 * // feed.items, feed.fetchNextPage(), feed.hasNextPage
 */
export function useCursorQuery<T>(options: UseCursorQueryOptions<T>): UseCursorQueryResult<T> {
    const { queryKey, queryFn, limit = 20, orderBy, ascending = false, ...queryOptions } = options;

    const query = useInfiniteQuery<
        CursorPage<T>,
        Error,
        InfiniteData<CursorPage<T>, string | null>,
        QueryKey,
        string | null
    >({
        ...queryOptions,
        queryKey: [...queryKey, { limit, orderBy, ascending }],
        initialPageParam: null,
        queryFn: ({ pageParam }) =>
            queryFn({ cursor: pageParam, limit, order_by: orderBy, ascending }),
        getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    });

    const pages = query.data?.pages ?? [];

    return {
        items: pages.flatMap((p) => p.items),
        pages,
        hasNextPage: query.hasNextPage,
        isLoading: query.isLoading,
        isFetchingNextPage: query.isFetchingNextPage,
        error: query.error,
        fetchNextPage: () => void query.fetchNextPage(),
        refetch: () => void query.refetch(),
    };
}
