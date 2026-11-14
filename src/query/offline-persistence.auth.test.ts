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
 * A cookie-session backend: while `cookie.alive`, the refresh route restores
 * account A from the HttpOnly cookie after `refreshMs`; once it is not, it
 * answers `401`, which is what a signed-out boot sees.
 *
 * @returns The fetcher and the cookie switch.
 */
function cookieBackend(): {
    fetcher: typeof fetch;
    cookie: { alive: boolean; refreshMs: number; meMs: number };
} {
    const cookie = { alive: true, refreshMs: 0, meMs: 0 };
    let issued = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/refresh") {
            await wait(cookie.refreshMs);
            if (!cookie.alive) return jsonResponse({ detail: "no cookie" }, 401);
            issued += 1;
            return jsonResponse({ access_token: `A-tok-${issued}` });
        }
        if (path === "/api/auth/login") {
            await wait(cookie.refreshMs);
            issued += 1;
            return jsonResponse({ access_token: `A-tok-${issued}` });
        }
        if (path === "/api/auth/me") {
            await wait(cookie.meMs);
            return jsonResponse({ id: "A" });
        }
        if (path === "/api/auth/logout") return new Response(null, { status: 204 });
        return jsonResponse({ detail: "not found" }, 404);
    }) as typeof fetch;
    return { fetcher, cookie };
}

/**
 * A fresh IndexedDB name per test.
 *
 * @returns The name.
 */
function databaseName(): string {
    return `qc-auth-${Math.random().toString(36).slice(2)}`;
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
function boot(backend: ReturnType<typeof cookieBackend>): Auth {
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
 * Boot signed out — the cookie is gone and the tab left no session in
 * storage — and restore the persisted cache the way the app does at boot.
 *
 * @param backend - The backend.
 * @param dbName - The database.
 * @returns The restored client.
 */
async function signedOutBoot(
    backend: ReturnType<typeof cookieBackend>,
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
 * #596: with `getPrincipal` alone, a cookie app's principal is `null` until its
 * own `/me` answers, and `null` reads as nobody. A tab closed inside that
 * window left account A's responses stamped anonymous, and the next signed-out
 * boot hydrated them (#590 closed it only for an app that wires
 * `isPrincipalKnown` by hand). The `auth` option takes the session from
 * `createTempestAuth` itself: its `sessionKey()` is the principal, and its
 * `isSessionKnown()` keeps the handle from writing or restoring while the
 * session is still being restored. The tests passing `auth` fail on b99a0c6,
 * where the option did not exist and the handle ran with no principal at all.
 */
describe("persistQueryClientOffline — the session comes from createTempestAuth (#596)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("leaves nothing for a signed-out boot when the tab closed before /me", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        await auth.refresh();
        client.setQueryData(["orders"], ["A-order-1"]);
        await wait(40);
        await persistence.flush();
        persistence.unsubscribe();

        const next = await signedOutBoot(backend, dbName);

        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("keeps the app's user id as principal, and writes nothing until it loaded", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
            getPrincipal: () => auth.useAuthStore.getState().user?.id,
        });
        await auth.refresh();
        client.setQueryData(["orders"], ["A-order-1"]);
        await wait(40);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("writes nothing while the boot refresh is still restoring the session", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        backend.cookie.refreshMs = 80;
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        const restoring = auth.refresh();
        expect(auth.isSessionKnown()).toBe(false);
        client.setQueryData(["orders"], ["A-order-1"]);
        await wait(40);

        expect(await readRow(dbName)).toBeUndefined();
        await restoring;
        expect(auth.isSessionKnown()).toBe(true);
        persistence.unsubscribe();
    });

    it("restores the cache of the session it was written under on the next boot", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        await auth.refresh();
        client.setQueryData(["orders"], ["A-order-1"]);
        await persistence.flush();
        persistence.unsubscribe();
        auth.dispose();

        const reloaded = boot(backend);
        const next = new QueryClient();
        const again = persistQueryClientOffline({
            queryClient: next,
            databaseName: dbName,
            auth: reloaded,
        });
        await again.restore();
        again.unsubscribe();

        expect(next.getQueryData(["orders"])).toEqual(["A-order-1"]);
    });

    it("reads the session as unknown while a login() is in flight, and known once it settled", async () => {
        const backend = cookieBackend();
        backend.cookie.refreshMs = 20;
        const auth = boot(backend);
        expect(auth.isSessionKnown()).toBe(true);

        const login = auth.login({ email: "a@example.test", password: "x" });
        expect(auth.isSessionKnown()).toBe(false);
        await login;

        expect(auth.isSessionKnown()).toBe(true);
        expect(auth.useAuthStore.getState().user).toEqual({ id: "A" });
    });

    it("reads a refresh of an installed session as known: a rotation does not change who is signed in", async () => {
        const backend = cookieBackend();
        const auth = boot(backend);
        await auth.refresh();
        backend.cookie.refreshMs = 20;

        const rotating = auth.refresh();
        expect(auth.isSessionKnown()).toBe(true);
        await rotating;
    });
});

/**
 * Wait until `login()` installed its token, which happens before `/me` is
 * asked: from then on `sessionKey()` names the new lineage while
 * `isSessionKnown()` is still `false`.
 *
 * @param auth - The preset.
 */
async function untilTokenInstalled(auth: Auth): Promise<void> {
    for (let i = 0; i < 200 && auth.getToken() === null; i++) await wait(1);
}

/**
 * Security audit run-11, C2: `login()` installs A's token before `/me`
 * answers, and A's queries resolve in that window while `isSessionKnown()` is
 * `false`, so the cache change did not bind the handle. When the session ended
 * before `/me` answered — a logout in another tab, or `logout()` in this tab
 * without `persistence.clear()` — the handle was still unbound, the next write
 * stamped A's responses `p:anonymous`, and the next signed-out boot on the
 * profile hydrated them. A second `login()` superseding the first inside the
 * window stamped the first session's responses with the second session's key
 * the same way. The first three tests fail on 05293bc, which wrote the row
 * (`p:anonymous`, or the second session's fingerprint); the handle now
 * records the `sessionKey()` the cache change saw and, once the session is
 * known, deletes instead of writing when it is not that session.
 */
describe("persistQueryClientOffline — a login that ends before /me answers (#596 follow-up)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("leaves nothing for a signed-out boot when another tab signs out during /me", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        backend.cookie.meMs = 60;
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        const login = auth.login({ email: "a@example.test", password: "x" });
        await untilTokenInstalled(auth);
        expect(auth.sessionKey()).not.toBeNull();
        expect(auth.isSessionKnown()).toBe(false);
        client.setQueryData(["orders"], ["A-order-1"]);
        localStorage.clear();
        window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
        await login.catch(() => undefined);
        expect(auth.sessionKey()).toBeNull();
        expect(auth.isSessionKnown()).toBe(true);
        await wait(40);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("leaves nothing for a signed-out boot when logout() runs during /me without clear()", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        backend.cookie.meMs = 60;
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        const login = auth.login({ email: "a@example.test", password: "x" });
        await untilTokenInstalled(auth);
        client.setQueryData(["orders"], ["A-order-1"]);
        await auth.logout();
        await login.catch(() => undefined);
        expect(auth.sessionKey()).toBeNull();
        await wait(40);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
        const next = await signedOutBoot(backend, dbName);
        expect(next.getQueryData(["orders"])).toBeUndefined();
    });

    it("does not stamp the first session's responses with a second login() that superseded it during /me", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        backend.cookie.meMs = 60;
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        const first = auth.login({ email: "a@example.test", password: "x" });
        await untilTokenInstalled(auth);
        const firstKey = auth.sessionKey();
        client.setQueryData(["orders"], ["A-order-1"]);
        const second = auth.login({ email: "a@example.test", password: "x" });
        await first.catch(() => undefined);
        await second;
        expect(auth.sessionKey()).not.toBe(firstKey);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
    });

    it("still persists the account whose login settles, for its next boot only", async () => {
        const dbName = databaseName();
        const backend = cookieBackend();
        backend.cookie.meMs = 60;
        const auth = boot(backend);
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 10,
            auth,
        });
        const login = auth.login({ email: "a@example.test", password: "x" });
        await untilTokenInstalled(auth);
        client.setQueryData(["orders"], ["A-order-1"]);
        await login;
        await persistence.flush();
        persistence.unsubscribe();
        auth.dispose();

        const reloaded = boot(backend);
        const next = new QueryClient();
        const again = persistQueryClientOffline({
            queryClient: next,
            databaseName: dbName,
            auth: reloaded,
        });
        await again.restore();
        again.unsubscribe();

        expect(next.getQueryData(["orders"])).toEqual(["A-order-1"]);
        const anonymous = await signedOutBoot(backend, dbName);
        expect(anonymous.getQueryData(["orders"])).toBeUndefined();
    });
});
