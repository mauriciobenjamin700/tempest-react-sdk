import { dehydrate, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineStore } from "../offline/create-offline-store";
import { setDevBuild } from "../utils/dev-mode";
import { persistQueryClientOffline } from "./offline-persistence";

function databaseName(): string {
    return `qc-owner-${Math.random().toString(36).slice(2)}`;
}

async function persistAs(dbName: string, principal: string | null, data: unknown): Promise<void> {
    const client = new QueryClient();
    client.setQueryData(["me"], data);
    const persistence = persistQueryClientOffline({
        queryClient: client,
        databaseName: dbName,
        getPrincipal: () => principal,
    });
    await persistence.flush();
    persistence.unsubscribe();
}

async function restoreAs(
    dbName: string,
    principal: (() => unknown) | undefined,
): Promise<QueryClient> {
    const client = new QueryClient();
    const persistence = persistQueryClientOffline({
        queryClient: client,
        databaseName: dbName,
        getPrincipal: principal as (() => string | null) | undefined,
    });
    await persistence.restore();
    persistence.unsubscribe();
    return client;
}

describe("persistQueryClientOffline — snapshot bound to its owner", () => {
    it("does not hydrate the previous user's snapshot when another user boots", async () => {
        const dbName = databaseName();
        await persistAs(dbName, "user-a", { name: "Ada" });

        const client = await restoreAs(dbName, () => "user-b");

        expect(client.getQueryData(["me"])).toBeUndefined();
    });

    it("does not hydrate a signed-in user's snapshot while nobody is signed in", async () => {
        const dbName = databaseName();
        await persistAs(dbName, "user-a", { name: "Ada" });

        const client = await restoreAs(dbName, () => null);

        expect(client.getQueryData(["me"])).toBeUndefined();
    });

    it("hydrates the snapshot for the same user who wrote it", async () => {
        const dbName = databaseName();
        await persistAs(dbName, "user-a", { name: "Ada" });

        const client = await restoreAs(dbName, () => "user-a");

        expect(client.getQueryData(["me"])).toEqual({ name: "Ada" });
    });

    it("keeps the foreign snapshot on disk, so a cookie app whose principal arrives late does not lose it", async () => {
        const dbName = databaseName();
        await persistAs(dbName, "user-a", { name: "Ada" });

        await restoreAs(dbName, () => null);
        const client = await restoreAs(dbName, () => "user-a");

        expect(client.getQueryData(["me"])).toEqual({ name: "Ada" });
    });

    it("stores only a fingerprint of the principal, never the id itself", async () => {
        const dbName = databaseName();
        await persistAs(dbName, "user-a@example.com", { name: "Ada" });

        const store = createOfflineStore<{ id: string; owner?: unknown }, string>({
            databaseName: dbName,
            version: 1,
            tableName: "cache",
            indexes: "&id",
            keyPath: "id",
        });
        const row = await store.get("tanstack-query");

        expect(row?.owner).toMatch(/^p:[0-9a-f]{16}$/);
        expect(JSON.stringify(row)).not.toContain("user-a@example.com");
    });

    it("does not hydrate a snapshot written before owners existed once getPrincipal is set", async () => {
        const dbName = databaseName();
        const legacy = new QueryClient();
        legacy.setQueryData(["me"], { name: "Ada" });
        const unbound = persistQueryClientOffline({ queryClient: legacy, databaseName: dbName });
        await unbound.flush();
        unbound.unsubscribe();

        const client = await restoreAs(dbName, () => "user-b");

        expect(client.getQueryData(["me"])).toBeUndefined();
    });

    it("reads a getter that throws or returns a promise as nobody", async () => {
        const dbName = databaseName();
        await persistAs(dbName, null, { name: "public" });

        const throwing = await restoreAs(dbName, () => {
            throw new Error("store not ready");
        });
        const asyncGetter = await restoreAs(dbName, () => Promise.resolve("user-a"));

        expect(throwing.getQueryData(["me"])).toEqual({ name: "public" });
        expect(asyncGetter.getQueryData(["me"])).toEqual({ name: "public" });
    });

    it("keeps restoring every snapshot as before when getPrincipal is not given", async () => {
        const dbName = databaseName();
        await persistAs(dbName, "user-a", { name: "Ada" });

        const client = await restoreAs(dbName, undefined);

        expect(client.getQueryData(["me"])).toEqual({ name: "Ada" });
    });
});

function readRow(dbName: string): Promise<{ id: string; owner?: unknown } | undefined> {
    const store = createOfflineStore<{ id: string; owner?: unknown }, string>({
        databaseName: dbName,
        version: 1,
        tableName: "cache",
        indexes: "&id",
        keyPath: "id",
    });
    return store.get("tanstack-query");
}

describe("persistQueryClientOffline — a session that ends without clear() (#563)", () => {
    it("does not leave the previous user's data for whoever boots next once the session expired before the write", async () => {
        const dbName = databaseName();
        let principal: string | null = "user-a";
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            getPrincipal: () => principal,
        });
        client.setQueryData(["me"], { name: "Ada" });
        await persistence.flush();
        principal = null;
        await persistence.flush();
        persistence.unsubscribe();

        const anonymous = await restoreAs(dbName, () => null);
        const next = await restoreAs(dbName, () => "user-b");

        expect(anonymous.getQueryData(["me"])).toBeUndefined();
        expect(next.getQueryData(["me"])).toBeUndefined();
        expect(await readRow(dbName)).toBeUndefined();
    });

    it("does not stamp the previous user's cache as the next user's when another account signs in on the same handle", async () => {
        const dbName = databaseName();
        let principal: string | null = "user-a";
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            getPrincipal: () => principal,
        });
        client.setQueryData(["me"], { name: "Ada" });
        await persistence.flush();
        principal = "user-b";
        await persistence.flush();
        persistence.unsubscribe();

        const next = await restoreAs(dbName, () => "user-b");

        expect(next.getQueryData(["me"])).toBeUndefined();
    });

    it("binds the handle to the owner of the snapshot it restored, so a session that expires before its first write leaves nothing", async () => {
        const dbName = databaseName();
        await persistAs(dbName, "user-a", { name: "Ada" });
        let principal: string | null = "user-a";
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            getPrincipal: () => principal,
        });
        await persistence.restore();
        principal = null;
        await persistence.flush();
        persistence.unsubscribe();

        const anonymous = await restoreAs(dbName, () => null);

        expect(anonymous.getQueryData(["me"])).toBeUndefined();
    });

    it("keeps persisting when the same user comes back on the handle after a gap", async () => {
        const dbName = databaseName();
        let principal: string | null = "user-a";
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            getPrincipal: () => principal,
        });
        client.setQueryData(["me"], { name: "Ada" });
        await persistence.flush();
        principal = null;
        await persistence.flush();
        principal = "user-a";
        await persistence.flush();
        persistence.unsubscribe();

        const back = await restoreAs(dbName, () => "user-a");

        expect(back.getQueryData(["me"])).toEqual({ name: "Ada" });
    });

    it("keeps persisting anonymous data for an app where nobody ever signs in", async () => {
        const dbName = databaseName();
        await persistAs(dbName, null, { name: "public" });

        const client = await restoreAs(dbName, () => null);

        expect(client.getQueryData(["me"])).toEqual({ name: "public" });
    });

    it("keeps persisting when the principal arrives after anonymous writes, as in a cookie app after /me", async () => {
        const dbName = databaseName();
        let principal: string | null = null;
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            getPrincipal: () => principal,
        });
        client.setQueryData(["catalog"], ["a"]);
        await persistence.flush();
        principal = "user-a";
        client.setQueryData(["me"], { name: "Ada" });
        await persistence.flush();
        persistence.unsubscribe();

        const restored = await restoreAs(dbName, () => "user-a");

        expect(restored.getQueryData(["me"])).toEqual({ name: "Ada" });
        expect(restored.getQueryData(["catalog"])).toEqual(["a"]);
    });

    it("does not hydrate an anonymous snapshot written by 0.82.0, which cannot be told apart from an expired session's", async () => {
        const dbName = databaseName();
        const store = createOfflineStore<{ id: string; owner?: unknown; state: unknown }, string>({
            databaseName: dbName,
            version: 1,
            tableName: "cache",
            indexes: "&id",
            keyPath: "id",
        });
        const leaked = new QueryClient();
        leaked.setQueryData(["me"], { name: "Ada" });
        await store.put({ id: "tanstack-query", owner: null, state: dehydrate(leaked) });

        const client = await restoreAs(dbName, () => null);

        expect(client.getQueryData(["me"])).toBeUndefined();
    });

    it("keeps the unbound path unchanged when getPrincipal is not given", async () => {
        const dbName = databaseName();
        const client = new QueryClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
        });
        client.setQueryData(["me"], { name: "Ada" });
        await persistence.flush();
        persistence.unsubscribe();

        const restored = await restoreAs(dbName, undefined);

        expect(restored.getQueryData(["me"])).toEqual({ name: "Ada" });
        expect(await readRow(dbName)).not.toHaveProperty("owner");
    });

    describe("dev warning", () => {
        afterEach(() => {
            vi.restoreAllMocks();
            setDevBuild(undefined);
        });

        async function switchAccounts(next: string | null): Promise<void> {
            let principal: string | null = "user-a";
            const client = new QueryClient();
            const persistence = persistQueryClientOffline({
                queryClient: client,
                databaseName: databaseName(),
                getPrincipal: () => principal,
            });
            client.setQueryData(["me"], { name: "Ada" });
            await persistence.flush();
            principal = next;
            await persistence.flush();
            await persistence.flush();
            persistence.unsubscribe();
        }

        it("warns once in dev when another account signs in on a bound handle", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

            await switchAccounts("user-b");

            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0]?.[0])).toContain("Create a new handle after login");
        });

        it("stays silent when the session merely expires", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

            await switchAccounts(null);

            expect(warn).not.toHaveBeenCalled();
        });

        it("stays silent on an account switch outside a dev build", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            setDevBuild(false);

            await switchAccounts("user-b");

            expect(warn).not.toHaveBeenCalled();
        });
    });
});
