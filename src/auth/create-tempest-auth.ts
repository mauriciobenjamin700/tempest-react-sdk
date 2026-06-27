import { createApiClient } from "../http";
import type { ApiClient } from "../http";
import { createAuthStore } from "./create-auth-store";
import type { AuthState } from "./create-auth-store";
import { createRefreshQueue } from "./refresh-queue";

/** The token envelope returned by a Tempest FastAPI SDK login/refresh route. */
export interface TempestTokenResponse {
    /** The bearer access token. */
    access_token: string;
    /** Token type — always `"bearer"` for the SDK. */
    token_type?: string;
    /** Optional refresh token (when the API returns it in the body, not a cookie). */
    refresh_token?: string;
}

export interface CreateTempestAuthOptions<TUser> {
    /** Base URL of the API. Required. */
    baseURL: string;
    /** Login route (`POST`). Default: `"/api/auth/login"`. */
    loginPath?: string;
    /** Refresh route (`POST`). Default: `"/api/auth/refresh"`. */
    refreshPath?: string;
    /** Optional current-user route (`GET`) called after login/refresh. */
    mePath?: string;
    /** Persist key for the store. Default: `"tempest-auth"`. */
    storeName?: string;
    /** Storage backend. Default: `"local"`. */
    storage?: "local" | "session";
    /** Send cookies (needed when the refresh token lives in an httpOnly cookie). */
    withCredentials?: boolean;
    /** Custom fetch implementation (testing / SSR). Defaults to `globalThis.fetch`. */
    fetcher?: typeof fetch;
    /**
     * Extract tokens from a login/refresh response. Default reads
     * `access_token` + `refresh_token`.
     */
    parseTokens?: (data: unknown) => { token: string; refreshToken?: string };
    /** Pull the user out of the login response, when the API embeds it. */
    parseUser?: (data: unknown) => TUser | null;
    /**
     * Build the refresh request body. Default sends `{ refresh_token }` when a
     * refresh token is stored, else `undefined` (cookie-based refresh).
     */
    refreshBody?: (refreshToken: string | null) => unknown;
}

export interface TempestAuth<TUser, TCredentials> {
    /** The persisted Zustand auth store hook (compatible with `<AuthGuard>`). */
    useAuthStore: ReturnType<typeof createAuthStore<TUser>>;
    /** A `createApiClient` wired with bearer auth + 401 → refresh → retry. */
    api: ApiClient;
    /** Authenticate, store the session, and resolve the user (or null). */
    login: (credentials: TCredentials) => Promise<TUser | null>;
    /** Clear the session (and the stored refresh token). */
    logout: () => void;
    /** Refresh the access token (deduplicated across concurrent callers). */
    refresh: () => Promise<void>;
    /** The current access token, or null. */
    getToken: () => string | null;
}

function defaultParseTokens(data: unknown): { token: string; refreshToken?: string } {
    const d = (data ?? {}) as TempestTokenResponse;
    return { token: d.access_token, refreshToken: d.refresh_token };
}

/**
 * Turn-key auth preset wiring `createAuthStore` + `createRefreshQueue` +
 * `createApiClient` to the Tempest FastAPI SDK auth contract: login returns
 * `{ access_token, token_type }`, requests carry `Authorization: Bearer`, and a
 * `401` triggers a single deduplicated refresh + retry. Logout (or a failed
 * refresh) clears the session.
 *
 * @example
 * const auth = createTempestAuth<User, { email: string; password: string }>({
 *     baseURL: import.meta.env.VITE_API_URL,
 *     mePath: "/api/auth/me",
 * });
 *
 * await auth.login({ email, password });   // stores session, returns the user
 * const orders = await auth.api.get("/api/orders");  // sends the bearer token
 * auth.logout();
 *
 * @param options - The auth configuration.
 * @returns The store hook, a wired API client, and login/logout/refresh helpers.
 */
export function createTempestAuth<TUser, TCredentials = { email: string; password: string }>(
    options: CreateTempestAuthOptions<TUser>,
): TempestAuth<TUser, TCredentials> {
    const {
        baseURL,
        loginPath = "/api/auth/login",
        refreshPath = "/api/auth/refresh",
        mePath,
        storeName = "tempest-auth",
        storage = "local",
        withCredentials = false,
        fetcher,
        parseTokens = defaultParseTokens,
        parseUser,
        refreshBody = (rt) => (rt ? { refresh_token: rt } : undefined),
    } = options;

    const useAuthStore = createAuthStore<TUser>({ name: storeName, storage });
    const refreshKey = `${storeName}-refresh`;

    function storageImpl(): Storage | null {
        if (typeof window === "undefined") return null;
        return storage === "session" ? window.sessionStorage : window.localStorage;
    }
    function readRefreshToken(): string | null {
        return storageImpl()?.getItem(refreshKey) ?? null;
    }
    function writeRefreshToken(token: string | null): void {
        const s = storageImpl();
        if (!s) return;
        if (token) s.setItem(refreshKey, token);
        else s.removeItem(refreshKey);
    }

    const state = (): AuthState<TUser> => useAuthStore.getState();
    const getToken = (): string | null => state().token;

    // Bare client (no auth/refresh) used for the login + refresh calls themselves.
    const bareApi = createApiClient({ baseURL, withCredentials, fetcher });

    async function fetchUser(): Promise<TUser | null> {
        if (!mePath) return state().user;
        const token = getToken();
        const user = await createApiClient({
            baseURL,
            withCredentials,
            fetcher,
            getToken: () => token,
        }).get<TUser>(mePath);
        state().setUser(user);
        return user;
    }

    async function login(credentials: TCredentials): Promise<TUser | null> {
        const data = await bareApi.post<unknown>(loginPath, { body: credentials });
        const { token, refreshToken } = parseTokens(data);
        state().setToken(token);
        writeRefreshToken(refreshToken ?? null);
        const embedded = parseUser?.(data);
        if (embedded != null) {
            state().setUser(embedded);
            return embedded;
        }
        return fetchUser();
    }

    function logout(): void {
        state().logout();
        writeRefreshToken(null);
    }

    const refresh = createRefreshQueue(async () => {
        const data = await bareApi.post<unknown>(refreshPath, {
            body: refreshBody(readRefreshToken()),
        });
        const { token, refreshToken } = parseTokens(data);
        state().setToken(token);
        if (refreshToken) writeRefreshToken(refreshToken);
    });

    const api = createApiClient({
        baseURL,
        withCredentials,
        fetcher,
        getToken,
        refresh,
        onUnauthorized: () => logout(),
    });

    return { useAuthStore, api, login, logout, refresh, getToken };
}
