/**
 * @tempest-limits function-lines — createApiClient is over the limit and every line
 * is a request-lifecycle concern the client cannot delegate: base URL joining, the
 * auth header, the 401 refresh-and-replay, the opt-in retry wrapper and the response
 * parsing that turns a failure into a typed error.
 */
import { randomId } from "../utils";
import { buildApiUrl } from "./build-url";
import { isTrustedCredentialTarget, reportSuppressedCredential } from "./credential-scope";
import { csrfHeaders } from "./csrf";
import { decodeByContentType } from "./decode-response";
import type { ResponseDecoder } from "./decode-response";
import {
    buildApiError,
    SessionSupersededError,
    TempestApiError,
    isRetriableStatus,
} from "./errors";
import { retry as retryWithBackoff } from "./retry";
import type { RetryOptions } from "./retry";
import { withTimeout } from "./timeout";
import type { ApiClient, ApiClientConfig, RequestAuthContext, RequestOptions } from "./types";

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
    if (error.code === REDIRECT_REFUSED) return false;
    return isRetriableStatus(error.status);
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

/**
 * The `code` of the {@link TempestApiError} thrown when a request carrying the
 * client's static `headers` is answered with a redirect.
 *
 * Kept out of the built-in retry policy: the status is `0` in a browser, which
 * would otherwise read as a network failure, and replaying gets the same
 * redirect back.
 */
const REDIRECT_REFUSED = "REDIRECT_REFUSED";

/**
 * Whether `response` is a redirect that `redirect: "manual"` stopped.
 *
 * Two shapes, measured: a browser hands back an `opaqueredirect` with status
 * `0` and no readable headers (Chrome 150, #554); a server runtime such as
 * Node's `fetch` hands back the real `3xx` with its `Location`. `304` is a
 * cache answer, not a redirect.
 *
 * @param response - What the fetcher resolved with.
 * @returns Whether the request was redirected and not followed.
 */
function isStoppedRedirect(response: Response): boolean {
    if (response.type === "opaqueredirect") return true;
    return response.status >= 300 && response.status < 400 && response.status !== 304;
}

/** Default milliseconds before a request is abandoned. */
const DEFAULT_TIMEOUT = 15_000;

/** Default milliseconds before a `FormData` request is abandoned. */
const DEFAULT_UPLOAD_TIMEOUT = 300_000;

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

/**
 * The request path as the log line shows it: no query, no fragment, no userinfo.
 *
 * The logger promises never to write the query string, and `params` was never
 * the only way one gets in: a call site can write `"/files?access_token=…"`
 * inline, and an absolute path — the signed upload endpoint or CDN URL that
 * `buildApiUrl` passes through untouched — carries its signature in the query
 * and may carry `user:password@` in the authority. Everything from the first
 * `?` or `#` is dropped and the userinfo of an absolute (or scheme-relative)
 * URL is removed; the host and the path stay, because they are what makes the
 * line useful. Pure string work, no `URL` round trip, so a path that would not
 * parse is still logged instead of throwing inside the logging branch.
 *
 * @param path - The path exactly as the call site passed it.
 * @returns The path without query, fragment or credentials.
 */
function pathForLog(path: string): string {
    return path.replace(/[?#][^]*/, "").replace(/^([^/]*\/\/)[^/]*@/, "$1");
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
 * **Binary bodies** have their own methods — `blob()` and `arrayBuffer()` — which
 * run the same pipeline and skip the parse. `request()` no longer decodes an
 * unknown `Content-Type` as text either: it returns a `Blob` and says so once in
 * a development build, because reading `image/jpeg` as UTF-8 destroyed the bytes
 * on the way in.
 *
 * **The bearer token is scoped to `baseURL`'s origin** since 0.66.0. A path may
 * be an absolute URL, which overrides the base entirely, so without a scope the
 * destination of a credentialed request could come from a value read off the
 * network. A request to another origin still goes out; it goes without the
 * header, and a development build says so once. Declare the exceptions in
 * {@link ApiClientConfig.trustedOrigins}. Since 0.82.0 the static
 * {@link ApiClientConfig.headers} follow the same scope, and a `401` from
 * outside it is thrown without `refresh` or `onUnauthorized` — it answered a
 * request that never carried this session's credential.
 *
 * **Redirects.** The scope is checked against the URL the request starts at;
 * where a redirect then goes is the transport's call. For `Authorization` that
 * is safe: browsers strip it on a cross-origin redirect, measured in Chrome 150
 * for `fetch` and XHR on `301`/`302`/`303`/`307`/`308` (#554). They strip
 * nothing else, so a request carrying the static {@link ApiClientConfig.headers}
 * goes out with `redirect: "manual"`, and a redirect answering it is thrown as a
 * {@link TempestApiError} with `code: "REDIRECT_REFUSED"` instead of being
 * followed. It cannot be followed by hand: a browser's manual redirect is an
 * opaque response whose `Location` is unreadable. A `redirect` set on the call
 * always wins.
 *
 * **CSRF** is off unless you set `csrf`. With it, every unsafe request (anything
 * but `GET`/`HEAD`/`OPTIONS`/`TRACE`) echoes the `csrf_token` cookie in an
 * `X-CSRF-Token` header — the double-submit contract of `tempest-fastapi-sdk`'s
 * `CSRFMiddleware` — scoped to the same origins as the bearer token and sent on
 * `skipAuth` requests too. See {@link ApiClientConfig.csrf}.
 *
 * **Retries** are off unless you set `retry`. See {@link ApiClientConfig.retry}
 * for the built-in policy; it never replays a write. A single call overrides it
 * with {@link RequestOptions.retry}, and opts out of auth entirely with
 * {@link RequestOptions.skipAuth}.
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
 * @returns A client with `request`/`get`/`post`/`put`/`patch`/`delete`/`blob`/
 * `arrayBuffer`/`upload`.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
    const fetcher = config.fetcher ?? globalThis.fetch.bind(globalThis);

    /**
     * The headers that belong to the client's credential scope — the static
     * `config.headers` and the `Authorization` header — or nothing.
     *
     * Takes the resolved URL rather than reading `config.baseURL`, because an
     * absolute path overrides the base entirely (see `buildApiUrl`) and the
     * credential is scoped to an origin, not to a client. Static headers ride
     * with the token since 0.82.0: an `X-Api-Key` set once on the client is as
     * much a credential as the bearer (#530).
     *
     * @param url - The absolute URL the request is going to.
     * @param inScope - Whether `url` is inside the credential scope.
     * @param skipAuth - Whether the caller opted this request out of auth.
     * @returns The headers, or an empty object.
     */
    function scopedHeaders(
        url: string,
        inScope: boolean,
        skipAuth: boolean,
    ): Record<string, string> {
        const token = skipAuth ? null : config.getToken?.();
        if (!inScope) {
            if (token) reportSuppressedCredential(url, config.baseURL);
            const names = Object.keys(config.headers ?? {});
            if (names.length > 0) reportSuppressedCredential(url, config.baseURL, names.join(", "));
            return {};
        }
        return { ...config.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    }

    async function rawRequest(
        url: string,
        inScope: boolean,
        options: RequestOptions,
        requestId: string | undefined,
        skipAuth: boolean,
    ): Promise<Response> {
        const { body, headers, signal, timeout, ...rest } = options;
        const isForm = isFormData(body);
        const configured = isForm ? config.uploadTimeout : config.timeout;
        const fallback = isForm ? DEFAULT_UPLOAD_TIMEOUT : DEFAULT_TIMEOUT;
        const limit =
            timeout !== undefined ? timeout : configured !== undefined ? configured : fallback;

        const callerHeaders = headers as Record<string, string> | undefined;
        const finalHeaders: Record<string, string> = {
            ...(isForm ? {} : { "Content-Type": "application/json" }),
            ...(requestId ? { "X-Request-ID": requestId } : {}),
            ...scopedHeaders(url, inScope, skipAuth),
            ...csrfHeaders({
                method: rest.method ?? "GET",
                url,
                reference: config.baseURL,
                csrf: config.csrf,
                trustedOrigins: config.trustedOrigins,
                headers: { ...config.headers, ...callerHeaders },
            }),
            ...callerHeaders,
        };

        const holdRedirects =
            inScope && rest.redirect === undefined && Object.keys(config.headers ?? {}).length > 0;
        const timed = withTimeout(signal, limit);
        const init: RequestInit = {
            ...rest,
            ...(holdRedirects ? { redirect: "manual" as const } : {}),
            signal: timed.signal,
            headers: finalHeaders,
            credentials: config.withCredentials ? "include" : rest.credentials,
            body:
                body === undefined || body === null
                    ? undefined
                    : isForm
                      ? (body as FormData)
                      : JSON.stringify(body),
        };

        let response: Response;
        try {
            response = await fetcher(url, init);
        } catch (cause) {
            if (timed.timedOut()) {
                throw new TempestApiError({
                    status: 0,
                    detail: `A requisição excedeu ${limit}ms e foi abandonada.`,
                });
            }
            throw cause;
        } finally {
            timed.dispose();
        }
        if (holdRedirects && isStoppedRedirect(response)) {
            throw new TempestApiError({
                status: response.status,
                code: REDIRECT_REFUSED,
                requestId,
                detail: "Redirect não seguido: a requisição levava os headers fixos do cliente.",
            });
        }
        return response;
    }

    async function send(
        path: string,
        url: string,
        inScope: boolean,
        options: RequestOptions,
        requestId: string,
        method: string,
        skipAuth: boolean,
    ): Promise<Response> {
        const log = config.logger;
        if (!log) return rawRequest(url, inScope, options, requestId, skipAuth);

        const target = `${method} ${pathForLog(path)}`;
        const startedAt = performance.now();
        try {
            const response = await rawRequest(url, inScope, options, requestId, skipAuth);
            const entry = { requestId, status: response.status, ms: elapsedMs(startedAt) };
            const line = `${target} → ${response.status}`;
            if (response.status >= 400) log.warn(line, entry);
            else log.debug(line, entry);
            return response;
        } catch (error) {
            log.warn(`${target} → no response`, {
                requestId,
                ms: elapsedMs(startedAt),
                error,
            });
            throw error;
        }
    }

    /**
     * Call `onUnauthorized`, keeping the request's own error unless the hook
     * says the attempt belongs to an ended session.
     *
     * @param response - The `401` that ended the attempt.
     * @param requestId - Correlation id for the log.
     * @param context - The credential and session the attempt left with.
     * @throws {SessionSupersededError} When `onUnauthorized` threw it.
     */
    async function notifyUnauthorized(
        response: Response,
        requestId: string,
        context: RequestAuthContext,
    ): Promise<void> {
        if (!config.onUnauthorized) return;
        config.logger?.warn(`unauthorized — calling onUnauthorized`, {
            requestId,
            status: response.status,
        });
        try {
            await config.onUnauthorized(response, context);
        } catch (error) {
            if (error instanceof SessionSupersededError) throw error;
            config.logger?.warn(`onUnauthorized threw — keeping the original response error`, {
                requestId,
                status: response.status,
                error,
            });
        }
    }

    /**
     * The credential and session an attempt leaves with, read just before it is
     * sent.
     *
     * @param skipAuth - Whether the attempt goes out without credentials.
     * @returns The context handed to `refresh` and `onUnauthorized`.
     */
    function authContext(skipAuth: boolean): RequestAuthContext {
        return {
            token: skipAuth ? null : (config.getToken?.() ?? null),
            epoch: config.getSessionEpoch?.() ?? null,
        };
    }

    /**
     * One request, with the `401` refresh-and-replay around it.
     *
     * The refresh path runs only for a target inside the credential scope. A
     * `401` from any other origin answers a request that never carried this
     * session's credential, so it says nothing about the session; until 0.82.0
     * it still drove `refresh()` and `onUnauthorized()`, so a foreign host could
     * spend a refresh and end the user's session (#530).
     *
     * @param path - The path as the call site wrote it.
     * @param options - Request options, policy fields included.
     * @param decode - How to turn the response into a value.
     * @returns The decoded value.
     */
    async function attempt<T>(
        path: string,
        options: RequestOptions,
        decode: ResponseDecoder<T>,
    ): Promise<T> {
        const { skipAuth = false, skipAuthRetry = false, params, ...init } = options;
        const requestId = config.requestId ? config.requestId() : randomId();
        const method = (init.method ?? "GET").toUpperCase();
        const url = buildApiUrl(config.baseURL, path, { prefix: config.prefix, params });
        const inScope = isTrustedCredentialTarget(url, config.baseURL, config.trustedOrigins);
        const sent = authContext(skipAuth);
        let response = await send(path, url, inScope, init, requestId, method, skipAuth);

        if (response.status === 401 && inScope && !skipAuth && !skipAuthRetry) {
            if (config.refresh) {
                let replayed: RequestAuthContext;
                try {
                    await config.refresh(sent);
                    replayed = authContext(skipAuth);
                    response = await send(path, url, inScope, init, requestId, method, skipAuth);
                } catch (error) {
                    if (error instanceof SessionSupersededError) throw error;
                    await notifyUnauthorized(response, requestId, sent);
                    throw await parseError(response, requestId);
                }
                if (response.status === 401) {
                    await notifyUnauthorized(response, requestId, replayed);
                }
            } else {
                await notifyUnauthorized(response, requestId, sent);
            }
        }

        if (!response.ok) {
            throw await parseError(response, requestId);
        }

        return decode(response);
    }

    async function run<T>(
        path: string,
        options: RequestOptions,
        decode: ResponseDecoder<T>,
    ): Promise<T> {
        const { retry: perRequest, ...rest } = options;
        const retryOptions = resolveRetry(perRequest !== undefined ? perRequest : config.retry);
        if (!retryOptions) return attempt<T>(path, rest, decode);

        const method = (rest.method ?? "GET").toUpperCase();
        return retryWithBackoff(() => attempt<T>(path, rest, decode), {
            ...retryOptions,
            shouldRetry:
                retryOptions.shouldRetry ?? ((error: unknown) => isRetriableFailure(error, method)),
        });
    }

    async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        return run<T>(path, options, decodeByContentType);
    }

    async function upload<T>(
        path: string,
        formData: FormData,
        method: "POST" | "PUT" | "PATCH" = "POST",
        options?: Omit<RequestOptions, "body" | "method">,
    ): Promise<T> {
        return request<T>(path, { ...options, method, body: formData });
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
        blob: (path: string, options?: RequestOptions) =>
            run<Blob>(path, { ...options }, (response) => response.blob()),
        arrayBuffer: (path: string, options?: RequestOptions) =>
            run<ArrayBuffer>(path, { ...options }, (response) => response.arrayBuffer()),
        upload,
        url: (path: string, params?: RequestOptions["params"]) =>
            buildApiUrl(config.baseURL, path, { prefix: config.prefix, params }),
    };
}
