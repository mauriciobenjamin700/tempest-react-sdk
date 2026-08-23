import Dexie, { type Table } from "dexie";

import { buildStore, type OfflineStore, type OfflineStoreConfig } from "./create-offline-store";

export interface OfflineTableConfig<TItem> {
    /**
     * Dexie index definition for this table. Use `&` for a unique primary key,
     * e.g. `"&id, service_id, created_at"`.
     */
    indexes: string;
    /** Property used as the primary key (default: `"id"`). */
    keyPath?: keyof TItem & string;
    /**
     * Optional owner scoping for this table. Set per table, since one database
     * commonly mixes scoped and unscoped data.
     */
    ownerField?: keyof TItem & string;
}

/** Maps each table name to the record type it stores. */
export type OfflineSchema = Record<string, unknown>;

export type OfflineTablesConfig<TSchema extends OfflineSchema> = {
    [K in keyof TSchema]: OfflineTableConfig<TSchema[K]>;
};

export interface OfflineDatabaseConfig<TSchema extends OfflineSchema> {
    /** IndexedDB database name. */
    databaseName: string;
    /** Schema version. Bump when changing any table's indexes. */
    version: number;
    /** One entry per object store, all inside this single database. */
    tables: OfflineTablesConfig<TSchema>;
}

export interface OfflineDatabase<TSchema extends OfflineSchema> {
    /**
     * The {@link OfflineStore} for one table.
     *
     * The name is checked against the declared schema; the record type is
     * supplied by the caller — `store<Chat>("chats")`. Deriving it from the
     * schema instead (`OfflineStore<TSchema[K], string>`) is what the shape
     * below documents as unavailable: Dexie's `Table<T>` expands `UpdateSpec<T>`
     * over the keys of `T`, and an unresolved indexed access there makes the
     * checker answer TS2589 no matter how the value is cast.
     *
     * Stores are created once and memoised, so repeated calls with the same
     * name return the same object.
     */
    store: <TItem>(name: keyof TSchema & string) => OfflineStore<TItem, string>;
    /** The Dexie instance shared by every store. */
    db: Dexie;
    /** Delete the whole database from the browser. */
    destroy: () => Promise<void>;
}

class MultiTableDb extends Dexie {
    constructor(name: string, version: number, stores: Record<string, string>) {
        super(name);
        this.version(version).stores(stores);
    }
}

/**
 * Build several {@link OfflineStore}s that share one IndexedDB database.
 *
 * `createOfflineStore` gives each store a database of its own, which is the
 * right shape for one isolated cache. It is the wrong shape as soon as the
 * tables belong together: chats and their messages, an entity and its drafts,
 * anything you would read or clear as a unit. Splitting those across databases
 * costs a real transaction — Dexie runs one atomically only *within* a single
 * database — and it splits the version bump for a related change across two
 * places.
 *
 * This keeps them in one database at one version, so a schema change is one
 * bump and a multi-table write can be wrapped in `db.transaction(...)`.
 *
 * Stores are reached through `store<TItem>(name)` rather than a prebuilt map.
 * That is forced rather than chosen: Dexie's `Table<T>` expands `UpdateSpec<T>`
 * over the keys of `T`, so building `{ [K in keyof TSchema]: OfflineStore<…> }`
 * — or even naming `OfflineStore<TSchema[K], string>` inside the accessor —
 * makes the checker answer TS2589 ("excessively deep"). Taking the record type
 * as a parameter keeps it a plain type argument, which resolves fine. The table
 * name is still checked against the declared schema.
 *
 * The store surface is identical to `createOfflineStore`; only ownership of the
 * database changes. `ownerField` is set per table, since a database commonly
 * mixes per-user data with shared data.
 *
 * @param config - Database name, version, and one entry per table.
 * @returns A `store(name)` accessor, the shared Dexie instance, and a
 *   `destroy()` that drops the database.
 *
 * @example
 * type Chat = { id: string; service_id: string; updated_at: string };
 * type Message = { id: string; service_chat_id: string; created_at: string };
 *
 * const database = createOfflineDatabase<{ chats: Chat; messages: Message }>({
 *     databaseName: "ChatDatabase",
 *     version: 1,
 *     tables: {
 *         chats: { indexes: "&id, service_id, updated_at" },
 *         messages: { indexes: "&id, service_chat_id, created_at" },
 *     },
 * });
 *
 * const chats = database.store<Chat>("chats");
 * const messages = database.store<Message>("messages");
 *
 * // Both tables in one atomic transaction — impossible across two databases.
 * await database.db.transaction("rw", chats.raw, messages.raw, async () => {
 *     await chats.put(chat);
 *     await messages.bulkPut(pending);
 * });
 */
export function createOfflineDatabase<TSchema extends OfflineSchema>(
    config: OfflineDatabaseConfig<TSchema>,
): OfflineDatabase<TSchema> {
    const { databaseName, version, tables } = config;

    const schema: Record<string, string> = {};
    for (const name of Object.keys(tables)) {
        schema[name] = tables[name as keyof TSchema].indexes;
    }

    const db = new MultiTableDb(databaseName, version, schema);
    const built = new Map<string, unknown>();

    function store<TItem>(name: keyof TSchema & string): OfflineStore<TItem, string> {
        const cached = built.get(name);
        if (cached) return cached as OfflineStore<TItem, string>;

        if (!(name in tables)) {
            throw new Error(
                `Table "${name}" is not declared in ${databaseName}. ` +
                    `Available: ${Object.keys(tables).join(", ")}.`,
            );
        }

        const table = db.table(name) as Table<TItem>;
        const tableConfig = tables[name] as Pick<
            OfflineStoreConfig<TItem>,
            "keyPath" | "ownerField"
        >;
        // Dexie's `Table<T>` drags in `UpdateSpec<T>`, which maps over the keys
        // of `T`. Instantiating that from inside a second generic function is
        // past what the checker will unfold, and it answers TS2589
        // ("excessively deep") — for every shape tried: `unknown`, `object`,
        // `Record<string, unknown>`, a closed interface, an explicit type
        // argument, and a cast through `never`. `createOfflineStore` calls this
        // same `buildStore` without complaint, so it is the nesting, not the
        // store.
        //
        // Suppressed rather than worked around: the emitted types and the
        // runtime are both correct — `create-offline-database.test.ts` covers
        // the full surface, cross-table transactions included.
        // `@ts-expect-error` over `@ts-ignore` on purpose: if a later
        // TypeScript raises the limit, this line starts failing and says so.
        // @ts-expect-error TS2589 — see above
        const created: OfflineStore<TItem> = buildStore<TItem>(db, table, tableConfig);
        built.set(name, created);
        return created;
    }

    return {
        store,
        db,
        destroy: () => db.delete(),
    };
}
