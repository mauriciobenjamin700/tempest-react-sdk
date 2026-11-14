import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempestAuth } from "../auth";
import type { TempestAuth } from "../auth";
import { createOfflineStore } from "../offline/create-offline-store";
import { persistQueryClientOffline } from "./offline-persistence";

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
 * Wait `ms` milliseconds.
 *
 * @param ms - The delay.
 * @returns A promise resolving after it.
 */
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A cookie-session backend whose `/api/orders` answers `401` to a request with
 * no bearer and account A's order, 50 ms later, to one with A's bearer — the
 * shape that makes the api client replay a tokenless request with the token a
 * `login()` or `refresh()` in flight installs.
 *
 * @returns The fetcher, the cookie switch and the bearers `/api/orders` saw.
 */
function replayBackend(): {
    fetcher: typeof fetch;
    cookie: { alive: boolean };
    seen: string[];
} {
    const cookie = { alive: true };
    const seen: string[] = [];
    let issued = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const bearer = new Headers(init?.headers).get("Authorization");
        if (path === "/api/auth/refresh") {
            await wait(30);
            if (!cookie.alive) return jsonResponse({ detail: "no cookie" }, 401);
            issued += 1;
            return jsonResponse({ access_token: `tok-${issued}` });
        }
        if (path === "/api/auth/login") {
            await wait(30);
            issued += 1;
            return jsonResponse({ access_token: `tok-${issued}` });
        }
        if (path === "/api/auth/me") {
            await wait(5);
            return jsonResponse({ id: "A" });
        }
        if (path === "/api/auth/logout") return new Response(null, { status: 204 });
        if (path === "/api/orders") {
            seen.push(bearer ?? "none");
            if (!bearer) {
                await wait(15);
                return jsonResponse({ detail: "unauthorized" }, 401);
            }
            await wait(50);
            return jsonResponse(["A-private-order"]);
        }
        return jsonResponse({ detail: "not found" }, 404);
    }) as typeof fetch;
    return { fetcher, cookie, seen };
}

/**
 * A fresh IndexedDB name per test.
 *
 * @returns The name.
 */
function databaseName(): string {
    return `qc-lifetime-${Math.random().toString(36).slice(2)}`;
}

/**
 * Read the persisted row straight from IndexedDB.
 *
 * @param dbName - The database.
 * @returns The row, if any.
 */
async function readRow(dbName: string): Promise<{ owner?: unknown } | undefined> {
    const store = createOfflineStore<{ id: string; owner?: unknown }, string>({
        databaseName: dbName,
        version: 1,
        tableName: "cache",
        indexes: "&id",
        keyPath: "id",
    });
    return store.get("tanstack-query");
}

const created: Auth[] = [];

/**
 * Open one page load of a cookie app built on `createTempestAuth`.
 *
 * @param backend - The backend.
 * @returns The preset.
 */
function boot(backend: ReturnType<typeof replayBackend>): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        withCredentials: true,
        logoutPath: "/api/auth/logout",
        mePath: "/api/auth/me",
        fetcher: backend.fetcher,
    });
    created.push(auth);
    return auth;
}

/**
 * Sign the session out from another tab: the browser fires `storage` with a
 * null key when that tab cleared the whole storage.
 */
function otherTabLogout(): void {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
}

/**
 * Boot signed out — the cookie is gone and no session is in storage — and
 * restore the persisted cache the way the app does at boot.
 *
 * @param backend - The backend.
 * @param dbName - The database.
 * @returns The restored client.
 */
async function signedOutBoot(
    backend: ReturnType<typeof replayBackend>,
    dbName: string,
): Promise<QueryClient> {
    localStorage.clear();
    backend.cookie.alive = false;
    const auth = boot(backend);
    const client = new QueryClient();
    const persistence = persistQueryClientOffline({
        queryClient: client,
        databaseName: dbName,
        auth,
    });
    await auth.refresh().catch(() => undefined);
    await persistence.restore();
    persistence.unsubscribe();
    return client;
}

/**
 * Fetch `["orders"]` through the preset's api client, so a `401` is replayed
 * with whatever token a sign-in in flight installs.
 *
 * @param client - The query client.
 * @param auth - The preset.
 * @returns The query's outcome, never rejecting.
 */
function fetchOrders(client: QueryClient, auth: Auth): Promise<unknown> {
    return client
        .fetchQuery({
            queryKey: ["orders"],
            queryFn: () => auth.api.get<string[]>("/api/orders"),
            retry: false,
        })
        .catch((error: unknown) => error);
}

/**
 * Security audit run-12, C1. The api client replays a request that left with
 * no token with the bearer of a `login()` or boot `refresh()` in flight. When
 * that session ended before the response landed, nobody was signed in at both
 * cache events the handle saw, so it never learned the session existed and the
 * next write stamped A's response `p:anonymous` for the next signed-out boot.
 * #605 only recorded a key seen at a cache event, and treated a recorded
 * `null` as nothing recorded. The throttle outlasts the race, as the default
 * `1000` does in the app, so no write runs while A is signed in. The four
 * variants fail on `3202295`.
 */
describe("persistQueryClientOffline — every session installed while the cache lives counts (run-12 C1)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("leaves nothing for a signed-out boot when the request left during login() and A ended before its replay landed", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 1000,
            auth,
        });
        const login = auth.login({ email: "a@example.test", password: "x" });
        await wait(1);
        expect(auth.sessionKey()).toBeNull();
        expect(auth.isSessionKnown()).toBe(false);
        const orders = fetchOrders(client, auth);
        await login;
        await wait(10);
        otherTabLogout();
        expect(await orders).toEqual(["A-private-order"]);
        expect(backend.seen).toEqual(["none", "Bearer tok-1"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("leaves nothing for a signed-out boot when a signed-out request is replayed by a login() that ended before it landed", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 1000,
            auth,
        });
        expect(auth.sessionKey()).toBeNull();
        expect(auth.isSessionKnown()).toBe(true);
        const orders = fetchOrders(client, auth);
        await wait(1);
        await auth.login({ email: "a@example.test", password: "x" });
        await wait(10);
        otherTabLogout();
        expect(await orders).toEqual(["A-private-order"]);
        expect(backend.seen).toEqual(["none", "Bearer tok-1"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("leaves nothing for a signed-out boot when the boot refresh() replayed a request and A ended before it landed", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 1000,
            auth,
        });
        const restoring = auth.refresh();
        await wait(1);
        expect(auth.isSessionKnown()).toBe(false);
        const orders = fetchOrders(client, auth);
        await restoring;
        await wait(10);
        expect(auth.sessionKey()).not.toBeNull();
        otherTabLogout();
        expect(await orders).toEqual(["A-private-order"]);
        expect(backend.seen).toEqual(["none", "Bearer tok-1"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("leaves nothing for a signed-out boot when a signed-out request is replayed by a cookie refresh() whose session ended before it landed", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 1000,
            auth,
        });
        expect(auth.isSessionKnown()).toBe(true);
        const orders = fetchOrders(client, auth);
        await wait(1);
        await auth.refresh();
        await wait(10);
        expect(auth.sessionKey()).not.toBeNull();
        otherTabLogout();
        expect(await orders).toEqual(["A-private-order"]);
        expect(backend.seen).toEqual(["none", "Bearer tok-1"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("keeps the control: the replayed response of a session that stays signed in is written as that session's", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        const login = auth.login({ email: "a@example.test", password: "x" });
        await wait(1);
        const orders = fetchOrders(client, auth);
        await login;
        expect(await orders).toEqual(["A-private-order"]);
        await persistence.flush();
        persistence.unsubscribe();

        const row = await readRow(dbName);
        expect(row?.owner).toMatch(/^p:[0-9a-f]{16}$/);
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("keeps persisting visitor data written before the first sign-in as that session's", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        client.setQueryData(["catalog"], ["public"]);
        await persistence.flush();
        expect((await readRow(dbName))?.owner).toBe("p:anonymous");
        await auth.login({ email: "a@example.test", password: "x" });
        client.setQueryData(["orders"], ["A-private-order"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect((await readRow(dbName))?.owner).toMatch(/^p:[0-9a-f]{16}$/);
    });

    it("reads a sessionKey() that throws as not known, so nothing is written", async () => {
        const dbName = databaseName();
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth: {
                sessionKey: () => {
                    throw new Error("boom");
                },
                isSessionKnown: () => true,
            },
        });
        client.setQueryData(["orders"], ["A-private-order"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
    });
});

/**
 * Security audit run-12, hardening P7b. The dev warning of a handle that
 * stopped persisting said to create a new handle after login; on the same
 * `QueryClient`, that handle stamped the previous session's responses, still
 * in memory, with the new account. The record of which sessions the cache may
 * hold belongs to the client now, so the new handle keeps deleting until the
 * client is reset.
 */
describe("persistQueryClientOffline — a new handle on a client holding an ended session (run-12 P7b)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    /**
     * Sign A in on a handle, cache A's order, end A without `clear()` and sign
     * a second session in on the same tab.
     *
     * @returns The preset, the client and the database.
     */
    async function endedSessionInMemory(): Promise<{
        auth: Auth;
        client: QueryClient;
        dbName: string;
    }> {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const first = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        await auth.login({ email: "a@example.test", password: "x" });
        client.setQueryData(["orders"], ["A-private-order"]);
        await first.flush();
        await auth.logout();
        await auth.login({ email: "b@example.test", password: "x" });
        await first.flush();
        first.unsubscribe();
        return { auth, client, dbName };
    }

    it("does not stamp the previous session's responses with the account signed in now", async () => {
        const { auth, client, dbName } = await endedSessionInMemory();
        expect(await readRow(dbName)).toBeUndefined();
        const second = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        client.setQueryData(["profile"], { id: "B" });
        await second.flush();
        second.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
    });

    it("persists the new session once the client was reset", async () => {
        const { auth, client, dbName } = await endedSessionInMemory();
        client.clear();
        const second = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        client.setQueryData(["profile"], { id: "B" });
        await second.flush();
        second.unsubscribe();

        const row = (await readRow(dbName)) as { owner?: unknown; state?: unknown } | undefined;
        expect(row?.owner).toMatch(/^p:[0-9a-f]{16}$/);
        expect(JSON.stringify(row?.state)).not.toContain("A-private-order");
    });

    it("persists the new session on a handle created after clear() of the previous one", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const first = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        await auth.login({ email: "a@example.test", password: "x" });
        client.setQueryData(["orders"], ["A-private-order"]);
        await auth.logout();
        await first.clear({ resetClient: true });
        await auth.login({ email: "b@example.test", password: "x" });
        const second = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        client.setQueryData(["profile"], { id: "B" });
        await second.flush();
        second.unsubscribe();

        expect((await readRow(dbName))?.owner).toMatch(/^p:[0-9a-f]{16}$/);
    });
});
