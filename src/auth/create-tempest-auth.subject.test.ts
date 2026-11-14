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
 * Encode one JWT segment the way a backend would: base64url, no padding.
 *
 * @param value - The JSON value.
 * @returns The segment.
 */
function segment(value: unknown): string {
    return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A cookie-refresh backend whose HttpOnly cookie belongs to whichever account
 * the test names in `cookie.owner` — what an OAuth callback, or a sign-in in
 * another tab with `storage: "session"`, leaves in the shared cookie jar.
 *
 * Each redemption issues a fresh access token of that account: a JWT whose
 * `sub` is the account with `format: "jwt"`, an opaque `<owner>-tok-<n>` with
 * `"opaque"`. `/api/auth/me` answers the account that owns the bearer;
 * `/api/orders` answers it too, unless the bearer is in `expired`.
 *
 * @param format - Whether access tokens are JWTs or opaque.
 * @returns The fetcher, the cookie holder, the expired set and every
 *   `/api/orders` bearer seen.
 */
function cookieBackend(format: "jwt" | "opaque") {
    const cookie = { owner: "A" };
    const owners = new Map<string, string>();
    const expired = new Set<string>();
    const ordersSeen: string[] = [];
    let issued = 0;
    let failRefresh = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const bearer = (headers.Authorization ?? "").replace("Bearer ", "");
        if (path === "/api/auth/refresh") {
            if (failRefresh) return jsonResponse({ detail: "no cookie" }, 401);
            issued += 1;
            const owner = cookie.owner;
            const token =
                format === "jwt"
                    ? `${segment({ alg: "HS256", typ: "JWT" })}.${segment({ sub: owner, n: issued })}.sig`
                    : `${owner}-tok-${issued}`;
            owners.set(token, owner);
            await new Promise((resolve) => setTimeout(resolve, 2));
            return jsonResponse({ access_token: token });
        }
        if (path === "/api/auth/logout") return new Response(null, { status: 204 });
        const owner = expired.has(bearer) ? undefined : owners.get(bearer);
        if (path === "/api/orders") ordersSeen.push(bearer);
        if (!owner) return jsonResponse({ detail: "expired" }, 401);
        if (path === "/api/auth/me") return jsonResponse({ id: owner });
        return jsonResponse({ acting_as: owner });
    }) as unknown as typeof fetch;
    return {
        fetcher,
        cookie,
        expired,
        ordersSeen,
        ownerOf: (token: string | null) => (token ? owners.get(token) : undefined),
        failRefresh: (fail: boolean) => {
            failRefresh = fail;
        },
    };
}

const created: Auth[] = [];

/**
 * Open one tab in cookie mode over the shared `localStorage`.
 *
 * @param fetcher - The backend.
 * @param ended - Collects every `onSessionEnd` this tab runs.
 * @param extra - Extra options.
 * @returns The tab's preset.
 */
function openTab(
    fetcher: typeof fetch,
    ended: TempestSessionEnd<User>[] = [],
    extra: Partial<CreateTempestAuthOptions<User>> = {},
): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        withCredentials: true,
        logoutPath: "/api/auth/logout",
        fetcher,
        onSessionEnd: (event) => {
            ended.push(event);
        },
        ...extra,
    });
    created.push(auth);
    return auth;
}

/**
 * #579: a `refresh()` that redeemed another account's cookie while the
 * previous session was still installed counted as a rotation. The lineage
 * stayed, so `sessionKey()` answered A's key for B and B's resumable upload
 * resumed A's upload URL with B's bearer; the store kept A's user next to B's
 * token, and the request of A that triggered the refresh was replayed as B.
 * The tests marked (#579) failed against 8e18770.
 */
describe("createTempestAuth — a refresh that redeems another account is a switch", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("gives the account behind the redeemed cookie a key of its own (#579)", async () => {
        const backend = cookieBackend("jwt");
        const auth = openTab(backend.fetcher);
        await auth.refresh();
        const keyOfA = auth.sessionKey();

        backend.cookie.owner = "B";
        await auth.refresh();

        expect(backend.ownerOf(auth.getToken())).toBe("B");
        expect(keyOfA).not.toBeNull();
        expect(auth.sessionKey()).not.toBeNull();
        expect(auth.sessionKey()).not.toBe(keyOfA);
    });

    it("ends the previous session with reason switch before installing the next (#579)", async () => {
        const backend = cookieBackend("jwt");
        const ended: TempestSessionEnd<User>[] = [];
        const auth = openTab(backend.fetcher, ended);
        await auth.refresh();
        const tokenOfA = auth.getToken();

        backend.cookie.owner = "B";
        await auth.refresh();

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ reason: "switch", token: tokenOfA, elsewhere: false });
    });

    it("loads the new account's user instead of keeping the previous one (#579)", async () => {
        const backend = cookieBackend("jwt");
        const auth = openTab(backend.fetcher, [], { mePath: "/api/auth/me" });
        await auth.refresh();
        auth.useAuthStore.getState().setUser({ id: "A" });

        backend.cookie.owner = "B";
        await auth.refresh();

        expect(auth.useAuthStore.getState().user).toEqual({ id: "B" });
    });

    it("never replays the previous account's request with the new account's token (#579)", async () => {
        const backend = cookieBackend("jwt");
        const auth = openTab(backend.fetcher);
        await auth.refresh();
        const tokenOfA = auth.getToken() as string;
        backend.expired.add(tokenOfA);
        backend.cookie.owner = "B";

        await expect(auth.api.get("/api/orders")).rejects.toBeInstanceOf(SessionSupersededError);

        expect(backend.ordersSeen).toEqual([tokenOfA]);
        expect(backend.ownerOf(auth.getToken())).toBe("B");
    });

    it("keeps the key and ends nothing when the same account rotates", async () => {
        const backend = cookieBackend("jwt");
        const ended: TempestSessionEnd<User>[] = [];
        const auth = openTab(backend.fetcher, ended, { mePath: "/api/auth/me" });
        await auth.refresh();
        auth.useAuthStore.getState().setUser({ id: "A" });
        const restored = auth.sessionKey();
        const first = auth.getToken();

        await auth.refresh();

        expect(auth.getToken()).not.toBe(first);
        expect(auth.sessionKey()).toBe(restored);
        expect(auth.useAuthStore.getState().user).toEqual({ id: "A" });
        expect(ended).toEqual([]);
    });

    it("replays a request of the same account after its rotation", async () => {
        const backend = cookieBackend("jwt");
        const auth = openTab(backend.fetcher);
        await auth.refresh();
        backend.expired.add(auth.getToken() as string);

        await expect(auth.api.get("/api/orders")).resolves.toEqual({ acting_as: "A" });
    });

    it("cannot tell accounts apart by opaque tokens, so refresh() keeps the lineage there", async () => {
        const backend = cookieBackend("opaque");
        const ended: TempestSessionEnd<User>[] = [];
        const auth = openTab(backend.fetcher, ended);
        await auth.refresh();
        const keyOfA = auth.sessionKey();

        backend.cookie.owner = "B";
        await auth.refresh();

        expect(auth.getToken()).toMatch(/^B-tok-/);
        expect(auth.sessionKey()).toBe(keyOfA);
        expect(ended).toEqual([]);
    });
});

/**
 * #579, the half a token cannot answer: with opaque tokens the client has no
 * subject to compare, so the app that knows a sign-in happened outside
 * `login()` — an OAuth callback that set the cookie — says so with
 * `restore()`.
 */
describe("createTempestAuth — restore() installs the refresh credential as a new sign-in", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("replaces a live session with the account behind the cookie, opaque tokens included", async () => {
        const backend = cookieBackend("opaque");
        const ended: TempestSessionEnd<User>[] = [];
        const auth = openTab(backend.fetcher, ended, { mePath: "/api/auth/me" });
        await auth.refresh();
        auth.useAuthStore.getState().setUser({ id: "A" });
        const keyOfA = auth.sessionKey();

        backend.cookie.owner = "B";
        const user = await auth.restore();

        expect(user).toEqual({ id: "B" });
        expect(auth.getToken()).toMatch(/^B-tok-/);
        expect(auth.sessionKey()).not.toBeNull();
        expect(auth.sessionKey()).not.toBe(keyOfA);
        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ reason: "switch", user: { id: "A" } });
    });

    it("signs in from the cookie with nothing installed and ends nothing", async () => {
        const backend = cookieBackend("opaque");
        const ended: TempestSessionEnd<User>[] = [];
        const auth = openTab(backend.fetcher, ended);

        const user = await auth.restore();

        expect(user).toBeNull();
        expect(auth.getToken()).toMatch(/^A-tok-/);
        expect(auth.sessionKey()).not.toBeNull();
        expect(ended).toEqual([]);
    });

    it("leaves the live session untouched when the redemption fails", async () => {
        const backend = cookieBackend("opaque");
        const ended: TempestSessionEnd<User>[] = [];
        const auth = openTab(backend.fetcher, ended);
        await auth.refresh();
        const token = auth.getToken();
        const key = auth.sessionKey();
        backend.failRefresh(true);

        await expect(auth.restore()).rejects.toBeTruthy();

        expect(auth.getToken()).toBe(token);
        expect(auth.sessionKey()).toBe(key);
        expect(ended).toEqual([]);
    });

    it("discards the restored session when logout() ran while it was in flight", async () => {
        const backend = cookieBackend("opaque");
        const auth = openTab(backend.fetcher);

        const restoring = auth.restore();
        await auth.logout();

        await expect(restoring).rejects.toBeInstanceOf(SessionSupersededError);
        expect(auth.getToken()).toBeNull();
        expect(auth.sessionKey()).toBeNull();
    });
});
