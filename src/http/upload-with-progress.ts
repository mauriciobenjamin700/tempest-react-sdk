import type { ApiError } from "./types";

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
    /** Send cookies. Defaults to false. */
    withCredentials?: boolean;
    /** Called on every `progress` event from the XHR upload channel. */
    onProgress?: (event: UploadProgressEvent) => void;
    /** Abort the request. */
    signal?: AbortSignal;
    /** Override the JSON parser. Defaults to `JSON.parse`. */
    parser?: (raw: string) => unknown;
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
 * {@link createApiClient}: non-2xx responses throw an {@link ApiError}.
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
        withCredentials = false,
        onProgress,
        signal,
        parser = JSON.parse,
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
        const finalHeaders: Record<string, string> = { ...headers };
        if (token && !("Authorization" in finalHeaders)) {
            finalHeaders.Authorization = `Bearer ${token}`;
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
                const detail =
                    (typeof errorBody === "object" && errorBody !== null
                        ? ((errorBody as Record<string, unknown>).detail ??
                          (errorBody as Record<string, unknown>).message)
                        : undefined) ?? `Erro ${xhr.status}`;
                const error: ApiError = {
                    status: xhr.status,
                    detail: String(detail),
                    body: errorBody,
                };
                reject(error);
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
            reject({ status: 0, detail: "Falha de rede no upload." } as ApiError);
        };

        xhr.onabort = () => {
            signal?.removeEventListener("abort", handleAbort);
            reject(new DOMException("Aborted", "AbortError"));
        };

        xhr.send(body);
    });
}
