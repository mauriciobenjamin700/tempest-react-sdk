import { afterEach, describe, expect, it } from "vitest";
import { createOfflineDatabase } from "./create-offline-database";
import { createOfflineStore, type OfflineStore } from "./create-offline-store";
import { createOfflineSync } from "./create-offline-sync";
import { StorageFullError } from "./storage-full-error";

type Note = { id: string; owner_id: string; text: string };

type FakeTransaction = {
    mode: IDBTransactionMode;
    _state: string;
    _requests: unknown[];
    _start: () => void;
    _abort: (name: string | null) => void;
};

/**
 * Make every `readwrite` transaction abort at commit with a
 * `QuotaExceededError`, the way Chromium reports a full origin.
 *
 * Measured in Chromium 159 with `Storage.overrideQuotaForOrigin` at 1 MiB and a
 * 4 MiB record: every write of the store (`put`, `bulkPut`, `update`,
 * `updateMany`) rejected with Dexie's `AbortError`, whose `inner` is the
 * browser's `QuotaExceededError`. The request itself succeeds; the quota is
 * enforced when the transaction commits. fake-indexeddb has no quota, so this
 * reproduces that path by aborting the transaction once its requests ran.
 *
 * @returns A function that restores the original behavior.
 */
function failCommitsWithQuota(): () => void {
    const proto = (globalThis.IDBTransaction as unknown as { prototype: FakeTransaction })
        .prototype;
    const original = proto._start;
    proto._start = function start(this: FakeTransaction): void {
        if (
            this.mode === "readwrite" &&
            this._state !== "finished" &&
            this._requests.length === 0
        ) {
            this._abort("QuotaExceededError");
            return;
        }
        original.call(this);
    };
    return () => {
        proto._start = original;
    };
}

/**
 * Make the object store's record writes fail with a `QuotaExceededError` at the
 * request, the shape where Dexie reports per-record failures — a `BulkError`
 * on `bulkPut`, a `ModifyError` on `modify` — instead of aborting at commit.
 *
 * @param store - A store whose database is already open.
 * @returns A function that restores the original behavior.
 */
function failRequestsWithQuota(store: OfflineStore<Note, string>): () => void {
    const backend = store.db.backendDB();
    const objectStore = backend
        .transaction(store.raw.name, "readonly")
        .objectStore(store.raw.name) as unknown as {
        _rawObjectStore: object;
    };
    const proto = Object.getPrototypeOf(objectStore._rawObjectStore) as {
        storeRecord: (...args: unknown[]) => unknown;
    };
    const original = proto.storeRecord;
    proto.storeRecord = () => {
        throw new DOMException("quota", "QuotaExceededError");
    };
    return () => {
        proto.storeRecord = original;
    };
}

describe("OfflineStore — storage full", () => {
    const cleanups: (() => Promise<void> | void)[] = [];

    afterEach(async () => {
        for (const cleanup of cleanups.reverse()) await cleanup();
        cleanups.length = 0;
    });

    async function seededStore(): Promise<OfflineStore<Note, string>> {
        const store = createOfflineStore<Note>({
            databaseName: `quota-${Math.random()}`,
            version: 1,
            tableName: "notes",
            indexes: "&id, owner_id",
            ownerField: "owner_id",
        });
        cleanups.push(() => store.db.delete());
        await store.put({ id: "seed", owner_id: "u", text: "a" }, "u");
        cleanups.push(failCommitsWithQuota());
        return store;
    }

    const writes: [string, (store: OfflineStore<Note, string>) => Promise<unknown>][] = [
        ["put", (store) => store.put({ id: "n", owner_id: "u", text: "b" }, "u")],
        [
            "bulkPut",
            (store) =>
                store.bulkPut(
                    [
                        { id: "b1", owner_id: "u", text: "b" },
                        { id: "b2", owner_id: "u", text: "c" },
                    ],
                    "u",
                ),
        ],
        ["update", (store) => store.update("seed", { text: "b" })],
        ["updateMany scoped", (store) => store.updateMany("u", { text: "b" })],
        ["updateMany unscoped", (store) => store.updateMany(undefined, { text: "b" })],
        ["delete", (store) => store.delete("seed")],
        ["clear scoped", (store) => store.clear("u")],
        ["clear unscoped", (store) => store.clear()],
    ];

    it.each(writes)(
        "%s rejects with StorageFullError carrying Dexie's error as cause",
        async (_name, write) => {
            const store = await seededStore();
            const error: unknown = await write(store).then(
                () => undefined,
                (reason: unknown) => reason,
            );
            expect(error).toBeInstanceOf(StorageFullError);
            const full = error as StorageFullError;
            expect(full.name).toBe("StorageFullError");
            expect((full.cause as Error).name).toBe("AbortError");
            expect((full.cause as { inner: Error }).inner.name).toBe("QuotaExceededError");
        },
    );

    it.each([
        [
            "put",
            (store: OfflineStore<Note, string>) => store.put({ id: "n", owner_id: "u", text: "b" }),
        ],
        [
            "bulkPut",
            (store: OfflineStore<Note, string>) =>
                store.bulkPut([
                    { id: "b1", owner_id: "u", text: "b" },
                    { id: "b2", owner_id: "u", text: "c" },
                ]),
        ],
        ["update", (store: OfflineStore<Note, string>) => store.update("seed", { text: "b" })],
        ["updateMany", (store: OfflineStore<Note, string>) => store.updateMany("u", { text: "b" })],
    ])(
        "%s rejects with StorageFullError when the quota fails the request itself",
        async (_name, write) => {
            const store = createOfflineStore<Note>({
                databaseName: `quota-${Math.random()}`,
                version: 1,
                tableName: "notes",
                indexes: "&id, owner_id",
                ownerField: "owner_id",
            });
            cleanups.push(() => store.db.delete());
            await store.put({ id: "seed", owner_id: "u", text: "a" });
            cleanups.push(failRequestsWithQuota(store));
            await expect(write(store)).rejects.toThrow(StorageFullError);
        },
    );

    it("keeps Dexie's BulkError as the cause so the app can tell which records failed", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `quota-${Math.random()}`,
            version: 1,
            tableName: "notes",
            indexes: "&id, owner_id",
        });
        cleanups.push(() => store.db.delete());
        await store.put({ id: "seed", owner_id: "u", text: "a" });
        cleanups.push(failRequestsWithQuota(store));
        const error = (await store
            .bulkPut([
                { id: "b1", owner_id: "u", text: "b" },
                { id: "b2", owner_id: "u", text: "c" },
            ])
            .catch((reason: unknown) => reason)) as StorageFullError;
        const cause = error.cause as { name: string; failuresByPos: Record<number, Error> };
        expect(cause.name).toBe("BulkError");
        expect(Object.keys(cause.failuresByPos)).toEqual(["0", "1"]);
    });

    it("leaves the store readable after a write hits the quota", async () => {
        const store = await seededStore();
        await expect(store.put({ id: "n", owner_id: "u", text: "b" }, "u")).rejects.toThrow(
            StorageFullError,
        );
        expect(await store.list("u")).toEqual([{ id: "seed", owner_id: "u", text: "a" }]);
    });

    it("lets errors other than the quota through untouched", async () => {
        const store = createOfflineStore<Note>({
            databaseName: `quota-${Math.random()}`,
            version: 1,
            tableName: "notes",
            indexes: "&id, owner_id",
        });
        cleanups.push(() => store.db.delete());
        const error: unknown = await store.put({ owner_id: "u", text: "no key" } as Note).then(
            () => undefined,
            (reason: unknown) => reason,
        );
        expect(error).not.toBeInstanceOf(StorageFullError);
        expect((error as Error).name).toBe("DataError");
    });

    it("converts the quota on stores built by createOfflineDatabase", async () => {
        const database = createOfflineDatabase<{ notes: Note }>({
            databaseName: `quota-${Math.random()}`,
            version: 1,
            tables: { notes: { indexes: "&id, owner_id" } },
        });
        cleanups.push(() => database.destroy());
        const notes = database.store<Note>("notes");
        await notes.put({ id: "seed", owner_id: "u", text: "a" });
        cleanups.push(failCommitsWithQuota());
        await expect(notes.put({ id: "n", owner_id: "u", text: "b" })).rejects.toThrow(
            StorageFullError,
        );
    });

    it("makes createOfflineSync.enqueue reject with StorageFullError when the outbox is full", async () => {
        const sync = createOfflineSync<{ text: string }, never>({
            databaseName: `quota-outbox-${Math.random()}`,
            watermark: { storageKey: `quota-watermark-${Math.random()}` },
            deliver: async () => undefined,
            pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
            applyRemote: async () => undefined,
        });
        cleanups.push(() => sync.dispose());
        await sync.enqueue("create", "r1", { text: "a" });
        cleanups.push(failCommitsWithQuota());
        await expect(sync.enqueue("update", "r1", { text: "b" })).rejects.toThrow(StorageFullError);
    });
});
