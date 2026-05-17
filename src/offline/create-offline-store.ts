import Dexie, { type Table, type UpdateSpec } from "dexie";

export interface OfflineStoreConfig<TItem> {
    /** IndexedDB database name. */
    databaseName: string;
    /** Schema version. Bump when changing indexes; pair with a migration if needed. */
    version: number;
    /** Object-store name. */
    tableName: string;
    /**
     * Dexie index definition for the table. Use `&` for the primary key
     * (unique), e.g. `"&id, owner_id, created_at"`. See Dexie docs for the
     * full syntax.
     */
    indexes: string;
    /** Property used as the primary key (default: `"id"`). */
    keyPath?: keyof TItem & string;
    /**
     * Optional owner scoping. When set, every read/write method honors the
     * `owner` argument and persists it on each record (e.g. multi-tenant
     * notifications keyed by `user_id`).
     */
    ownerField?: keyof TItem & string;
}

export interface ListOptions<TItem> {
    /** Property to order by. Default: `keyPath`. */
    orderBy?: keyof TItem & string;
    /** Reverse the ordering. Default: false. */
    reverse?: boolean;
    /** Maximum number of items to return. */
    limit?: number;
    /** Skip this many items from the start of the result set. */
    offset?: number;
    /** Custom predicate applied after the index query. */
    filter?: (item: TItem) => boolean;
}

export interface OfflineStore<TItem, TKey extends string | number> {
    /** Insert or replace a record. */
    put: (item: TItem, owner?: string) => Promise<TKey>;
    /** Insert or replace multiple records in a single transaction. */
    bulkPut: (items: TItem[], owner?: string) => Promise<TKey>;
    /** Fetch one record by its primary key. */
    get: (key: TKey) => Promise<TItem | undefined>;
    /** List records, optionally scoped to `owner` when `ownerField` is configured. */
    list: (owner?: string, options?: ListOptions<TItem>) => Promise<TItem[]>;
    /** Partial update by primary key. Returns the number of records changed. */
    update: (key: TKey, changes: Partial<TItem>) => Promise<number>;
    /** Apply a modification to every record matching `owner`. */
    updateMany: (owner: string | undefined, changes: Partial<TItem>) => Promise<number>;
    /** Delete one record by primary key. */
    delete: (key: TKey) => Promise<void>;
    /** Delete every record matching `owner` (or the entire table when no scope is set). */
    clear: (owner?: string) => Promise<void>;
    /** Count records, optionally scoped to `owner`. */
    count: (owner?: string) => Promise<number>;
    /** Raw Dexie table for advanced queries. */
    raw: Table<TItem, TKey>;
    /** Underlying Dexie instance. */
    db: Dexie;
}

class GenericDb<TItem, TKey extends string | number> extends Dexie {
    store!: Table<TItem, TKey>;

    constructor(name: string, version: number, tableName: string, indexes: string) {
        super(name);
        this.version(version).stores({ [tableName]: indexes });
        this.store = this.table<TItem, TKey>(tableName);
    }
}

/**
 * Build a typed IndexedDB-backed store using Dexie. Optionally scope every
 * operation by an `ownerField` (useful for multi-user SSE history, drafts,
 * cache per workspace, etc.).
 *
 * Dexie is an **optional peer dependency** — install it (`npm i dexie`) only
 * when your app needs offline storage.
 *
 * @example
 * type Note = { id: string; owner_id: string; text: string; created_at: string };
 * const notes = createOfflineStore<Note, string>({
 *     databaseName: "TempestNotes",
 *     version: 1,
 *     tableName: "notes",
 *     indexes: "&id, owner_id, created_at",
 *     ownerField: "owner_id",
 * });
 * await notes.put({ id: "n1", owner_id: "u1", text: "hi", created_at: ... }, "u1");
 * const mine = await notes.list("u1", { orderBy: "created_at", reverse: true });
 */
export function createOfflineStore<TItem, TKey extends string | number = string>(
    config: OfflineStoreConfig<TItem>,
): OfflineStore<TItem, TKey> {
    const { databaseName, version, tableName, indexes, keyPath = "id", ownerField } = config;

    const db = new GenericDb<TItem, TKey>(databaseName, version, tableName, indexes);
    const table = db.store;

    function withOwner(item: TItem, owner?: string): TItem {
        if (!ownerField || !owner) return item;
        return { ...item, [ownerField]: owner } as TItem;
    }

    async function list(owner?: string, options: ListOptions<TItem> = {}): Promise<TItem[]> {
        const { orderBy = keyPath, reverse = false, limit, offset, filter } = options;

        let collection = ownerField && owner
            ? table.where(ownerField).equals(owner)
            : table.toCollection();

        if (filter) collection = collection.filter(filter);

        let items =
            orderBy === keyPath
                ? await collection.toArray()
                : await collection.sortBy(orderBy);

        if (reverse) items = items.reverse();
        if (offset) items = items.slice(offset);
        if (typeof limit === "number") items = items.slice(0, limit);
        return items;
    }

    return {
        put: (item, owner) => table.put(withOwner(item, owner)) as Promise<TKey>,
        bulkPut: (items, owner) =>
            table.bulkPut(items.map((item) => withOwner(item, owner))) as Promise<TKey>,
        get: (key) => table.get(key),
        list,
        update: (key, changes) => table.update(key, changes as UpdateSpec<TItem>),
        updateMany: async (owner, changes) => {
            const spec = changes as UpdateSpec<TItem>;
            if (ownerField && owner) {
                return table.where(ownerField).equals(owner).modify(spec);
            }
            return table.toCollection().modify(spec);
        },
        delete: (key) => table.delete(key),
        clear: async (owner) => {
            if (ownerField && owner) {
                await table.where(ownerField).equals(owner).delete();
                return;
            }
            await table.clear();
        },
        count: (owner) => {
            if (ownerField && owner) {
                return table.where(ownerField).equals(owner).count();
            }
            return table.count();
        },
        raw: table,
        db,
    };
}
