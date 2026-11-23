/**
 * @tempest-limits function-lines — createApiClient is over the limit and every line
 * is a request-lifecycle concern the client cannot delegate: base URL joining, the
 * auth header, the 401 refresh-and-replay, the opt-in retry wrapper and the response
 * parsing that turns a failure into a typed error.
 */
import { randomId } from "../utils";
import { buildApiUrl, toWebSocketUrl } from "./build-url";
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
     * Whether the attempt carried a bearer token of a session epoch that has
     * ended since it left.
     *
     * @param context - The credential and epoch the attempt left with.
     * @returns `true` when the attempt had a token and `getSessionEpoch` now
     * returns another epoch; `false` without `getSessionEpoch`.
     */
    function sessionEndedSince(context: RequestAuthContext): boolean {
        if (context.token === null || context.epoch === null || !config.getSessionEpoch) {
            return false;
        }
        return config.getSessionEpoch() !== context.epoch;
    }

    /**
     * Whether `getSessionEpoch` moved since the attempt left, with or without
     * a token on it.
     *
     * The gate in front of the `401` hooks. A `401` that lands after its
     * session ended speaks for nobody signed in now: `refresh()` would run with
     * the ended session's context and `onUnauthorized` — the documented place
     * to end the session — would sign the next account out. Unlike
     * {@link sessionEndedSince}, a tokenless attempt counts too: its `401`
     * landing after `login(B)` is no reason to end B's session either. Read on
     * arrival, before any hook runs, so a `401` whose own handling ends the
     * session still rejects with the `401` (#646).
     *
     * @param context - The credential and epoch the attempt left with.
     * @returns `true` when the epoch differs now; `false` without
     * `getSessionEpoch`.
     */
    function epochMovedSince(context: RequestAuthContext): boolean {
        if (context.epoch === null || !config.getSessionEpoch) return false;
        return config.getSessionEpoch() !== context.epoch;
    }

    /**
     * Whether another session was installed since the attempt left: the epoch
     * moved and a bearer token that is not the attempt's own is current now.
     *
     * The epoch alone cannot tell the two ways a `401`'s handling can end:
     * `refresh()` failing and signing out, or `onUnauthorized` calling
     * `logout()`, move the epoch *because of* this `401`, and its caller must
     * see it (#646); a `logout()` + `login(B)` that ran while the refresh or
     * `onUnauthorized` awaited moves it too, and then the `401` envelope is
     * account A's data reaching B's `onError` (security audit run-16 §6,
     * #657). What differs is the credential left behind: signing out leaves
     * none, a rotation that failed leaves the attempt's own, and only a new
     * session leaves another one.
     *
     * The gate is {@link epochMovedSince}, not {@link sessionEndedSince}: an
     * attempt sent without a token has no session to end, but a `login(B)`
     * during its failing refresh still installs another one, and up to 0.92.0
     * that tokenless `401` reached `onUnauthorized` and a `() => logout()`
     * signed B out (security audit run-18 §3.1, #696).
     *
     * @param context - The credential and epoch the attempt left with.
     * @returns `true` when the epoch moved since the attempt left and a token
     * other than the attempt's own is installed; `false` without
     * `getSessionEpoch`.
     */
    function sessionReplacedSince(context: RequestAuthContext): boolean {
        if (!epochMovedSince(context)) return false;
        const current = config.getToken?.() ?? null;
        return current !== null && current !== context.token;
    }

    /**
     * The error to reject a failed attempt with.
     *
     * An error response answers the attempt it belongs to just as a success
     * does: its envelope (`detail`, `code`, field errors) is the ended
     * account's data, and the caller's `onError` runs under whoever is signed
     * in now. So an attempt sent with a bearer token under an epoch that had
     * ended when its response arrived rejects with
     * {@link SessionSupersededError}, like a success would. Up to 0.86.0 only a
     * 2xx was checked, and a `404`/`409`/`500` to account A's request that
     * landed after `logout()` + `login(B)` reached B's `onError` carrying A's
     * body (security audit run-15).
     *
     * The reference point is the response's arrival, not the throw: a `401`
     * whose own handling ends the session — `refresh()` failing and signing
     * out, `onUnauthorized` calling `logout()` — moves the epoch *because of*
     * this response, and its caller must still see the `401`. Only when no
     * `401` handling ran is the epoch read again after decoding, to catch a
     * session change during the decode itself. When it ran, the response is
     * refused only if another session was installed meanwhile (see
     * `sessionReplacedSince`), which signing out because of the `401` never
     * does.
     *
     * @param response - The failed response.
     * @param requestId - The correlation id of the attempt.
     * @param context - The credential and epoch the answered attempt left with.
     * @param endedOnArrival - Whether that session had ended when the response
     * arrived, read before any `401` handling ran.
     * @param handled - Whether `refresh`/`onUnauthorized` ran for this response.
     * @returns The `TempestApiError` to throw, or `SessionSupersededError`
     * when the attempt's session had ended.
     */
    async function failure(
        response: Response,
        requestId: string,
        context: RequestAuthContext,
        endedOnArrival: boolean,
        handled: boolean,
    ): Promise<Error> {
        const error = await parseError(response, requestId);
        const ended =
            endedOnArrival ||
            (handled ? sessionReplacedSince(context) : sessionEndedSince(context));
        return ended ? new SessionSupersededError() : error;
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
     * A response that answers an attempt sent with a bearer token under a
     * session epoch that has since ended rejects with
     * {@link SessionSupersededError} instead of resolving, checked once the
     * body is decoded. The response holds the ended account's data, and the
     * caller's continuation — a mutation's `onSuccess` writing to a cache, a
     * `setState` — would hand it to the account signed in now: up to 0.86.0 a
     * mutation sent by account A before `logout()` resolved under account B,
     * and its `setQueryData` reached B's screens and B's offline snapshot
     * (security audit run-14, U7, #609). An error response gets the same check
     * (see `failure`). An attempt that carried no token says nothing about any
     * account, so it resolves — or rejects with the API error — as before.
     *
     * A `refresh()` that resolves after the rejected attempt's session ended
     * stops the request before the replay: the replay would leave with the
     * credential of whoever is signed in now and hand that account's answer to
     * the continuation the ended one started. `createTempestAuth` already
     * refuses inside its own refresh; a `refresh` hook of a standalone client
     * that ignores its context did not, and up to 0.87.0 `logout()` +
     * `login(B)` during it resent account A's `POST` with B's bearer (security
     * audit run-16). A `refresh()` that throws after the same switch rejects
     * with {@link SessionSupersededError} too, without calling
     * `onUnauthorized`, which would end B's session for A's `401` (#657).
     *
     * A `401` — to the first attempt or to the replay — that lands after the
     * session epoch it left under moved rejects with
     * {@link SessionSupersededError} before `refresh` or `onUnauthorized` run
     * (see `epochMovedSince`). Up to 0.90.0 the hooks ran anyway: a standalone
     * client whose `onUnauthorized` signs out ended account B's session for
     * account A's stale `401` after `logout()` + `login(B)`, and a tokenless
     * `401` landing after `login(B)` did the same (security audit run-17). The
     * `createTempestAuth` preset compared the epoch itself and was not
     * affected.
     *
     * Only a failing `refresh()` counts as the session failing. The replay is
     * sent outside that `try`: a network error on it — after a refresh that
     * succeeded, so the session is alive — rejects with that error, as on any
     * first attempt, without calling `onUnauthorized`. Up to 0.91.0 the same
     * `catch` took it, and a network blip right after a refresh signed the
     * user out (security audit run-17 §5, #684).
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
        let answered = sent;
        let response = await send(path, url, inScope, init, requestId, method, skipAuth);
        let endedOnArrival = sessionEndedSince(sent);
        let handled = false;

        if (response.status === 401 && inScope && !skipAuth && !skipAuthRetry) {
            if (epochMovedSince(sent)) throw new SessionSupersededError();
            handled = true;
            if (config.refresh) {
                let replayed: RequestAuthContext;
                try {
                    await config.refresh(sent);
                    if (sessionEndedSince(sent)) throw new SessionSupersededError();
                    replayed = authContext(skipAuth);
                } catch (error) {
                    if (error instanceof SessionSupersededError) throw error;
                    if (sessionReplacedSince(sent)) throw new SessionSupersededError();
                    await notifyUnauthorized(response, requestId, sent);
                    throw await failure(response, requestId, sent, endedOnArrival, true);
                }
                answered = replayed;
                response = await send(path, url, inScope, init, requestId, method, skipAuth);
                endedOnArrival = sessionEndedSince(replayed);
                handled = response.status === 401;
                if (response.status === 401) {
                    if (epochMovedSince(replayed)) throw new SessionSupersededError();
                    await notifyUnauthorized(response, requestId, replayed);
                }
            } else {
                await notifyUnauthorized(response, requestId, sent);
            }
        }

        if (!response.ok) {
            throw await failure(response, requestId, answered, endedOnArrival, handled);
        }

        const value = await decode(response);
        if (sessionEndedSince(answered)) throw new SessionSupersededError();
        return value;
    }

    /**
     * Whether a replay would leave under another session than the request's
     * first attempt did.
     *
     * Two shapes count: the first attempt carried a token and its epoch has
     * ended (a `logout()`, with or without the next `login()`), or the replay
     * would pick up a token the first attempt never had — a `login()` during the
     * backoff of a request sent signed out. In both, the replay is not the same
     * request any more: it carries another authority than the call site sent,
     * and its response would settle a continuation started under the first
     * session. A request whose attempts all go out without a token (`skipAuth`,
     * or signed out on both sides) carries no account, so the epoch moving
     * under it is no reason to stop.
     *
     * @param first - The credential and epoch of the first attempt.
     * @param next - The credential and epoch the replay would leave with.
     * @returns `true` when the epochs differ and either side has a token;
     * `false` without `getSessionEpoch`, which is what tells sessions apart.
     */
    function sessionChangedBetween(first: RequestAuthContext, next: RequestAuthContext): boolean {
        if (first.epoch === null || next.epoch === null || first.epoch === next.epoch) {
            return false;
        }
        return first.token !== null || next.token !== null;
    }

    /**
     * The request with its retry policy around it.
     *
     * The retry wrapper calls `attempt` once per try, and `attempt` reads the
     * credential when it leaves — so up to 0.87.0 a replay scheduled for account
     * A left with account B's bearer when `logout()` + `login(B)` ran during the
     * backoff, and resolved into the continuation A started; with a
     * `shouldRetry` that replays writes, A's `POST` ran in B's account (security
     * audit run-15 §6, #643). The session of the first attempt is now the
     * request's session: a replay that would leave under another one (see
     * `sessionChangedBetween`) is never sent, and the request rejects with
     * {@link SessionSupersededError}.
     *
     * The check runs twice. When an attempt fails, before asking `shouldRetry`:
     * a session that had already changed then changed during that attempt —
     * possibly *because of* it, as a `401` whose `onUnauthorized` signs out — and
     * the attempt's own error is the answer (`attempt` already turned it into
     * `SessionSupersededError` when the session ended in flight), so it is
     * thrown as is. And right before a replay leaves, after the backoff: a
     * change there is the backoff's, and nothing about it is the last error's.
     * A `SessionSupersededError` is never replayed, whatever `shouldRetry`
     * says.
     *
     * @param path - The path as the call site wrote it.
     * @param options - Request options, the `retry` override included.
     * @param decode - How to turn the response into a value.
     * @returns The decoded value.
     */
    async function run<T>(
        path: string,
        options: RequestOptions,
        decode: ResponseDecoder<T>,
    ): Promise<T> {
        const { retry: perRequest, ...rest } = options;
        const retryOptions = resolveRetry(perRequest !== undefined ? perRequest : config.retry);
        if (!retryOptions) return attempt<T>(path, rest, decode);

        const method = (rest.method ?? "GET").toUpperCase();
        const skipAuth = rest.skipAuth ?? false;
        const first = authContext(skipAuth);
        const changed = (): boolean => sessionChangedBetween(first, authContext(skipAuth));
        const policy =
            retryOptions.shouldRetry ?? ((error: unknown) => isRetriableFailure(error, method));
        let started = false;

        return retryWithBackoff(
            async () => {
                if (started && changed()) throw new SessionSupersededError();
                started = true;
                return attempt<T>(path, rest, decode);
            },
            {
                ...retryOptions,
                shouldRetry: (error: unknown, count: number) =>
                    !(error instanceof SessionSupersededError) &&
                    !changed() &&
                    policy(error, count),
            },
        );
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
        wsUrl: (path: string, params?: RequestOptions["params"]) =>
            toWebSocketUrl(buildApiUrl(config.baseURL, path, { prefix: config.prefix, params })),
    };
}
