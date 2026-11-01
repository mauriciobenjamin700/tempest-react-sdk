import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createOfflineStore } from "../offline/create-offline-store";
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
