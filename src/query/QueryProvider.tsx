import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DefaultOptions } from "@tanstack/react-query";
import { STALE_TIME, CACHE_TIME } from "./constants";

export interface QueryProviderProps {
    children: ReactNode;
    /** Pass an existing client to share it across roots. */
    client?: QueryClient;
    /** Overrides for the default options applied when no `client` is provided. */
    defaultOptions?: DefaultOptions;
}

/**
 * Wrapper around `QueryClientProvider` that bootstraps a `QueryClient` with
 * sane SDK defaults (5-minute stale time, 30-minute gc time, 1 retry).
 */
export function QueryProvider({ children, client, defaultOptions }: QueryProviderProps) {
    const [internalClient] = useState<QueryClient>(() =>
        client ??
        new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: STALE_TIME.DEFAULT,
                    gcTime: CACHE_TIME.DEFAULT,
                    retry: 1,
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
