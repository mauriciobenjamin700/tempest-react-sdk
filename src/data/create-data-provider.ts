import type { ApiClient, RequestOptions } from "@/http/types";
import type { OffsetPage } from "@/query/pagination";

/** Query-param values accepted by the API client for a list request. */
type ParamValue = string | number | boolean | undefined | null;

/** Filters passed to {@link DataProvider.getList}, spread verbatim into the query string. */
export type DataFilters = Record<string, ParamValue>;

/** Parameters for a paginated, sorted, filtered list request. */
export interface GetListParams {
    /** Offset pagination — 1-based `page` and `pageSize`. */
    pagination?: { page?: number; pageSize?: number };
    /** Single-field sort. `order` defaults to `"asc"`. */
    sort?: { field: string; order?: "asc" | "desc" };
    /** Arbitrary filter query params, spread onto the request. */
    filters?: DataFilters;
}

/**
 * Refine-style data provider over the Tempest FastAPI SDK CRUD/pagination
 * conventions. Implementations are stateless wrappers around an {@link ApiClient}.
 */
export interface DataProvider {
    /**
     * Fetch a paginated list of a resource.
     *
     * @param resource - The resource name (e.g. `"users"`).
     * @param params - Pagination, sort and filter parameters.
     * @returns The offset-paginated envelope.
     */
    getList<T>(resource: string, params?: GetListParams): Promise<OffsetPage<T>>;
    /**
     * Fetch a single record by id.
     *
     * @param resource - The resource name.
     * @param id - The record id.
     * @returns The record.
     */
    getOne<T>(resource: string, id: string | number): Promise<T>;
    /**
     * Fetch many records by id (default: parallel {@link DataProvider.getOne}).
     *
     * @param resource - The resource name.
     * @param ids - The record ids.
     * @returns The records, in the same order as `ids`.
     */
    getMany<T>(resource: string, ids: (string | number)[]): Promise<T[]>;
    /**
     * Create a record.
     *
     * @param resource - The resource name.
     * @param data - The creation payload.
     * @returns The created record.
     */
    create<T>(resource: string, data: unknown): Promise<T>;
    /**
     * Update a record (PATCH by default, PUT when configured).
     *
     * @param resource - The resource name.
     * @param id - The record id.
     * @param data - The update payload.
     * @returns The updated record.
     */
    update<T>(resource: string, id: string | number, data: unknown): Promise<T>;
    /**
     * Delete a record by id.
     *
     * @param resource - The resource name.
     * @param id - The record id.
     * @returns The delete response (often the deleted record).
     */
    deleteOne<T>(resource: string, id: string | number): Promise<T>;
}

/** Options to tailor {@link createDataProvider} to a backend's conventions. */
export interface DataProviderOptions {
    /** Query-param name for the page number. Default: `"page"`. */
    pageParam?: string;
    /** Query-param name for the page size. Default: `"size"`. */
    sizeParam?: string;
    /** Query-param name for the sort field. Default: `"order_by"`. */
    sortFieldParam?: string;
    /** Query-param name for the sort order. Default: `"ascending"`. */
    sortOrderParam?: string;
    /**
     * When `true` (default), emit the sort order as a boolean
     * (`order:"asc"` → `true`). When `false`, emit the literal `"asc"`/`"desc"`.
     */
    sortOrderAsBoolean?: boolean;
    /** HTTP method used by {@link DataProvider.update}. Default: `"patch"`. */
    updateMethod?: "patch" | "put";
    /**
     * Build the request path for a resource (and optional id).
     * Default: `id == null ? "/" + resource : "/" + resource + "/" + id`.
     */
    buildPath?: (resource: string, id?: string | number) => string;
}

const defaultBuildPath = (resource: string, id?: string | number): string =>
    id == null ? `/${resource}` : `/${resource}/${id}`;

/**
 * Create a {@link DataProvider} bound to an {@link ApiClient}.
 *
 * Maps Refine-style calls to the Tempest FastAPI SDK conventions: list →
 * `GET /{resource}?page=&size=&order_by=&ascending=&...filters`, one →
 * `GET /{resource}/{id}`, create → `POST`, update → `PATCH`/`PUT`,
 * delete → `DELETE`.
 *
 * @param client - The HTTP client created by `createApiClient`.
 * @param options - Optional overrides for param names, sort encoding,
 *   update method and path building.
 * @returns A stateless data provider.
 *
 * @example
 * const dataProvider = createDataProvider(apiClient);
 * const page = await dataProvider.getList<User>("users", {
 *     pagination: { page: 1, pageSize: 20 },
 *     sort: { field: "created_at", order: "desc" },
 *     filters: { active: true },
 * });
 */
export function createDataProvider(
    client: ApiClient,
    options: DataProviderOptions = {},
): DataProvider {
    const {
        pageParam = "page",
        sizeParam = "size",
        sortFieldParam = "order_by",
        sortOrderParam = "ascending",
        sortOrderAsBoolean = true,
        updateMethod = "patch",
        buildPath = defaultBuildPath,
    } = options;

    const provider: DataProvider = {
        getList<T>(resource: string, params: GetListParams = {}): Promise<OffsetPage<T>> {
            const { pagination, sort, filters } = params;
            const query: Record<string, ParamValue> = {};

            if (pagination?.page != null) query[pageParam] = pagination.page;
            if (pagination?.pageSize != null) query[sizeParam] = pagination.pageSize;

            if (sort?.field) {
                const order = sort.order ?? "asc";
                query[sortFieldParam] = sort.field;
                query[sortOrderParam] = sortOrderAsBoolean ? order === "asc" : order;
            }

            if (filters) {
                for (const [key, value] of Object.entries(filters)) {
                    query[key] = value;
                }
            }

            const requestOptions: RequestOptions = { params: query };
            return client.get<OffsetPage<T>>(buildPath(resource), requestOptions);
        },

        getOne<T>(resource: string, id: string | number): Promise<T> {
            return client.get<T>(buildPath(resource, id));
        },

        getMany<T>(resource: string, ids: (string | number)[]): Promise<T[]> {
            return Promise.all(ids.map((id) => provider.getOne<T>(resource, id)));
        },

        create<T>(resource: string, data: unknown): Promise<T> {
            return client.post<T>(buildPath(resource), { body: data });
        },

        update<T>(resource: string, id: string | number, data: unknown): Promise<T> {
            const path = buildPath(resource, id);
            return updateMethod === "put"
                ? client.put<T>(path, { body: data })
                : client.patch<T>(path, { body: data });
        },

        deleteOne<T>(resource: string, id: string | number): Promise<T> {
            return client.delete<T>(buildPath(resource, id));
        },
    };

    return provider;
}
