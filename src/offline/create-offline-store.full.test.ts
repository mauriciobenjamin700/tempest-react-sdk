import { afterEach, describe, expect, it } from "vitest";
import { createOfflineStore } from "./create-offline-store";

type Note = { id: string; owner_id: string; text: string; read?: boolean };

describe("createOfflineStore — full", () => {
    const stores: { db: { delete: () => Promise<void> } }[] = [];
    afterEach(async () => {
        for (const s of stores) await s.db.delete();
        stores.length = 0;
    });

    it("update changes a single record", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "n",
            indexes: "&id, owner_id",
            ownerField: "owner_id",
        });
        stores.push(store);
        await store.put({ id: "1", owner_id: "u", text: "a" });
        await store.update("1", { text: "b" });
        expect((await store.get("1"))?.text).toBe("b");
    });

    it("updateMany updates all matching records", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "n",
            indexes: "&id, owner_id, read",
            ownerField: "owner_id",
        });
        stores.push(store);
        await store.bulkPut([
            { id: "1", owner_id: "u", text: "a", read: false },
            { id: "2", owner_id: "u", text: "b", read: false },
        ]);
        await store.updateMany("u", { read: true });
        const list = await store.list("u");
        expect(list.every((n) => n.read)).toBe(true);
    });

    it("list supports limit + reverse + filter", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "n",
            indexes: "&id, owner_id",
        });
        stores.push(store);
        await store.bulkPut([
            { id: "1", owner_id: "u", text: "alpha" },
            { id: "2", owner_id: "u", text: "beta" },
            { id: "3", owner_id: "u", text: "gamma" },
        ]);
        const filtered = await store.list(undefined, {
            filter: (n) => n.text.startsWith("b"),
        });
        expect(filtered).toHaveLength(1);
        const limited = await store.list(undefined, { limit: 2 });
        expect(limited).toHaveLength(2);
    });

    it("delete removes by primary key", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "n",
            indexes: "&id",
        });
        stores.push(store);
        await store.put({ id: "1", owner_id: "u", text: "a" });
        await store.delete("1");
        expect(await store.get("1")).toBeUndefined();
    });
});
