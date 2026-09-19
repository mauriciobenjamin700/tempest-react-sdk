import type { Logger } from "../logger";
import type { RetryOptions } from "./retry";

/**
 * The slice of {@link Logger} the client writes to: `debug` for a request that
 * came back under 400, `warn` for everything else. Structural, so the SDK
 * logger fits without adapting and so does any object with those two methods.
 */
export type ApiClientLogger = Pick<Logger, "debug" | "warn">;

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
    /**
     * Field-level messages from a validation response, keyed by the field path
     * the backend named (`"email"`, `"items.0.price"`, `"phone"`).
     *
     * Present whenever the body named a field, through either shape a Tempest
     * stack sends:
     *
     * - FastAPI's validation list — `detail: [{ loc, msg, type }]`, one entry per
     *   field, each keyed by its `loc` path.
     * - The singular keys a `tempest-fastapi-sdk` backend uses once it owns the
     *   handler — `detail.field`, then top-level `field`, then `details.field`, in
     *   that order. There the single value is the same sentence as `detail`.
     *
     * This is the shape a form needs: `detail` is one line for a log or a
     * developer, and pulling the fields back out of it means parsing prose. The
     * first message wins when a field appears twice, because a field shows one
     * error at a time.
     */
    fields?: Record<string, string>;
    /** The raw parsed error body, when available. */
    body?: unknown;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined | null>;
    /**
     * Abort this request.
     *
     * Inherited from `RequestInit` and forwarded to `fetch`, so it has always
     * worked — but nothing said so, which made it a capability nobody could find.
     * Declared here for that reason alone. Pass the `signal` react-query hands to
     * a `queryFn` and the request is cancelled on unmount and on refetch.
     */
    signal?: AbortSignal | null;
    /**
     * Send this request with no `Authorization` header, and never enter the
     * refresh-and-replay cycle on a `401`.
     *
     * This is what login and refresh need: a route that must not carry the
     * token it is about to obtain, and whose own `401` must surface rather than
     * call `refresh()` again — which would recurse. Before 0.66.0 the only way
     * to get it was a second client, which is why `createTempestAuth` used to
     * build three.
     */
    skipAuth?: boolean;
    /**
     * Send the `Authorization` header, but let a `401` surface instead of
     * refreshing and replaying.
     *
     * The narrower half of {@link skipAuth}, for a call that is authenticated
     * but whose failure the caller wants to see — a token probe, a background
     * poll that should not fight for the refresh lock.
     */
    skipAuthRetry?: boolean;
    /**
     * Retry policy for this request, overriding the client's.
     *
     * Replaces `config.retry` entirely rather than merging into it, the same
     * way `config.retry` is read today: a merged `shouldRetry` would silently
     * combine two policies that were each written to be complete.
     *
     * `false` turns retrying off for one call on a client that has it on;
     * `true` or {@link RetryOptions} turns it on for one call on a client that
     * does not.
     */
    retry?: boolean | RetryOptions;
    /**
     * Override the client's timeout for this request, in milliseconds. `null`
     * disables it, which is the escape hatch for a stream or a long poll.
     *
     * Composed with `signal`, not replacing it: whichever fires first wins, and
     * the two are told apart — a timeout surfaces as an {@link ApiError} with
     * `status: 0`, while an abort you asked for propagates as an abort.
     */
    timeout?: number | null;
}

export interface ApiClientConfig {
    /**
     * Base URL for every request. Required.
     *
     * May carry a path (`https://api.example.com/api`) — it is kept, and a
     * request for `"/auth/login"` lands on `/api/auth/login`. May also be
     * relative (`"/api"`), which resolves against the current origin and is the
     * shape to use behind a dev-server or reverse proxy.
     */
    baseURL: string;
    /**
     * Path segment every request is nested under, such as `"/api"` — the
     * `root_path` a Tempest FastAPI service is usually mounted on.
     *
     * The alternative to writing it into `baseURL`, and the better one when the
     * base comes from an environment variable that other things also use (an
     * SSE endpoint, a media host): the variable stays the bare origin and only
     * the client carries the prefix.
     *
     * Applied at most once — a path that already opens with the prefix is left
     * alone, so call sites can migrate one at a time.
     */
    prefix?: string;
    /** Returns the current bearer token (or null/undefined). Called per request. */
    getToken?: () => string | null | undefined;
    /**
     * Origins besides `baseURL`'s that may receive the `getToken` credential.
     *
     * Since 0.66.0 the bearer token is scoped to the origin of `baseURL`. A
     * request to any other origin still goes out — it just goes without the
     * header. That matters because a path may be an absolute URL, in which case
     * it overrides `baseURL` completely, so the destination of a credentialed
     * request could be decided by a value the app read off the network: a
     * pagination link, a `download_url`, a `Location`.
     *
     * List the second host here when it genuinely needs the API's token — a CDN
     * behind the same identity, a sibling service. An origin compares as an
     * origin (`"https://cdn.acme.com"`), so path and trailing slash are
     * ignored.
     *
     * A relative `baseURL` needs nothing here: a relative target resolves
     * against the document and cannot cross an origin.
     */
    trustedOrigins?: readonly string[];
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
     * Where the client reports each request it finished. Off when absent — the
     * client writes to no console of its own.
     *
     * One entry per attempt (so a refresh replay and every retry show up), at
     * `debug` under 400 and at `warn` from 400 up, carrying `requestId`,
     * `status` and the elapsed `ms`. Firing `onUnauthorized` gets its own `warn`,
     * which is what a session dying mid-session looks like in the log.
     *
     * Deliberately **not** a `debug: boolean`: the level lives in the logger you
     * pass, so `createLogger({ level })` decides what survives, the sink decides
     * where it goes (console in dev, Sentry in production, an array in a test),
     * and one namespace per client keeps two clients apart.
     *
     * Never logs a body, a header, or the query string — a bearer token in
     * `Authorization`, a password in a login payload and an `access_token` query
     * param would all end up in whatever the sink writes to. What is logged is
     * the method, the path as the call site wrote it, and the numbers.
     */
    logger?: ApiClientLogger;
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
    /**
     * Milliseconds before a request is abandoned. Default `15_000`. `null` turns
     * it off.
     *
     * There was no timeout at all before, and the failure it leaves open is not
     * an error: a TCP connection that dies without a FIN never answers, so the
     * browser can hold the request for minutes or forever. In an offline-first
     * SDK that is the wrong place to have no floor — the eternal spinner lands
     * exactly on the bad network this package exists to survive.
     *
     * A timeout surfaces as an {@link ApiError} with `status: 0`, the same shape
     * the client already uses for "never reached the server", so the built-in
     * retry policy replays it without a special case.
     */
    timeout?: number | null;
    /**
     * Milliseconds before a `FormData` request is abandoned. Default `300_000`.
     * `null` turns it off.
     *
     * A binary upload is not a slow request, it is a different kind of request. A
     * single timeout forces a choice between one short enough to protect a normal
     * call and one long enough to finish a file, and 15 seconds cuts an upload
     * mid-body — which the server then has to interpret as a truncated payload.
     *
     * Detected from the body being `FormData`, the same test that already decides
     * the `Content-Type`. Override per request with `options.timeout` when a
     * particular call does not fit either default.
     */
    uploadTimeout?: number | null;
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
    /**
     * Download a binary body through the full client pipeline.
     *
     * Same base URL, `getToken` header, 401 refresh-and-replay, `onUnauthorized`,
     * logging, timeout and retry policy as {@link ApiClient.request} — only the
     * decoding differs. Without it every download left the client: a hand-rolled
     * `fetch` that re-declares the `Authorization` header and re-implements the
     * error handling, and that has no refresh, which is the client's reason to
     * exist.
     *
     * @param path - Path joined onto the client's base URL.
     * @param options - The same options `request` takes; `method` defaults to GET.
     * @returns The response body as a `Blob`.
     * @throws TempestApiError On any non-2xx response, carrying the status.
     */
    blob(path: string, options?: RequestOptions): Promise<Blob>;
    /**
     * Download a binary body as an `ArrayBuffer`, for the callers a `Blob` does
     * not serve — a decoder, a hash, a typed array fed to WebGL or to
     * `onnxruntime-web`.
     *
     * @param path - Path joined onto the client's base URL.
     * @param options - The same options `request` takes; `method` defaults to GET.
     * @returns The response body as an `ArrayBuffer`.
     * @throws TempestApiError On any non-2xx response, carrying the status.
     */
    arrayBuffer(path: string, options?: RequestOptions): Promise<ArrayBuffer>;
    upload<T>(
        path: string,
        formData: FormData,
        method?: "POST" | "PUT" | "PATCH",
        options?: Omit<RequestOptions, "body" | "method">,
    ): Promise<T>;
}
