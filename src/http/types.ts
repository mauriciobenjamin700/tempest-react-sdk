export interface ApiError {
    /** HTTP status code (0 for network failures). */
    status: number;
    /** Human-readable message — the backend envelope's `detail` (or `message`). */
    detail: string;
    /**
     * Programmatic error code from the Tempest FastAPI SDK envelope (`code`),
     * e.g. `"EMAIL_TAKEN"`. Lets callers branch without parsing `detail`.
     */
    code?: string;
    /**
     * Correlation id echoed from the backend envelope's `details.request_id`
     * (or the `X-Request-ID` response header). Pair it with `createLogger`.
     */
    requestId?: string;
    /**
     * Seconds to wait before retrying, parsed from the `Retry-After` response
     * header (commonly on `429`/`503`). Honored by {@link retry}.
     */
    retryAfter?: number;
    /** The raw parsed error body, when available. */
    body?: unknown;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined | null>;
}

export interface ApiClientConfig {
    /** Base URL for every request. Required. */
    baseURL: string;
    /** Returns the current bearer token (or null/undefined). Called per request. */
    getToken?: () => string | null | undefined;
    /**
     * Per-request correlation id sent as the `X-Request-ID` header, matching the
     * Tempest FastAPI SDK `RequestIDMiddleware`. Defaults to a generated id.
     * Return an empty string to disable the header.
     */
    requestId?: () => string;
    /** Called on 401 responses. Use it to logout the user or trigger a refresh. */
    onUnauthorized?: (response: Response) => void | Promise<void>;
    /**
     * Optional refresh hook. When provided and the original request returns 401,
     * the client awaits `refresh()` then retries the request once.
     */
    refresh?: () => Promise<void>;
    /** Whether to send cookies on cross-origin requests (default: false). */
    withCredentials?: boolean;
    /** Default headers merged into every request. */
    headers?: Record<string, string>;
    /** Optional fetch implementation (defaults to globalThis.fetch). */
    fetcher?: typeof fetch;
}

export interface ApiClient {
    request<T>(path: string, options?: RequestOptions): Promise<T>;
    get<T>(path: string, options?: RequestOptions): Promise<T>;
    post<T>(path: string, options?: RequestOptions): Promise<T>;
    put<T>(path: string, options?: RequestOptions): Promise<T>;
    patch<T>(path: string, options?: RequestOptions): Promise<T>;
    delete<T>(path: string, options?: RequestOptions): Promise<T>;
    upload<T>(path: string, formData: FormData, method?: "POST" | "PUT" | "PATCH"): Promise<T>;
}
