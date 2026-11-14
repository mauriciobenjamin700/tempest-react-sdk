import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineStore } from "../offline/create-offline-store";
import { setDevBuild } from "../utils/dev-mode";
import { persistQueryClientOffline } from "./offline-persistence";

function databaseName(): string {
    return `qc-unknown-${Math.random().toString(36).slice(2)}`;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function restoreAs(dbName: string, principal: string | null): Promise<QueryClient> {
    const client = new QueryClient();
    const persistence = persistQueryClientOffline({
        queryClient: client,
        databaseName: dbName,
        getPrincipal: () => principal,
    });
    await persistence.restore();
    persistence.unsubscribe();
    return client;
}

describe("persistQueryClientOffline — principal not known yet (#590)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setDevBuild(undefined);
    });

    it("writes nothing while the principal is unknown, so a tab closed before /me leaves nothing for a logged-out boot", async () => {
        const dbName = databaseName();
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 30,
            getPrincipal: () => null,
            isPrincipalKnown: () => false,
        });
        client.setQueryData(["orders"], ["A-order-1"]);
        await wait(150);
        await persistence.flush();
        persistence.unsubscribe();

        const anonymous = await restoreAs(dbName, null);

        expect(anonymous.getQueryData(["orders"])).toBeUndefined();
        expect(await readRow(dbName)).toBeUndefined();
    });

    it("re-arms the write until the principal is known, then stamps it with the real owner", async () => {
        const dbName = databaseName();
        let known = false;
        let principal: string | null = null;
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 20,
            getPrincipal: () => principal,
            isPrincipalKnown: () => known,
        });
        client.setQueryData(["orders"], ["A-order-1"]);
        await wait(70);
        expect(await readRow(dbName)).toBeUndefined();
        principal = "user-a";
        known = true;
        await wait(70);
        persistence.unsubscribe();

        const anonymous = await restoreAs(dbName, null);
        const owner = await restoreAs(dbName, "user-a");

        expect(anonymous.getQueryData(["orders"])).toBeUndefined();
        expect(owner.getQueryData(["orders"])).toEqual(["A-order-1"]);
    });

    it("keeps persisting visitor data once the answer is that nobody is signed in", async () => {
        const dbName = databaseName();
        let known = false;
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 20,
            getPrincipal: () => undefined,
            isPrincipalKnown: () => known,
        });
        client.setQueryData(["catalog"], ["a"]);
        await wait(50);
        known = true;
        await wait(60);
        persistence.unsubscribe();

        const visitor = await restoreAs(dbName, null);

        expect(visitor.getQueryData(["catalog"])).toEqual(["a"]);
    });

    it("does not bind the handle to a stale principal read while unknown", async () => {
        const dbName = databaseName();
        let known = false;
        let principal: string | null = "user-a";
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 20,
            getPrincipal: () => principal,
            isPrincipalKnown: () => known,
        });
        client.setQueryData(["me"], { name: "Bea" });
        principal = "user-b";
        known = true;
        await persistence.flush();
        persistence.unsubscribe();

        const restored = await restoreAs(dbName, "user-b");

        expect(restored.getQueryData(["me"])).toEqual({ name: "Bea" });
    });

    it("hydrates nothing while unknown and the owner's snapshot once known", async () => {
        const dbName = databaseName();
        const writer = new QueryClient();
        const first = persistQueryClientOffline({
            queryClient: writer,
            databaseName: dbName,
            getPrincipal: () => "user-a",
        });
        writer.setQueryData(["me"], { name: "Ada" });
        await first.flush();
        first.unsubscribe();
        let known = false;
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            getPrincipal: () => (known ? "user-a" : null),
            isPrincipalKnown: () => known,
        });

        await persistence.restore();
        const before = client.getQueryData(["me"]);
        known = true;
        await persistence.restore();
        persistence.unsubscribe();

        expect(before).toBeUndefined();
        expect(client.getQueryData(["me"])).toEqual({ name: "Ada" });
    });

    it("reads an isPrincipalKnown that throws as unknown, so nothing is written", async () => {
        const dbName = databaseName();
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            getPrincipal: () => null,
            isPrincipalKnown: () => {
                throw new Error("auth store not ready");
            },
        });
        client.setQueryData(["orders"], ["A-order-1"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeUndefined();
    });

    it("ignores isPrincipalKnown without getPrincipal", async () => {
        const dbName = databaseName();
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            isPrincipalKnown: () => false,
        });
        client.setQueryData(["catalog"], ["a"]);
        await persistence.flush();
        persistence.unsubscribe();

        expect(await readRow(dbName)).toBeDefined();
    });

    describe("an anonymous snapshot hydrated by a handle someone then signs in on", () => {
        async function leakedAnonymousRow(): Promise<string> {
            const dbName = databaseName();
            const client = new QueryClient();
            const persistence = persistQueryClientOffline({
                queryClient: client,
                databaseName: dbName,
                throttleMs: 30,
                getPrincipal: () => null,
            });
            client.setQueryData(["orders"], ["A-order-1"]);
            await wait(150);
            persistence.unsubscribe();
            return dbName;
        }

        it("does not re-stamp it as the account that signed in (issue Q1)", async () => {
            const dbName = await leakedAnonymousRow();
            let principal: string | null = null;
            const client = new QueryClient();
            const relay = persistQueryClientOffline({
                queryClient: client,
                databaseName: dbName,
                throttleMs: 30,
                getPrincipal: () => principal,
            });
            await relay.restore();
            principal = "user-b";
            client.setQueryData(["me"], { name: "B" });
            await relay.flush();
            relay.unsubscribe();

            const next = await restoreAs(dbName, "user-b");

            expect(next.getQueryData(["orders"])).toBeUndefined();
            expect(await readRow(dbName)).toBeUndefined();
        });

        it("keeps writing it while nobody signs in", async () => {
            const dbName = await leakedAnonymousRow();
            const client = new QueryClient();
            const relay = persistQueryClientOffline({
                queryClient: client,
                databaseName: dbName,
                getPrincipal: () => null,
            });
            await relay.restore();
            client.setQueryData(["catalog"], ["a"]);
            await relay.flush();
            relay.unsubscribe();

            const visitor = await restoreAs(dbName, null);

            expect(visitor.getQueryData(["catalog"])).toEqual(["a"]);
        });

        it("warns once in dev that the handle stopped persisting", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            const dbName = await leakedAnonymousRow();
            let principal: string | null = null;
            const client = new QueryClient();
            const relay = persistQueryClientOffline({
                queryClient: client,
                databaseName: dbName,
                getPrincipal: () => principal,
            });
            await relay.restore();
            principal = "user-b";
            await relay.flush();
            await relay.flush();
            relay.unsubscribe();

            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0]?.[0])).toContain("Create a new handle after login");
        });
    });

    it("keeps the control case: a principal that arrives before the throttled write stamps the data as its own (issue Q2)", async () => {
        const dbName = databaseName();
        let principal: string | null = null;
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 60,
            getPrincipal: () => principal,
        });
        client.setQueryData(["orders"], ["A-order-1"]);
        await wait(10);
        principal = "user-a";
        await wait(150);
        persistence.unsubscribe();

        const anonymous = await restoreAs(dbName, null);

        expect(anonymous.getQueryData(["orders"])).toBeUndefined();
    });
});
