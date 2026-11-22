import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth } from "../auth";
import type { TempestAuth } from "../auth";
import { SessionSupersededError } from "../http";
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
 * Wait until the bearer replay of `/api/orders` has reached the backend.
 *
 * The run-12 C1 cases end session A while that replay is on the wire, and
 * assert `backend.seen` as a precondition. A fixed `wait(10)` after the login
 * settled raced the refresh queue: with the whole suite running in parallel
 * (the `make release-tag` pack) the replay had not left after 10 ms, the
 * other-tab logout won, `refresh` rejected without replaying, and the
 * precondition failed while the outcome under test still held. Polling every
 * millisecond lands inside the 50 ms the fake backend holds the replay.
 *
 * The 2 s budget stays under the 5 s test timeout, so a replay that never
 * leaves fails here, on `backend.seen`, instead of as a bare
 * `TestTimeoutError` with no line (#692).
 *
 * @param backend - The fake backend whose `seen` log is watched.
 * @returns Once the second `/api/orders` request was seen.
 */
async function replaySent(backend: { seen: string[] }): Promise<void> {
    await vi.waitFor(() => expect(backend.seen).toHaveLength(2), {
        interval: 1,
        timeout: 2_000,
    });
}

/**
 * A cookie-session backend whose `/api/orders` answers `401` to a request with
 * no bearer and account A's order, 50 ms later, to one with A's bearer — the
 * shape that makes the api client replay a tokenless request with the token a
 * `login()` or `refresh()` in flight installs.
 *
 * The replay these cases pin needs the tokenless `401` to land while a
 * sign-in (`/api/auth/login`, `/api/auth/refresh`) is pending, so the backend
 * orders the two instead of trusting the clock: the `401` waits for a sign-in
 * to have arrived, and a sign-in is answered only after every tokenless
 * `/api/orders` it overlapped got its `401`, plus one macrotask for the client
 * to hand that `401` to the sign-in in flight. With wall-clock delays alone
 * (`401` after 15 ms, sign-in after 30 ms) the order held by ~20 ms on an idle
 * machine: the tokenless request left 5–15 ms after `login()`, which settled
 * at 41–51 ms. Under load either side slipped — the `401` landed after
 * `login()` had moved the epoch, or before the `login()` sent after it had
 * left — the client surfaced it without replaying (by design, security audit
 * run-17), and `replaySent` waited out the 5 s test timeout. Running this
 * file 12 at a time alongside 12 copies of itself, three rounds, failed 12 of
 * 36 runs across three cases (#692).
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
    let unauthorized: Promise<void> = Promise.resolve();
    let signInArrived: () => void = () => undefined;
    const signIn = new Promise<void>((resolve) => {
        signInArrived = resolve;
    });
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const bearer = new Headers(init?.headers).get("Authorization");
        if (path === "/api/auth/refresh") {
            signInArrived();
            await wait(30);
            await unauthorized;
            await wait(1);
            if (!cookie.alive) return jsonResponse({ detail: "no cookie" }, 401);
            issued += 1;
            return jsonResponse({ access_token: `tok-${issued}` });
        }
        if (path === "/api/auth/login") {
            signInArrived();
            await wait(30);
            await unauthorized;
            await wait(1);
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
                const answered = Promise.all([wait(15), signIn]).then(() => undefined);
                unauthorized = Promise.all([unauthorized, answered]).then(() => undefined);
                await answered;
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
 * @param key - The handle's `key`, defaulting to the library's.
 * @returns The row, if any.
 */
async function readRow(
    dbName: string,
    key = "tanstack-query",
): Promise<{ owner?: unknown; state?: unknown } | undefined> {
    const store = createOfflineStore<{ id: string; owner?: unknown; state?: unknown }, string>({
        databaseName: dbName,
        version: 1,
        tableName: "cache",
        indexes: "&id",
        keyPath: "id",
    });
    return store.get(key);
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
 *
 * Since #609 the api client refuses a response whose bearer belongs to a
 * session epoch that ended before it landed, so A's replayed response now
 * rejects with `SessionSupersededError` and never reaches the cache. The
 * precondition that it resolved was inverted on purpose, and the assertions
 * that nothing is left for the signed-out boot keep pinning the outcome.
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
        await replaySent(backend);
        otherTabLogout();
        expect(await orders).toBeInstanceOf(SessionSupersededError);
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
        await replaySent(backend);
        otherTabLogout();
        expect(await orders).toBeInstanceOf(SessionSupersededError);
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
        await replaySent(backend);
        expect(auth.sessionKey()).not.toBeNull();
        otherTabLogout();
        expect(await orders).toBeInstanceOf(SessionSupersededError);
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
        await replaySent(backend);
        expect(auth.sessionKey()).not.toBeNull();
        otherTabLogout();
        expect(await orders).toBeInstanceOf(SessionSupersededError);
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

/**
 * Security audit run-13, C1. `clear()` without `resetClient` dropped the
 * client's lineage while the in-memory client still held the ended session's
 * responses, so the handle the docs say to create at login started a fresh
 * lineage, adopted B as its first session and wrote A's responses under B's
 * fingerprint for B's next boot. With two keys on one client, one handle's
 * `clear()` dropped the other's lineage and reopened run-12 C1 there. The
 * lineage now outlives a `clear()` that leaves the client as it is, marked as
 * ended; only `resetClient: true` (or a handle created on an empty client)
 * starts a new one. The three shapes and the detached `flush()` fail on
 * `7e71acd`.
 *
 * In the two-key shape, A's replayed response rejects with
 * `SessionSupersededError` since #609 (its session ended before it landed);
 * the precondition was inverted on purpose, and the row still must not exist.
 */
describe("persistQueryClientOffline — clear() without resetClient keeps the client's lineage (run-13 C1)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    /**
     * Create a handle, sign A in on it and cache A's order.
     *
     * @returns The preset, the client, the database and the first handle.
     */
    async function signedInA(): Promise<{
        auth: Auth;
        client: QueryClient;
        dbName: string;
        first: ReturnType<typeof persistQueryClientOffline>;
    }> {
        const dbName = databaseName();
        const auth = boot(replayBackend());
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
        return { auth, client, dbName, first };
    }

    /**
     * Do what the docs advise after a login: create a new handle on the same
     * client, then let B's first query land and flush it.
     *
     * @param auth - The preset.
     * @param client - The client.
     * @param dbName - The database.
     * @returns The row written, if any.
     */
    async function newHandleAfterLogin(
        auth: Auth,
        client: QueryClient,
        dbName: string,
    ): Promise<{ owner?: unknown; state?: unknown } | undefined> {
        const second = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        client.setQueryData(["profile"], { id: "B" });
        await second.flush();
        second.unsubscribe();
        return readRow(dbName);
    }

    it("does not write A's responses under B after logout() and clear()", async () => {
        const { auth, client, dbName, first } = await signedInA();
        await auth.logout();
        await first.clear();
        await auth.login({ email: "b@example.test", password: "x" });

        expect(await newHandleAfterLogin(auth, client, dbName)).toBeUndefined();
    });

    it("does not write A's responses under B when clear() ran before logout()", async () => {
        const { auth, client, dbName, first } = await signedInA();
        await first.clear();
        await auth.logout();
        await auth.login({ email: "b@example.test", password: "x" });

        expect(await newHandleAfterLogin(auth, client, dbName)).toBeUndefined();
    });

    it("does not write A's responses under B after a logout in another tab, a login and clear()", async () => {
        const { auth, client, dbName, first } = await signedInA();
        otherTabLogout();
        await auth.login({ email: "b@example.test", password: "x" });
        await first.clear();

        expect(await newHandleAfterLogin(auth, client, dbName)).toBeUndefined();
    });

    it("keeps the other key's lineage when one handle on the same client calls clear()", async () => {
        const dbName = databaseName();
        const backend = replayBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const options = { queryClient: client, databaseName: dbName, throttleMs: 1000, auth };
        const one = persistQueryClientOffline({ ...options, key: "k1" });
        const two = persistQueryClientOffline({ ...options, key: "k2" });
        const login = auth.login({ email: "a@example.test", password: "x" });
        await wait(1);
        const orders = fetchOrders(client, auth);
        await login;
        await wait(10);
        otherTabLogout();
        expect(await orders).toBeInstanceOf(SessionSupersededError);
        await one.clear();
        await two.flush();
        two.unsubscribe();

        expect(await readRow(dbName, "k2")).toBeUndefined();
    });

    it("does not write from a handle whose flush() runs after unsubscribe(), since it no longer sees sessions come and go", async () => {
        const dbName = databaseName();
        const auth = boot(replayBackend());
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        persistence.unsubscribe();
        await auth.login({ email: "a@example.test", password: "x" });
        client.setQueryData(["orders"], ["A-private-order"]);
        await auth.logout();
        await auth.login({ email: "b@example.test", password: "x" });
        await persistence.flush();

        expect(await readRow(dbName)).toBeUndefined();
    });

    it("keeps the control: clear({ resetClient: true }) lets the next handle persist only B", async () => {
        const { auth, client, dbName, first } = await signedInA();
        otherTabLogout();
        await auth.login({ email: "b@example.test", password: "x" });
        await first.clear({ resetClient: true });

        const row = await newHandleAfterLogin(auth, client, dbName);
        expect(row?.owner).toMatch(/^p:[0-9a-f]{16}$/);
        expect(JSON.stringify(row?.state)).toContain('"B"');
        expect(JSON.stringify(row?.state)).not.toContain("A-private-order");
    });

    it("lets a handle created on a client the app emptied by hand persist after clear()", async () => {
        const { auth, client, dbName, first } = await signedInA();
        await auth.logout();
        await first.clear();
        client.removeQueries();
        await auth.login({ email: "b@example.test", password: "x" });

        const row = await newHandleAfterLogin(auth, client, dbName);
        expect(row?.owner).toMatch(/^p:[0-9a-f]{16}$/);
        expect(JSON.stringify(row?.state)).not.toContain("A-private-order");
    });
});
