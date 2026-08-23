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

describe("createOfflineStore — list ordering and slicing", () => {
    it("orders by a non-key field, reverses, offsets and limits", async () => {
        const store = createOfflineStore<{ id: string; n: number }, string>({
            databaseName: `list-${Math.random().toString(36).slice(2)}`,
            version: 1,
            tableName: "rows",
            indexes: "&id, n",
        });
        await store.bulkPut([
            { id: "a", n: 3 },
            { id: "b", n: 1 },
            { id: "c", n: 2 },
        ]);

        expect((await store.list(undefined, { orderBy: "n" })).map((r) => r.id)).toEqual([
            "b",
            "c",
            "a",
        ]);
        expect(
            (await store.list(undefined, { orderBy: "n", reverse: true })).map((r) => r.id),
        ).toEqual(["a", "c", "b"]);
        expect((await store.list(undefined, { orderBy: "n", offset: 1 })).map((r) => r.id)).toEqual(
            ["c", "a"],
        );
        expect((await store.list(undefined, { orderBy: "n", limit: 2 })).map((r) => r.id)).toEqual([
            "b",
            "c",
        ]);
        expect(
            (await store.list(undefined, { filter: (row) => row.n > 1 })).map((r) => r.id).sort(),
        ).toEqual(["a", "c"]);

        await store.db.delete();
    });

    it("stamps the owner only where a store was given one", async () => {
        const owned = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "n",
            indexes: "&id, owner_id",
            ownerField: "owner_id",
        });
        await owned.put({ id: "1", text: "a" } as Note, "ana");
        expect((await owned.get("1"))?.owner_id).toBe("ana");

        const plain = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "n",
            indexes: "&id, owner_id",
        });
        await plain.put({ id: "1", text: "a" } as Note, "ana");
        expect((await plain.get("1"))?.owner_id).toBeUndefined();

        await owned.db.delete();
        await plain.db.delete();
    });

    it("updates every row when no owner scopes the change", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `t-${Math.random()}`,
            version: 1,
            tableName: "n",
            indexes: "&id, owner_id",
        });
        await store.put({ id: "1", owner_id: "u", text: "a" });
        await store.put({ id: "2", owner_id: "u", text: "b" });

        const changed = await store.updateMany(undefined, { read: true });

        expect(changed).toBe(2);
        expect((await store.get("2"))?.read).toBe(true);

        await store.db.delete();
    });
});
