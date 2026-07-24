import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth } from "./create-tempest-auth";

interface User {
    id: number;
    email: string;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("createTempestAuth", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("logs in, stores the token, and fetches the user from mePath", async () => {
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login"))
                return jsonResponse({ access_token: "tok-1", token_type: "bearer" });
            if (url.endsWith("/api/auth/me")) return jsonResponse({ id: 1, email: "a@b.c" });
            return jsonResponse({}, 404);
        });

        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            mePath: "/api/auth/me",
            fetcher,
        });

        const user = await auth.login({ email: "a@b.c", password: "x" });
        expect(user).toEqual({ id: 1, email: "a@b.c" });
        expect(auth.getToken()).toBe("tok-1");
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it("attaches the bearer token to authed requests", async () => {
        let authHeader: string | null = null;
        const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/login"))
                return jsonResponse({ access_token: "tok-2", token_type: "bearer" });
            authHeader = new Headers(init?.headers).get("Authorization");
            return jsonResponse([{ id: 9 }]);
        });

        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            loginPath: "/login",
            fetcher,
        });
        await auth.login({ email: "a", password: "b" });
        await auth.api.get("/api/orders");
        expect(authHeader).toBe("Bearer tok-2");
    });

    it("refreshes once on 401 then retries the original request", async () => {
        let issued = "old";
        let refreshCalls = 0;
        const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/login"))
                return jsonResponse({ access_token: "old", refresh_token: "r1" });
            if (url.endsWith("/refresh")) {
                refreshCalls += 1;
                issued = "new";
                return jsonResponse({ access_token: "new" });
            }
            // Protected route: 401 with the old token, 200 with the new one.
            const sent = new Headers(init?.headers).get("Authorization");
            return sent === "Bearer new" ? jsonResponse({ ok: true }) : jsonResponse({}, 401);
        });

        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            loginPath: "/login",
            refreshPath: "/refresh",
            fetcher,
        });
        await auth.login({ email: "a", password: "b" });
        const result = await auth.api.get<{ ok: boolean }>("/api/secure");

        expect(result).toEqual({ ok: true });
        expect(refreshCalls).toBe(1);
        expect(issued).toBe("new");
        expect(auth.getToken()).toBe("new");
    });

    it("logout clears the session and stored refresh token", async () => {
        const fetcher = vi.fn(async () => jsonResponse({ access_token: "t", refresh_token: "r" }));
        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            loginPath: "/login",
            fetcher,
        });
        await auth.login({ email: "a", password: "b" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("r");

        auth.logout();
        expect(auth.getToken()).toBeNull();
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
    });
});

describe("createTempestAuth — parsing, storage and refresh options", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it("skips the me request when parseUser finds the user in the login payload", async () => {
        const fetcher = vi.fn(async () =>
            jsonResponse({ access_token: "tok", user: { id: 7, email: "x@y.z" } }),
        );
        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            mePath: "/api/auth/me",
            fetcher,
            parseUser: (data) => (data as { user?: User }).user ?? null,
        });

        const user = await auth.login({ email: "x@y.z", password: "p" });
        expect(user).toEqual({ id: 7, email: "x@y.z" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("keeps the current user when no mePath is configured", async () => {
        const fetcher = vi.fn(async () => jsonResponse({ access_token: "tok" }));
        const auth = createTempestAuth<User>({ baseURL: "https://api.test", fetcher });

        const user = await auth.login({ email: "a@b.c", password: "p" });
        expect(user).toBeNull();
        expect(auth.getToken()).toBe("tok");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("stores the refresh token in sessionStorage when asked", async () => {
        const fetcher = vi.fn(async () =>
            jsonResponse({ access_token: "tok", refresh_token: "rt-1" }),
        );
        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            storage: "session",
            storeName: "s-auth",
            fetcher,
        });

        await auth.login({ email: "a@b.c", password: "p" });
        expect(sessionStorage.getItem("s-auth-refresh")).toBe("rt-1");

        auth.logout();
        expect(sessionStorage.getItem("s-auth-refresh")).toBeNull();
    });

    it("sends the stored refresh token in the refresh body and rotates it", async () => {
        localStorage.setItem("tempest-auth-refresh", "rt-old");
        const bodies: unknown[] = [];
        const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
            return jsonResponse({ access_token: "tok-2", refresh_token: "rt-new" });
        });
        const auth = createTempestAuth<User>({ baseURL: "https://api.test", fetcher });

        await auth.refresh();
        expect(bodies[0]).toEqual({ refresh_token: "rt-old" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("rt-new");
        expect(auth.getToken()).toBe("tok-2");
    });

    it("omits the refresh body when nothing is stored", async () => {
        const bodies: (string | null)[] = [];
        const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            bodies.push(init?.body ? String(init.body) : null);
            return jsonResponse({ access_token: "tok-3" });
        });
        const auth = createTempestAuth<User>({ baseURL: "https://api.test", fetcher });

        await auth.refresh();
        expect(bodies[0]).toBeNull();
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
    });

    it("accepts a custom refreshBody and parseTokens", async () => {
        localStorage.setItem("tempest-auth-refresh", "rt");
        const bodies: unknown[] = [];
        const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
            return jsonResponse({ jwt: "custom-tok" });
        });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            fetcher,
            refreshBody: (rt) => ({ token: rt }),
            parseTokens: (data) => ({ token: (data as { jwt: string }).jwt }),
        });

        await auth.refresh();
        expect(bodies[0]).toEqual({ token: "rt" });
        expect(auth.getToken()).toBe("custom-tok");
    });

    it("treats an empty login payload as an undefined token", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
        const auth = createTempestAuth<User>({ baseURL: "https://api.test", fetcher });
        await auth.login({ email: "a@b.c", password: "p" });
        expect(auth.getToken()).toBeUndefined();
    });
});
