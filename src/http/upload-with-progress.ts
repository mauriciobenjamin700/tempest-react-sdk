/**
 * @tempest-limits function-lines — XMLHttpRequest is used instead of fetch precisely
 * because it reports upload progress, and its API is event-based: the body wires
 * load, error, abort, timeout and progress against one request object, plus the
 * AbortSignal bridge.
 */
import { randomId } from "../utils";
import {
    isTrustedCredentialTarget,
    reportSuppressedCredential,
    resolveRequestUrl,
} from "./credential-scope";
import { csrfHeaders } from "./csrf";
import type { CsrfOptions } from "./csrf";
import { buildApiError, TempestApiError } from "./errors";

export interface UploadProgressEvent {
    /** Bytes already uploaded. */
    loaded: number;
    /** Total payload size in bytes — only meaningful when `lengthComputable` is true. */
    total: number;
    /** Fraction between 0 and 1, or null when total is unknown. */
    fraction: number | null;
    lengthComputable: boolean;
}

export interface UploadWithProgressOptions {
    url: string;
    body: FormData | Blob | File;
    method?: "POST" | "PUT" | "PATCH";
    headers?: Record<string, string>;
    /** Returns the current bearer token. */
    getToken?: () => string | null | undefined;
    /**
     * Origin the `getToken` credential belongs to, normally the API's.
     * Defaults to the page's own origin (`location.origin`).
     *
     * Unlike `createApiClient`, this helper has no base URL to infer a scope
     * from — the caller names the destination on every call, and the `url` can
     * come from somewhere other than your own code (a signed URL the API handed
     * back, a value from a response body). Until 0.82.0 an unset scope sent the
     * token wherever `url` pointed; it now starts closed, like the CSRF token
     * always did, and an API on another origin sets this to receive it (#530).
     *
     * Outside a browsing context there is no page origin, and the scope falls
     * back to `url` itself.
     */
    credentialOrigin?: string;
    /**
     * Extra origins allowed to receive the credential, on top of
     * {@link credentialOrigin} (or the page origin it defaults to).
     */
    trustedOrigins?: readonly string[];
    /** Send cookies. Defaults to false. */
    withCredentials?: boolean;
    /**
     * Send a CSRF token with the upload, as `createApiClient`'s `csrf` does.
     * Off by default; `true` reads the `csrf_token` cookie into `X-CSRF-Token`.
     *
     * Scoped exactly like the bearer token: to {@link credentialOrigin} (the
     * page's own origin when unset) plus {@link trustedOrigins}. An API on
     * another origin sets `credentialOrigin` to receive the token.
     */
    csrf?: boolean | CsrfOptions;
    /** Called on every `progress` event from the XHR upload channel. */
    onProgress?: (event: UploadProgressEvent) => void;
    /** Abort the request. */
    signal?: AbortSignal;
    /** Override the JSON parser. Defaults to `JSON.parse`. */
    parser?: (raw: string) => unknown;
    /**
     * Per-request correlation id sent as `X-Request-ID` (Tempest convention).
     * Defaults to a generated id. Return an empty string to disable.
     */
    requestId?: () => string;
    /**
     * What to do when the server answers with a redirect. When unset, the
     * helper picks: `"error"` when {@link headers} carry anything besides the
     * headers it exempts (`Authorization`, `X-Request-ID`, `Content-Type` and
     * `X-CSRF-Token`) **and** no {@link onProgress} was given, `"follow"`
     * otherwise (since 0.84.0). A value passed here always wins.
     *
     * - `"follow"` — the `XMLHttpRequest` path, with byte-level progress. The
     *   browser follows every redirect and offers no way to stop it: measured
     *   in Chrome 150, and again in Chromium 153, Firefox 155 and WebKit 26.6
     *   (#570), a same-origin upload answered `301`/`302`/`303`/`307`/`308`
     *   towards another origin delivered `X-Api-Key` from {@link headers} and
     *   the SDK's own `X-CSRF-Token` there on all five, and the body on
     *   `307`/`308`; only `Authorization` was stripped. What this path does
     *   enforce (since 0.83.0): an answer from another origin than the one the
     *   request was sent to is never the result — it rejects with
     *   `code: "REDIRECT_REFUSED"`, so that host cannot hand the app a URL to
     *   store. Until 0.82.0 it resolved with the other host's body.
     * - `"error"` — goes out over `fetch` with `redirect: "manual"`, and a
     *   redirect rejects with `code: "REDIRECT_REFUSED"` before anything is
     *   sent to the other host. The cost: `fetch` reports no upload progress,
     *   so `onProgress` fires once, when the server confirms the whole body,
     *   and a same-origin redirect (FastAPI's trailing-slash `307`) is refused
     *   too — a browser hands it back opaque, with no readable `Location`. A
     *   streamed `fetch` body would report progress, but Chrome refuses one
     *   over HTTP/1.1 (`TypeError: Failed to fetch`, measured) and Firefox and
     *   Safari do not support it.
     *
     * Why the default depends on `onProgress`: progress is the only thing the
     * XHR path buys, and the leak is its price. A caller that asked for no
     * progress paid that price for nothing, so its fixed headers get the
     * treatment `createApiClient` (#560) and `createResumableUpload` (#568)
     * give theirs. A caller that wants progress keeps it, and the guarantee is
     * one `redirect: "error"` away. Sending the bearer through
     * {@link getToken} keeps `"follow"` safe for it, because the browser
     * strips `Authorization` on a cross-origin redirect.
     */
    redirect?: "follow" | "error";
}

/**
 * The `code` of the {@link TempestApiError} an upload rejects with when a
 * redirect is refused, or when the answer came from another origin — the code
 * `createApiClient` and `createResumableUpload` use for the same refusal.
 */
const UPLOAD_REDIRECT_REFUSED = "REDIRECT_REFUSED";

/**
 * Fixed headers that do not switch an upload without `onProgress` to
 * `redirect: "error"`, lowercased.
 *
 * `authorization` is stripped by the browser on a cross-origin redirect
 * (measured in Chromium 153, Firefox 155 and WebKit 26.6). `x-request-id` and
 * `content-type` are not secrets. `x-csrf-token` does cross the redirect, and
 * is exempt for the reason `createApiClient` (#560) exempts it: it rides on
 * every `POST` of a cookie session, which is exactly the trailing-slash `307`
 * case, and on its own it authenticates nothing — using it takes the victim's
 * cookie and a custom header the API's CORS does not allow from another
 * origin. The header the `csrf` option adds is not part of `headers` and never
 * counts.
 */
const HEADERS_THAT_KEEP_FOLLOWING: ReadonlySet<string> = new Set([
    "authorization",
    "x-request-id",
    "content-type",
    "x-csrf-token",
]);

/**
 * The redirect mode an upload runs with when the caller did not pick one.
 *
 * @param headers - The caller's fixed headers.
 * @param wantsProgress - Whether an `onProgress` was given.
 * @returns `"error"` when a header that would leak rides along and progress
 *   was not asked for, `"follow"` otherwise.
 */
function defaultRedirect(
    headers: Record<string, string>,
    wantsProgress: boolean,
): "follow" | "error" {
    if (wantsProgress) return "follow";
    const leaks = Object.keys(headers).some(
        (name) => !HEADERS_THAT_KEEP_FOLLOWING.has(name.toLowerCase()),
    );
    return leaks ? "error" : "follow";
}

/** What a finished upload answered, whichever transport carried it. */
interface UploadAnswer {
    status: number;
    text: string;
    header: (name: string) => string | null;
}

function parseErrorBody(raw: string): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

/**
 * Turn a finished upload's answer into the promised value, or the error the
 * contract promises. Shared by both transports, so `redirect: "follow"` and
 * `redirect: "error"` resolve and reject the same way.
 *
 * @param answer - Status, raw text and a header reader.
 * @param parser - The JSON parser.
 * @param requestId - The `X-Request-ID` sent, for the error.
 * @returns The parsed JSON, the raw text, or `undefined` for an empty answer.
 * @throws {TempestApiError} On a non-2xx status.
 */
function settle<T>(answer: UploadAnswer, parser: (raw: string) => unknown, requestId: string): T {
    if (answer.status < 200 || answer.status >= 300) {
        throw new TempestApiError(
            buildApiError(
                answer.status,
                parseErrorBody(answer.text),
                { get: answer.header },
                requestId,
            ),
        );
    }
    if (answer.status === 204 || !answer.text) return undefined as T;
    if ((answer.header("content-type") ?? "").includes("application/json")) {
        return parser(answer.text) as T;
    }
    return answer.text as unknown as T;
}

/**
 * The origin a URL resolves to, or `null` when it does not resolve.
 *
 * @param url - Absolute or relative URL.
 * @returns The origin.
 */
function originOf(url: string): string | null {
    const resolved = resolveRequestUrl(url);
    return resolved === null ? null : new URL(resolved).origin;
}

/** What {@link sendWithoutRedirects} sends. */
interface ManualUpload {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: FormData | Blob;
    withCredentials: boolean;
    signal?: AbortSignal;
    requestId: string;
}

/**
 * Send the upload over `fetch` with `redirect: "manual"` — the
 * `redirect: "error"` path of {@link uploadWithProgress}.
 *
 * A browser hands the stopped redirect back as an `opaqueredirect` with
 * status `0`; a server runtime hands back the real `3xx`. Both are refused;
 * `304` is a cache answer, not a redirect.
 *
 * @param init - Where, how, and what to send.
 * @returns The answer.
 * @throws {TempestApiError} `code: "REDIRECT_REFUSED"` on a redirect, status
 *   `0` on a network failure.
 */
async function sendWithoutRedirects(init: ManualUpload): Promise<UploadAnswer> {
    let response: Response;
    try {
        response = await fetch(init.url, {
            method: init.method,
            headers: init.headers,
            body: init.body,
            credentials: init.withCredentials ? "include" : "same-origin",
            redirect: "manual",
            signal: init.signal,
        });
    } catch {
        if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        throw new TempestApiError({
            status: 0,
            detail: "Falha de rede no upload.",
            requestId: init.requestId || undefined,
        });
    }
    if (
        response.type === "opaqueredirect" ||
        (response.status >= 300 && response.status < 400 && response.status !== 304)
    ) {
        throw new TempestApiError({
            status: response.status,
            code: UPLOAD_REDIRECT_REFUSED,
            detail: "Redirect não seguido no upload.",
            requestId: init.requestId || undefined,
        });
    }
    return {
        status: response.status,
        text: await response.text(),
        header: (name) => response.headers.get(name),
    };
}

/**
 * Upload a file (or any payload) with byte-level progress reporting.
 *
 * `fetch` cannot report upload progress in browsers, so this helper falls
 * back to `XMLHttpRequest`. It mirrors the error contract used by
 * {@link createApiClient}: non-2xx responses reject with a `TempestApiError`.
 *
 * An `XMLHttpRequest` cannot refuse a redirect; see
 * {@link UploadWithProgressOptions.redirect} for what follows one, what the
 * helper still refuses, the `fetch` path that trades progress for never
 * following, and when that path is the default (fixed headers and no
 * `onProgress`, since 0.84.0).
 *
 * @returns The parsed JSON response, or the raw text when the response is not JSON.
 */
export function uploadWithProgress<T = unknown>(options: UploadWithProgressOptions): Promise<T> {
    const {
        url,
        body,
        method = "POST",
        headers = {},
        getToken,
        credentialOrigin,
        trustedOrigins,
        withCredentials = false,
        csrf,
        onProgress,
        signal,
        parser = JSON.parse,
        requestId,
        redirect = defaultRedirect(options.headers ?? {}, options.onProgress !== undefined),
    } = options;

    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

    const token = getToken?.();
    const sentRequestId = requestId ? requestId() : randomId();
    const finalHeaders: Record<string, string> = { ...headers };
    const scope = credentialOrigin ?? globalThis.location?.origin ?? url;
    if (token && !("Authorization" in finalHeaders)) {
        if (isTrustedCredentialTarget(url, scope, trustedOrigins)) {
            finalHeaders.Authorization = `Bearer ${token}`;
        } else {
            reportSuppressedCredential(url, scope);
        }
    }
    Object.assign(
        finalHeaders,
        csrfHeaders({
            method,
            url,
            reference: scope,
            csrf,
            trustedOrigins,
            headers,
        }),
    );
    if (sentRequestId && !("X-Request-ID" in finalHeaders)) {
        finalHeaders["X-Request-ID"] = sentRequestId;
    }

    if (redirect === "error") {
        return sendWithoutRedirects({
            url,
            method,
            headers: finalHeaders,
            body,
            withCredentials,
            signal,
            requestId: sentRequestId,
        }).then((answer) => {
            const sized = body instanceof Blob;
            const total = sized ? body.size : 0;
            onProgress?.({
                loaded: total,
                total,
                fraction: sized ? 1 : null,
                lengthComputable: sized,
            });
            return settle<T>(answer, parser, sentRequestId);
        });
    }

    return new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.withCredentials = withCredentials;
        for (const [key, value] of Object.entries(finalHeaders)) {
            xhr.setRequestHeader(key, value);
        }

        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                onProgress({
                    loaded: event.loaded,
                    total: event.total,
                    fraction: event.lengthComputable ? event.loaded / event.total : null,
                    lengthComputable: event.lengthComputable,
                });
            };
        }

        function handleAbort(): void {
            xhr.abort();
        }
        signal?.addEventListener("abort", handleAbort);

        xhr.onload = () => {
            signal?.removeEventListener("abort", handleAbort);
            const landed = xhr.responseURL ? originOf(xhr.responseURL) : null;
            if (landed !== null && landed !== originOf(url)) {
                reject(
                    new TempestApiError({
                        status: xhr.status,
                        code: UPLOAD_REDIRECT_REFUSED,
                        detail: "O upload foi redirecionado para outra origem.",
                        requestId: sentRequestId || undefined,
                    }),
                );
                return;
            }
            try {
                resolve(
                    settle<T>(
                        {
                            status: xhr.status,
                            text: xhr.responseText,
                            header: (name) => xhr.getResponseHeader(name),
                        },
                        parser,
                        sentRequestId,
                    ),
                );
            } catch (err) {
                reject(err);
            }
        };

        xhr.onerror = () => {
            signal?.removeEventListener("abort", handleAbort);
            reject(
                new TempestApiError({
                    status: 0,
                    detail: "Falha de rede no upload.",
                    requestId: sentRequestId || undefined,
                }),
            );
        };

        xhr.onabort = () => {
            signal?.removeEventListener("abort", handleAbort);
            reject(new DOMException("Aborted", "AbortError"));
        };

        xhr.send(body);
    });
}
