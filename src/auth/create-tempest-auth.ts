import { createApiClient, RefreshSupersededError } from "../http";
import type { ApiClient, CsrfOptions, RefreshContext, RetryOptions } from "../http";
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

/**
 * What {@link CreateTempestAuthOptions.onSessionEnd} receives about the session
 * that just ended.
 */
export interface TempestSessionEnd<TUser> {
    /**
     * Why it ended: `"logout"` for an explicit `logout()`, `"expired"` when the
     * client ended it on its own — the refresh failed, or the request replayed
     * after a refresh still came back `401` — and `"switch"` when `login()`
     * succeeded for another set of credentials while this session was live.
     */
    reason: "logout" | "expired" | "switch";
    /** The user of the ended session, as the store held it. */
    user: TUser | null;
    /** The access token of the ended session, or `null` when it had none. */
    token: string | null;
    /**
     * A client that sends the ended session's access token — the store has
     * already been cleared, so `auth.api` no longer does.
     *
     * Use it for the server-side half of the teardown, such as deleting this
     * browser's push subscription. It never refreshes and never ends a session:
     * a `401` here just rejects. On `"logout"` the token is usually still
     * valid; on `"expired"` the server has already refused it, so expect the
     * call to fail and keep the local half of the teardown independent of it.
     */
    api: ApiClient;
}

export interface CreateTempestAuthOptions<TUser> {
    /** Base URL of the API. Required. */
    baseURL: string;
    /**
     * Path segment the API is mounted under, such as `"/api"`, forwarded to
     * every client this preset builds — see the `prefix` option of
     * `createApiClient`.
     *
     * Safe to combine with the default paths below: the prefix is applied at
     * most once, so `"/api/auth/login"` under a `"/api"` prefix stays
     * `"/api/auth/login"`.
     */
    prefix?: string;
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
    /**
     * CSRF token for every write, forwarded to `createApiClient`'s `csrf`. Off
     * by default; `true` echoes the `csrf_token` cookie as `X-CSRF-Token`.
     *
     * The pair to `withCredentials`: once the refresh token lives in a cookie,
     * the browser attaches it to a `POST /auth/refresh` that another site
     * triggers. Login and refresh carry the header too — they go out with
     * `skipAuth`, and the CSRF header does not follow auth.
     */
    csrf?: boolean | CsrfOptions;
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
    /**
     * Retry policy for `api`, forwarded to {@link createApiClient}. Off by
     * default; `true` enables the conservative built-in policy, which never
     * replays a write.
     */
    retry?: boolean | RetryOptions;
    /**
     * Where to send the browser when the session ends — a hard navigation via
     * `window.location.assign`, after the store is cleared.
     *
     * **Prefer leaving this unset.** `logout()` already clears the store, so a
     * `<RouteGuard when={isAuthenticated} redirectTo="/login">` wrapped around
     * the protected area navigates on its own, which keeps the SPA alive and the
     * router history intact. Reach for this only when the expiry can happen
     * outside any guarded subtree and a full reload is acceptable.
     */
    redirectTo?: string;
    /**
     * Tear down per-user state when a session ends — on an explicit `logout()`,
     * when the client ends the session on its own after a failed refresh, and
     * when a successful `login()` replaces a live session. Without it, the automatic path had no place to hook into, and
     * state derived from the user (a push subscription, a persisted query
     * cache, a background-sync queue) survived into the next account.
     *
     * Order, on every path:
     *
     * 1. any refresh still in flight is superseded, so it cannot reinstall the
     *    ending session's tokens;
     * 2. the store and the stored refresh token are cleared — synchronously, so
     *    `isAuthenticated` is already `false` when `logout()` returns;
     * 3. this hook runs with a {@link TempestSessionEnd} whose `api` still sends
     *    the ended session's access token;
     * 4. on `"expired"` with `redirectTo` set, the browser navigates — after the
     *    hook settled, even if it threw; on `"switch"`, the new session is
     *    installed — after the hook settled, even if it threw.
     *
     * It may be async. `logout()` resolves when it settles and rejects with what
     * it threw; on the automatic path the error is swallowed, because the
     * request that ended the session already rejects with its own `401`. It
     * runs once per session: a second `logout()`, or the other requests of a
     * burst of `401`s, find nothing left to end and skip it.
     *
     * On `"switch"` the hook runs only **after** the new credentials were
     * accepted, so a failed `login()` leaves the live session untouched. It runs
     * **before** the new session is installed: teardown of the previous
     * account's state (clearing a persisted cache, a background-sync queue) has
     * to finish before the new account's requests start filling them, or it
     * would wipe — or race with — the new account's data. The cost is that
     * `isAuthenticated` is `false` while the hook runs, which a route guard may
     * act on; keep the hook short. Its error is swallowed there, since the
     * login itself succeeded.
     */
    onSessionEnd?: (session: TempestSessionEnd<TUser>) => void | Promise<void>;
}

export interface TempestAuth<TUser, TCredentials> {
    /** The persisted Zustand auth store hook (compatible with `<AuthGuard>`). */
    useAuthStore: ReturnType<typeof createAuthStore<TUser>>;
    /** A `createApiClient` wired with bearer auth + 401 → refresh → retry. */
    api: ApiClient;
    /** Authenticate, store the session, and resolve the user (or null). */
    login: (credentials: TCredentials) => Promise<TUser | null>;
    /**
     * End the session: supersede any refresh in flight, clear the store and the
     * stored refresh token, then run `onSessionEnd`.
     *
     * The store is cleared synchronously, before the first `await`, so callers
     * that ignore the promise see the signed-out state at once. The promise
     * resolves when `onSessionEnd` settled and rejects with its error.
     */
    logout: () => Promise<void>;
    /**
     * Refresh the access token (deduplicated across concurrent callers).
     *
     * @throws {RefreshSupersededError} When the session ended or changed while
     *   the refresh was in flight; its tokens were discarded.
     */
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
 * `401` triggers a single deduplicated refresh + replay.
 *
 * The session is cleared whenever that path ends unauthorized anyway — the
 * refresh threw, or the replay came back `401` — so a refresh token that the
 * backend has revoked cannot leave the app holding a dead session. With
 * `redirectTo` set, the browser also leaves the page; without it, clearing the
 * store is enough for a `<RouteGuard>` to navigate on its own.
 *
 * Every refresh is bound to a **session epoch**, bumped by `logout()` and by a
 * `login()` whose credentials were accepted. A refresh that resolves after its epoch ended discards
 * what it brought back and rejects with {@link RefreshSupersededError}, which
 * the client passes through without ending the new session. Before 0.77.0 a
 * refresh that was in flight during `logout()` reinstalled the old tokens —
 * and after `logout()` + `login(B)`, replaced B's token with A's while the UI
 * showed B (#435). A `401` from a request sent under an ended session is
 * refused the same way, instead of being replayed as the account signed in now.
 *
 * Refreshes are collapsed per rotation, not just per overlap: a `401` whose
 * request left with a token that has since been replaced in the same session
 * replays with the new token and refreshes nothing. Three expired requests take
 * one refresh whether their `401`s arrive together or one after another.
 *
 * @example
 * const auth = createTempestAuth<User, { email: string; password: string }>({
 *     baseURL: import.meta.env.VITE_API_URL,
 *     mePath: "/api/auth/me",
 * });
 *
 * await auth.login({ email, password });   // stores session, returns the user
 * const orders = await auth.api.get("/api/orders");  // sends the bearer token
 * await auth.logout();                      // clears, then runs onSessionEnd
 *
 * @param options - The auth configuration.
 * @returns The store hook, a wired API client, and login/logout/refresh helpers.
 */
export function createTempestAuth<TUser, TCredentials = { email: string; password: string }>(
    options: CreateTempestAuthOptions<TUser>,
): TempestAuth<TUser, TCredentials> {
    const {
        baseURL,
        prefix,
        loginPath = "/api/auth/login",
        refreshPath = "/api/auth/refresh",
        mePath,
        storeName = "tempest-auth",
        storage = "local",
        withCredentials = false,
        csrf,
        fetcher,
        parseTokens = defaultParseTokens,
        parseUser,
        refreshBody = (rt) => (rt ? { refresh_token: rt } : undefined),
        retry,
        redirectTo,
        onSessionEnd,
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

    /**
     * Load the current user, without letting a `401` end the session.
     *
     * `skipAuthRetry` is what keeps this one client honest: the call is
     * authenticated, but a `401` here surfaces instead of triggering a refresh
     * and `onUnauthorized`. That was the behaviour of the throwaway client this
     * used to build per invocation, and it is the reason the preset needed
     * three clients before 0.66.0.
     */
    async function fetchUser(): Promise<TUser | null> {
        if (!mePath) return state().user;
        const user = await api.get<TUser>(mePath, { skipAuthRetry: true });
        state().setUser(user);
        return user;
    }

    let epoch = 0;
    const issued = new Set<string>();
    const retired = new Set<string>();
    let ending: Promise<void> = Promise.resolve();

    /**
     * Install an access token under the current epoch, remembering it and the
     * one it replaces.
     *
     * Remembering both is what lets `refreshFor` tell a `401` from this
     * session's older token (already rotated, just replay) from one sent under a
     * session that has since ended (refuse). The replaced token counts because
     * it may never have passed through here — rehydrated from storage on a page
     * load, or set on the store directly.
     *
     * @param token - The access token to install.
     */
    function install(token: string): void {
        const replaced = state().token;
        if (replaced) issued.add(replaced);
        state().setToken(token);
        issued.add(token);
    }

    /**
     * Start a new session epoch: supersede the refresh in flight, retire this
     * epoch's tokens — the one in the store included, for the same reason as in
     * `install` — and give the new epoch a refresh queue of its own, so a `401`
     * under the new session never joins the old session's refresh.
     */
    function nextEpoch(): void {
        epoch += 1;
        const current = state().token;
        if (current) issued.add(current);
        for (const token of issued) retired.add(token);
        issued.clear();
        queue = createRefreshQueue(rotate);
    }

    /**
     * Perform one refresh for the epoch that is current when it starts.
     *
     * Checked again after the round trip, on success and on failure alike: a
     * refresh that fails after `logout()` + `login(B)` must not reach
     * `onUnauthorized` either, or it would end B's session.
     *
     * @throws {RefreshSupersededError} When the epoch changed during the call.
     */
    async function rotate(): Promise<void> {
        const started = epoch;
        let data: unknown;
        try {
            data = await api.post<unknown>(refreshPath, {
                body: refreshBody(readRefreshToken()),
                skipAuth: true,
            });
        } catch (error) {
            if (epoch !== started) throw new RefreshSupersededError();
            throw error;
        }
        if (epoch !== started) throw new RefreshSupersededError();
        const { token, refreshToken } = parseTokens(data);
        install(token);
        if (refreshToken) writeRefreshToken(refreshToken);
    }

    let queue = createRefreshQueue(rotate);

    /**
     * The `refresh` the client calls on a `401`, told which token the rejected
     * request carried.
     *
     * - A token retired by an ended session, no longer current: the request
     *   belongs to that session and is refused rather than replayed as whoever
     *   is signed in now.
     * - Any other token that is no longer current: this session already rotated
     *   past it, so the replay just picks up the new one — no second refresh.
     * - Otherwise: join or start this epoch's refresh.
     *
     * @param context - The token the rejected request was sent with.
     * @throws {RefreshSupersededError} When the request belongs to an ended
     *   session, or the session changed during the refresh.
     */
    async function refreshFor(context: RefreshContext): Promise<void> {
        const current = getToken();
        if (context.token !== null && context.token !== current) {
            if (retired.has(context.token)) throw new RefreshSupersededError();
            if (current !== null) return;
        }
        return queue();
    }

    /**
     * Authenticate and install the new session.
     *
     * The previous session ends only once the new credentials are accepted: a
     * login that fails leaves it, and the refresh it may have in flight,
     * untouched. When one was live, `onSessionEnd` runs with `"switch"` before
     * the new tokens are installed — see the option for why that order. A
     * `logout()` still tearing down is awaited the same way, so the new
     * account's state never starts before the previous one's teardown ended.
     *
     * @param credentials - Sent as the login body.
     * @returns The user of the new session, or null.
     * @throws {RefreshSupersededError} When another `logout()` or `login()`
     *   ended the session while this one was waiting on the teardown; the new
     *   tokens are discarded.
     */
    async function login(credentials: TCredentials): Promise<TUser | null> {
        const data = await api.post<unknown>(loginPath, {
            body: credentials,
            skipAuth: true,
        });
        const { token, refreshToken } = parseTokens(data);
        const teardown = finish("switch");
        const mine = epoch;
        await teardown.catch(() => undefined);
        if (epoch !== mine) throw new RefreshSupersededError();
        install(token);
        writeRefreshToken(refreshToken ?? null);
        const embedded = parseUser?.(data);
        if (embedded != null) {
            state().setUser(embedded);
            return embedded;
        }
        return fetchUser();
    }

    /**
     * End the current session, synchronously up to the hook.
     *
     * The epoch moves first, so a refresh resolving between here and the hook
     * is already superseded. The hook only runs when there was a session to
     * end — a token, a stored refresh token or a user — which is what keeps a
     * burst of `401`s from running it once per request; those later callers
     * wait on the teardown already under way instead, through `ending`, which
     * never rejects so a later no-op `logout()` does not inherit an old error.
     *
     * @param reason - Whether the caller signed out, the client gave up, or a
     *   login replaced the session.
     * @returns A promise settling with the hook.
     */
    function finish(reason: TempestSessionEnd<TUser>["reason"]): Promise<void> {
        nextEpoch();
        const { user, token } = state();
        const live = token !== null || user !== null || readRefreshToken() !== null;
        state().logout();
        writeRefreshToken(null);
        if (!live) return ending;
        if (!onSessionEnd) return Promise.resolve();
        const sessionApi = createApiClient({
            baseURL,
            prefix,
            withCredentials,
            csrf,
            fetcher,
            getToken: () => token,
        });
        const run = (async () => {
            await onSessionEnd({ reason, user, token, api: sessionApi });
        })();
        ending = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    function logout(): Promise<void> {
        return finish("logout");
    }

    /**
     * End the session after the client gave up on it and, when `redirectTo`
     * is set, leave the page once `onSessionEnd` settled.
     *
     * Separate from `logout` so an explicit sign-out stays a pure state change:
     * a caller that already navigates itself would otherwise get a second,
     * competing navigation. The hook is awaited before navigating because a
     * hard navigation aborts whatever request it still had in flight.
     */
    async function endSession(): Promise<void> {
        await finish("expired").catch(() => undefined);
        if (redirectTo && typeof window !== "undefined") {
            window.location.assign(redirectTo);
        }
    }

    const api = createApiClient({
        baseURL,
        prefix,
        withCredentials,
        csrf,
        fetcher,
        getToken,
        refresh: refreshFor,
        retry,
        onUnauthorized: () => endSession(),
    });

    const refresh = (): Promise<void> => queue();

    return { useAuthStore, api, login, logout, refresh, getToken };
}
