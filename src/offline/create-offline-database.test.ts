import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { createOfflineDatabase, type OfflineDatabase } from "./create-offline-database";

interface Chat {
    id: string;
    service_id: string;
    updated_at: string;
}

interface Message {
    id: string;
    service_chat_id: string;
    owner_id?: string;
    created_at: string;
}

type Schema = { chats: Chat; messages: Message };

let handle: OfflineDatabase<Schema> | null = null;

function build(name = "TestChatDb") {
    handle = createOfflineDatabase<Schema>({
        databaseName: name,
        version: 1,
        tables: {
            chats: { indexes: "&id, service_id, updated_at" },
            messages: {
                indexes: "&id, service_chat_id, owner_id, created_at",
                ownerField: "owner_id",
            },
        },
    });
    return handle;
}

afterEach(async () => {
    if (handle) await handle.db.delete();
    handle = null;
});

describe("createOfflineDatabase", () => {
    it("puts every table in one database", async () => {
        const database = build();
        const chats = database.store<Chat>("chats");
        const messages = database.store<Message>("messages");

        await chats.put({ id: "c1", service_id: "s1", updated_at: "2026-01-01" });
        await messages.put({ id: "m1", service_chat_id: "c1", created_at: "2026-01-01" });

        expect(database.db.tables.map((t) => t.name).sort()).toEqual(["chats", "messages"]);
        expect(chats.db).toBe(messages.db);
    });

    it("memoises the store for a table", () => {
        const database = build();
        expect(database.store<Chat>("chats")).toBe(database.store<Chat>("chats"));
    });

    it("throws for a table missing from the schema", () => {
        const database = build();
        expect(() => database.store<Chat>("nope" as "chats")).toThrow(/not declared/);
    });

    it("keeps the stores independent", async () => {
        const database = build();
        const chats = database.store<Chat>("chats");
        const messages = database.store<Message>("messages");

        await chats.put({ id: "c1", service_id: "s1", updated_at: "2026-01-01" });
        await messages.bulkPut([
            { id: "m1", service_chat_id: "c1", created_at: "2026-01-01" },
            { id: "m2", service_chat_id: "c1", created_at: "2026-01-02" },
        ]);

        expect(await chats.count()).toBe(1);
        expect(await messages.count()).toBe(2);

        await messages.clear();
        expect(await messages.count()).toBe(0);
        expect(await chats.count()).toBe(1);
    });

    it("writes across tables atomically — the reason this exists", async () => {
        const database = build();
        const chats = database.store<Chat>("chats");
        const messages = database.store<Message>("messages");

        await expect(
            database.db.transaction("rw", chats.raw, messages.raw, async () => {
                await chats.put({ id: "c1", service_id: "s1", updated_at: "2026-01-01" });
                await messages.put({ id: "m1", service_chat_id: "c1", created_at: "x" });
                throw new Error("falha no meio da transação");
            }),
        ).rejects.toThrow("falha no meio da transação");

        // Both writes roll back together. Across two databases neither would.
        expect(await chats.count()).toBe(0);
        expect(await messages.count()).toBe(0);
    });

    it("honours per-table owner scoping", async () => {
        const messages = build().store<Message>("messages");

        await messages.put({ id: "m1", service_chat_id: "c1", created_at: "a" }, "u1");
        await messages.put({ id: "m2", service_chat_id: "c1", created_at: "b" }, "u2");

        expect(await messages.count("u1")).toBe(1);
        expect((await messages.list("u1"))[0]!.owner_id).toBe("u1");

        await messages.clear("u1");
        expect(await messages.count("u1")).toBe(0);
        expect(await messages.count("u2")).toBe(1);
    });

    it("leaves a table without ownerField unscoped", async () => {
        const chats = build().store<Chat>("chats");

        await chats.put({ id: "c1", service_id: "s1", updated_at: "a" }, "u1");
        const [chat] = await chats.list("u1");

        expect(chat).toBeDefined();
        expect(chat as unknown as Record<string, unknown>).not.toHaveProperty("owner_id");
    });

    it("supports the full store surface on each table", async () => {
        const chats = build().store<Chat>("chats");

        await chats.put({ id: "c1", service_id: "s1", updated_at: "2026-01-01" });
        expect((await chats.get("c1"))?.service_id).toBe("s1");

        expect(await chats.update("c1", { service_id: "s2" })).toBe(1);
        expect((await chats.get("c1"))?.service_id).toBe("s2");

        await chats.delete("c1");
        expect(await chats.get("c1")).toBeUndefined();
    });

    it("orders and limits through list options", async () => {
        const messages = build().store<Message>("messages");

        await messages.bulkPut([
            { id: "m1", service_chat_id: "c1", created_at: "2026-01-03" },
            { id: "m2", service_chat_id: "c1", created_at: "2026-01-01" },
            { id: "m3", service_chat_id: "c1", created_at: "2026-01-02" },
        ]);

        const recent = await messages.list(undefined, {
            orderBy: "created_at",
            reverse: true,
            limit: 2,
        });

        expect(recent.map((m) => m.id)).toEqual(["m1", "m3"]);
    });

    it("destroy() drops the database", async () => {
        const database = build("DestroyMe");
        await database.store<Chat>("chats").put({ id: "c1", service_id: "s1", updated_at: "a" });

        await database.destroy();
        handle = null;

        const reopened = createOfflineDatabase<Schema>({
            databaseName: "DestroyMe",
            version: 1,
            tables: {
                chats: { indexes: "&id, service_id, updated_at" },
                messages: { indexes: "&id, service_chat_id, owner_id, created_at" },
            },
        });
        expect(await reopened.store<Chat>("chats").count()).toBe(0);
        await reopened.db.delete();
    });
});
