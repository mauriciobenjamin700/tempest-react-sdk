import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth } from "./create-tempest-auth";

interface User {
    id: number;
    email: string;
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
 * Replace `window.location` with a stub that records `assign` calls.
 *
 * jsdom's own location throws "Not implemented" on navigation, so a redirect can
 * only be observed by swapping the object out.
 *
 * @returns The spy standing in for `location.assign`.
 */
function stubLocationAssign() {
    const assign = vi.fn((_url: string): void => {});
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, assign },
    });
    return assign;
}

/**
 * A refresh token the backend has revoked is the case these tests pin: the
 * refresh call itself can succeed while the access token it returns is still
 * refused. The session has to end anyway, or the app keeps a store that says
 * "authenticated" while every request 401s.
 */
describe("createTempestAuth — session expiry", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("clears the session when the replay is still 401 after a successful refresh", async () => {
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login"))
                return jsonResponse({ access_token: "tok-1", refresh_token: "ref-1" });
            if (url.endsWith("/api/auth/refresh")) return jsonResponse({ access_token: "tok-2" });
            return jsonResponse({ detail: "expired" }, 401);
        });

        const auth = createTempestAuth<User>({ baseURL: "https://api.test", fetcher });
        await auth.login({ email: "a@b.c", password: "x" });
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(true);

        await expect(auth.api.get("/api/orders")).rejects.toMatchObject({ status: 401 });

        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
        expect(auth.getToken()).toBeNull();
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
    });

    it("navigates to redirectTo when the session ends", async () => {
        const assign = stubLocationAssign();
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login"))
                return jsonResponse({ access_token: "tok-1", refresh_token: "ref-1" });
            if (url.endsWith("/api/auth/refresh")) return jsonResponse({ detail: "nope" }, 401);
            return jsonResponse({ detail: "expired" }, 401);
        });

        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            fetcher,
            redirectTo: "/login",
        });
        await auth.login({ email: "a@b.c", password: "x" });

        await expect(auth.api.get("/api/orders")).rejects.toMatchObject({ status: 401 });

        expect(assign).toHaveBeenCalledWith("/login");
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("does not navigate on an explicit logout", async () => {
        const assign = stubLocationAssign();
        const fetcher = vi.fn(async () =>
            jsonResponse({ access_token: "tok-1", refresh_token: "ref-1" }),
        );

        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            fetcher,
            redirectTo: "/login",
        });
        await auth.login({ email: "a@b.c", password: "x" });

        auth.logout();

        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
        expect(assign).not.toHaveBeenCalled();
    });

    it("leaves navigation to the caller when redirectTo is unset", async () => {
        const assign = stubLocationAssign();
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login")) return jsonResponse({ access_token: "tok-1" });
            return jsonResponse({ detail: "expired" }, 401);
        });

        const auth = createTempestAuth<User>({ baseURL: "https://api.test", fetcher });
        await auth.login({ email: "a@b.c", password: "x" });

        await expect(auth.api.get("/api/orders")).rejects.toMatchObject({ status: 401 });

        expect(assign).not.toHaveBeenCalled();
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("forwards the retry policy to the api client", async () => {
        let calls = 0;
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login")) return jsonResponse({ access_token: "tok-1" });
            calls += 1;
            return calls === 1 ? jsonResponse({ detail: "boom" }, 503) : jsonResponse({ ok: true });
        });

        const auth = createTempestAuth<User>({
            baseURL: "https://api.test",
            fetcher,
            retry: { initialDelay: 1 },
        });
        await auth.login({ email: "a@b.c", password: "x" });

        await expect(auth.api.get("/api/orders")).resolves.toEqual({ ok: true });
        expect(calls).toBe(2);
    });
});
