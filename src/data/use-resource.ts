import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    UseMutationOptions,
    UseMutationResult,
    UseQueryOptions,
    UseQueryResult,
} from "@tanstack/react-query";

import type { OffsetPage } from "@/query/pagination";

import { deleteEach } from "./create-data-provider";
import type { DeleteManyResult, GetListParams } from "./create-data-provider";
import { useDataProvider } from "./data-provider-context";

/** Extra TanStack Query options for {@link useList} (key + fn are provided). */
export type UseListOptions<T> = Omit<
    UseQueryOptions<OffsetPage<T>, Error, OffsetPage<T>>,
    "queryKey" | "queryFn"
>;

/** Extra TanStack Query options for {@link useOne} (key + fn + enabled are provided). */
export type UseOneOptions<T> = Omit<
    UseQueryOptions<T, Error, T>,
    "queryKey" | "queryFn" | "enabled"
> & { enabled?: boolean };

/**
 * Build the cache key for a resource list query.
 *
 * Without `params` the key stops at `"list"`, so it is the prefix of every list
 * of the resource and `invalidateQueries({ queryKey: listQueryKey("posts") })`
 * reaches all of them. Until 0.92.0 it ended in a literal `undefined`, which
 * TanStack's partial match compares like any other element: the filter matched
 * only a list mounted without params, i.e. none of the paginated ones (#700).
 *
 * @param resource - The resource name.
 * @param params - The list params (page/sort/filters).
 * @returns A stable TanStack Query key.
 */
export function listQueryKey(resource: string, params?: GetListParams): unknown[] {
    return params === undefined ? ["data", resource, "list"] : ["data", resource, "list", params];
}

/**
 * Build the cache key for a single-record query.
 *
 * @param resource - The resource name.
 * @param id - The record id.
 * @returns A stable TanStack Query key.
 */
export function oneQueryKey(resource: string, id: string | number | null | undefined): unknown[] {
    return ["data", resource, "one", id];
}

/**
 * Query a paginated list of a resource through the active {@link useDataProvider}.
 *
 * @param resource - The resource name.
 * @param params - Pagination, sort and filter parameters.
 * @param options - Extra TanStack Query options.
 * @returns The TanStack Query result for the offset page.
 */
export function useList<T>(
    resource: string,
    params?: GetListParams,
    options?: UseListOptions<T>,
): UseQueryResult<OffsetPage<T>, Error> {
    const provider = useDataProvider();
    return useQuery<OffsetPage<T>, Error>({
        queryKey: listQueryKey(resource, params),
        queryFn: () => provider.getList<T>(resource, params),
        ...options,
    });
}

/**
 * Query a single record by id through the active {@link useDataProvider}.
 *
 * The query is disabled while `id` is `null`/`undefined`.
 *
 * @param resource - The resource name.
 * @param id - The record id.
 * @param options - Extra TanStack Query options.
 * @returns The TanStack Query result for the record.
 */
export function useOne<T>(
    resource: string,
    id: string | number | null | undefined,
    options?: UseOneOptions<T>,
): UseQueryResult<T, Error> {
    const provider = useDataProvider();
    const { enabled, ...rest } = options ?? {};
    return useQuery<T, Error>({
        queryKey: oneQueryKey(resource, id),
        queryFn: () => provider.getOne<T>(resource, id as string | number),
        enabled: id != null && (enabled ?? true),
        ...rest,
    });
}

/**
 * Options for the create mutation. `mutationFn` is the SDK's; `onSuccess` runs
 * after the SDK starts the list invalidation, never instead of it.
 */
export type UseCreateOptions<T> = Omit<UseMutationOptions<T, Error, unknown>, "mutationFn">;

/**
 * Create a record and invalidate the resource list cache on success.
 *
 * The app's `onSuccess` is taken out of `options` and chained after the
 * invalidation: spread on top, as it was until 0.92.0, it replaced the SDK's
 * handler and the list stayed stale after every create (#699).
 *
 * @param resource - The resource name.
 * @param options - Extra TanStack Mutation options.
 * @returns The mutation; `mutate(data)` creates the record.
 */
export function useCreate<T>(
    resource: string,
    options?: UseCreateOptions<T>,
): UseMutationResult<T, Error, unknown> {
    const provider = useDataProvider();
    const queryClient = useQueryClient();
    const { onSuccess, ...rest } = options ?? {};
    return useMutation<T, Error, unknown>({
        ...rest,
        mutationFn: (data: unknown) => provider.create<T>(resource, data),
        onSuccess: (...args) => {
            void queryClient.invalidateQueries({ queryKey: listQueryKey(resource) });
            return onSuccess?.(...args);
        },
    });
}

/** Variables accepted by the update mutation. */
export interface UpdateVariables {
    /** The record id to update. */
    id: string | number;
    /** The update payload. */
    data: unknown;
}

/**
 * Options for the update mutation. `mutationFn` is the SDK's; `onSuccess` runs
 * after the SDK starts the list and record invalidations, never instead of them.
 */
export type UseUpdateOptions<T> = Omit<UseMutationOptions<T, Error, UpdateVariables>, "mutationFn">;

/**
 * Update a record and invalidate both the list and the single-record caches.
 *
 * The app's `onSuccess` is chained after the invalidations, not spread over
 * them (#699).
 *
 * @param resource - The resource name.
 * @param options - Extra TanStack Mutation options.
 * @returns The mutation; `mutate({ id, data })` updates the record.
 */
export function useUpdate<T>(
    resource: string,
    options?: UseUpdateOptions<T>,
): UseMutationResult<T, Error, UpdateVariables> {
    const provider = useDataProvider();
    const queryClient = useQueryClient();
    const { onSuccess, ...rest } = options ?? {};
    return useMutation<T, Error, UpdateVariables>({
        ...rest,
        mutationFn: ({ id, data }: UpdateVariables) => provider.update<T>(resource, id, data),
        onSuccess: (...args) => {
            const [, variables] = args;
            void queryClient.invalidateQueries({ queryKey: listQueryKey(resource) });
            void queryClient.invalidateQueries({ queryKey: oneQueryKey(resource, variables.id) });
            return onSuccess?.(...args);
        },
    });
}

/**
 * Options for the delete mutation. `mutationFn` is the SDK's; `onSuccess` runs
 * after the SDK starts the list invalidation, never instead of it.
 */
export type UseDeleteOptions<T> = Omit<UseMutationOptions<T, Error, string | number>, "mutationFn">;

/**
 * Delete a record by id and invalidate the resource list cache on success.
 *
 * The app's `onSuccess` is chained after the invalidation, not spread over it
 * (#699). To delete a selection, use {@link useDeleteMany}: one `mutateAsync`
 * per id invalidates — and refetches — the list once per id.
 *
 * @param resource - The resource name.
 * @param options - Extra TanStack Mutation options.
 * @returns The mutation; `mutate(id)` deletes the record.
 */
export function useDelete<T>(
    resource: string,
    options?: UseDeleteOptions<T>,
): UseMutationResult<T, Error, string | number> {
    const provider = useDataProvider();
    const queryClient = useQueryClient();
    const { onSuccess, ...rest } = options ?? {};
    return useMutation<T, Error, string | number>({
        ...rest,
        mutationFn: (id: string | number) => provider.deleteOne<T>(resource, id),
        onSuccess: (...args) => {
            void queryClient.invalidateQueries({ queryKey: listQueryKey(resource) });
            return onSuccess?.(...args);
        },
    });
}

/**
 * Options for the bulk delete mutation. `mutationFn` is the SDK's; `onSuccess`
 * runs after the SDK starts the single list invalidation.
 */
export type UseDeleteManyOptions<T> = Omit<
    UseMutationOptions<DeleteManyResult<T>, Error, (string | number)[]>,
    "mutationFn"
>;

/**
 * Delete many records by id and invalidate the resource list cache **once**.
 *
 * Deleting a selection with one {@link useDelete} `mutateAsync` per id costs one
 * invalidation per id, and every one of them refetches the mounted list:
 * measured with 10 ids, 10 `invalidateQueries` and 10 `getList` calls. This
 * hook runs {@link DataProvider.deleteMany} (or one `deleteOne` per id when the
 * provider has none) and invalidates once, whatever the size of the selection.
 *
 * Each id settles on its own: the mutation resolves with which ids were
 * deleted and which failed, so a record the backend refuses does not hide the
 * ones that went through. It rejects only when the provider call itself
 * throws, and then nothing is invalidated. The list is invalidated even when
 * every id failed, because a failure such as a 404 may mean another session
 * already removed the record.
 *
 * @param resource - The resource name.
 * @param options - Extra TanStack Mutation options.
 * @returns The mutation; `mutate(ids)` deletes the records.
 *
 * @example
 * const deleteMany = useDeleteMany<Product>("products");
 * const { deleted, failed } = await deleteMany.mutateAsync(["p1", "p2", "p3"]);
 */
export function useDeleteMany<T>(
    resource: string,
    options?: UseDeleteManyOptions<T>,
): UseMutationResult<DeleteManyResult<T>, Error, (string | number)[]> {
    const provider = useDataProvider();
    const queryClient = useQueryClient();
    const { onSuccess, ...rest } = options ?? {};
    return useMutation<DeleteManyResult<T>, Error, (string | number)[]>({
        ...rest,
        mutationFn: (ids: (string | number)[]) =>
            provider.deleteMany
                ? provider.deleteMany<T>(resource, ids)
                : deleteEach<T>(provider, resource, ids),
        onSuccess: (...args) => {
            void queryClient.invalidateQueries({ queryKey: listQueryKey(resource) });
            return onSuccess?.(...args);
        },
    });
}
