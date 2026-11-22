import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OffsetPage } from "@/query/pagination";

import type { DataProvider } from "./create-data-provider";
import { TempestDataProvider, useDataProvider } from "./data-provider-context";
import {
    listQueryKey,
    useCreate,
    useDelete,
    useDeleteMany,
    useList,
    useOne,
    useUpdate,
} from "./use-resource";

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

/**
 * #699: until 0.92.0 the hooks spread `options` over their own `onSuccess`, so
 * an app `onSuccess` replaced the invalidation — measured 0 `invalidateQueries`
 * calls for each of the three hooks. The order is part of the contract the docs
 * state: the SDK starts the invalidation, then the app's callback runs.
 */
describe("mutation hooks — the app onSuccess does not replace the invalidation", () => {
    function track(queryClient: QueryClient): {
        order: string[];
        appOnSuccess: ReturnType<typeof vi.fn<(data: unknown) => void>>;
    } {
        const order: string[] = [];
        const original = queryClient.invalidateQueries.bind(queryClient);
        vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) => {
            order.push(`invalidate ${JSON.stringify(filters?.queryKey)}`);
            return original(filters);
        });
        const appOnSuccess = vi.fn<(data: unknown) => void>(() => {
            order.push("app");
        });
        return { order, appOnSuccess };
    }

    it("useCreate invalidates the list and then calls the app onSuccess", async () => {
        const { wrapper, queryClient } = makeWrapper(fakeProvider());
        const { order, appOnSuccess } = track(queryClient);

        const { result } = renderHook(() => useCreate<User>("users", { onSuccess: appOnSuccess }), {
            wrapper,
        });
        await act(async () => {
            await result.current.mutateAsync({ name: "Grace" });
        });

        expect(order).toEqual(['invalidate ["data","users","list"]', "app"]);
        expect(appOnSuccess.mock.calls[0][0]).toEqual({ id: 2, name: "Grace" });
    });

    it("useUpdate invalidates the list and the record and then calls the app onSuccess", async () => {
        const { wrapper, queryClient } = makeWrapper(fakeProvider());
        const { order, appOnSuccess } = track(queryClient);

        const { result } = renderHook(() => useUpdate<User>("users", { onSuccess: appOnSuccess }), {
            wrapper,
        });
        await act(async () => {
            await result.current.mutateAsync({ id: 1, data: { name: "Grace" } });
        });

        expect(order).toEqual([
            'invalidate ["data","users","list"]',
            'invalidate ["data","users","one",1]',
            "app",
        ]);
    });

    it("useDelete invalidates the list and then calls the app onSuccess", async () => {
        const { wrapper, queryClient } = makeWrapper(fakeProvider());
        const { order, appOnSuccess } = track(queryClient);

        const { result } = renderHook(() => useDelete<User>("users", { onSuccess: appOnSuccess }), {
            wrapper,
        });
        await act(async () => {
            await result.current.mutateAsync(1);
        });

        expect(order).toEqual(['invalidate ["data","users","list"]', "app"]);
    });

    it("keeps the other app options, such as onError", async () => {
        const failure = new Error("boom");
        const provider = fakeProvider({ create: vi.fn(async () => Promise.reject(failure)) });
        const { wrapper } = makeWrapper(provider);
        const onError = vi.fn();

        const { result } = renderHook(() => useCreate<User>("users", { onError }), { wrapper });
        await act(async () => {
            await result.current.mutateAsync({}).catch(() => undefined);
        });

        expect(onError.mock.calls[0][0]).toBe(failure);
    });
});

/**
 * #700: until 0.92.0 `listQueryKey("posts")` was `["data", "posts", "list",
 * undefined]`, and as an `invalidateQueries` filter it matched 0 of the lists
 * `useList` mounts with params.
 */
describe("listQueryKey", () => {
    it("without params reaches a list mounted with pagination", async () => {
        const provider = fakeProvider();
        const { wrapper, queryClient } = makeWrapper(provider);
        const { result } = renderHook(
            () => useList<User>("posts", { pagination: { page: 2, pageSize: 10 } }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        await act(async () => {
            await queryClient.invalidateQueries({ queryKey: listQueryKey("posts") });
        });

        expect(provider.getList).toHaveBeenCalledTimes(2);
    });

    it("stops at the list segment without params and keeps the params when given", () => {
        expect(listQueryKey("posts")).toEqual(["data", "posts", "list"]);
        expect(listQueryKey("posts")).toHaveLength(3);
        expect(listQueryKey("posts", { pagination: { page: 1 } })).toEqual([
            "data",
            "posts",
            "list",
            { pagination: { page: 1 } },
        ]);
    });
});

/**
 * #715: deleting a selection with one `useDelete().mutateAsync` per id measured
 * 10 `invalidateQueries` and 10 `getList` refetches for 10 ids.
 */
describe("useDeleteMany", () => {
    const ids: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it("invalidates and refetches the mounted list once for ten ids", async () => {
        const provider = fakeProvider();
        const { wrapper, queryClient } = makeWrapper(provider);
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");
        const { result } = renderHook(
            () => ({
                list: useList<User>("users", { pagination: { page: 1 } }),
                remove: useDeleteMany<User>("users"),
            }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

        await act(async () => {
            await result.current.remove.mutateAsync(ids);
        });
        await waitFor(() => expect(result.current.list.isFetching).toBe(false));

        expect(provider.deleteOne).toHaveBeenCalledTimes(10);
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["data", "users", "list"] });
        expect(provider.getList).toHaveBeenCalledTimes(2);
    });

    it("resolves with the ids that failed instead of rejecting", async () => {
        const refused = new Error("open orders");
        const provider = fakeProvider({
            deleteOne: vi.fn(async (_resource: string, id: string | number) => {
                if (id === 2) throw refused;
                return { id, name: "x" };
            }) as unknown as DataProvider["deleteOne"],
        });
        const { wrapper } = makeWrapper(provider);

        const { result } = renderHook(() => useDeleteMany<User>("users"), { wrapper });
        let outcome: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
        await act(async () => {
            outcome = await result.current.mutateAsync([1, 2, 3]);
        });

        expect(outcome?.deleted.map((entry) => entry.id)).toEqual([1, 3]);
        expect(outcome?.failed).toEqual([{ id: 2, error: refused }]);
    });

    it("uses the provider deleteMany when it has one", async () => {
        const deleteMany = vi.fn(async () => ({ deleted: [], failed: [] }));
        const provider = fakeProvider({ deleteMany } as Partial<DataProvider>);
        const { wrapper } = makeWrapper(provider);

        const { result } = renderHook(() => useDeleteMany<User>("users"), { wrapper });
        await act(async () => {
            await result.current.mutateAsync([1, 2]);
        });

        expect(deleteMany).toHaveBeenCalledWith("users", [1, 2]);
        expect(provider.deleteOne).not.toHaveBeenCalled();
    });

    it("does not invalidate when the provider call itself throws", async () => {
        const failure = new Error("bulk endpoint down");
        const provider = fakeProvider({
            deleteMany: vi.fn(async () => Promise.reject(failure)),
        } as Partial<DataProvider>);
        const { wrapper, queryClient } = makeWrapper(provider);
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");

        const { result } = renderHook(() => useDeleteMany<User>("users"), { wrapper });
        await act(async () => {
            await result.current.mutateAsync([1]).catch(() => undefined);
        });

        await waitFor(() => expect(result.current.error).toBe(failure));
        expect(invalidate).not.toHaveBeenCalled();
    });

    it("invalidates once and then calls the app onSuccess", async () => {
        const { wrapper, queryClient } = makeWrapper(fakeProvider());
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");
        const onSuccess = vi.fn();

        const { result } = renderHook(() => useDeleteMany<User>("users", { onSuccess }), {
            wrapper,
        });
        await act(async () => {
            await result.current.mutateAsync([1, 2]);
        });

        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(
            onSuccess.mock.invocationCallOrder[0],
        );
    });
});
