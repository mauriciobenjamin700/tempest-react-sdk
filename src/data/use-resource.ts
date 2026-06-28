import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    UseMutationOptions,
    UseMutationResult,
    UseQueryOptions,
    UseQueryResult,
} from "@tanstack/react-query";

import type { OffsetPage } from "@/query/pagination";

import type { GetListParams } from "./create-data-provider";
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
 * @param resource - The resource name.
 * @param params - The list params (page/sort/filters).
 * @returns A stable TanStack Query key.
 */
export function listQueryKey(resource: string, params?: GetListParams): unknown[] {
    return ["data", resource, "list", params];
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

/** Options for the create mutation (mutationFn + onSuccess are provided). */
export type UseCreateOptions<T> = Omit<UseMutationOptions<T, Error, unknown>, "mutationFn">;

/**
 * Create a record and invalidate the resource list cache on success.
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
    return useMutation<T, Error, unknown>({
        mutationFn: (data: unknown) => provider.create<T>(resource, data),
        onSuccess: (...args) => {
            void queryClient.invalidateQueries({ queryKey: ["data", resource, "list"] });
            options?.onSuccess?.(...args);
        },
        ...options,
    });
}

/** Variables accepted by the update mutation. */
export interface UpdateVariables {
    /** The record id to update. */
    id: string | number;
    /** The update payload. */
    data: unknown;
}

/** Options for the update mutation (mutationFn + onSuccess are provided). */
export type UseUpdateOptions<T> = Omit<UseMutationOptions<T, Error, UpdateVariables>, "mutationFn">;

/**
 * Update a record and invalidate both the list and the single-record caches.
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
    return useMutation<T, Error, UpdateVariables>({
        mutationFn: ({ id, data }: UpdateVariables) => provider.update<T>(resource, id, data),
        onSuccess: (...args) => {
            const [, variables] = args;
            void queryClient.invalidateQueries({ queryKey: ["data", resource, "list"] });
            void queryClient.invalidateQueries({ queryKey: oneQueryKey(resource, variables.id) });
            options?.onSuccess?.(...args);
        },
        ...options,
    });
}

/** Options for the delete mutation (mutationFn + onSuccess are provided). */
export type UseDeleteOptions<T> = Omit<UseMutationOptions<T, Error, string | number>, "mutationFn">;

/**
 * Delete a record by id and invalidate the resource list cache on success.
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
    return useMutation<T, Error, string | number>({
        mutationFn: (id: string | number) => provider.deleteOne<T>(resource, id),
        onSuccess: (...args) => {
            void queryClient.invalidateQueries({ queryKey: ["data", resource, "list"] });
            options?.onSuccess?.(...args);
        },
        ...options,
    });
}
