import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CursorPage } from "./pagination";
import { useCursorQuery } from "./use-cursor-query";

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

describe("useCursorQuery", () => {
    it("walks batches via next_cursor until has_more is false", async () => {
        const batches: Record<string, CursorPage<{ id: number }>> = {
            start: { items: [{ id: 1 }], next_cursor: "c2", has_more: true, limit: 1 },
            c2: { items: [{ id: 2 }], next_cursor: null, has_more: false, limit: 1 },
        };
        const queryFn = vi.fn(
            async (p: { cursor?: string | null }) => batches[p.cursor ?? "start"],
        );

        const { result } = renderHook(
            () => useCursorQuery<{ id: number }>({ queryKey: ["feed"], limit: 1, queryFn }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.items).toEqual([{ id: 1 }]));
        expect(result.current.hasNextPage).toBe(true);

        act(() => result.current.fetchNextPage());
        await waitFor(() => expect(result.current.items).toEqual([{ id: 1 }, { id: 2 }]));
        await waitFor(() => expect(result.current.hasNextPage).toBe(false));

        // First call uses the null initial cursor, second uses "c2".
        expect(queryFn).toHaveBeenNthCalledWith(1, expect.objectContaining({ cursor: null }));
        expect(queryFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "c2" }));
    });
});
