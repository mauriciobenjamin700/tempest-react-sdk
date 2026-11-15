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

interface PersistedRow {
    id: string;
    owner?: unknown;
    state?: { queries: { queryKey: unknown; state: { data: unknown } }[] };
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
 * Wait `ms` milliseconds.
 *
 * @param ms - The delay.
 * @returns A promise resolving after it.
 */
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A backend that signs in whichever account `backend.account` names and
 * answers `/api/data` with the private data of the account whose bearer the
 * request carried, after `dataMs`.
 *
 * @returns The fetcher and the switches.
 */
function accountBackend(): {
    fetcher: typeof fetch;
    backend: { account: string; dataMs: number };
} {
    const backend = { account: "A", dataMs: 0 };
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
            await wait(backend.dataMs);
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
    return `qc-end-${Math.random().toString(36).slice(2)}`;
}

/**
 * Every query data stored in the persisted row, or `null` without a row.
 *
 * @param dbName - The database.
 * @returns The data of each persisted query.
 */
async function persistedData(dbName: string): Promise<unknown[] | null> {
    const store = createOfflineStore<PersistedRow, string>({
        databaseName: dbName,
        version: 1,
        tableName: "cache",
        indexes: "&id",
        keyPath: "id",
    });
    const row = await store.get("tanstack-query");
    if (!row?.state) return null;
    return row.state.queries.map((query) => query.state.data);
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

describe("persistQueryClientOffline — a reset before the session ends (#609)", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("does not stamp what the previous account fetched after a reset with the next account", async () => {
        const { fetcher, backend } = accountBackend();
        const auth = boot(fetcher);
        const queryClient = new QueryClient();
        const dbName = databaseName();
        const first = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await auth.login({ email: "a", password: "x" });
        await queryClient.fetchQuery(dataQuery(auth, "a-orders"));
        await first.flush();

        await first.clear({ resetClient: true });
        await queryClient.fetchQuery(dataQuery(auth, "a-refetched"));
        await auth.logout();
        backend.account = "B";
        await auth.login({ email: "b", password: "x" });

        const second = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await queryClient.fetchQuery(dataQuery(auth, "b-profile"));
        await second.flush();
        second.unsubscribe();

        expect(await persistedData(dbName)).toBeNull();
    });

    it("persists the next account once a reset that ran while signed in is followed by an empty client", async () => {
        const { fetcher, backend } = accountBackend();
        const auth = boot(fetcher);
        const queryClient = new QueryClient();
        const dbName = databaseName();
        const first = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await auth.login({ email: "a", password: "x" });
        await queryClient.fetchQuery(dataQuery(auth, "a-orders"));

        await first.clear({ resetClient: true });
        await auth.logout();
        backend.account = "B";
        await auth.login({ email: "b", password: "x" });

        const second = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await queryClient.fetchQuery(dataQuery(auth, "b-profile"));
        await second.flush();
        second.unsubscribe();

        expect(await persistedData(dbName)).toEqual([["private-of-B"]]);
    });

    it("persists the next account when the reset runs after logout", async () => {
        const { fetcher, backend } = accountBackend();
        const auth = boot(fetcher);
        const queryClient = new QueryClient();
        const dbName = databaseName();
        const first = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await auth.login({ email: "a", password: "x" });
        await queryClient.fetchQuery(dataQuery(auth, "a-orders"));

        await auth.logout();
        await first.clear({ resetClient: true });
        backend.account = "B";
        await auth.login({ email: "b", password: "x" });

        const second = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await queryClient.fetchQuery(dataQuery(auth, "b-profile"));
        await second.flush();
        second.unsubscribe();

        expect(await persistedData(dbName)).toEqual([["private-of-B"]]);
    });

    it("does not stamp a mutation result of the previous account that lands after logout with the next account", async () => {
        const { fetcher, backend } = accountBackend();
        const auth = boot(fetcher);
        const queryClient = new QueryClient();
        const dbName = databaseName();
        const first = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await auth.login({ email: "a", password: "x" });
        await queryClient.fetchQuery(dataQuery(auth, "a-orders"));
        await first.flush();

        backend.dataMs = 30;
        const mutation = queryClient.getMutationCache().build(queryClient, {
            mutationFn: () => auth.api.get<string[]>("/api/data"),
            onSuccess: (data: string[]) => {
                queryClient.setQueryData(["a-late"], data);
            },
        });
        const late = mutation.execute(undefined).catch((error: unknown) => error);
        await wait(5);
        await auth.logout();
        await first.clear({ resetClient: true });
        const second = persistQueryClientOffline({ queryClient, databaseName: dbName, auth });
        await late;

        backend.dataMs = 0;
        backend.account = "B";
        await auth.login({ email: "b", password: "x" });
        await queryClient.fetchQuery(dataQuery(auth, "b-profile"));
        await second.flush();
        second.unsubscribe();

        expect(queryClient.getQueryData(["a-late"])).toBeUndefined();
        expect(await persistedData(dbName)).toEqual([["private-of-B"]]);
    });
});
