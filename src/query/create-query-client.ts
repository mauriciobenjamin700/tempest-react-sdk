import { QueryClient } from "@tanstack/react-query";
import type { DefaultOptions } from "@tanstack/react-query";

import { CACHE_TIME, STALE_TIME } from "./constants";
import { shouldRetryQuery } from "./retry-policy";

/**
 * Create a `QueryClient` with the SDK defaults — the same client
 * {@link QueryProvider} builds when it gets no `client`.
 *
 * Queries: 5-minute `staleTime` ({@link STALE_TIME}.DEFAULT), 30-minute
 * `gcTime` ({@link CACHE_TIME}.DEFAULT), `retry` by {@link shouldRetryQuery},
 * no refetch on window focus. Mutations: no retry. `defaultOptions` is merged
 * per group (`queries`, `mutations`) over those defaults, key by key.
 *
 * Use it when the app needs the client outside React: `queryClient.clear()` in
 * an auth `onSessionEnd`, `persistQueryClientOffline({ queryClient })`, a
 * prefetch in a router loader. Building it with `new QueryClient()` instead
 * loses the defaults, and retyping them drifts the day one of them changes.
 * The client also comes from the SDK's own copy of `@tanstack/react-query`, so
 * it cannot trip the duplicate-copy "No QueryClient set" failure that
 * {@link QueryProvider} warns about.
 *
 * `networkMode` stays TanStack's `"online"`: a query that reaches the network
 * pauses offline instead of failing. A query whose `queryFn` reads only
 * IndexedDB passes `networkMode: "always"` itself (see the query docs).
 *
 * @param defaultOptions - Overrides merged over the SDK defaults.
 * @returns A new `QueryClient`.
 *
 * @example
 * export const queryClient = createQueryClient();
 * const auth = createTempestAuth({ baseURL, onSessionEnd: () => queryClient.clear() });
 * <QueryProvider client={queryClient}>…</QueryProvider>;
 */
export function createQueryClient(defaultOptions?: DefaultOptions): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: STALE_TIME.DEFAULT,
                gcTime: CACHE_TIME.DEFAULT,
                retry: shouldRetryQuery,
                refetchOnWindowFocus: false,
                ...(defaultOptions?.queries ?? {}),
            },
            mutations: {
                retry: 0,
                ...(defaultOptions?.mutations ?? {}),
            },
        },
    });
}
