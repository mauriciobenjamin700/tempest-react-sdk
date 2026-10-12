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
