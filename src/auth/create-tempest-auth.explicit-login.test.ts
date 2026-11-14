import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionSupersededError } from "../http";
import { createTempestAuth } from "./create-tempest-auth";
import type { TempestAuth, TempestSessionEnd } from "./create-tempest-auth";

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
 * Encode one JWT segment the way a backend would: base64url, no padding.
 *
 * @param value - The JSON value.
 * @returns The segment.
 */
function segment(value: unknown): string {
    return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Wait `ms` milliseconds.
 *
 * @param ms - The delay.
 * @returns A promise resolving after it.
 */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A body-mode backend whose access tokens are JWTs naming their account in
 * `sub`. A refresh token `ref-<account>-<n>` redeems as that account, so a
 * test that stores another account's refresh token makes the next
 * `refresh()` an account switch (#579). `/api/auth/login` answers the
 * account named by `email` after `loginDelay.ms`, the refresh route after
 * `refreshDelay.ms`; `/api/auth/logout` records the refresh token it revokes.
 *
 * @returns The fetcher, the tunable delays and the revoked refresh tokens.
 */
function subjectBackend(): {
    fetcher: typeof fetch;
    loginDelay: { ms: number };
    refreshDelay: { ms: number };
    revoked: string[];
} {
    let issued = 0;
    const loginDelay = { ms: 0 };
    const refreshDelay = { ms: 0 };
    const revoked: string[] = [];
    const owners = new Map<string, string>();
    const pair = (account: string): { access_token: string; refresh_token: string } => {
        issued += 1;
        const token = `${segment({ alg: "HS256", typ: "JWT" })}.${segment({ sub: account, n: issued })}.sig`;
        owners.set(token, account);
        return { access_token: token, refresh_token: `ref-${account}-${issued}` };
    };
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
        if (path === "/api/auth/login") {
            await delay(loginDelay.ms);
            if (body.email === "refused") return jsonResponse({ detail: "bad credentials" }, 401);
            return jsonResponse(pair(body.email ?? "?"));
        }
        if (path === "/api/auth/refresh") {
            await delay(refreshDelay.ms);
            const account = (body.refresh_token ?? "").split("-")[1] ?? "?";
            return jsonResponse(pair(account));
        }
        if (path === "/api/auth/logout") {
            revoked.push(body.refresh_token ?? "<cookie>");
            return new Response(null, { status: 204 });
        }
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const owner = owners.get((headers.Authorization ?? "").replace("Bearer ", ""));
        if (!owner) return jsonResponse({ detail: "expired" }, 401);
        return jsonResponse({ id: owner });
    }) as typeof fetch;
    return { fetcher, loginDelay, refreshDelay, revoked };
}

const created: Auth[] = [];

/**
 * Open a body-mode preset signed in as account A, with account B's refresh
 * token stored in its place — what makes the next `refresh()` switch to B.
 *
 * @param backend - The backend.
 * @param ended - Collects every `onSessionEnd` the preset runs.
 * @param hookMs - How long each `onSessionEnd` takes.
 * @returns The preset.
 */
async function signedInAsAWithBsRefreshToken(
    backend: ReturnType<typeof subjectBackend>,
    ended: TempestSessionEnd<User>[],
    hookMs = 0,
): Promise<Auth> {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        mePath: "/api/auth/me",
        logoutPath: "/api/auth/logout",
        fetcher: backend.fetcher,
        onSessionEnd: async (event) => {
            ended.push(event);
            await delay(hookMs);
        },
    });
    created.push(auth);
    await auth.login({ email: "A", password: "x" });
    localStorage.setItem("tempest-auth-refresh", "ref-B-0");
    return auth;
}

/**
 * #595, decided by the owner on 14/11/2026: the explicit login wins. A
 * `refresh()` that redeemed another account's credential while a `login()`
 * was in flight used to switch to that account first; the switch moved the
 * epoch, and the `login()` that landed after it was discarded as superseded —
 * the user asked for C and ended as B (measured on b99a0c6). The switch is now
 * discarded, and its redemption revoked in body mode, whenever a `login()` is
 * in flight. `restore()` and the switch itself do not count: they are not the
 * user asking for an account.
 */
describe("createTempestAuth — an explicit login wins over an implicit account switch (#595)", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("ends as C when the switch to B arrives while login(C) is in flight", async () => {
        const backend = subjectBackend();
        const ended: TempestSessionEnd<User>[] = [];
        const auth = await signedInAsAWithBsRefreshToken(backend, ended);
        backend.loginDelay.ms = 20;
        backend.refreshDelay.ms = 2;

        const login = auth.login({ email: "C", password: "x" });
        const refresh = auth.refresh();

        await expect(refresh).rejects.toBeInstanceOf(SessionSupersededError);
        await expect(login).resolves.toEqual({ id: "C" });
        expect(auth.useAuthStore.getState().user).toEqual({ id: "C" });
        expect(await auth.api.get("/api/auth/me")).toEqual({ id: "C" });
        expect(ended.map((event) => [event.reason, event.user])).toEqual([["switch", { id: "A" }]]);
    });

    it("revokes the discarded redemption of B in body mode", async () => {
        const backend = subjectBackend();
        const auth = await signedInAsAWithBsRefreshToken(backend, []);
        backend.loginDelay.ms = 20;
        backend.refreshDelay.ms = 2;

        const login = auth.login({ email: "C", password: "x" });
        await auth.refresh().catch(() => undefined);
        await login;

        expect(backend.revoked.some((token) => token.startsWith("ref-B-"))).toBe(true);
        expect(localStorage.getItem("tempest-auth-refresh")).toMatch(/^ref-C-/);
    });

    it("ends as C when login(C) starts while the switch to B is tearing A down", async () => {
        const backend = subjectBackend();
        const ended: TempestSessionEnd<User>[] = [];
        const auth = await signedInAsAWithBsRefreshToken(backend, ended, 10);
        backend.refreshDelay.ms = 0;

        const refresh = auth.refresh();
        await delay(3);
        const login = auth.login({ email: "C", password: "x" });

        await Promise.allSettled([refresh]);
        await expect(login).resolves.toEqual({ id: "C" });
        expect(auth.useAuthStore.getState().user).toEqual({ id: "C" });
        expect(await auth.api.get("/api/auth/me")).toEqual({ id: "C" });
    });

    it("ends as C when login(C) starts after the switch to B was installed", async () => {
        const backend = subjectBackend();
        const auth = await signedInAsAWithBsRefreshToken(backend, []);

        await auth.refresh();
        expect(auth.useAuthStore.getState().user).toEqual({ id: "B" });
        await auth.login({ email: "C", password: "x" });

        expect(auth.useAuthStore.getState().user).toEqual({ id: "C" });
    });

    it("keeps A when the login(C) that discarded the switch is refused", async () => {
        const backend = subjectBackend();
        const auth = await signedInAsAWithBsRefreshToken(backend, []);
        backend.loginDelay.ms = 20;
        backend.refreshDelay.ms = 2;

        const login = auth.login({ email: "refused", password: "x" });
        const refresh = auth.refresh();

        await expect(refresh).rejects.toBeInstanceOf(SessionSupersededError);
        await expect(login).rejects.toMatchObject({ status: 401 });
        expect(auth.useAuthStore.getState().user).toEqual({ id: "A" });
    });
});
