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

describe("usePaginatedQuery — ordering and navigation clamps", () => {
    it("sends order_by and ascending when ordering is configured", async () => {
        const queryFn = vi.fn(async () => pageOf(1, 10, 30));
        const { result } = renderHook(
            () =>
                usePaginatedQuery({
                    queryKey: ["ordered"],
                    queryFn,
                    orderBy: "created_at",
                    ascending: false,
                }),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.page).toBeDefined());
        expect(queryFn).toHaveBeenCalledWith(
            expect.objectContaining({ order_by: "created_at", ascending: false }),
        );
    });

    it("omits ordering params when orderBy is absent", async () => {
        const queryFn = vi.fn(async () => pageOf(1, 10, 30));
        const { result } = renderHook(() => usePaginatedQuery({ queryKey: ["plain"], queryFn }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.page).toBeDefined());
        const params = queryFn.mock.calls[0][0] as Record<string, unknown>;
        expect(params.order_by).toBeUndefined();
        expect(params.ascending).toBeUndefined();
    });

    it("clamps setPage to the first page", async () => {
        const queryFn = vi.fn(async (params: { page: number }) => pageOf(params.page, 10, 30));
        const { result } = renderHook(() => usePaginatedQuery({ queryKey: ["clamp"], queryFn }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.page).toBeDefined());

        act(() => result.current.setPage(-3));
        await waitFor(() => expect(result.current.page?.page).toBe(1));
    });

    it("next() stops at the last page and prev() stops at the first", async () => {
        const queryFn = vi.fn(async (params: { page: number }) => pageOf(params.page, 10, 20));
        const { result } = renderHook(() => usePaginatedQuery({ queryKey: ["ends"], queryFn }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.page).toBeDefined());

        act(() => result.current.prev());
        await waitFor(() => expect(result.current.page?.page).toBe(1));

        act(() => result.current.next());
        await waitFor(() => expect(result.current.page?.page).toBe(2));
        act(() => result.current.next());
        await waitFor(() => expect(result.current.hasNext).toBe(false));
        expect(result.current.page?.page).toBe(2);
    });

    it("reports pageCount 0 before the first page resolves", () => {
        const queryFn = vi.fn(async () => pageOf(1, 10, 30));
        const { result } = renderHook(() => usePaginatedQuery({ queryKey: ["pending"], queryFn }), {
            wrapper: wrapper(),
        });
        expect(result.current.pageCount).toBe(0);
        expect(result.current.hasNext).toBe(false);
        expect(result.current.hasPrev).toBe(false);
    });
});
