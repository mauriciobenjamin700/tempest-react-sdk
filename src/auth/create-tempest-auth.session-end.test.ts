import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth } from "./create-tempest-auth";
import type { TempestSessionEnd } from "./create-tempest-auth";

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
 * A backend that accepts `tok-1` on `DELETE /webpush/subscribe` and nothing else
 * on the protected routes, recording the bearer every request carried.
 *
 * @param refreshStatus - Status the refresh route answers with.
 * @returns The fetcher and the log of `[path, bearer]` pairs.
 */
function backend(refreshStatus = 401) {
    const seen: Array<[string, string | undefined]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const headers = (init?.headers ?? {}) as Record<string, string>;
        seen.push([url.pathname, headers.Authorization]);
        if (url.pathname === "/api/auth/login") {
            return jsonResponse({
                access_token: "tok-1",
                refresh_token: "ref-1",
                user: { id: "A" },
            });
        }
        if (url.pathname === "/api/auth/refresh") {
            return jsonResponse({ detail: "revoked" }, refreshStatus);
        }
        if (url.pathname === "/webpush/subscribe" && headers.Authorization === "Bearer tok-1") {
            return new Response(null, { status: 204 });
        }
        return jsonResponse({ detail: "expired" }, 401);
    });
    return { fetcher, seen };
}

/**
 * Issue #445: the session can end in two ways — an explicit `logout()` and the
 * automatic `endSession()` after a refresh that failed — and per-user state
 * derived from it (a push subscription, a persisted query cache) has to be torn
 * down on both. Before the fix there was no hook at all, and the documented
 * recipe only covered the explicit path.
 */
describe("createTempestAuth — onSessionEnd", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("runs on logout with the ending session's token still usable", async () => {
        const { fetcher, seen } = backend();
        const ends: Array<{ reason: string; user: User | null; token: string | null }> = [];
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            parseUser: (data) => (data as { user: User }).user,
            onSessionEnd: async (session: TempestSessionEnd<User>) => {
                ends.push({ reason: session.reason, user: session.user, token: session.token });
                await session.api.delete("/webpush/subscribe", {
                    body: { endpoint: "https://push/x" },
                });
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const done = auth.logout();
        expect(auth.getToken()).toBeNull();
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
        await done;

        expect(ends).toEqual([{ reason: "logout", user: { id: "A" }, token: "tok-1" }]);
        expect(seen).toContainEqual(["/webpush/subscribe", "Bearer tok-1"]);
    });

    it("runs when the session expires because the refresh failed", async () => {
        const { fetcher } = backend();
        const onSessionEnd = vi.fn();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await expect(auth.api.get("/api/orders")).rejects.toMatchObject({ status: 401 });

        expect(onSessionEnd).toHaveBeenCalledOnce();
        expect(onSessionEnd.mock.calls[0]?.[0]).toMatchObject({
            reason: "expired",
            token: "tok-1",
        });
        expect(auth.getToken()).toBeNull();
    });

    it("runs once when a burst of 401s ends the same session", async () => {
        const { fetcher } = backend();
        const onSessionEnd = vi.fn();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await Promise.allSettled([
            auth.api.get("/api/a"),
            auth.api.get("/api/b"),
            auth.api.get("/api/c"),
        ]);

        expect(onSessionEnd).toHaveBeenCalledOnce();
    });

    it("does not run when there was no session to end", async () => {
        const onSessionEnd = vi.fn();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher: backend().fetcher,
            onSessionEnd,
        });

        await auth.logout();

        expect(onSessionEnd).not.toHaveBeenCalled();
    });

    it("never lets the ending-session client refresh or end another session", async () => {
        const { fetcher, seen } = backend(200);
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd: async (session) => {
                await session.api.get("/api/orders").catch(() => undefined);
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await auth.logout();

        expect(seen.filter(([path]) => path === "/api/auth/refresh")).toHaveLength(0);
    });

    it("rejects logout() with the hook's error after the session is already cleared", async () => {
        const boom = new Error("teardown failed");
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher: backend().fetcher,
            onSessionEnd: () => {
                throw boom;
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await expect(auth.logout()).rejects.toBe(boom);
        expect(auth.getToken()).toBeNull();
    });

    it("navigates to redirectTo only after the hook settled", async () => {
        const order: string[] = [];
        const assign = vi.fn((_url: string): void => {
            order.push("assign");
        });
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, assign },
        });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher: backend().fetcher,
            redirectTo: "/login",
            onSessionEnd: async () => {
                await Promise.resolve();
                order.push("hook");
                throw new Error("still navigates");
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await expect(auth.api.get("/api/orders")).rejects.toMatchObject({ status: 401 });

        expect(order).toEqual(["hook", "assign"]);
        expect(assign).toHaveBeenCalledWith("/login");
    });
});

/**
 * A two-account backend: `a@x.test` logs in as `A-tok-1`, `b@x.test` as
 * `B-tok-1`, and any other email is refused with `401`. The refresh route waits
 * on a gate and answers `A-tok-2`; a protected route accepts `A-tok-2` and
 * `B-tok-1` and records the bearer every request carried.
 *
 * @returns The fetcher, the gate release and the `[path, bearer]` log.
 */
function switchBackend() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const seen: Array<[string, string | undefined]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const headers = (init?.headers ?? {}) as Record<string, string>;
        seen.push([url.pathname, headers.Authorization]);
        if (url.pathname === "/api/auth/login") {
            const { email } = JSON.parse(String(init?.body)) as { email: string };
            if (email === "a@x.test")
                return jsonResponse({
                    access_token: "A-tok-1",
                    refresh_token: "A-ref-1",
                    user: { id: "A" },
                });
            if (email === "b@x.test")
                return jsonResponse({
                    access_token: "B-tok-1",
                    refresh_token: "B-ref-1",
                    user: { id: "B" },
                });
            return jsonResponse({ detail: "bad credentials" }, 401);
        }
        if (url.pathname === "/api/auth/refresh") {
            await gate;
            return jsonResponse({ access_token: "A-tok-2", refresh_token: "A-ref-2" });
        }
        if (url.pathname === "/webpush/subscribe") return new Response(null, { status: 204 });
        const bearer = headers.Authorization;
        if (bearer === "Bearer A-tok-2") return jsonResponse({ acting_as: "A" });
        if (bearer === "Bearer B-tok-1") return jsonResponse({ acting_as: "B" });
        return jsonResponse({ detail: "expired" }, 401);
    });
    return { fetcher, seen, release: () => release() };
}

/**
 * Follow-up to #445: `login()` over a live session used to replace it without
 * ending it, so the previous account's push subscription and cached state
 * survived into the new one. It now ends the previous session with
 * `reason: "switch"` — but only once the new credentials were accepted.
 */
describe("createTempestAuth — onSessionEnd on account switch", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("ends A with reason 'switch' and A's token before installing B", async () => {
        const { fetcher, seen } = switchBackend();
        const during: Array<string | null> = [];
        const ends: Array<{ reason: string; user: User | null; token: string | null }> = [];
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            parseUser: (data) => (data as { user: User }).user,
            onSessionEnd: async (session) => {
                ends.push({ reason: session.reason, user: session.user, token: session.token });
                during.push(auth.getToken());
                await session.api.delete("/webpush/subscribe", { body: { endpoint: "e" } });
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await expect(auth.login({ email: "b@x.test", password: "x" })).resolves.toEqual({
            id: "B",
        });

        expect(ends).toEqual([{ reason: "switch", user: { id: "A" }, token: "A-tok-1" }]);
        expect(during).toEqual([null]);
        expect(seen).toContainEqual(["/webpush/subscribe", "Bearer A-tok-1"]);
        expect(auth.getToken()).toBe("B-tok-1");
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("B-ref-1");
    });

    it("leaves A's session and its in-flight refresh untouched when B's login fails", async () => {
        const { fetcher, release } = switchBackend();
        const onSessionEnd = vi.fn();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            parseUser: (data) => (data as { user: User }).user,
            onSessionEnd,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const pending = auth.api.get("/api/orders");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await expect(auth.login({ email: "wrong@x.test", password: "x" })).rejects.toMatchObject({
            status: 401,
        });
        release();

        await expect(pending).resolves.toEqual({ acting_as: "A" });
        expect(onSessionEnd).not.toHaveBeenCalled();
        expect(auth.getToken()).toBe("A-tok-2");
        expect(auth.useAuthStore.getState()).toMatchObject({
            user: { id: "A" },
            isAuthenticated: true,
        });
    });

    it("still signs B in when the switch teardown throws", async () => {
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher: switchBackend().fetcher,
            parseUser: (data) => (data as { user: User }).user,
            onSessionEnd: () => {
                throw new Error("teardown failed");
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await expect(auth.login({ email: "b@x.test", password: "x" })).resolves.toEqual({
            id: "B",
        });
        expect(auth.getToken()).toBe("B-tok-1");
    });

    /**
     * Inverted on purpose. This used to pin that `login()` waits for a
     * `logout()` teardown still running. Review found that the same wait
     * deadlocks when the caller is the hook itself (`onSessionEnd` awaiting
     * `auth.api`, `auth.logout()` or `auth.login()`), and without an async
     * context the SDK cannot tell the hook from an outside caller. A hang is
     * worse than an overlap, so while a hook runs nothing waits on it; the
     * documented contract is to `await auth.logout()` before `login()`.
     */
    it("does not wait for a teardown still running when logout() was not awaited", async () => {
        const order: string[] = [];
        let finishTeardown!: () => void;
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher: switchBackend().fetcher,
            parseUser: (data) => (data as { user: User }).user,
            onSessionEnd: async (session) => {
                order.push(`end:${session.reason}`);
                await new Promise<void>((resolve) => {
                    finishTeardown = resolve;
                });
                order.push("end:done");
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const leaving = auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });
        order.push(`installed:${auth.getToken()}`);
        finishTeardown();
        await leaving;

        expect(order).toEqual(["end:logout", "installed:B-tok-1", "end:done"]);
    });
});
