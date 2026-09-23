import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OffsetPage, OffsetParams } from "./pagination";
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
        const queryFn = vi.fn(async (_params: OffsetParams) => pageOf(1, 10, 30));
        const { result } = renderHook(() => usePaginatedQuery({ queryKey: ["plain"], queryFn }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.page).toBeDefined());
        const params = queryFn.mock.calls[0]![0] as Record<string, unknown>;
        expect(params.order_by).toBeUndefined();
        expect(params.ascending).toBeUndefined();
    });

    it("clamps setPage to the first page", async () => {
        const queryFn = vi.fn(async (params: OffsetParams) => pageOf(Number(params.page), 10, 30));
        const { result } = renderHook(() => usePaginatedQuery({ queryKey: ["clamp"], queryFn }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.page).toBeDefined());

        act(() => result.current.setPage(-3));
        await waitFor(() => expect(result.current.page?.page).toBe(1));
    });

    it("next() stops at the last page and prev() stops at the first", async () => {
        const queryFn = vi.fn(async (params: OffsetParams) => pageOf(Number(params.page), 10, 20));
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

    it("refetches the current page on demand", async () => {
        const queryFn = vi.fn(async (p: { page?: number; size?: number }) =>
            pageOf(p.page ?? 1, p.size ?? 20, 45),
        );
        const { result } = renderHook(
            () => usePaginatedQuery<{ id: number }>({ queryKey: ["x"], pageSize: 20, queryFn }),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.items).toHaveLength(20));

        act(() => result.current.refetch());

        await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    });
});

describe("usePaginatedQuery — a new filter starts from the first page", () => {
    /**
     * Before 0.68.0 the page survived a key change: on page 7 of an unfiltered list,
     * applying `code: "AUTH"` requested `AUTH:page=7` of a two-page result and
     * rendered an empty table (#356). The reset now happens in the same render as
     * the key change, so the stale page never reaches the fetcher.
     */
    it("never requests the previous page number for a new query key", async () => {
        const calls: string[] = [];
        const { result, rerender } = renderHook(
            ({ code }: { code: string }) =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["logs", { code }],
                    pageSize: 10,
                    queryFn: async (p) => {
                        calls.push(`${code}:page=${p.page}`);
                        return pageOf(p.page ?? 1, 10, code ? 20 : 100);
                    },
                }),
            { wrapper: wrapper(), initialProps: { code: "" } },
        );
        await waitFor(() => expect(result.current.items).toHaveLength(10));
        act(() => result.current.setPage(7));
        await waitFor(() => expect(result.current.page?.page).toBe(7));

        rerender({ code: "AUTH" });

        await waitFor(() => expect(result.current.page?.page).toBe(1));
        expect(result.current.pageNumber).toBe(1);
        expect(calls).toEqual([":page=1", ":page=7", "AUTH:page=1"]);
    });

    it("keeps the page when the query key is structurally the same", async () => {
        const queryFn = vi.fn(async (p: OffsetParams) => pageOf(p.page ?? 1, 10, 100));
        const { result, rerender } = renderHook(
            ({ code }: { code: string }) =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["logs", { code }],
                    pageSize: 10,
                    queryFn,
                }),
            { wrapper: wrapper(), initialProps: { code: "AUTH" } },
        );
        await waitFor(() => expect(result.current.items).toHaveLength(10));
        act(() => result.current.setPage(3));
        await waitFor(() => expect(result.current.page?.page).toBe(3));

        rerender({ code: "AUTH" });

        expect(result.current.pageNumber).toBe(3);
    });

    it("navigates from page 1 of the new key after a reset", async () => {
        const { result, rerender } = renderHook(
            ({ code }: { code: string }) =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["logs", { code }],
                    pageSize: 10,
                    queryFn: async (p) => pageOf(p.page ?? 1, 10, 100),
                }),
            { wrapper: wrapper(), initialProps: { code: "" } },
        );
        await waitFor(() => expect(result.current.items).toHaveLength(10));
        act(() => result.current.setPage(5));
        await waitFor(() => expect(result.current.page?.page).toBe(5));
        rerender({ code: "AUTH" });
        await waitFor(() => expect(result.current.page?.page).toBe(1));

        act(() => result.current.next());
        await waitFor(() => expect(result.current.page?.page).toBe(2));
        act(() => result.current.prev());
        await waitFor(() => expect(result.current.page?.page).toBe(1));
    });
});
