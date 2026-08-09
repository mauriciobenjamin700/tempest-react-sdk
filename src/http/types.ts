import type { RetryOptions } from "./retry";

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
    /**
     * Called when a request ends up unauthorized — a 401 with no `refresh`
     * configured, a `refresh()` that threw, or a retry that came back 401 again
     * after a refresh that resolved. Use it to end the session.
     */
    onUnauthorized?: (response: Response) => void | Promise<void>;
    /**
     * Optional refresh hook. When provided and the original request returns 401,
     * the client awaits `refresh()` then retries the request once.
     */
    refresh?: () => Promise<void>;
    /**
     * Retry failed requests with exponential backoff. Off by default, so the
     * client keeps failing fast unless you opt in.
     *
     * `true` uses the built-in policy, which is deliberately conservative: only
     * idempotent methods (`GET`, `HEAD`, `OPTIONS`) and only failures a retry
     * can plausibly fix — a network error, `408`, `425`, `429`, or any `5xx`. A
     * `POST` is never retried on its own, so nothing gets duplicated.
     *
     * Pass {@link RetryOptions} to tune it. Supplying your own `shouldRetry`
     * replaces the built-in policy entirely, method check included — that is the
     * escape hatch for retrying a write you made idempotent with
     * {@link generateIdempotencyKey}.
     *
     * Retries wrap the whole request, refresh included, and each attempt carries
     * its own `X-Request-ID`. A `4xx` outside the three listed above is never
     * retried: repeating an identical request cannot fix a bad payload or a
     * permission the caller does not have.
     */
    retry?: boolean | RetryOptions;
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
