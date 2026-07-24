import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCaches, inspectCaches } from "./cache-inspect";

class FakeCache {
    store = new Map<string, Response>();
    async keys(): Promise<Request[]> {
        return [...this.store.keys()].map((url) => new Request(url));
    }
    async match(request: Request): Promise<Response | undefined> {
        return this.store.get(request.url);
    }
}

class FakeCacheStorage {
    caches = new Map<string, FakeCache>();
    async open(name: string): Promise<FakeCache> {
        let cache = this.caches.get(name);
        if (!cache) {
            cache = new FakeCache();
            this.caches.set(name, cache);
        }
        return cache;
    }
    async keys(): Promise<string[]> {
        return [...this.caches.keys()];
    }
    async delete(name: string): Promise<boolean> {
        return this.caches.delete(name);
    }
}

let original: unknown;
let storage: FakeCacheStorage;

beforeEach(async () => {
    original = (globalThis as Record<string, unknown>).caches;
    storage = new FakeCacheStorage();
    Object.defineProperty(globalThis, "caches", {
        value: storage,
        configurable: true,
        writable: true,
    });
    const a = await storage.open("tempest-precache-v1");
    a.store.set("https://app.test/a.js", new Response("abc")); // 3 bytes
    a.store.set("https://app.test/b.js", new Response("de")); // 2 bytes
    const other = await storage.open("other-cache");
    other.store.set("https://app.test/c.js", new Response("x"));
});

afterEach(() => {
    if (original === undefined) {
        delete (globalThis as Record<string, unknown>).caches;
    } else {
        Object.defineProperty(globalThis, "caches", {
            value: original,
            configurable: true,
            writable: true,
        });
    }
});

describe("inspectCaches", () => {
    it("reports entries and bytes per cache", async () => {
        const reports = await inspectCaches();
        const precache = reports.find((r) => r.name === "tempest-precache-v1");
        expect(precache?.entries).toBe(2);
        expect(precache?.bytes).toBe(5);
    });

    it("filters by prefix", async () => {
        const reports = await inspectCaches({ filter: "tempest-" });
        expect(reports).toHaveLength(1);
        expect(reports[0].name).toBe("tempest-precache-v1");
    });

    it("skips byte measurement when measureBytes is false", async () => {
        const reports = await inspectCaches({ measureBytes: false });
        expect(reports.every((r) => r.bytes === null)).toBe(true);
        expect(reports.every((r) => r.entries >= 1)).toBe(true);
    });

    it("returns empty when caches is unavailable", async () => {
        delete (globalThis as Record<string, unknown>).caches;
        expect(await inspectCaches()).toEqual([]);
    });
});

describe("clearCaches", () => {
    it("deletes matching caches and returns their names", async () => {
        const deleted = await clearCaches("tempest-");
        expect(deleted).toEqual(["tempest-precache-v1"]);
        expect(await storage.keys()).toEqual(["other-cache"]);
    });

    it("deletes all caches when no filter is given", async () => {
        const deleted = await clearCaches();
        expect(deleted).toHaveLength(2);
        expect(await storage.keys()).toEqual([]);
    });
});
