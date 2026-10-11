import { beforeEach, describe, expect, it, vi } from "vitest";

import { RefreshSupersededError } from "../http";
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
 * A two-account backend whose refresh route waits on a gate, so a test can end
 * or replace the session while a refresh is still in flight.
 *
 * Account A logs in as `A-tok-1`/`A-ref-1` and refreshes to `A-tok-2`; account
 * B logs in as `B-tok-1`/`B-ref-1` and refreshes to `B-tok-2`. A protected route
 * answers with the account that owns the bearer it received, and `401` for any
 * token that is not current — which is what lets a test see a request that left
 * as the wrong account.
 *
 * @param delays - Per protected request, in send order, milliseconds to wait
 *   before answering. Missing entries answer immediately.
 * @returns The auth preset, the gate release, and the refresh bodies seen.
 */
function twoAccountBackend(delays: number[] = []) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const refreshBodies: unknown[] = [];
    const accepted = new Map([
        ["A-tok-2", "A"],
        ["B-tok-1", "B"],
        ["B-tok-2", "B"],
    ]);
    let protectedCalls = 0;

    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (url.endsWith("/api/auth/login")) {
            const body = JSON.parse(String(init?.body)) as { email: string };
            return body.email === "b@x.test"
                ? jsonResponse({
                      access_token: "B-tok-1",
                      refresh_token: "B-ref-1",
                      user: { id: "B" },
                  })
                : jsonResponse({
                      access_token: "A-tok-1",
                      refresh_token: "A-ref-1",
                      user: { id: "A" },
                  });
        }
        if (url.endsWith("/api/auth/refresh")) {
            const body = JSON.parse(String(init?.body)) as { refresh_token: string };
            refreshBodies.push(body);
            if (body.refresh_token === "B-ref-1") {
                return jsonResponse({ access_token: "B-tok-2", refresh_token: "B-ref-2" });
            }
            await gate;
            return jsonResponse({ access_token: "A-tok-2", refresh_token: "A-ref-2" });
        }
        const delay = delays[protectedCalls++] ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const bearer = (headers.Authorization ?? "").replace("Bearer ", "");
        const owner = accepted.get(bearer);
        return owner
            ? jsonResponse({ acting_as: owner })
            : jsonResponse({ detail: "expired" }, 401);
    });

    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        fetcher,
        parseUser: (data) => (data as { user: User }).user,
    });
    return { auth, release: () => release(), refreshBodies, fetcher };
}

/**
 * Let the pending request reach the refresh gate.
 *
 * @returns A promise that settles after a macrotask.
 */
function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Issue #435: a refresh that started under one session must never install its
 * tokens into another. Before the fix, measured with the `twoAccountBackend`
 * below: after `logout()` the late refresh put `A-tok-2` back in the store and
 * `isAuthenticated` back to `true`; after `logout()` + `login(B)` the store kept
 * user B while the token became `A-tok-2`, so every request went out as A.
 */
describe("createTempestAuth — refresh bound to the session epoch", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("keeps the session cleared when a refresh started before logout resolves after it", async () => {
        const { auth, release } = twoAccountBackend();
        await auth.login({ email: "a@x.test", password: "x" });

        const pending = auth.api.get("/api/orders");
        await tick();
        void auth.logout();
        release();

        await expect(pending).rejects.toBeInstanceOf(RefreshSupersededError);
        expect(auth.getToken()).toBeNull();
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(false);
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
    });

    it("keeps account B's tokens and session when A's refresh resolves after B signed in", async () => {
        const { auth, release } = twoAccountBackend();
        await auth.login({ email: "a@x.test", password: "x" });

        const pending = auth.api.get("/api/orders");
        await tick();
        void auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });
        release();

        await expect(pending).rejects.toBeInstanceOf(RefreshSupersededError);
        expect(auth.getToken()).toBe("B-tok-1");
        expect(auth.useAuthStore.getState()).toMatchObject({
            user: { id: "B" },
            isAuthenticated: true,
        });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("B-ref-1");
        await expect(auth.api.get("/api/orders")).resolves.toEqual({ acting_as: "B" });
    });

    it("supersedes A's refresh when B signs in without an explicit logout", async () => {
        const { auth, release } = twoAccountBackend();
        await auth.login({ email: "a@x.test", password: "x" });

        const pending = auth.api.get("/api/orders");
        await tick();
        await auth.login({ email: "b@x.test", password: "x" });
        release();

        await expect(pending).rejects.toBeInstanceOf(RefreshSupersededError);
        expect(auth.getToken()).toBe("B-tok-1");
    });

    it("does not let a 401 under the new session join the old session's refresh", async () => {
        const { auth, release, refreshBodies } = twoAccountBackend();
        await auth.login({ email: "a@x.test", password: "x" });

        const stale = auth.api.get("/api/orders");
        await tick();
        void auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });

        auth.useAuthStore.getState().setToken("B-tok-expired");
        await expect(auth.api.get("/api/orders")).resolves.toEqual({ acting_as: "B" });
        expect(refreshBodies).toEqual([{ refresh_token: "A-ref-1" }, { refresh_token: "B-ref-1" }]);

        release();
        await expect(stale).rejects.toBeInstanceOf(RefreshSupersededError);
        expect(auth.getToken()).toBe("B-tok-2");
    });

    it("rejects a refresh that fails after logout as superseded, without ending the new session", async () => {
        let fail!: () => void;
        const gate = new Promise<void>((resolve) => {
            fail = resolve;
        });
        const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login")) {
                const body = JSON.parse(String(init?.body)) as { email: string };
                const who = body.email === "b@x.test" ? "B" : "A";
                return jsonResponse({
                    access_token: `${who}-tok-1`,
                    refresh_token: `${who}-ref-1`,
                });
            }
            if (url.endsWith("/api/auth/refresh")) {
                await gate;
                return jsonResponse({ detail: "revoked" }, 401);
            }
            return jsonResponse({ detail: "expired" }, 401);
        });
        const onSessionEnd = vi.fn();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const pending = auth.api.get("/api/orders");
        await tick();
        await auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });
        fail();

        await expect(pending).rejects.toBeInstanceOf(RefreshSupersededError);
        expect(auth.getToken()).toBe("B-tok-1");
        expect(onSessionEnd).toHaveBeenCalledOnce();
        expect(onSessionEnd.mock.calls[0]?.[0]).toMatchObject({ reason: "logout" });
    });

    it("refuses to replay a request from an ended session under the new one", async () => {
        const { auth } = twoAccountBackend([30]);
        await auth.login({ email: "a@x.test", password: "x" });

        const stale = auth.api.get("/api/orders");
        await tick();
        void auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });

        await expect(stale).rejects.toBeInstanceOf(RefreshSupersededError);
        expect(auth.getToken()).toBe("B-tok-1");
        expect(auth.useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it("refuses a stale request sent with a token rehydrated from storage", async () => {
        localStorage.setItem(
            "tempest-auth",
            JSON.stringify({ state: { user: { id: "A" }, token: "A-tok-1" }, version: 0 }),
        );
        localStorage.setItem("tempest-auth-refresh", "A-ref-1");
        const { auth } = twoAccountBackend([30]);
        expect(auth.getToken()).toBe("A-tok-1");

        const stale = auth.api.get("/api/orders");
        await tick();
        void auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });

        await expect(stale).rejects.toBeInstanceOf(RefreshSupersededError);
        expect(auth.getToken()).toBe("B-tok-1");
    });
});

describe("createTempestAuth — one refresh per expiry", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("collapses three simultaneous 401s into one refresh", async () => {
        const { auth, release, refreshBodies } = twoAccountBackend();
        release();
        await auth.login({ email: "a@x.test", password: "x" });

        const results = await Promise.all([
            auth.api.get("/api/a"),
            auth.api.get("/api/b"),
            auth.api.get("/api/c"),
        ]);

        expect(results).toEqual([{ acting_as: "A" }, { acting_as: "A" }, { acting_as: "A" }]);
        expect(refreshBodies).toHaveLength(1);
    });

    it("collapses three 401s that arrive after the first refresh already resolved", async () => {
        const { auth, release, refreshBodies } = twoAccountBackend([0, 20, 40]);
        release();
        await auth.login({ email: "a@x.test", password: "x" });

        const results = await Promise.all([
            auth.api.get("/api/a"),
            auth.api.get("/api/b"),
            auth.api.get("/api/c"),
        ]);

        expect(results).toEqual([{ acting_as: "A" }, { acting_as: "A" }, { acting_as: "A" }]);
        expect(refreshBodies).toHaveLength(1);
    });

    it("refreshes again when the token the last refresh issued expires in turn", async () => {
        const { auth, release, refreshBodies, fetcher } = twoAccountBackend();
        release();
        await auth.login({ email: "a@x.test", password: "x" });
        await auth.api.get("/api/a");
        expect(refreshBodies).toHaveLength(1);

        fetcher.mockImplementationOnce(async () => jsonResponse({ detail: "expired" }, 401));
        await expect(auth.api.get("/api/a")).resolves.toEqual({ acting_as: "A" });
        expect(refreshBodies).toHaveLength(2);
    });
});
