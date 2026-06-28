import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OffsetPage } from "@/query/pagination";

import type { DataProvider } from "./create-data-provider";
import { TempestDataProvider, useDataProvider } from "./data-provider-context";
import { useCreate, useDelete, useList, useOne, useUpdate } from "./use-resource";

interface User {
    id: number;
    name: string;
}

function page(items: User[]): OffsetPage<User> {
    return { items, total: items.length, page: 1, size: 20, pages: 1 };
}

function fakeProvider(overrides: Partial<DataProvider> = {}): DataProvider {
    return {
        getList: vi.fn(async () => page([{ id: 1, name: "Ada" }])),
        getOne: vi.fn(async () => ({ id: 1, name: "Ada" })),
        getMany: vi.fn(async () => [{ id: 1, name: "Ada" }]),
        create: vi.fn(async () => ({ id: 2, name: "Grace" })),
        update: vi.fn(async () => ({ id: 1, name: "Grace" })),
        deleteOne: vi.fn(async () => ({ id: 1, name: "Ada" })),
        ...overrides,
    } as unknown as DataProvider;
}

function makeWrapper(provider: DataProvider): {
    wrapper: ({ children }: { children: ReactNode }) => ReactNode;
    queryClient: QueryClient;
} {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <TempestDataProvider provider={provider}>{children}</TempestDataProvider>
        </QueryClientProvider>
    );
    return { wrapper, queryClient };
}

describe("useDataProvider", () => {
    it("throws when used outside a provider", () => {
        expect(() => renderHook(() => useDataProvider())).toThrow(/TempestDataProvider/);
    });
});

describe("useList", () => {
    it("returns the offset page from the provider", async () => {
        const provider = fakeProvider();
        const { wrapper } = makeWrapper(provider);

        const { result } = renderHook(() => useList<User>("users", { pagination: { page: 1 } }), {
            wrapper,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.items).toEqual([{ id: 1, name: "Ada" }]);
        expect(provider.getList).toHaveBeenCalledWith("users", { pagination: { page: 1 } });
    });
});

describe("useOne", () => {
    it("fetches a record by id", async () => {
        const provider = fakeProvider();
        const { wrapper } = makeWrapper(provider);

        const { result } = renderHook(() => useOne<User>("users", 1), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ id: 1, name: "Ada" });
        expect(provider.getOne).toHaveBeenCalledWith("users", 1);
    });

    it("is disabled when id is null", () => {
        const provider = fakeProvider();
        const { wrapper } = makeWrapper(provider);

        const { result } = renderHook(() => useOne<User>("users", null), { wrapper });

        expect(result.current.fetchStatus).toBe("idle");
        expect(provider.getOne).not.toHaveBeenCalled();
    });
});

describe("useCreate", () => {
    it("calls provider.create and invalidates the list", async () => {
        const provider = fakeProvider();
        const { wrapper, queryClient } = makeWrapper(provider);
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");

        const { result } = renderHook(() => useCreate<User>("users"), { wrapper });
        result.current.mutate({ name: "Grace" });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(provider.create).toHaveBeenCalledWith("users", { name: "Grace" });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["data", "users", "list"] });
    });
});

describe("useUpdate", () => {
    it("calls provider.update and invalidates list + the one", async () => {
        const provider = fakeProvider();
        const { wrapper, queryClient } = makeWrapper(provider);
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");

        const { result } = renderHook(() => useUpdate<User>("users"), { wrapper });
        result.current.mutate({ id: 1, data: { name: "Grace" } });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(provider.update).toHaveBeenCalledWith("users", 1, { name: "Grace" });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["data", "users", "list"] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["data", "users", "one", 1] });
    });
});

describe("useDelete", () => {
    it("calls provider.deleteOne and invalidates the list", async () => {
        const provider = fakeProvider();
        const { wrapper, queryClient } = makeWrapper(provider);
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");

        const { result } = renderHook(() => useDelete<User>("users"), { wrapper });
        result.current.mutate(1);

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(provider.deleteOne).toHaveBeenCalledWith("users", 1);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["data", "users", "list"] });
    });
});
