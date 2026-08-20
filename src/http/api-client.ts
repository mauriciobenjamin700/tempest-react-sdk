/**
 * @tempest-limits function-lines — createApiClient is over the limit and every line
 * is a request-lifecycle concern the client cannot delegate: base URL joining, the
 * auth header, the 401 refresh-and-replay, the opt-in retry wrapper and the response
 * parsing that turns a failure into a typed error.
 */
import { randomId } from "../utils";
import { buildApiUrl } from "./build-url";
import { buildApiError, TempestApiError } from "./errors";
import { retry as retryWithBackoff } from "./retry";
import type { RetryOptions } from "./retry";
import type { ApiClient, ApiClientConfig, RequestOptions } from "./types";

/**
 * Methods the built-in retry policy will replay.
 *
 * `PUT` and `DELETE` are idempotent on paper but stay out: a backend that logs,
 * bills, or fires a webhook per call still sees two, so replaying them is a
 * decision the caller makes through `shouldRetry`, not a default.
 */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Sub-500 statuses worth a second attempt: a network failure (status `0`), a
 * request timeout, a too-early replay, and a rate limit — which usually carries
 * the `Retry-After` the backoff already honours.
 */
const RETRIABLE_STATUSES: ReadonlySet<number> = new Set([0, 408, 425, 429]);

/**
 * The built-in retry policy, used when `retry` is `true` or is options carrying
 * no `shouldRetry` of their own.
 *
 * Conservative on purpose. Replaying a write can duplicate it, and replaying a
 * `400` or a `403` cannot fix a bad payload or a permission the caller does not
 * have — it only spends the user's time before showing the same error.
 *
 * @param error - Whatever the attempt threw.
 * @param method - The upper-cased HTTP method of the request.
 * @returns Whether the client should try again.
 */
function isRetriableFailure(error: unknown, method: string): boolean {
    if (!IDEMPOTENT_METHODS.has(method)) return false;
    if (!(error instanceof TempestApiError)) return false;
    return RETRIABLE_STATUSES.has(error.status) || error.status >= 500;
}

/**
 * Normalize the `retry` config into options, or `null` when retrying is off.
 *
 * @param config - The `retry` field as the caller wrote it.
 * @returns Retry options to use, or `null` to run a single attempt.
 */
function resolveRetry(config: boolean | RetryOptions | undefined): RetryOptions | null {
    if (!config) return null;
    return config === true ? {} : config;
}

function isFormData(body: unknown): body is FormData {
    return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * Milliseconds since a `performance.now()` reading, rounded.
 *
 * `performance.now()` rather than `Date.now()` because this measures a
 * duration: the wall clock can step sideways mid-request (an NTP correction, a
 * VM resuming, the user changing the clock) and turn a 40 ms call into a
 * negative number. The monotonic clock cannot.
 *
 * @param startedAt - The reading taken before the work started.
 * @returns Whole milliseconds elapsed.
 */
function elapsedMs(startedAt: number): number {
    return Math.round(performance.now() - startedAt);
}

async function parseError(response: Response, sentRequestId?: string): Promise<TempestApiError> {
    let body: unknown;
    try {
        body = await response.clone().json();
    } catch {
        try {
            body = await response.text();
        } catch {
            body = null;
        }
    }
    return new TempestApiError(
        buildApiError(response.status, body, response.headers, sentRequestId),
    );
}

/**
 * Create a typed HTTP client backed by `fetch`.
 *
 * Handles JSON serialization, query params, bearer auth via `getToken`, uploads
 * via `FormData`, and throws a typed `ApiError` on any non-2xx response.
 *
 * **Expired sessions.** A `401` with `refresh` configured awaits the refresh and
 * replays the request once. `onUnauthorized` fires whenever that path ends
 * unauthorized anyway — the refresh threw, or the replay came back `401` — which
 * is the signal to clear the session. Without `refresh`, the first `401` calls
 * it directly.
 *
 * **Retries** are off unless you set `retry`. See {@link ApiClientConfig.retry}
 * for the built-in policy; it never replays a write.
 *
 * **Logging** is off unless you pass a `logger`. With one, every finished attempt
 * writes a line — `debug` under 400, `warn` from 400 up, plus a `warn` when
 * `onUnauthorized` fires — carrying `requestId`, `status` and elapsed `ms`, and
 * never a body, header or query string. The level and the destination belong to
 * the logger, not to a boolean here.
 *
 * @example
 * const api = createApiClient({
 *     baseURL: import.meta.env.VITE_API_URL,
 *     getToken: () => useAuthStore.getState().token,
 *     refresh,
 *     onUnauthorized: () => useAuthStore.getState().logout(),
 *     logger: createLogger({ level: import.meta.env.DEV ? "debug" : "warn" }).child("http"),
 *     retry: true,
 * });
 *
 * @param config - Base URL plus the optional auth, retry and fetch hooks.
 * @returns A client with `request`/`get`/`post`/`put`/`patch`/`delete`/`upload`.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
    const fetcher = config.fetcher ?? globalThis.fetch.bind(globalThis);

    function authHeaders(): Record<string, string> {
        const token = config.getToken?.();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    async function rawRequest(
        path: string,
        options: RequestOptions,
        requestId?: string,
    ): Promise<Response> {
        const { body, params, headers, ...rest } = options;
        const isForm = isFormData(body);

        const finalHeaders: Record<string, string> = {
            ...(isForm ? {} : { "Content-Type": "application/json" }),
            ...(requestId ? { "X-Request-ID": requestId } : {}),
            ...config.headers,
            ...authHeaders(),
            ...(headers as Record<string, string> | undefined),
        };

        const init: RequestInit = {
            ...rest,
            headers: finalHeaders,
            credentials: config.withCredentials ? "include" : rest.credentials,
            body:
                body === undefined || body === null
                    ? undefined
                    : isForm
                      ? (body as FormData)
                      : JSON.stringify(body),
        };

        return fetcher(buildApiUrl(config.baseURL, path, { prefix: config.prefix, params }), init);
    }

    async function send(
        path: string,
        options: RequestOptions,
        requestId: string,
        method: string,
    ): Promise<Response> {
        const log = config.logger;
        if (!log) return rawRequest(path, options, requestId);

        const startedAt = performance.now();
        try {
            const response = await rawRequest(path, options, requestId);
            const entry = { requestId, status: response.status, ms: elapsedMs(startedAt) };
            const line = `${method} ${path} → ${response.status}`;
            if (response.status >= 400) log.warn(line, entry);
            else log.debug(line, entry);
            return response;
        } catch (error) {
            log.warn(`${method} ${path} → no response`, {
                requestId,
                ms: elapsedMs(startedAt),
                error,
            });
            throw error;
        }
    }

    async function notifyUnauthorized(response: Response, requestId: string): Promise<void> {
        if (!config.onUnauthorized) return;
        config.logger?.warn(`unauthorized — calling onUnauthorized`, {
            requestId,
            status: response.status,
        });
        try {
            await config.onUnauthorized(response);
        } catch (error) {
            config.logger?.warn(`onUnauthorized threw — keeping the original response error`, {
                requestId,
                status: response.status,
                error,
            });
        }
    }

    async function attempt<T>(path: string, options: RequestOptions): Promise<T> {
        const requestId = config.requestId ? config.requestId() : randomId();
        const method = (options.method ?? "GET").toUpperCase();
        let response = await send(path, options, requestId, method);

        if (response.status === 401) {
            if (config.refresh) {
                try {
                    await config.refresh();
                    response = await send(path, options, requestId, method);
                } catch {
                    await notifyUnauthorized(response, requestId);
                    throw await parseError(response, requestId);
                }
                if (response.status === 401) {
                    await notifyUnauthorized(response, requestId);
                }
            } else {
                await notifyUnauthorized(response, requestId);
            }
        }

        if (!response.ok) {
            throw await parseError(response, requestId);
        }

        if (response.status === 204) {
            return undefined as T;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
            return (await response.json()) as T;
        }
        return (await response.text()) as unknown as T;
    }

    async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const retryOptions = resolveRetry(config.retry);
        if (!retryOptions) return attempt<T>(path, options);

        const method = (options.method ?? "GET").toUpperCase();
        return retryWithBackoff(() => attempt<T>(path, options), {
            ...retryOptions,
            shouldRetry:
                retryOptions.shouldRetry ?? ((error: unknown) => isRetriableFailure(error, method)),
        });
    }

    async function upload<T>(
        path: string,
        formData: FormData,
        method: "POST" | "PUT" | "PATCH" = "POST",
    ): Promise<T> {
        return request<T>(path, { method, body: formData });
    }

    return {
        request,
        get: <T>(path: string, options?: RequestOptions) =>
            request<T>(path, { ...options, method: "GET" }),
        post: <T>(path: string, options?: RequestOptions) =>
            request<T>(path, { ...options, method: "POST" }),
        put: <T>(path: string, options?: RequestOptions) =>
            request<T>(path, { ...options, method: "PUT" }),
        patch: <T>(path: string, options?: RequestOptions) =>
            request<T>(path, { ...options, method: "PATCH" }),
        delete: <T>(path: string, options?: RequestOptions) =>
            request<T>(path, { ...options, method: "DELETE" }),
        upload,
    };
}
