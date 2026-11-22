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

function pageOf(page: number, size: number, total: number): OffsetPage<{ id: number }> {
    const start = (page - 1) * size;
    const items = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => ({
        id: start + i,
    }));
    return { items, total, page, size, pages: Math.ceil(total / size) };
}

/**
 * A controlled `page` is what lets the page live in the URL (#714): before it,
 * `initialPage` was read once and the back button could not move the list.
 */
describe("usePaginatedQuery with a controlled page", () => {
    it("requests the page it is given, and follows it when it changes from outside", async () => {
        const queryFn = vi.fn(async (p: OffsetParams) => pageOf(p.page ?? 1, 10, 45));
        const { result, rerender } = renderHook(
            ({ page }: { page: number }) =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["c"],
                    pageSize: 10,
                    queryFn,
                    page,
                    onPageChange: () => {},
                }),
            { wrapper: wrapper(), initialProps: { page: 3 } },
        );
        await waitFor(() => expect(result.current.items[0]?.id).toBe(20));
        expect(result.current.pageNumber).toBe(3);

        rerender({ page: 2 });
        await waitFor(() => expect(result.current.items[0]?.id).toBe(10));
        expect(queryFn.mock.calls.map(([p]) => p.page)).toEqual([3, 2]);
    });

    it("reports setPage, next and prev through onPageChange instead of moving on its own", async () => {
        const onPageChange = vi.fn();
        const queryFn = vi.fn(async (p: OffsetParams) => pageOf(p.page ?? 1, 10, 45));
        const { result } = renderHook(
            () =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["c"],
                    pageSize: 10,
                    queryFn,
                    page: 2,
                    onPageChange,
                }),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.pageCount).toBe(5));

        act(() => result.current.next());
        act(() => result.current.prev());
        act(() => result.current.setPage(-4));
        expect(onPageChange.mock.calls).toEqual([[3], [1], [1]]);
        expect(result.current.pageNumber).toBe(2);
    });

    it("does not report past the last or before the first page", async () => {
        const onPageChange = vi.fn();
        const queryFn = vi.fn(async (p: OffsetParams) => pageOf(p.page ?? 1, 10, 20));
        const { result, rerender } = renderHook(
            ({ page }: { page: number }) =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["c"],
                    pageSize: 10,
                    queryFn,
                    page,
                    onPageChange,
                }),
            { wrapper: wrapper(), initialProps: { page: 2 } },
        );
        await waitFor(() => expect(result.current.pageCount).toBe(2));
        act(() => result.current.next());
        rerender({ page: 1 });
        act(() => result.current.prev());
        expect(onPageChange).not.toHaveBeenCalled();
    });

    it("keeps the caller's page when the query key changes — the caller resets it", async () => {
        const queryFn = vi.fn(async (p: OffsetParams) => pageOf(p.page ?? 1, 10, 45));
        const { result, rerender } = renderHook(
            ({ term }: { term: string }) =>
                usePaginatedQuery<{ id: number }>({
                    queryKey: ["c", term],
                    pageSize: 10,
                    queryFn,
                    page: 4,
                    onPageChange: () => {},
                }),
            { wrapper: wrapper(), initialProps: { term: "" } },
        );
        await waitFor(() => expect(result.current.items).toHaveLength(10));
        rerender({ term: "café" });
        expect(result.current.pageNumber).toBe(4);
    });
});
