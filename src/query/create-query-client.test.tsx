import type { ReactNode } from "react";
import { onlineManager, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CACHE_TIME, STALE_TIME } from "./constants";
import { createQueryClient } from "./create-query-client";
import { shouldRetryQuery } from "./retry-policy";

describe("createQueryClient", () => {
    afterEach(() => {
        onlineManager.setOnline(true);
    });

    it("applies the SDK defaults an app would otherwise retype", () => {
        const options = createQueryClient().getDefaultOptions();

        expect(options.queries).toMatchObject({
            staleTime: STALE_TIME.DEFAULT,
            gcTime: CACHE_TIME.DEFAULT,
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
        });
        expect(options.mutations).toMatchObject({ retry: 0 });
    });

    it("merges overrides per key, keeping the defaults it does not name", () => {
        const options = createQueryClient({
            queries: { staleTime: STALE_TIME.LONG },
            mutations: { retry: 2 },
        }).getDefaultOptions();

        expect(options.queries).toMatchObject({
            staleTime: STALE_TIME.LONG,
            gcTime: CACHE_TIME.DEFAULT,
            retry: shouldRetryQuery,
        });
        expect(options.mutations).toMatchObject({ retry: 2 });
    });

    it("returns a new client per call, so clearing one leaves the other", () => {
        const first = createQueryClient();
        const second = createQueryClient();
        second.setQueryData(["k"], 1);

        first.clear();

        expect(first).not.toBe(second);
        expect(second.getQueryData(["k"])).toBe(1);
    });

    /**
     * #723 measured: offline, a query on the default `networkMode` ran its
     * `queryFn` 0 times and stayed `pending`/`paused`; with `"always"` (or
     * `"offlineFirst"`) it ran once and succeeded. The default is kept on
     * purpose — a query that does reach the network should pause, not burn a
     * failing request — so a query that reads only IndexedDB opts in.
     */
    it("keeps network queries paused offline and lets an IndexedDB query opt in with always", async () => {
        onlineManager.setOnline(false);
        const queryClient = createQueryClient();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const network = vi.fn(async () => "remote");
        const local = vi.fn(async () => "indexeddb");

        const { result } = renderHook(
            () => ({
                network: useQuery({ queryKey: ["network"], queryFn: network }),
                local: useQuery({ queryKey: ["local"], queryFn: local, networkMode: "always" }),
            }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.local.data).toBe("indexeddb"));

        expect(network).not.toHaveBeenCalled();
        expect(result.current.network.fetchStatus).toBe("paused");
        expect(local).toHaveBeenCalledTimes(1);
    });
});
