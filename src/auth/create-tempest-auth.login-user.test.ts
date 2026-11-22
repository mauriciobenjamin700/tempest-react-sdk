import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionSupersededError, TempestApiError } from "../http";
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
 * A body-mode backend whose `/api/auth/me` answers with `meStatus.value` —
 * `200` with the account the bearer belongs to, anything else with an error
 * envelope. `/api/auth/login` issues `tok-<email>` / `ref-<email>`, and
 * `/api/auth/logout` records the refresh token it revokes.
 *
 * @returns The fetcher, the tunable `/me` status and the revoked refresh tokens.
 */
function meBackend(): {
    fetcher: typeof fetch;
    meStatus: { value: number };
    revoked: string[];
} {
    const meStatus = { value: 200 };
    const revoked: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
        if (path === "/api/auth/login") {
            return jsonResponse({
                access_token: `tok-${body.email}`,
                refresh_token: `ref-${body.email}`,
            });
        }
        if (path === "/api/auth/logout") {
            revoked.push(body.refresh_token ?? "<cookie>");
            return new Response(null, { status: 204 });
        }
        if (meStatus.value !== 200)
            return jsonResponse({ detail: "profile unavailable" }, meStatus.value);
        const headers = (init?.headers ?? {}) as Record<string, string>;
        return jsonResponse({ id: (headers.Authorization ?? "").replace("Bearer tok-", "") });
    }) as typeof fetch;
    return { fetcher, meStatus, revoked };
}

const created: Auth[] = [];

/**
 * Open a body-mode preset with `mePath` and `logoutPath`.
 *
 * @param backend - The backend.
 * @param ended - Collects every `onSessionEnd` the preset runs.
 * @returns The preset.
 */
function openAuth(backend: ReturnType<typeof meBackend>, ended: TempestSessionEnd<User>[]): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        mePath: "/api/auth/me",
        logoutPath: "/api/auth/logout",
        fetcher: backend.fetcher,
        onSessionEnd: (event) => {
            ended.push(event);
        },
    });
    created.push(auth);
    return auth;
}

/**
 * #748: when `mePath` failed after the credentials were accepted, `login()`
 * rejected but left the new access and refresh tokens installed next to a
 * `null` user — `isAuthenticated` true for nobody, and every route guard that
 * checks only the token let the app in. Measured on 71727a7: after a `500`
 * from `/me`, `token` was `"tok-B"`, `user` `null` and the refresh token
 * `"ref-B"` stayed stored (the first three tests failed). A sign-in whose user
 * cannot be loaded is now undone before `login()` rejects: the store and the
 * refresh token are cleared, the refresh token is revoked in body mode, and
 * `onSessionEnd` runs `"expired"` for the half-installed session, since its
 * token already reached the store's listeners.
 */
describe("createTempestAuth — a login whose user fails to load leaves no session (#748)", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("rejects with the /me error and leaves neither token nor refresh token behind", async () => {
        const backend = meBackend();
        const auth = openAuth(backend, []);
        backend.meStatus.value = 500;

        const error = await auth
            .login({ email: "B", password: "x" })
            .catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(TempestApiError);
        expect(error).toMatchObject({ status: 500 });
        expect(auth.useAuthStore.getState()).toMatchObject({ token: null, user: null });
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
    });

    it("revokes the refresh token the undone sign-in brought, in body mode", async () => {
        const backend = meBackend();
        const auth = openAuth(backend, []);
        backend.meStatus.value = 503;

        await auth.login({ email: "B", password: "x" }).catch(() => undefined);

        expect(backend.revoked).toEqual(["ref-B"]);
    });

    it("ends the previous session with switch and the undone one with expired", async () => {
        const backend = meBackend();
        const ended: TempestSessionEnd<User>[] = [];
        const auth = openAuth(backend, ended);
        await auth.login({ email: "A", password: "x" });
        backend.meStatus.value = 401;

        await expect(auth.login({ email: "B", password: "x" })).rejects.toMatchObject({
            status: 401,
        });

        expect(ended.map((event) => [event.reason, event.user, event.token])).toEqual([
            ["switch", { id: "A" }, "tok-A"],
            ["expired", null, "tok-B"],
        ]);
        expect(auth.useAuthStore.getState()).toMatchObject({ token: null, user: null });
    });

    it("lets the next login succeed after an undone one", async () => {
        const backend = meBackend();
        const auth = openAuth(backend, []);
        backend.meStatus.value = 500;
        await auth.login({ email: "B", password: "x" }).catch(() => undefined);
        backend.meStatus.value = 200;

        await expect(auth.login({ email: "B", password: "x" })).resolves.toEqual({ id: "B" });
        expect(auth.useAuthStore.getState()).toMatchObject({ token: "tok-B", user: { id: "B" } });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("ref-B");
    });

    it("leaves a session installed by a later login alone when the /me of an earlier one fails", async () => {
        const backend = meBackend();
        let releaseMe: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            releaseMe = resolve;
        });
        let firstMe = true;
        const auth = openAuth(
            {
                ...backend,
                fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
                    if (new URL(String(input)).pathname === "/api/auth/me" && firstMe) {
                        firstMe = false;
                        await gate;
                        return jsonResponse({ detail: "profile unavailable" }, 500);
                    }
                    return backend.fetcher(input, init);
                }) as typeof fetch,
            },
            [],
        );

        const first = auth.login({ email: "A", password: "x" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await expect(auth.login({ email: "C", password: "x" })).resolves.toEqual({ id: "C" });
        releaseMe();

        await expect(first).rejects.toBeInstanceOf(SessionSupersededError);
        expect(auth.useAuthStore.getState()).toMatchObject({ token: "tok-C", user: { id: "C" } });
        expect(backend.revoked).not.toContain("ref-C");
    });
});
