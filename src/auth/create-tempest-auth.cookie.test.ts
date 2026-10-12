import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth } from "./create-tempest-auth";

interface User {
    id: string;
}

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
 * The bearer a request carried, without the scheme.
 *
 * @param init - The request init the fetcher received.
 * @returns The token, or undefined.
 */
function bearerOf(init?: RequestInit): string | undefined {
    return ((init?.headers ?? {}) as Record<string, string>).Authorization?.replace("Bearer ", "");
}

interface Call {
    path: string;
    method: string;
    bearer: string | undefined;
    body: unknown;
}

/**
 * A cookie-refresh backend whose refresh cookie stays valid after a client-side
 * logout — the worst case of #474. Protected routes answer `401` without a
 * bearer and `200` with one.
 *
 * @param options - `logoutStatus` answers the logout route; `logoutGate`
 *   holds it until the test opens the gate; `logoutThrows` makes it a network
 *   failure.
 * @returns The fetcher and the calls it saw.
 */
function cookieBackend(
    options: {
        logoutStatus?: number;
        logoutGate?: Promise<void>;
        logoutThrows?: boolean;
    } = {},
): { fetcher: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    let rotations = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path, method: init?.method ?? "GET", bearer: bearerOf(init), body });
        if (path === "/api/auth/login") {
            const who = (body as { email?: string }).email === "b@x.test" ? "B" : "A";
            return jsonResponse({ access_token: `${who}-tok-1`, refresh_token: `${who}-ref-1` });
        }
        if (path === "/api/auth/refresh") {
            rotations += 1;
            return jsonResponse({ access_token: `A-tok-cookie-${rotations}` });
        }
        if (path === "/api/auth/logout") {
            await options.logoutGate;
            if (options.logoutThrows) throw new TypeError("Failed to fetch");
            return new Response(null, { status: options.logoutStatus ?? 204 });
        }
        if (bearerOf(init) === undefined) return jsonResponse({ detail: "anonymous" }, 401);
        return jsonResponse({ id: "A" });
    }) as unknown as typeof fetch;
    return { fetcher, calls };
}

/**
 * Let pending microtasks and a macrotask run.
 *
 * @returns A promise that settles after a macrotask.
 */
function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * #474: with the refresh token in an HttpOnly cookie, `logout()` cannot clear
 * it, and before the fix a tokenless `401` after the logout started a refresh
 * that the cookie answered — signing A back in for whoever used the browser
 * next. The tests marked "no session installed" failed against d39027c.
 */
describe("createTempestAuth — cookie refresh after logout", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("does not refresh a tokenless 401 when no session is installed", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });
        await auth.logout();

        await expect(auth.api.get("/api/me")).rejects.toMatchObject({ status: 401 });

        expect(calls.filter((call) => call.path === "/api/auth/refresh")).toHaveLength(0);
        expect(auth.getToken()).toBeNull();
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("does not refresh a tokenless 401 on a fresh page with no session installed", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            fetcher,
        });

        await expect(auth.api.get("/api/me")).rejects.toMatchObject({ status: 401 });

        expect(calls.filter((call) => call.path === "/api/auth/refresh")).toHaveLength(0);
        expect(auth.getToken()).toBeNull();
    });

    it("still restores the session from the refresh cookie when the app calls refresh() at boot", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            fetcher,
        });

        await auth.refresh();
        await expect(auth.api.get("/api/me")).resolves.toEqual({ id: "A" });

        expect(auth.getToken()).toBe("A-tok-cookie-1");
        expect(calls.find((call) => call.path === "/api/auth/refresh")?.body).toBeUndefined();
    });

    it("still refreshes a tokenless 401 while a refresh token is stored", async () => {
        localStorage.setItem("tempest-auth-refresh", "A-ref-0");
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({ baseURL: "https://api.example.test", fetcher });

        await expect(auth.api.get("/api/me")).resolves.toEqual({ id: "A" });

        expect(calls.filter((call) => call.path === "/api/auth/refresh")).toHaveLength(1);
    });

    it("still refreshes a tokenless 401 while a login is in flight", async () => {
        let openLogin!: () => void;
        const loginHeld = new Promise<void>((resolve) => {
            openLogin = resolve;
        });
        const { fetcher: inner, calls } = cookieBackend();
        const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith("/api/auth/login")) await loginHeld;
            return inner(input, init);
        }) as typeof fetch;
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            fetcher,
        });

        const signingIn = auth.login({ email: "a@x.test", password: "x" });
        await tick();
        const anonymous = auth.api.get("/api/me");
        await tick();
        openLogin();
        await signingIn;
        await anonymous.catch(() => undefined);

        expect(calls.filter((call) => call.path === "/api/auth/refresh")).toHaveLength(1);
    });
});

describe("createTempestAuth — logoutPath", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("sends nothing to the backend on logout() without logoutPath", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({ baseURL: "https://api.example.test", fetcher });
        await auth.login({ email: "a@x.test", password: "x" });
        calls.length = 0;

        await auth.logout();

        expect(calls).toEqual([]);
    });

    it("revokes with the ended session's token and refresh token, after clearing locally", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const ending = auth.logout();
        expect(auth.getToken()).toBeNull();
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
        await ending;

        const logout = calls.find((call) => call.path === "/api/auth/logout");
        expect(logout).toEqual({
            path: "/api/auth/logout",
            method: "POST",
            bearer: "A-tok-1",
            body: { refresh_token: "A-ref-1" },
        });
    });

    it("sends the logout without a body in cookie mode, where the cookie carries the refresh token", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.refresh();

        await auth.logout();

        const logout = calls.find((call) => call.path === "/api/auth/logout");
        expect(logout?.body).toBeUndefined();
        expect(logout?.bearer).toBe("A-tok-cookie-1");
    });

    it("sends the logout in cookie mode even when nothing is installed locally", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
            fetcher,
        });

        await auth.logout();

        expect(calls.filter((call) => call.path === "/api/auth/logout")).toHaveLength(1);
    });

    it("skips the logout request in body mode when there was no session", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher,
        });

        await auth.logout();

        expect(calls).toEqual([]);
    });

    it("resolves logout() when the revocation fails on the network or with an error status", async () => {
        for (const options of [{ logoutThrows: true }, { logoutStatus: 500 }]) {
            localStorage.clear();
            const { fetcher } = cookieBackend(options);
            const auth = createTempestAuth<User>({
                baseURL: "https://api.example.test",
                logoutPath: "/api/auth/logout",
                fetcher,
            });
            await auth.login({ email: "a@x.test", password: "x" });

            await expect(auth.logout()).resolves.toBeUndefined();
            expect(auth.getToken()).toBeNull();
        }
    });

    it("waits for the revocation before resolving logout(), so a navigation does not abort it", async () => {
        let open!: () => void;
        const logoutGate = new Promise<void>((resolve) => {
            open = resolve;
        });
        const { fetcher } = cookieBackend({ logoutGate });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        let settled = false;
        const ending = auth.logout().then(() => {
            settled = true;
        });
        await tick();
        expect(settled).toBe(false);
        open();
        await ending;
        expect(settled).toBe(true);
    });

    it("sends B's login only after A's revocation settled, so its response cannot clear B's cookies", async () => {
        let open!: () => void;
        const logoutGate = new Promise<void>((resolve) => {
            open = resolve;
        });
        const { fetcher, calls } = cookieBackend({ logoutGate });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        void auth.logout();
        const signingIn = auth.login({ email: "b@x.test", password: "x" });
        await tick();
        expect(calls.filter((call) => call.path === "/api/auth/login")).toHaveLength(1);
        open();
        await signingIn;

        expect(calls.map((call) => call.path).slice(-2)).toEqual([
            "/api/auth/logout",
            "/api/auth/login",
        ]);
        expect(auth.getToken()).toBe("B-tok-1");
    });

    it("does not revoke the previous session on an account switch, where the cookie jar already holds the new one", async () => {
        const { fetcher, calls } = cookieBackend();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });
        await auth.login({ email: "b@x.test", password: "x" });

        expect(calls.filter((call) => call.path === "/api/auth/logout")).toHaveLength(0);
    });
});

/**
 * A gate the test opens by hand.
 *
 * @returns The promise and the function that opens it.
 */
function gate(): { wait: Promise<void>; open: () => void } {
    let open!: () => void;
    const wait = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { wait, open };
}

/**
 * A backend whose login, refresh and logout routes can each be held, recording
 * when each request arrives and when each response leaves.
 *
 * @param holds - Per-route gates; `logout` is consumed one per request.
 * @returns The fetcher and the ordered event log.
 */
function heldBackend(holds: {
    login?: Promise<void>;
    refresh?: Promise<void>;
    logout?: Promise<void>[];
}): { fetcher: typeof fetch; events: string[]; calls: Call[] } {
    const events: string[] = [];
    const calls: Call[] = [];
    const logouts = [...(holds.logout ?? [])];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path, method: init?.method ?? "GET", bearer: bearerOf(init), body });
        events.push(`> ${path}`);
        if (path === "/api/auth/login") {
            await holds.login;
            const who = (body as { email?: string }).email === "b@x.test" ? "B" : "A";
            events.push(`< login ${who}`);
            return jsonResponse({ access_token: `${who}-tok-1`, refresh_token: `${who}-ref-1` });
        }
        if (path === "/api/auth/refresh") {
            await holds.refresh;
            events.push("< refresh");
            return jsonResponse({ access_token: "A-tok-cookie-1" });
        }
        if (path === "/api/auth/logout") {
            await logouts.shift();
            events.push("< logout");
            return new Response(null, { status: 204 });
        }
        if (bearerOf(init) === undefined) return jsonResponse({ detail: "anonymous" }, 401);
        return jsonResponse({ id: bearerOf(init) });
    }) as unknown as typeof fetch;
    return { fetcher, events, calls };
}

describe("createTempestAuth — review of the cookie and logoutPath fixes", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useRealTimers();
    });

    it("restores the boot session when a tokenless request 401s while the boot refresh is in flight", async () => {
        const held = gate();
        const { fetcher, calls } = heldBackend({ refresh: held.wait });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            fetcher,
        });

        const booting = auth.refresh();
        const loading = auth.api.get("/api/me");
        await tick();
        held.open();

        await expect(booting).resolves.toBeUndefined();
        await expect(loading).resolves.toEqual({ id: "A-tok-cookie-1" });
        expect(auth.getToken()).toBe("A-tok-cookie-1");
        expect(calls.filter((call) => call.path === "/api/auth/refresh")).toHaveLength(1);
    });

    it("does not call onSessionEnd or redirect for a tokenless 401 with no session", async () => {
        const onSessionEnd = vi.fn();
        const { fetcher } = heldBackend({});
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            fetcher,
            onSessionEnd,
        });

        await expect(auth.api.get("/api/me")).rejects.toMatchObject({ status: 401 });

        expect(onSessionEnd).not.toHaveBeenCalled();
    });

    it("makes login() wait for every overlapping revocation, not just the last", async () => {
        const first = gate();
        const second = gate();
        const { fetcher, calls } = heldBackend({ logout: [first.wait, second.wait] });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        void auth.logout();
        void auth.logout();
        const signingIn = auth.login({ email: "b@x.test", password: "x" });
        await tick();
        second.open();
        await tick();
        expect(calls.filter((call) => call.path === "/api/auth/login")).toHaveLength(1);
        first.open();
        await signingIn;

        expect(calls.filter((call) => call.path === "/api/auth/login")).toHaveLength(2);
    });

    it("revokes in cookie mode only after a login in flight during logout() got its response", async () => {
        const held = gate();
        const { fetcher, events } = heldBackend({ login: held.wait });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
            fetcher,
        });

        const signingIn = auth.login({ email: "a@x.test", password: "x" }).catch(() => undefined);
        await tick();
        const ending = auth.logout();
        await tick();
        held.open();
        await Promise.all([signingIn, ending]);

        expect(events.indexOf("< login A")).toBeGreaterThanOrEqual(0);
        expect(events.indexOf("> /api/auth/logout")).toBeGreaterThan(events.indexOf("< login A"));
    });

    it("revokes in body mode the refresh token a superseded login brought back", async () => {
        const held = gate();
        const { fetcher, calls } = heldBackend({ login: held.wait });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher,
        });

        const signingIn = auth.login({ email: "a@x.test", password: "x" }).catch(() => undefined);
        await tick();
        await auth.logout();
        held.open();
        await signingIn;
        await tick();

        const logout = calls.find((call) => call.path === "/api/auth/logout");
        expect(logout).toMatchObject({ bearer: "A-tok-1", body: { refresh_token: "A-ref-1" } });
    });

    it("signs in after the revocation wait times out when the logout never answers", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const never = new Promise<void>(() => undefined);
        const { fetcher, calls } = heldBackend({ logout: [never] });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        void auth.logout();
        const signingIn = auth.login({ email: "b@x.test", password: "x" });
        await vi.advanceTimersByTimeAsync(9_999);
        expect(calls.filter((call) => call.path === "/api/auth/login")).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);

        await expect(signingIn).resolves.toBeNull();
        expect(auth.getToken()).toBe("B-tok-1");
    });

    it("reports a failed revocation to onLogoutError", async () => {
        const onLogoutError = vi.fn();
        const { fetcher } = cookieBackend({ logoutStatus: 500 });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            onLogoutError,
            fetcher,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await auth.logout();

        expect(onLogoutError).toHaveBeenCalledOnce();
        expect(onLogoutError.mock.calls[0]?.[0]).toMatchObject({ status: 500 });
    });
});
