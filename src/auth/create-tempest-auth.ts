import { createApiClient, SessionSupersededError } from "../http";
import { isDevBuild } from "../utils/dev-mode";
import type { ApiClient, CsrfOptions, RequestAuthContext, RetryOptions } from "../http";
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
    /**
     * Server-side logout route (`POST`), called by an explicit `logout()` to
     * revoke the ending session. Off by default.
     *
     * `logout()` alone only clears client state, and an HttpOnly refresh
     * cookie is out of its reach: with `withCredentials`, the cookie stays
     * redeemable until the backend revokes it. The tempest-fastapi-sdk mounts
     * `POST /auth/logout` (`204`, idempotent) when it stores refresh tokens in
     * the database — at `/auth/cookie/logout` when it delivers tokens both in
     * the body and in cookies — and stateless refresh tokens cannot be
     * revoked, so the route is absent there.
     *
     * The request goes out through the ended session's client (the same one
     * `onSessionEnd` receives, carrying its access token), with the body that
     * `refreshBody` builds from the refresh token stored before the clear:
     * `{ refresh_token }` in body mode, no body in cookie mode, which is what
     * that route reads. The local clear does not wait on it — `isAuthenticated`
     * is still `false` when `logout()` returns — but the promise `logout()`
     * returns does, so a navigation after `await auth.logout()` does not abort
     * it. A failure (network, `4xx`, `5xx`) is swallowed: revocation is
     * best-effort and never keeps the user signed in. A `login()` started
     * while it is in flight waits for it, because the logout response clears
     * the auth cookies and would otherwise clear the new account's.
     *
     * Only an explicit `logout()` revokes. On `"switch"` the cookie jar already
     * holds the new account's cookie, and on `"expired"` the server has already
     * refused the session.
     *
     * Overlapping sign-outs each send their own revocation, and `login()` waits
     * for all of them — at most 10 seconds, so one that
     * never answers delays the sign-in instead of blocking it. In cookie mode,
     * a revocation also waits (within the same bound) for the login and
     * refresh responses that were in flight when `logout()` ran: the server
     * sets the ended session's cookie when that response arrives, and a
     * revocation sent earlier would leave it behind. In body mode, the refresh
     * token such a superseded response brings back is revoked on its own.
     */
    logoutPath?: string;
    /**
     * Called with the error when a `logoutPath` revocation fails — network
     * failure, `4xx` or `5xx`. `logout()` still resolves, since the local
     * sign-out already happened; this is where the app logs or retries. A dev
     * build also warns in the console. Errors it throws are swallowed.
     */
    onLogoutError?: (error: unknown) => void;
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
     *
     * Inside the hook, reach the backend only through `session.api`. `auth.api`
     * goes out with no token; `auth.login()` waits on the teardown in progress —
     * this hook — and never settles. Telling the hook apart from an outside
     * caller would need an async context the browser does not have, so this is
     * a documented rule, not a runtime check.
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
     * resolves when `onSessionEnd` settled — and, with `logoutPath`, when the
     * server-side revocation settled too — and rejects with the hook's error;
     * a failed revocation never rejects it.
     */
    logout: () => Promise<void>;
    /**
     * Refresh the access token (deduplicated across concurrent callers).
     *
     * @throws {SessionSupersededError} When the session ended or changed while
     *   the refresh was in flight; its tokens were discarded.
     */
    refresh: () => Promise<void>;
    /** The current access token, or null. */
    getToken: () => string | null;
}

/**
 * How long `login()` waits for pending `logoutPath` revocations, and how long a
 * cookie-mode revocation waits for the login or refresh responses still in
 * flight when `logout()` ran, before going ahead anyway.
 *
 * A bound, not a guess at latency: a fetcher that ignores abort, or a backend
 * that never answers, would otherwise leave the next `login()` waiting forever.
 * Ten seconds is past any healthy round trip and short enough that a stuck
 * revocation costs a slow sign-in, not a dead one.
 */
const LOGOUT_REVOCATION_WAIT_MS = 10_000;

/**
 * Wait until every promise settled, or until `ms` passed, whichever is first.
 *
 * @param pending - What to wait for; rejections count as settled.
 * @param ms - The bound.
 * @returns A promise that always resolves.
 */
function settleWithin(pending: readonly Promise<unknown>[], ms: number): Promise<void> {
    if (pending.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        void Promise.allSettled(pending).then(() => {
            clearTimeout(timer);
            resolve();
        });
    });
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
 * what it brought back and rejects with {@link SessionSupersededError}, which
 * the client passes through without ending the new session. Before 0.77.0 a
 * refresh that was in flight during `logout()` reinstalled the old tokens —
 * and after `logout()` + `login(B)`, replaced B's token with A's while the UI
 * showed B (#435). A `401` from a request sent under an ended session is
 * refused the same way, instead of being replayed as the account signed in now.
 *
 * A `401` from a request that carried no token, while no session is installed,
 * surfaces without a refresh: in cookie mode that refresh would be answered by
 * the HttpOnly cookie `logout()` cannot clear, signing the previous account
 * back in (#474). With a `login()` in flight, that `401` waits for it and
 * replays with the token it installed, or surfaces when it failed — still
 * without a refresh (#496). Restore a session at boot with an explicit
 * `refresh()`, and pass `logoutPath` so the backend revokes the cookie:
 * without a working revocation, that boot `refresh()` restores the previous
 * account for whoever uses the browser next.
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
        logoutPath,
        onLogoutError,
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
     *
     * Bound to the epoch current when the request leaves, like `rotate()`: a
     * profile that resolves after `logout()` — or after `logout()` +
     * `login(B)` — is discarded instead of written next to B's token, and the
     * `login()` that asked for it rejects as superseded (#473).
     *
     * @throws {SessionSupersededError} When the epoch changed while the
     *   request was in flight, on success and on failure alike.
     */
    async function fetchUser(): Promise<TUser | null> {
        if (!mePath) return state().user;
        const started = epoch;
        let user: TUser;
        try {
            user = await api.get<TUser>(mePath, { skipAuthRetry: true });
        } catch (error) {
            if (epoch !== started) throw new SessionSupersededError();
            throw error;
        }
        if (epoch !== started) throw new SessionSupersededError();
        state().setUser(user);
        return user;
    }

    let epoch = 0;
    let ending: Promise<void> = Promise.resolve();
    let hooksRunning = 0;
    const loginsInFlight = new Set<Promise<unknown>>();
    const revocations = new Set<Promise<void>>();
    const credentialRequests = new Set<Promise<unknown>>();
    const rotatingEpochs = new Set<number>();

    /**
     * Track a login or refresh request until it settles, so a cookie-mode
     * revocation can wait for the response that sets the cookie it revokes.
     *
     * @param request - The request in flight.
     * @returns The same request.
     */
    function trackCredentialRequest<T>(request: Promise<T>): Promise<T> {
        const settled = request.then(
            () => undefined,
            () => undefined,
        );
        credentialRequests.add(settled);
        void settled.then(() => credentialRequests.delete(settled));
        return request;
    }

    /**
     * Surface a failed revocation: `onLogoutError`, plus a console warning in a
     * dev build.
     *
     * @param error - What the revocation rejected with.
     */
    function reportLogoutError(error: unknown): void {
        if (isDevBuild()) {
            console.warn(
                "[tempest-react-sdk] createTempestAuth: logoutPath revocation failed",
                error,
            );
        }
        try {
            onLogoutError?.(error);
        } catch {
            return;
        }
    }

    /**
     * Send one `logoutPath` revocation and track it until it settles. Never
     * rejects.
     *
     * @param build - Produces the request, after whatever wait it needs.
     * @returns A promise settling when the revocation settled.
     */
    function trackRevocation(build: () => Promise<unknown>): Promise<void> {
        const tracked = (async () => {
            try {
                await build();
            } catch (error) {
                reportLogoutError(error);
            }
        })();
        revocations.add(tracked);
        void tracked.then(() => revocations.delete(tracked));
        return tracked;
    }

    /**
     * Revoke, in body mode, the refresh token a superseded login or refresh
     * brought back. Nobody can use it — the client discarded it — but it would
     * stay valid on the server until it expires.
     *
     * Cookie mode is left to `revoke()`, which waits for these responses
     * instead: re-sending a cookie revocation here could carry whichever
     * account's cookie the browser holds by then.
     *
     * @param token - The superseded response's access token.
     * @param refreshToken - The superseded response's refresh token.
     */
    function revokeDiscarded(token: string | null, refreshToken: string | undefined): void {
        if (!logoutPath || withCredentials || !refreshToken) return;
        void trackRevocation(() =>
            endedSessionApi(token).post<unknown>(logoutPath, {
                body: refreshBody(refreshToken),
            }),
        );
    }

    /**
     * A client that sends an ended session's access token, and never refreshes
     * or ends a session: a `401` there just rejects.
     *
     * @param token - The ended session's access token.
     * @returns The client `onSessionEnd` and the `logoutPath` call go through.
     */
    function endedSessionApi(token: string | null): ApiClient {
        return createApiClient({
            baseURL,
            prefix,
            withCredentials,
            csrf,
            fetcher,
            getToken: () => token,
        });
    }

    /**
     * Start a new session epoch: supersede the refresh in flight and give the
     * new epoch a refresh queue of its own, so a `401` under the new session
     * never joins the old session's refresh.
     *
     * The client reads the epoch when each attempt leaves (`getSessionEpoch`),
     * which is what ties a `401` to the session that sent it — no set of
     * tokens to keep, and nothing that grows with the session's length.
     */
    function nextEpoch(): void {
        epoch += 1;
        queue = createRefreshQueue(rotate);
    }

    /**
     * Perform one refresh for the epoch that is current when it starts.
     *
     * Checked again after the round trip, on success and on failure alike: a
     * refresh that fails after `logout()` + `login(B)` must not reach
     * `onUnauthorized` either, or it would end B's session.
     *
     * @throws {SessionSupersededError} When the epoch changed during the call.
     */
    async function rotate(): Promise<void> {
        const started = epoch;
        rotatingEpochs.add(started);
        try {
            let data: unknown;
            try {
                data = await trackCredentialRequest(
                    api.post<unknown>(refreshPath, {
                        body: refreshBody(readRefreshToken()),
                        skipAuth: true,
                    }),
                );
            } catch (error) {
                if (epoch !== started) throw new SessionSupersededError();
                throw error;
            }
            const { token, refreshToken } = parseTokens(data);
            if (epoch !== started) {
                revokeDiscarded(token ?? null, refreshToken);
                throw new SessionSupersededError();
            }
            state().setToken(token);
            if (refreshToken) writeRefreshToken(refreshToken);
        } finally {
            rotatingEpochs.delete(started);
        }
    }

    let queue = createRefreshQueue(rotate);

    /**
     * Whether a `401` must be left alone: no refresh, no ending the session.
     *
     * Two cases, both of the current epoch: an attempt that carried no token
     * while a session is now installed (it left before the sign-in, and
     * refreshing or ending the new session for it would punish the wrong
     * session); and an attempt whose token the session has since rotated past
     * (the rotation it would trigger already happened).
     *
     * @param context - The attempt's credential.
     * @returns Whether the attempt is stale within the current session.
     */
    function staleWithinSession(context: RequestAuthContext): boolean {
        const current = getToken();
        if (current === null) return false;
        return context.token === null || context.token !== current;
    }

    /**
     * Whether nothing could make a tokenless `401` worth a refresh: no access
     * token and no stored refresh token.
     *
     * With `withCredentials`, the refresh would otherwise be answered by an
     * HttpOnly cookie the client cannot see or clear — after `logout()`, that
     * signed the previous account back in for whoever used the browser next
     * (#474). A `login()` in flight does not count as a session either: the
     * cookie a refresh would present during it is still the ended account's
     * (#496). Restoring a session from the cookie is an explicit `refresh()`,
     * typically at boot, which this does not touch.
     *
     * @returns Whether no session is installed.
     */
    function signedOut(): boolean {
        return getToken() === null && readRefreshToken() === null;
    }

    /**
     * Settle a tokenless `401` that arrived with no session installed while a
     * `login()` is in flight: wait for every login in flight, then let the
     * request replay when one of them installed a token.
     *
     * No refresh is sent. In cookie mode one would present whatever cookie
     * the browser holds — after `logout()` without a working `logoutPath`,
     * the previous account's: a failed login then left the client signed in
     * as that account, and a successful one could have its cookie overwritten
     * by the refresh's late `Set-Cookie` (#496).
     *
     * Skipped while an `onSessionEnd` hook runs: an account switch waits on
     * that hook, so a hook awaiting `auth.api` would wait on itself.
     *
     * @throws {Error} When no login is in flight, a hook is running, or every
     *   login settled without installing a token — the `401` surfaces as is.
     */
    async function awaitLogins(): Promise<void> {
        if (loginsInFlight.size > 0 && hooksRunning === 0) {
            await Promise.allSettled([...loginsInFlight]);
            if (getToken() !== null) return;
        }
        throw new Error("anonymous 401 with no session");
    }

    /**
     * The `refresh` the client calls on a `401`.
     *
     * - An attempt from an ended epoch is refused rather than replayed as
     *   whoever is signed in now.
     * - A token this session already rotated past: the replay just picks up the
     *   new one — no second refresh.
     * - No token, while a session is now installed: the `401` surfaces as is.
     * - No token, and no session installed: joins this epoch's refresh when
     *   one is already in flight — the boot `refresh()` restoring a session
     *   from the cookie, which the request then replays under; otherwise waits
     *   for a `login()` in flight and replays with its token, see
     *   `awaitLogins`; otherwise surfaces the `401` as is, see `signedOut`.
     * - Otherwise: join or start this epoch's refresh.
     *
     * @param context - The credential and epoch the rejected attempt left with.
     * @throws {SessionSupersededError} When the attempt belongs to an ended
     *   session, or the session changed during the refresh.
     */
    async function refreshFor(context: RequestAuthContext): Promise<void> {
        if (context.epoch !== null && context.epoch !== epoch) throw new SessionSupersededError();
        if (staleWithinSession(context)) {
            if (context.token === null) throw new Error("anonymous 401 under a live session");
            return;
        }
        if (context.token === null && signedOut()) {
            if (rotatingEpochs.has(epoch)) return queue();
            return awaitLogins();
        }
        return queue();
    }

    /**
     * The client's `onUnauthorized`: end the session only when the `401` is the
     * current session's own.
     *
     * The replay after a refresh is checked here too — it can come back `401`
     * after the user signed out and another account signed in, and ending the
     * session then would sign the new account out. A tokenless `401` with no
     * session installed ends nothing either: there is no session to end, and
     * ending "nothing" used to move the epoch and supersede the boot
     * `refresh()` in flight.
     *
     * @param context - The credential and epoch of the attempt that failed.
     * @throws {SessionSupersededError} When that attempt belongs to an ended
     *   session.
     */
    async function onUnauthorized(_response: Response, context: RequestAuthContext): Promise<void> {
        if (context.epoch !== null && context.epoch !== epoch) throw new SessionSupersededError();
        if (staleWithinSession(context)) return;
        if (context.token === null && signedOut()) return;
        await endSession();
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
     * Never call it from inside `onSessionEnd`: it would wait on that hook.
     * Every `logoutPath` revocation still in flight is awaited before the
     * request leaves — at most {@link LOGOUT_REVOCATION_WAIT_MS} — so a
     * cookie-clearing response cannot land after the new account's cookies.
     *
     * @param credentials - Sent as the login body.
     * @returns The user of the new session, or null.
     * @throws {SessionSupersededError} When a `logout()` or another `login()`
     *   moved the session while this one was in flight — during its request,
     *   during the teardown or while `mePath` was loading the user; the new
     *   tokens, or the user, are discarded.
     */
    async function login(credentials: TCredentials): Promise<TUser | null> {
        if (revocations.size > 0) await settleWithin([...revocations], LOGOUT_REVOCATION_WAIT_MS);
        const run = signIn(credentials);
        loginsInFlight.add(run);
        try {
            return await run;
        } finally {
            loginsInFlight.delete(run);
        }
    }

    /**
     * The body of `login()`, tracked in `loginsInFlight` by its caller so a
     * tokenless `401` during the sign-in waits for it and replays with the
     * token it installs, see `awaitLogins`. Tracking starts only after a
     * pending revocation settled.
     *
     * @param credentials - Sent as the login body.
     * @returns The user of the new session, or null.
     * @throws {SessionSupersededError} See `login()`.
     */
    async function signIn(credentials: TCredentials): Promise<TUser | null> {
        const started = epoch;
        const data = await trackCredentialRequest(
            api.post<unknown>(loginPath, {
                body: credentials,
                skipAuth: true,
            }),
        );
        const { token, refreshToken } = parseTokens(data);
        if (epoch !== started) {
            revokeDiscarded(token ?? null, refreshToken);
            throw new SessionSupersededError();
        }
        const { done } = finish("switch");
        const mine = epoch;
        await done.catch(() => undefined);
        if (epoch !== mine) throw new SessionSupersededError();
        state().setToken(token);
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
     * burst of `401`s from running it once per request.
     *
     * With nothing left to end, the caller waits on the teardown already under
     * way (`ending`, which never rejects, so a later no-op does not inherit an
     * old error). Two callers skip that wait while a hook is running, because
     * they may be the hook itself and would wait on their own teardown forever:
     * `endSession` — a hook awaiting `auth.api` goes out tokenless, gets a
     * `401`, and lands here — and a `logout()` with no session left. `login()`
     * (`"switch"`) always waits: the new account's state must not start while
     * the previous one's teardown is still clearing it. A hook awaiting
     * `auth.login()` therefore never settles — misuse the option documents.
     *
     * `"expired"` with nothing live leaves the epoch alone: there is nothing to
     * supersede but a refresh with no session behind it — the boot `refresh()`
     * restoring one from the cookie — and moving the epoch would throw that
     * away. `logout()` and `login()` always move it, since they must supersede
     * such a refresh.
     *
     * The returned `done` is a fresh promise derived from the hook, not the one
     * `ending` holds: a `logout()` nobody awaits still surfaces the hook's error
     * as an unhandled rejection instead of losing it.
     *
     * @param reason - Whether the caller signed out, the client gave up, or a
     *   login replaced the session.
     * @returns Whether a live session ended here, and a promise settling with
     *   the hook.
     */
    function finish(reason: TempestSessionEnd<TUser>["reason"]): {
        live: boolean;
        done: Promise<void>;
    } {
        const { user, token } = state();
        const live = token !== null || user !== null || readRefreshToken() !== null;
        if (live || reason !== "expired") nextEpoch();
        state().logout();
        writeRefreshToken(null);
        if (!live) {
            const wait = reason === "switch" || hooksRunning === 0;
            return { live, done: wait ? ending : Promise.resolve() };
        }
        if (!onSessionEnd) return { live, done: Promise.resolve() };
        const sessionApi = endedSessionApi(token);
        hooksRunning += 1;
        const run = (async () => {
            try {
                await onSessionEnd({ reason, user, token, api: sessionApi });
            } finally {
                hooksRunning -= 1;
            }
        })();
        ending = run.then(
            () => undefined,
            () => undefined,
        );
        return { live, done: run.then(() => undefined) };
    }

    /**
     * Send the `logoutPath` revocation for the session about to end, with the
     * credentials it holds now — read before `finish` clears them.
     *
     * Skipped without `logoutPath`, and in body mode when there is nothing to
     * revoke; in cookie mode it always goes out, since the cookie it revokes is
     * invisible to the client. Never rejects.
     *
     * In cookie mode it first waits — at most
     * {@link LOGOUT_REVOCATION_WAIT_MS} — for the login and refresh responses
     * in flight right now: each one sets a cookie for the session this
     * `logout()` ends, and a revocation that left before it would leave that
     * cookie behind.
     *
     * @returns A promise settling when the revocation settled, or null when
     *   none was sent.
     */
    function revoke(): Promise<void> | null {
        if (!logoutPath) return null;
        const path = logoutPath;
        const { token, user } = state();
        const refreshToken = readRefreshToken();
        if (!withCredentials && token === null && user === null && refreshToken === null) {
            return null;
        }
        const inFlight = withCredentials ? [...credentialRequests] : [];
        return trackRevocation(async () => {
            await settleWithin(inFlight, LOGOUT_REVOCATION_WAIT_MS);
            return endedSessionApi(token).post<unknown>(path, { body: refreshBody(refreshToken) });
        });
    }

    function logout(): Promise<void> {
        const revocation = revoke();
        const { done } = finish("logout");
        if (!revocation) return done;
        return Promise.all([revocation, done]).then(() => undefined);
    }

    /**
     * End the session after the client gave up on it and, when `redirectTo`
     * is set, leave the page once `onSessionEnd` settled.
     *
     * Separate from `logout` so an explicit sign-out stays a pure state change:
     * a caller that already navigates itself would otherwise get a second,
     * competing navigation. The hook is awaited before navigating because a
     * hard navigation aborts whatever request it still had in flight. Only the
     * call that ended a live session navigates; the rest of a burst of `401`s
     * waits on the same teardown, or returns at once inside a hook.
     */
    async function endSession(): Promise<void> {
        const { live, done } = finish("expired");
        await done.catch(() => undefined);
        if (live && redirectTo && typeof window !== "undefined") {
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
        getSessionEpoch: () => epoch,
        refresh: refreshFor,
        retry,
        onUnauthorized,
    });

    const refresh = (): Promise<void> => queue();

    return { useAuthStore, api, login, logout, refresh, getToken };
}
