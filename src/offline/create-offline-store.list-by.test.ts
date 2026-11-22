import { afterEach, describe, expect, it } from "vitest";
import { createOfflineDatabase } from "./create-offline-database";
import { createOfflineStore, type OfflineStore } from "./create-offline-store";

interface Photo {
    id: string;
    owner_id: string;
    visit_id: string;
    taken_at: string;
}

const stores: { db: { delete: () => Promise<void> } }[] = [];

afterEach(async () => {
    for (const store of stores) await store.db.delete();
    stores.length = 0;
});

/**
 * Two technicians, five visits each, four photos per visit.
 *
 * @param indexes - The table's Dexie index definition.
 * @returns A filled photo store.
 */
async function photoStore(
    indexes: string = "&id, owner_id, visit_id, taken_at",
): Promise<OfflineStore<Photo, string>> {
    const store = createOfflineStore<Photo, string>({
        databaseName: `list-by-${Math.random().toString(36).slice(2)}`,
        version: 1,
        tableName: "photos",
        indexes,
        ownerField: "owner_id",
    });
    stores.push(store);
    const photos: Photo[] = [];
    for (const owner of ["ana", "carlos"]) {
        for (let visit = 0; visit < 5; visit += 1) {
            for (let shot = 3; shot >= 0; shot -= 1) {
                photos.push({
                    id: `${owner}-${visit}-${shot}`,
                    owner_id: owner,
                    visit_id: `visit-${visit}`,
                    taken_at: `2026-11-22T10:0${shot}:00Z`,
                });
            }
        }
    }
    await store.bulkPut(photos);
    return store;
}

describe("OfflineStore.listBy — listing by an index other than the owner", () => {
    it("returns only the owner's records for the value, even when another owner shares it", async () => {
        const store = await photoStore();

        const anas = await store.listBy("visit_id", "visit-2", "ana");

        expect(anas).toHaveLength(4);
        expect(new Set(anas.map((photo) => photo.owner_id))).toEqual(new Set(["ana"]));
        expect(new Set(anas.map((photo) => photo.visit_id))).toEqual(new Set(["visit-2"]));
    });

    it("reads only the index hits, where list(owner, { filter }) reads every record of the owner", async () => {
        const store = await photoStore();
        let scanned = 0;
        await store.list("ana", {
            filter: (photo) => {
                scanned += 1;
                return photo.visit_id === "visit-2";
            },
        });
        let read = 0;
        await store.listBy("visit_id", "visit-2", "ana", {
            filter: () => {
                read += 1;
                return true;
            },
        });

        expect(scanned).toBe(20);
        expect(read).toBe(4);
    });

    it("lists every owner's matches when no owner is passed", async () => {
        const store = await photoStore();

        expect(await store.listBy("visit_id", "visit-2")).toHaveLength(8);
    });

    it("applies ordering and paging like list", async () => {
        const store = await photoStore();

        const page = await store.listBy("visit_id", "visit-1", "carlos", {
            orderBy: "taken_at",
            reverse: true,
            offset: 1,
            limit: 2,
        });

        expect(page.map((photo) => photo.id)).toEqual(["carlos-1-2", "carlos-1-1"]);
    });

    it("returns an empty list when nothing matches", async () => {
        const store = await photoStore();

        expect(await store.listBy("visit_id", "visit-99", "ana")).toEqual([]);
    });

    it("rejects an index the table does not declare instead of scanning", async () => {
        const store = await photoStore("&id, owner_id, taken_at");

        await expect(store.listBy("visit_id", "visit-2", "ana")).rejects.toThrow(/indexed/i);
    });

    it("is available on stores built by createOfflineDatabase", async () => {
        const database = createOfflineDatabase<{ photos: Photo }>({
            databaseName: `list-by-db-${Math.random().toString(36).slice(2)}`,
            version: 1,
            tables: { photos: { indexes: "&id, owner_id, visit_id", ownerField: "owner_id" } },
        });
        stores.push(database);
        const photos = database.store<Photo>("photos");
        await photos.put({ id: "p1", owner_id: "", visit_id: "v1", taken_at: "t" }, "ana");
        await photos.put({ id: "p2", owner_id: "", visit_id: "v1", taken_at: "t" }, "carlos");

        const anas = await photos.listBy("visit_id", "v1", "ana");

        expect(anas.map((photo) => photo.id)).toEqual(["p1"]);
    });
});
