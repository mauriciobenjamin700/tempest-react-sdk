import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OffsetPage } from "./pagination";
import { usePaginatedQuery } from "./use-paginated-query";

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

function pageOf(page: number, pageSize: number, total: number): OffsetPage<{ id: number }> {
    const pages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items = Array.from({ length: Math.min(pageSize, total - start) }, (_, i) => ({
        id: start + i,
    }));
    return { items, total, page, size: pageSize, pages };
}

describe("usePaginatedQuery", () => {
    it("loads the first page and derives pageCount/hasNext", async () => {
        const queryFn = vi.fn(async (p: { page?: number; size?: number }) =>
            pageOf(p.page ?? 1, p.size ?? 20, 45),
        );
        const { result } = renderHook(
            () => usePaginatedQuery<{ id: number }>({ queryKey: ["x"], pageSize: 20, queryFn }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.items).toHaveLength(20));
        expect(result.current.pageCount).toBe(3);
        expect(result.current.total).toBe(45);
        expect(result.current.hasNext).toBe(true);
        expect(result.current.hasPrev).toBe(false);
    });

    it("advances pages and sends page + size to the fetcher", async () => {
        const queryFn = vi.fn(async (p: { page?: number; size?: number }) =>
            pageOf(p.page ?? 1, p.size ?? 20, 45),
        );
        const { result } = renderHook(
            () => usePaginatedQuery<{ id: number }>({ queryKey: ["x"], pageSize: 20, queryFn }),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.items).toHaveLength(20));

        act(() => result.current.next());
        await waitFor(() => expect(result.current.pageNumber).toBe(2));
        await waitFor(() => expect(result.current.items[0].id).toBe(20));
        expect(result.current.hasPrev).toBe(true);
        expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({ page: 2, size: 20 }));
    });

    it("uses page_size as the size param when configured", async () => {
        const queryFn = vi.fn(async (p: { page_size?: number }) => pageOf(1, p.page_size ?? 20, 5));
        renderHook(
            () =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["y"],
                    pageSize: 10,
                    sizeParam: "page_size",
                    queryFn,
                }),
            { wrapper: wrapper() },
        );
        await waitFor(() =>
            expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({ page_size: 10 })),
        );
    });
});
