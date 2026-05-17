import { afterEach, describe, expect, it } from "vitest";
import { createOfflineStore } from "./create-offline-store";

type Note = { id: string; owner_id: string; text: string };

describe("createOfflineStore", () => {
    const stores: { db: { delete: () => Promise<void> } }[] = [];

    afterEach(async () => {
        for (const s of stores) await s.db.delete();
        stores.length = 0;
    });

    it("put + get round-trips a record", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "notes",
            indexes: "&id, owner_id",
            ownerField: "owner_id",
        });
        stores.push(store);
        await store.put({ id: "1", owner_id: "u1", text: "hi" });
        const got = await store.get("1");
        expect(got?.text).toBe("hi");
    });

    it("list filters by owner", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "notes",
            indexes: "&id, owner_id",
            ownerField: "owner_id",
        });
        stores.push(store);
        await store.bulkPut([
            { id: "1", owner_id: "u1", text: "a" },
            { id: "2", owner_id: "u2", text: "b" },
        ]);
        const mine = await store.list("u1");
        expect(mine.map((n) => n.id)).toEqual(["1"]);
    });

    it("clear(owner) removes only the owner's records", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "notes",
            indexes: "&id, owner_id",
            ownerField: "owner_id",
        });
        stores.push(store);
        await store.bulkPut([
            { id: "1", owner_id: "u1", text: "a" },
            { id: "2", owner_id: "u2", text: "b" },
        ]);
        await store.clear("u1");
        expect(await store.count("u1")).toBe(0);
        expect(await store.count("u2")).toBe(1);
    });
});
