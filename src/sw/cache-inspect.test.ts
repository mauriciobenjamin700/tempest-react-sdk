import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("cache-inspect — filters and byte measurement", () => {
    /** Put one response in a fresh bucket of the fake Cache Storage. */
    async function seed(name: string, url: string, response: Response): Promise<void> {
        (await storage.open(name)).store.set(`https://app.test${url}`, response);
    }

    it("matches names by RegExp and by predicate", async () => {
        expect((await inspectCaches({ filter: /^tempest-/ })).map((r) => r.name)).toEqual([
            "tempest-precache-v1",
        ]);
        expect(
            (await inspectCaches({ filter: (name) => name.startsWith("other") })).map(
                (r) => r.name,
            ),
        ).toEqual(["other-cache"]);
    });

    it("prefers content-length over reading the body", async () => {
        await seed(
            "sizes",
            "/header",
            new Response("x", { headers: { "content-length": "1234" } }),
        );
        const [report] = await inspectCaches({ filter: "sizes" });
        expect(report.bytes).toBe(1234);
    });

    it("ignores a non-numeric content-length and falls back to the blob", async () => {
        await seed("bad-header", "/x", new Response("abc", { headers: { "content-length": "" } }));
        const [report] = await inspectCaches({ filter: "bad-header" });
        expect(report.bytes).toBe(3);
    });

    it("counts zero bytes when the body cannot be read", async () => {
        const broken = new Response("x");
        vi.spyOn(broken, "clone").mockImplementation(() => {
            throw new Error("detached");
        });
        await seed("broken", "/x", broken);
        const [report] = await inspectCaches({ filter: "broken" });
        expect(report.bytes).toBe(0);
    });

    it("returns empty lists when Cache Storage is unavailable", async () => {
        delete (globalThis as Record<string, unknown>).caches;
        expect(await inspectCaches()).toEqual([]);
        expect(await clearCaches()).toEqual([]);
    });

    it("clearCaches deletes only matching buckets and reports them", async () => {
        expect(await clearCaches("other")).toEqual(["other-cache"]);
        const names = (await inspectCaches()).map((r) => r.name);
        expect(names).toContain("tempest-precache-v1");
        expect(names).not.toContain("other-cache");
    });
});
