export interface ApiError {
    status: number;
    detail: string;
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
