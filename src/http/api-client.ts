import type { ApiClient, ApiClientConfig, ApiError, RequestOptions } from "./types";

function buildUrl(baseURL: string, path: string, params?: RequestOptions["params"]): string {
    const url = new URL(path, baseURL.endsWith("/") ? baseURL : `${baseURL}/`);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        }
    }
    return url.toString();
}

function isFormData(body: unknown): body is FormData {
    return typeof FormData !== "undefined" && body instanceof FormData;
}

async function parseError(response: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
        body = await response.clone().json();
    } catch {
        try {
            body = await response.text();
        } catch {
            body = null;
        }
    }
    const detail =
        (typeof body === "object" && body !== null
            ? ((body as Record<string, unknown>).detail ??
              (body as Record<string, unknown>).message)
            : undefined) ?? `Erro ${response.status}`;
    return {
        status: response.status,
        detail: String(detail),
        body,
    };
}

/**
 * Create a typed HTTP client backed by `fetch`.
 *
 * Handles JSON serialization, query params, bearer auth via `getToken`,
 * automatic refresh + retry on 401 when `refresh` is supplied, and uploads
 * via `FormData`. Throws an `ApiError` on non-2xx responses.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
    const fetcher = config.fetcher ?? globalThis.fetch.bind(globalThis);

    function authHeaders(): Record<string, string> {
        const token = config.getToken?.();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
        const { body, params, headers, ...rest } = options;
        const isForm = isFormData(body);

        const finalHeaders: Record<string, string> = {
            ...(isForm ? {} : { "Content-Type": "application/json" }),
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

        return fetcher(buildUrl(config.baseURL, path, params), init);
    }

    async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        let response = await rawRequest(path, options);

        if (response.status === 401) {
            if (config.refresh) {
                try {
                    await config.refresh();
                    response = await rawRequest(path, options);
                } catch {
                    await config.onUnauthorized?.(response);
                    throw await parseError(response);
                }
            } else {
                await config.onUnauthorized?.(response);
            }
        }

        if (!response.ok) {
            throw await parseError(response);
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
