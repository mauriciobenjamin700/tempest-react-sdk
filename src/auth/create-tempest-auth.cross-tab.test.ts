import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionSupersededError } from "../http";
import { createTempestAuth } from "./create-tempest-auth";
import type {
    CreateTempestAuthOptions,
    TempestAuth,
    TempestSessionEnd,
} from "./create-tempest-auth";

interface User {
    id: string;
}

type Auth = TempestAuth<User, { email: string; password: string }>;

/**
 * Build a JSON `Response`, since the client only parses a body when the content
 * type says JSON.
 *
 * @param body - Value to serialize.
 * @param status - HTTP status, defaulting to 200.
 * @returns The response.
 */
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/**
 * One backend shared by every "tab" of a test, the way two tabs of a browser
 * talk to the same API.
 *
 * Account A logs in as `A-tok-1`/`A-ref-1`, account B as `B-tok-1`/`B-ref-1`.
 * Each refresh rotates both tokens (`A-ref-1` → `A-tok-2`/`A-ref-2`, and so
 * on) and revokes the pair it replaced, so only the newest access token of an
 * account is accepted. `POST /api/auth/logout` revokes the caller's access and
 * refresh token. In cookie mode the refresh token lives in a cookie jar shared
 * by all tabs, which the login and refresh responses overwrite.
 *
 * A protected route answers with the account that owns the bearer, or `401`.
 *
 * @param cookieMode - Whether the refresh token travels as a cookie.
 * @param hold - Awaited by the refresh route before it answers.
 * @returns The fetcher, what each refresh presented, and `expire`, which
 *   makes the protected route reject one access token while the auth routes
 *   still recognize it.
 */
function sharedBackend(cookieMode = false, hold: Promise<void> = Promise.resolve()) {
    const accepted = new Map<string, string>();
    const refreshable = new Map<string, string>();
    const generation = new Map<string, number>();
    const presented: { tab: string; refresh: string | null }[] = [];
    let cookie: string | null = null;
    const expired = new Set<string>();

    /**
     * Issue the next pair for `account`, revoking the previous one.
     *
     * @param account - The account the pair belongs to.
     * @returns The new tokens.
     */
    function issue(account: string): { access_token: string; refresh_token?: string } {
        for (const [token, owner] of [...accepted]) if (owner === account) accepted.delete(token);
        for (const [token, owner] of [...refreshable])
            if (owner === account) refreshable.delete(token);
        const n = (generation.get(account) ?? 0) + 1;
        generation.set(account, n);
        const access = `${account}-tok-${n}`;
        const refresh = `${account}-ref-${n}`;
        accepted.set(access, account);
        refreshable.set(refresh, account);
        if (cookieMode) {
            cookie = refresh;
            return { access_token: access };
        }
        return { access_token: access, refresh_token: refresh };
    }

    function fetcherFor(tab: string): typeof fetch {
        return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const headers = (init?.headers ?? {}) as Record<string, string>;
            const bearer = (headers.Authorization ?? "").replace("Bearer ", "");
            if (url.endsWith("/api/auth/login")) {
                const body = JSON.parse(String(init?.body)) as { email: string };
                const account = body.email === "b@x.test" ? "B" : "A";
                return jsonResponse({ ...issue(account), user: { id: account } });
            }
            if (url.endsWith("/api/auth/refresh")) {
                const sent = cookieMode
                    ? cookie
                    : init?.body
                      ? (JSON.parse(String(init.body)) as { refresh_token: string }).refresh_token
                      : null;
                presented.push({ tab, refresh: sent });
                await hold;
                const owner = sent ? refreshable.get(sent) : undefined;
                return owner
                    ? jsonResponse(issue(owner))
                    : jsonResponse({ detail: "revoked" }, 401);
            }
            if (url.endsWith("/api/auth/logout")) {
                const owner = accepted.get(bearer);
                if (owner) {
                    for (const [t, o] of [...accepted]) if (o === owner) accepted.delete(t);
                    for (const [t, o] of [...refreshable]) if (o === owner) refreshable.delete(t);
                }
                if (cookieMode) cookie = null;
                return new Response(null, { status: 204 });
            }
            const owner = expired.has(bearer) ? undefined : accepted.get(bearer);
            return owner
                ? jsonResponse({ acting_as: owner })
                : jsonResponse({ detail: "expired" }, 401);
        }) as unknown as typeof fetch;
    }

    return { fetcherFor, presented, expire: (token: string) => expired.add(token) };
}

const created: Auth[] = [];

/**
 * Open one "tab": a `createTempestAuth` over the shared storage, built the way
 * a page load builds it — so it rehydrates whatever the storage holds now.
 *
 * @param name - Label recorded with each refresh this tab sends.
 * @param backend - The shared backend.
 * @param extra - Extra options.
 * @returns The tab's auth preset.
 */
function openTab(
    name: string,
    backend: ReturnType<typeof sharedBackend>,
    extra: Partial<CreateTempestAuthOptions<User>> = {},
): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        fetcher: backend.fetcherFor(name),
        logoutPath: "/api/auth/logout",
        parseUser: (data) => (data as { user: User }).user,
        ...extra,
    });
    created.push(auth);
    return auth;
}

/**
 * Deliver the `storage` event the browser fires in every **other** tab after a
 * write. jsdom has a single window, so the test fires it by hand; every tab
 * that did not write ignores it when nothing differs from what it holds.
 *
 * @param key - The key that changed, or null for `clear()`.
 * @param area - The storage area written.
 */
function deliverStorageEvent(key: string | null, area: Storage = localStorage): void {
    window.dispatchEvent(new StorageEvent("storage", { key, storageArea: area }));
}

/**
 * The `{ user, token }` the persist middleware wrote, as the next tab to load
 * would read it.
 *
 * @returns The persisted session.
 */
function persisted(): { user: User | null; token: string | null } {
    const raw = localStorage.getItem("tempest-auth");
    return raw
        ? (JSON.parse(raw) as { state: { user: User | null; token: string | null } }).state
        : { user: null, token: null };
}

/**
 * Issue #524: a tab left open after logout kept account A in memory and, on its
 * next `401`, redeemed account B's refresh token from the shared
 * `localStorage`, persisting `{ user: A, token: B }`. Measured on `dcf99b1`
 * before the fix, with this backend: the stale tab presented `B-ref-1`, ended
 * holding `{ user: A, token: "B-tok-2" }` and wrote it to storage; in cookie
 * mode it did the same with B's cookie. A same-account rotation in one tab did
 * not sign the other out, but made it redeem again: tab 2 presented `A-ref-2`,
 * which revoked the `A-tok-2` tab 1 held, so each tab's next `401` rotated the
 * other's token away — one extra refresh per tab per rotation.
 */
describe("createTempestAuth — the session is shared by every tab of the origin", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("never redeems another account's refresh token from a tab still holding the previous one", async () => {
        const backend = sharedBackend();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend);
        expect(tab2.useAuthStore.getState().user).toEqual({ id: "A" });

        await tab1.logout();
        await tab1.login({ email: "b@x.test", password: "x" });

        await expect(tab2.api.get("/api/orders")).rejects.toBeInstanceOf(SessionSupersededError);

        expect(backend.presented.filter((p) => p.tab === "tab2")).toEqual([]);
        expect(tab2.useAuthStore.getState()).toMatchObject({
            user: { id: "B" },
            token: "B-tok-1",
            isAuthenticated: true,
        });
        expect(persisted()).toEqual({ user: { id: "B" }, token: "B-tok-1" });
        await expect(tab2.api.get("/api/orders")).resolves.toEqual({ acting_as: "B" });
    });

    it("discards a refresh that resolves after another tab signed in as someone else", async () => {
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const backend = sharedBackend(false, held);
        const tab1 = openTab("tab1", backend, { logoutPath: undefined });
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { logoutPath: undefined });

        const pending = tab2.refresh();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await tab1.logout();
        await tab1.login({ email: "b@x.test", password: "x" });
        release();

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
        expect(backend.presented).toEqual([{ tab: "tab2", refresh: "A-ref-1" }]);
        expect(tab2.useAuthStore.getState()).toMatchObject({ user: { id: "B" }, token: "B-tok-1" });
        expect(persisted()).toEqual({ user: { id: "B" }, token: "B-tok-1" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("B-ref-1");
    });

    it("does not clear another account's session when a refresh fails after the other tab switched", async () => {
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const backend = sharedBackend(false, held);
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend);
        backend.expire("A-tok-1");

        const pending = tab2.api.get("/api/orders");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await tab1.logout();
        await tab1.login({ email: "b@x.test", password: "x" });
        release();

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
        expect(backend.presented).toEqual([{ tab: "tab2", refresh: "A-ref-1" }]);
        expect(persisted()).toEqual({ user: { id: "B" }, token: "B-tok-1" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("B-ref-1");
        await expect(tab1.api.get("/api/orders")).resolves.toEqual({ acting_as: "B" });
    });

    it("never redeems another account's cookie from a stale tab in cookie mode", async () => {
        const backend = sharedBackend(true);
        const tab1 = openTab("tab1", backend, { withCredentials: true });
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { withCredentials: true });

        await tab1.logout();
        await tab1.login({ email: "b@x.test", password: "x" });

        await expect(tab2.api.get("/api/orders")).rejects.toBeInstanceOf(SessionSupersededError);

        expect(backend.presented.filter((p) => p.tab === "tab2")).toEqual([]);
        expect(tab2.useAuthStore.getState()).toMatchObject({ user: { id: "B" }, token: "B-tok-1" });
        expect(persisted()).toEqual({ user: { id: "B" }, token: "B-tok-1" });
    });

    it("keeps the other tab signed in, with the new token, when one tab rotates the same account", async () => {
        const backend = sharedBackend();
        const ended = vi.fn();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { onSessionEnd: ended });

        await tab1.refresh();
        expect(tab1.getToken()).toBe("A-tok-2");

        await expect(tab2.api.get("/api/orders")).resolves.toEqual({ acting_as: "A" });

        expect(backend.presented).toEqual([{ tab: "tab1", refresh: "A-ref-1" }]);
        expect(tab2.useAuthStore.getState()).toMatchObject({
            user: { id: "A" },
            token: "A-tok-2",
            isAuthenticated: true,
        });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("A-ref-2");
        expect(ended).not.toHaveBeenCalled();
    });

    it("picks up a rotation made in another tab as soon as the storage event arrives", async () => {
        const backend = sharedBackend();
        const ended = vi.fn();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { onSessionEnd: ended });

        await tab1.refresh();
        deliverStorageEvent("tempest-auth");

        expect(tab2.getToken()).toBe("A-tok-2");
        await tab2.refresh();
        expect(backend.presented).toEqual([
            { tab: "tab1", refresh: "A-ref-1" },
            { tab: "tab2", refresh: "A-ref-2" },
        ]);
        expect(tab1.getToken()).toBe("A-tok-2");
        deliverStorageEvent("tempest-auth-refresh");
        expect(tab1.getToken()).toBe("A-tok-3");
        expect(ended).not.toHaveBeenCalled();
    });

    it("ends the session in every tab when one tab logs out", async () => {
        const backend = sharedBackend();
        const ended = vi.fn<(session: TempestSessionEnd<User>) => void>();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { onSessionEnd: ended });

        await tab1.logout();
        deliverStorageEvent("tempest-auth");

        expect(tab2.useAuthStore.getState()).toMatchObject({
            user: null,
            token: null,
            isAuthenticated: false,
        });
        expect(ended).toHaveBeenCalledTimes(1);
        expect(ended.mock.calls[0]?.[0]).toMatchObject({
            reason: "logout",
            user: { id: "A" },
            token: "A-tok-1",
            elsewhere: true,
        });
        deliverStorageEvent("tempest-auth-refresh");
        expect(ended).toHaveBeenCalledTimes(1);
    });

    it("ends the session when another tab clears the whole storage", async () => {
        const backend = sharedBackend();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });

        localStorage.clear();
        deliverStorageEvent(null);

        expect(tab1.useAuthStore.getState()).toMatchObject({
            user: null,
            token: null,
            isAuthenticated: false,
        });
    });

    it("reports an account switch made in another tab as a switch that happened elsewhere", async () => {
        const backend = sharedBackend();
        const ended = vi.fn<(session: TempestSessionEnd<User>) => void>();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { onSessionEnd: ended });

        await tab1.login({ email: "b@x.test", password: "x" });
        deliverStorageEvent("tempest-auth");

        expect(tab2.useAuthStore.getState()).toMatchObject({ user: { id: "B" }, token: "B-tok-1" });
        expect(ended).toHaveBeenCalledTimes(1);
        expect(ended.mock.calls[0]?.[0]).toMatchObject({
            reason: "switch",
            user: { id: "A" },
            token: "A-tok-1",
            elsewhere: true,
        });
    });

    it("does not end the other account's session when a stale tab logs out", async () => {
        const backend = sharedBackend();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend);

        await tab1.logout();
        await tab1.login({ email: "b@x.test", password: "x" });
        await tab2.logout();

        expect(localStorage.getItem("tempest-auth-refresh")).toBe("B-ref-1");
        expect(persisted()).toEqual({ user: { id: "B" }, token: "B-tok-1" });
        await expect(tab1.api.get("/api/orders")).resolves.toEqual({ acting_as: "B" });
    });

    it("runs onSessionEnd once with elsewhere false for this tab's own logout", async () => {
        const backend = sharedBackend();
        const ended = vi.fn<(session: TempestSessionEnd<User>) => void>();
        const tab1 = openTab("tab1", backend, { onSessionEnd: ended });
        await tab1.login({ email: "a@x.test", password: "x" });

        await tab1.logout();
        deliverStorageEvent("tempest-auth");

        expect(ended).toHaveBeenCalledTimes(1);
        expect(ended.mock.calls[0]?.[0]).toMatchObject({ reason: "logout", elsewhere: false });
    });

    it("ignores storage events for other keys and other storage areas", async () => {
        const backend = sharedBackend();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const raw = localStorage.getItem("tempest-auth");
        localStorage.setItem(
            "tempest-auth",
            JSON.stringify({ state: { user: null, token: null }, version: 0 }),
        );

        deliverStorageEvent("unrelated");
        deliverStorageEvent("tempest-auth", sessionStorage);
        expect(tab1.getToken()).toBe("A-tok-1");

        localStorage.setItem("tempest-auth", raw ?? "");
    });

    it("treats a stored session that does not parse as a session ended elsewhere", async () => {
        const backend = sharedBackend();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });

        localStorage.setItem("tempest-auth", "{not json");
        deliverStorageEvent("tempest-auth");

        expect(tab1.useAuthStore.getState()).toMatchObject({ user: null, token: null });
    });

    it("keeps its own session without a window, where there is no shared storage to follow", async () => {
        const backend = sharedBackend();
        const ended = vi.fn<(session: TempestSessionEnd<User>) => void>();
        vi.stubGlobal("window", undefined);
        try {
            const tab1 = openTab("tab1", backend, { onSessionEnd: ended });
            await tab1.login({ email: "a@x.test", password: "x" });
            await expect(tab1.api.get("/api/orders")).resolves.toEqual({ acting_as: "A" });
            expect(tab1.getToken()).toBe("A-tok-1");

            await tab1.logout();

            expect(tab1.getToken()).toBeNull();
            expect(ended.mock.calls[0]?.[0]).toMatchObject({ reason: "logout", elsewhere: false });
            tab1.dispose();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("stops following other tabs after dispose()", async () => {
        const backend = sharedBackend();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        tab1.dispose();
        tab1.dispose();

        localStorage.clear();
        deliverStorageEvent(null);

        expect(tab1.getToken()).toBe("A-tok-1");
    });

    it("keeps rotating as before in sessionStorage mode, where each tab has its own session", async () => {
        const backend = sharedBackend();
        const tab1 = openTab("tab1", backend, { storage: "session" });
        await tab1.login({ email: "a@x.test", password: "x" });
        await tab1.refresh();
        await tab1.refresh();

        expect(backend.presented).toEqual([
            { tab: "tab1", refresh: "A-ref-1" },
            { tab: "tab1", refresh: "A-ref-2" },
        ]);
        expect(tab1.getToken()).toBe("A-tok-3");
        expect(sessionStorage.getItem("tempest-auth-refresh")).toBe("A-ref-3");
        expect(localStorage.getItem("tempest-auth")).toBeNull();

        deliverStorageEvent("tempest-auth");
        expect(tab1.getToken()).toBe("A-tok-3");
    });
});
