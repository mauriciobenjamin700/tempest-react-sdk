import { QueryClient, type QueryCacheNotifyEvent } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempestAuth } from "../auth";
import type { TempestAuth } from "../auth";
import { createOfflineStore } from "../offline/create-offline-store";
import { persistQueryClientOffline } from "./offline-persistence";

interface User {
    id: string;
}

type Auth = TempestAuth<User, { email: string; password: string }>;

interface PersistedRow {
    id: string;
    owner?: unknown;
    state?: { queries: { queryKey: unknown[]; state: { data: unknown } }[] };
}

/**
 * Build a JSON `Response`.
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
 * A backend that signs in whichever account `backend.account` names and
 * answers `/api/data` with the private data of the account whose bearer the
 * request carried.
 *
 * @returns The fetcher and the account switch.
 */
function accountBackend(): { fetcher: typeof fetch; backend: { account: string } } {
    const backend = { account: "A" };
    let issued = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const bearer = new Headers(init?.headers).get("Authorization");
        if (path === "/api/auth/login") {
            issued += 1;
            return jsonResponse({ access_token: `${backend.account}-tok-${issued}` });
        }
        if (path === "/api/auth/me") return jsonResponse({ id: backend.account });
        if (path === "/api/auth/logout") return new Response(null, { status: 204 });
        if (path === "/api/data") {
            if (!bearer) return jsonResponse({ detail: "no token" }, 401);
            return jsonResponse([
                `private-of-${bearer.slice("Bearer ".length, "Bearer ".length + 1)}`,
            ]);
        }
        return jsonResponse({ detail: "not found" }, 404);
    }) as typeof fetch;
    return { fetcher, backend };
}

/**
 * A fresh IndexedDB name per test.
 *
 * @returns The name.
 */
function databaseName(): string {
    return `qc-signed-out-${Math.random().toString(36).slice(2)}`;
}

/**
 * The persisted row, if any.
 *
 * @param dbName - The database.
 * @returns The row.
 */
async function persistedRow(dbName: string): Promise<PersistedRow | undefined> {
    const store = createOfflineStore<PersistedRow, string>({
        databaseName: dbName,
        version: 1,
        tableName: "cache",
        indexes: "&id",
        keyPath: "id",
    });
    return store.get("tanstack-query");
}

/**
 * The persisted queries as `key → data`, or `null` without a row.
 *
 * @param dbName - The database.
 * @returns Each persisted query's first key segment mapped to its data.
 */
async function persistedData(dbName: string): Promise<Record<string, unknown> | null> {
    const row = await persistedRow(dbName);
    if (!row?.state) return null;
    return Object.fromEntries(
        row.state.queries.map((query) => [String(query.queryKey[0]), query.state.data]),
    );
}

const created: Auth[] = [];

/**
 * Build a preset on the backend.
 *
 * @param fetcher - The backend's fetcher.
 * @returns The preset.
 */
function boot(fetcher: typeof fetch): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        mePath: "/api/auth/me",
        logoutPath: "/api/auth/logout",
        fetcher,
    });
    created.push(auth);
    return auth;
}

/**
 * Query options reading `/api/data` with the preset's client.
 *
 * @param auth - The preset.
 * @param key - The query key.
 * @returns The options.
 */
function dataQuery(
    auth: Auth,
    key: string,
): { queryKey: string[]; queryFn: () => Promise<string[]>; retry: false } {
    return { queryKey: [key], queryFn: () => auth.api.get<string[]>("/api/data"), retry: false };
}

/**
 * Query options for public data that needs no session (a catalog).
 *
 * @param key - The query key.
 * @returns The options.
 */
function publicQuery(key: string): { queryKey: string[]; queryFn: () => Promise<string[]> } {
    return { queryKey: [key], queryFn: () => Promise.resolve(["public-catalog"]) };
}

/**
 * A promise of the app (not `auth.api`), started in A's session, that writes
 * A's data with `setQueryData` once `gate` resolves — an `onSuccess` that
 * awaits something of its own before writing.
 *
 * @param queryClient - The client.
 * @param gate - Resolves when the promise should write.
 * @returns Resolves once the write happened.
 */
async function lateAppWrite(queryClient: QueryClient, gate: Promise<void>): Promise<void> {
    await gate;
    queryClient.setQueryData(["a-late"], ["private-of-A"]);
}

/**
 * Sign A in on a handle, cache A's data and start the late app promise; then
 * log A out and reset the client the documented way (`onSessionEnd`).
 *
 * @returns The preset, the backend, the client, the database and the gate.
 */
async function signedOutAfterA(): Promise<{
    auth: Auth;
    backend: { account: string };
    queryClient: QueryClient;
    dbName: string;
    release: () => void;
    late: Promise<void>;
}> {
    const { fetcher, backend } = accountBackend();
    const auth = boot(fetcher);
    const queryClient = new QueryClient();
    const dbName = databaseName();
    const first = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
    await auth.login({ email: "a", password: "x" });
    await queryClient.fetchQuery(dataQuery(auth, "a-orders"));
    await first.flush();
    let release: () => void = () => undefined;
    const late = lateAppWrite(
        queryClient,
        new Promise<void>((resolve) => {
            release = resolve;
        }),
    );
    await auth.logout();
    await first.clear({ resetClient: true });
    return { auth, backend, queryClient, dbName, release, late };
}

/**
 * Log B in, create the handle the docs advise after a login, fetch B's data
 * and flush.
 *
 * @param auth - The preset.
 * @param backend - The backend switch.
 * @param queryClient - The client.
 * @param dbName - The database.
 * @returns What was persisted.
 */
async function signInB(
    auth: Auth,
    backend: { account: string },
    queryClient: QueryClient,
    dbName: string,
): Promise<Record<string, unknown> | null> {
    backend.account = "B";
    await auth.login({ email: "b", password: "x" });
    const second = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
    await queryClient.fetchQuery(dataQuery(auth, "b-profile"));
    await second.flush();
    second.unsubscribe();
    return persistedData(dbName);
}

/**
 * Security audit run-14 U7 / run-15 hardening (#653). A promise of the app —
 * not a request of `auth.api`, which refuses a response of an ended session
 * since #609 — resolves after A's `logout()` and the `clear({ resetClient:
 * true })` that dropped the client's lineage, and writes A's data with
 * `setQueryData` while nobody is signed in. Before #653 no handle watched the
 * client in that gap (A's had ended, B's did not exist yet), so B's handle
 * started a new lineage on a client holding A's data and stamped it with B's
 * fingerprint: measured on `d272b88`, the row held `a-late: ["private-of-A"]`
 * under B's owner, in both variants below.
 *
 * Writes made with `setQueryData` while nobody is signed in, after a session
 * was seen on the client, are now kept out of every snapshot until a fetch
 * replaces their data. Fetches are not: a public query fetched in the gap is
 * persisted for B as before.
 */
describe("persistQueryClientOffline — a signed-out setQueryData after a session ended (#653)", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("does not stamp A's data written by an app promise after logout with B when no handle watched the gap", async () => {
        const { auth, backend, queryClient, dbName, release, late } = await signedOutAfterA();
        release();
        await late;
        expect(queryClient.getQueryData(["a-late"])).toEqual(["private-of-A"]);

        const persisted = await signInB(auth, backend, queryClient, dbName);

        expect(persisted).toEqual({ "b-profile": ["private-of-B"] });
        expect((await persistedRow(dbName))?.owner).toMatch(/^p:[0-9a-f]{16}$/);
    });

    it("does not stamp A's data with B when the next handle was created right after logout, before the write", async () => {
        const { auth, backend, queryClient, dbName, release, late } = await signedOutAfterA();
        const waiting = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        release();
        await late;
        await waiting.flush();
        expect(await persistedData(dbName)).toEqual({});

        backend.account = "B";
        await auth.login({ email: "b", password: "x" });
        await queryClient.fetchQuery(dataQuery(auth, "b-profile"));
        await waiting.flush();
        waiting.unsubscribe();

        expect(await persistedData(dbName)).toEqual({ "b-profile": ["private-of-B"] });
    });

    it("keeps persisting B, public queries included, when only a fetch landed between logout and B's login", async () => {
        const { auth, backend, queryClient, dbName, release, late } = await signedOutAfterA();
        await queryClient.fetchQuery(publicQuery("catalog"));

        const persisted = await signInB(auth, backend, queryClient, dbName);
        release();
        await late;

        expect(persisted).toEqual({
            catalog: ["public-catalog"],
            "b-profile": ["private-of-B"],
        });
    });

    it("keeps persisting B when a visitor's setQueryData landed in the gap, leaving only that key out", async () => {
        const { auth, backend, queryClient, dbName, release, late } = await signedOutAfterA();
        queryClient.setQueryData(["cart"], ["visitor-item"]);
        await queryClient.fetchQuery(publicQuery("catalog"));

        const persisted = await signInB(auth, backend, queryClient, dbName);
        release();
        await late;

        expect(persisted).toEqual({
            catalog: ["public-catalog"],
            "b-profile": ["private-of-B"],
        });
        expect(queryClient.getQueryData(["cart"])).toEqual(["visitor-item"]);
    });

    it("persists a key written in the gap again once B fetches it", async () => {
        const { auth, backend, queryClient, dbName, release, late } = await signedOutAfterA();
        release();
        await late;
        backend.account = "B";
        await auth.login({ email: "b", password: "x" });
        const second = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await queryClient.fetchQuery({ ...dataQuery(auth, "a-late"), staleTime: 0 });
        await second.flush();
        second.unsubscribe();

        expect(await persistedData(dbName)).toEqual({ "a-late": ["private-of-B"] });
    });

    it("keeps persisting B's own setQueryData", async () => {
        const { auth, backend, queryClient, dbName } = await signedOutAfterA();
        backend.account = "B";
        await auth.login({ email: "b", password: "x" });
        const second = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        queryClient.setQueryData(["b-draft"], ["draft-of-B"]);
        await second.flush();
        second.unsubscribe();

        expect(await persistedData(dbName)).toEqual({ "b-draft": ["draft-of-B"] });
    });

    it("keeps persisting a visitor's setQueryData written before anyone signed in on the tab", async () => {
        const auth = boot(accountBackend().fetcher);
        const queryClient = new QueryClient();
        const dbName = databaseName();
        const handle = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        queryClient.setQueryData(["cart"], ["visitor-item"]);
        await handle.flush();
        handle.unsubscribe();

        expect(await persistedData(dbName)).toEqual({ cart: ["visitor-item"] });
    });

    it("keeps A's late write out of B's snapshot with getPrincipal alone", async () => {
        const queryClient = new QueryClient();
        const dbName = databaseName();
        let principal: string | null = "A";
        const options = { queryClient, databaseName: dbName, getPrincipal: () => principal };
        const first = persistQueryClientOffline(options);
        queryClient.setQueryData(["a-orders"], ["private-of-A"]);
        await first.flush();
        principal = null;
        await first.clear({ resetClient: true });
        queryClient.setQueryData(["a-late"], ["private-of-A"]);
        principal = "B";
        const second = persistQueryClientOffline(options);
        queryClient.setQueryData(["b-draft"], ["draft-of-B"]);
        await second.flush();
        second.unsubscribe();

        expect(await persistedData(dbName)).toEqual({ "b-draft": ["draft-of-B"] });
    });

    it("keeps a write out when the session reader throws, so it fails closed", async () => {
        const queryClient = new QueryClient();
        const dbName = databaseName();
        let throws = false;
        const session = {
            sessionKey: (): string | null => {
                if (throws) throw new Error("storage unavailable");
                return "A";
            },
            isSessionKnown: (): boolean => true,
        };
        const handle = persistQueryClientOffline({
            queryClient,
            databaseName: dbName,
            auth: session,
        });
        queryClient.setQueryData(["a-orders"], ["private-of-A"]);
        throws = true;
        queryClient.setQueryData(["unknown"], ["written-while-unreadable"]);
        throws = false;
        await handle.flush();
        handle.unsubscribe();

        expect(await persistedData(dbName)).toEqual({ "a-orders": ["private-of-A"] });
    });

    it("pins the TanStack contract it reads: setQueryData is a manual success, a fetch is not", async () => {
        const queryClient = new QueryClient();
        const successes: { key: unknown; manual: unknown }[] = [];
        queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
            if (event.type === "updated" && event.action.type === "success") {
                successes.push({ key: event.query.queryKey[0], manual: event.action.manual });
            }
        });
        queryClient.setQueryData(["written"], 1);
        await queryClient.fetchQuery({ queryKey: ["fetched"], queryFn: () => 2 });

        expect(successes).toEqual([
            { key: "written", manual: true },
            { key: "fetched", manual: undefined },
        ]);
    });
});
