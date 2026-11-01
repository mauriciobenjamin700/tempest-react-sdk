/**
 * @tempest-limits function-lines — XMLHttpRequest is used instead of fetch precisely
 * because it reports upload progress, and its API is event-based: the body wires
 * load, error, abort, timeout and progress against one request object, plus the
 * AbortSignal bridge.
 */
import { randomId } from "../utils";
import { isTrustedCredentialTarget, reportSuppressedCredential } from "./credential-scope";
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
 * Upload a file (or any payload) with byte-level progress reporting.
 *
 * `fetch` cannot report upload progress in browsers, so this helper falls
 * back to `XMLHttpRequest`. It mirrors the error contract used by
 * {@link createApiClient}: non-2xx responses reject with a `TempestApiError`.
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
    } = options;

    return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }

        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.withCredentials = withCredentials;

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
            const isSuccess = xhr.status >= 200 && xhr.status < 300;
            const contentType = xhr.getResponseHeader("content-type") ?? "";

            if (!isSuccess) {
                const errorBody = parseErrorBody(xhr.responseText);
                reject(
                    new TempestApiError(
                        buildApiError(
                            xhr.status,
                            errorBody,
                            { get: (name) => xhr.getResponseHeader(name) },
                            sentRequestId,
                        ),
                    ),
                );
                return;
            }

            if (xhr.status === 204 || !xhr.responseText) {
                resolve(undefined as T);
                return;
            }

            if (contentType.includes("application/json")) {
                try {
                    resolve(parser(xhr.responseText) as T);
                } catch (err) {
                    reject(err);
                }
            } else {
                resolve(xhr.responseText as unknown as T);
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
