import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DefaultOptions } from "@tanstack/react-query";
import { STALE_TIME, CACHE_TIME } from "./constants";
import { shouldRetryQuery } from "./retry-policy";
import { warnOnForeignClient } from "./foreign-client-warning";

export interface QueryProviderProps {
    children: ReactNode;
    /** Pass an existing client to share it across roots. */
    client?: QueryClient;
    /** Overrides for the default options applied when no `client` is provided. */
    defaultOptions?: DefaultOptions;
}

/**
 * Wrapper around `QueryClientProvider` that bootstraps a `QueryClient` with
 * sane SDK defaults (5-minute stale time, 30-minute gc time, one retry for
 * failures worth replaying).
 *
 * Retries follow {@link shouldRetryQuery} rather than a flat count: a 4xx other
 * than 408/429 is the server refusing on purpose, and replaying it only doubles
 * the network log while the spinner keeps turning.
 */
export function QueryProvider({ children, client, defaultOptions }: QueryProviderProps) {
    warnOnForeignClient(client);

    const [internalClient] = useState<QueryClient>(
        () =>
            client ??
            new QueryClient({
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
            }),
    );

    return <QueryClientProvider client={internalClient}>{children}</QueryClientProvider>;
}
