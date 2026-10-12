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
     *
     * Since 0.77.0 `id` arrives already passed through {@link encodeIdSegment}:
     * percent-encoded as one path segment, and never `""`, `"."` or `".."`. An
     * override therefore interpolates it as-is — encoding it again would turn
     * `%2F` into `%252F`.
     */
    buildPath?: (resource: string, id?: string | number) => string;
}

const DOT_SEGMENTS: ReadonlySet<string> = new Set(["", ".", ".."]);

/**
 * Encode a record id as exactly one URL path segment.
 *
 * The data provider calls this on every id before building a path, because the
 * id is the one part of the URL that may come from outside the app — a search
 * param, a hash, a decoded route param, a value another user stored. Left raw,
 * `"../../admin/users"` walks the authenticated request out of the resource,
 * `"7?role=admin"` injects query params and `"7#x"` truncates the path, all
 * while the request still carries the bearer token (#438).
 *
 * `encodeURIComponent` neutralises `/`, `?`, `#` and `%`. It leaves `.` alone,
 * so `""`, `"."` and `".."` are rejected instead: the URL parser resolves them
 * as dot-segments whatever the encoding, and none of them names a record.
 * `null` and `undefined` — what an untyped caller or a not-yet-loaded route
 * param hands over — are rejected too, since `String()` would turn them into
 * the literal segments `"null"` and `"undefined"`.
 *
 * @param id - The record id, as handed to the provider.
 * @returns The percent-encoded segment, safe to interpolate between two `/`.
 * @throws {TypeError} When the id is `null`, `undefined`, `""`, `"."` or `".."`.
 *
 * @example
 * encodeIdSegment(7); // "7"
 * encodeIdSegment("a/b?x=1"); // "a%2Fb%3Fx%3D1"
 * encodeIdSegment(".."); // throws TypeError
 */
export function encodeIdSegment(id: string | number): string {
    if (id == null) {
        throw new TypeError(`Invalid record id ${String(id)}: a record id is required.`);
    }
    const raw = String(id);
    if (DOT_SEGMENTS.has(raw)) {
        throw new TypeError(
            `Invalid record id ${JSON.stringify(raw)}: it would resolve as a path dot-segment.`,
        );
    }
    return encodeURIComponent(raw);
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
 * Every id goes through {@link encodeIdSegment} before reaching `buildPath`, so
 * an id can never leave its own path segment — not with the default builder,
 * and not with an override that interpolates it.
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

        async getOne<T>(resource: string, id: string | number): Promise<T> {
            return client.get<T>(buildPath(resource, encodeIdSegment(id)));
        },

        getMany<T>(resource: string, ids: (string | number)[]): Promise<T[]> {
            return Promise.all(ids.map((id) => provider.getOne<T>(resource, id)));
        },

        create<T>(resource: string, data: unknown): Promise<T> {
            return client.post<T>(buildPath(resource), { body: data });
        },

        async update<T>(resource: string, id: string | number, data: unknown): Promise<T> {
            const path = buildPath(resource, encodeIdSegment(id));
            return updateMethod === "put"
                ? client.put<T>(path, { body: data })
                : client.patch<T>(path, { body: data });
        },

        async deleteOne<T>(resource: string, id: string | number): Promise<T> {
            return client.delete<T>(buildPath(resource, encodeIdSegment(id)));
        },
    };

    return provider;
}
