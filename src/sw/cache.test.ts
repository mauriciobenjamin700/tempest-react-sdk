import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPartialResponse, installPrecache, installRuntimeCache } from "./cache";

type Listener = (event: unknown) => void;

/** In-memory Cache (subset of the Cache API), keyed by request URL. */
class FakeCache {
    store = new Map<string, Response>();
    private key(req: Request | string): string {
        return typeof req === "string" ? new URL(req, "https://app.test").href : req.url;
    }
    async match(req: Request | string): Promise<Response | undefined> {
        return this.store.get(this.key(req));
    }
    async put(req: Request | string, res: Response): Promise<void> {
        this.store.set(this.key(req), res);
    }
    async addAll(urls: string[]): Promise<void> {
        for (const url of urls)
            this.store.set(new URL(url, "https://app.test").href, new Response("x"));
    }
    async keys(): Promise<Request[]> {
        return [...this.store.keys()].map((url) => new Request(url));
    }
    async delete(req: Request | string): Promise<boolean> {
        return this.store.delete(this.key(req));
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

const ORIGINAL: Record<string, unknown> = {};
const STUB_KEYS = ["addEventListener", "clients", "skipWaiting", "location", "caches", "fetch"];

let listeners: Record<string, Listener[]>;
let cacheStorage: FakeCacheStorage;
let fetchMock: ReturnType<typeof vi.fn>;

function stubSw(): void {
    listeners = { install: [], activate: [], fetch: [] };
    cacheStorage = new FakeCacheStorage();
    fetchMock = vi.fn();

    const sw: Record<string, unknown> = {
        addEventListener: (name: string, listener: Listener) => {
            (listeners[name] ??= []).push(listener);
        },
        clients: { claim: vi.fn().mockResolvedValue(undefined) },
        skipWaiting: vi.fn().mockResolvedValue(undefined),
        location: { origin: "https://app.test" },
        caches: cacheStorage,
        fetch: fetchMock,
    };
    for (const key of STUB_KEYS) {
        ORIGINAL[key] = (globalThis as Record<string, unknown>)[key];
        Object.defineProperty(globalThis, key, {
            value: sw[key],
            configurable: true,
            writable: true,
        });
    }
}

beforeEach(stubSw);

afterEach(() => {
    for (const key of STUB_KEYS) {
        if (ORIGINAL[key] === undefined) {
            delete (globalThis as Record<string, unknown>)[key];
        } else {
            Object.defineProperty(globalThis, key, {
                value: ORIGINAL[key],
                configurable: true,
                writable: true,
            });
        }
    }
    vi.restoreAllMocks();
});

/** Drive the (single) fetch listener and return its produced Response. */
async function dispatchFetch(request: Request): Promise<Response | "passthrough"> {
    let produced: Promise<Response> | Response | undefined;
    const event = {
        request,
        respondWith: (r: Response | Promise<Response>) => {
            produced = r;
        },
    };
    for (const listener of listeners.fetch) {
        listener(event);
        if (produced !== undefined) break;
    }
    if (produced === undefined) return "passthrough";
    return produced;
}

describe("installRuntimeCache", () => {
    it("cache-first serves the network once, then the cache", async () => {
        fetchMock.mockResolvedValue(new Response("net"));
        installRuntimeCache([{ match: /\/img\//, strategy: "cache-first", cacheName: "img" }]);

        const req = new Request("https://app.test/img/a.png");
        const first = await dispatchFetch(req);
        expect(first).not.toBe("passthrough");
        await (first as Response).text();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await dispatchFetch(req);
        expect(fetchMock).toHaveBeenCalledTimes(1); // served from cache, no extra fetch
    });

    it("network-first falls back to cache when the network fails", async () => {
        installRuntimeCache([{ match: /\/api\//, strategy: "network-first", cacheName: "api" }]);
        const req = new Request("https://app.test/api/me");

        fetchMock.mockResolvedValueOnce(new Response("fresh"));
        const ok = (await dispatchFetch(req)) as Response;
        expect(await ok.text()).toBe("fresh");

        fetchMock.mockRejectedValueOnce(new Error("offline"));
        const cached = (await dispatchFetch(req)) as Response;
        expect(await cached.text()).toBe("fresh");
    });

    it("ignores non-GET and non-matching requests (passthrough)", async () => {
        installRuntimeCache([{ match: /\/api\//, strategy: "cache-first", cacheName: "api" }]);
        expect(await dispatchFetch(new Request("https://app.test/api", { method: "POST" }))).toBe(
            "passthrough",
        );
        expect(await dispatchFetch(new Request("https://app.test/other"))).toBe("passthrough");
    });

    it("trims the cache to maxEntries", async () => {
        fetchMock.mockResolvedValue(new Response("x"));
        installRuntimeCache([
            { match: /\/img\//, strategy: "cache-first", cacheName: "img", maxEntries: 2 },
        ]);
        for (const n of [1, 2, 3]) {
            await (await dispatchFetch(new Request(`https://app.test/img/${n}.png`))).valueOf();
        }
        const cache = await cacheStorage.open("img");
        expect((await cache.keys()).length).toBe(2);
    });
});

describe("installPrecache", () => {
    function dispatch(type: "install" | "activate"): Promise<void> {
        const waits: Promise<unknown>[] = [];
        const event = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
        for (const listener of listeners[type]) listener(event);
        return Promise.all(waits).then(() => undefined);
    }

    it("precaches manifest urls on install and skips waiting", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "abc", urls: ["/index.html", "/assets/a.js"] })),
        );
        installPrecache();
        await dispatch("install");

        const cache = await cacheStorage.open("tempest-precache-abc");
        expect(await cache.match("/assets/a.js")).toBeTruthy();
        expect(
            (globalThis as unknown as { skipWaiting: ReturnType<typeof vi.fn> }).skipWaiting,
        ).toHaveBeenCalled();
    });

    it("deletes stale precache versions on activate", async () => {
        await cacheStorage.open("tempest-precache-old");
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "new", urls: ["/index.html"] })),
        );
        installPrecache();
        await dispatch("install");
        await dispatch("activate");

        const names = await cacheStorage.keys();
        expect(names).toContain("tempest-precache-new");
        expect(names).not.toContain("tempest-precache-old");
    });

    it("serves the app shell for offline navigations", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "v1", urls: ["/index.html"] })),
        );
        installPrecache();
        await dispatch("install");

        // Seed the shell content, then go offline.
        (await cacheStorage.open("tempest-precache-v1")).store.set(
            "https://app.test/index.html",
            new Response("<!doctype html>shell"),
        );
        fetchMock.mockRejectedValueOnce(new Error("offline"));

        // `Request` can't be constructed with mode "navigate"; fake the fields used.
        const nav = {
            url: "https://app.test/dashboard",
            method: "GET",
            mode: "navigate",
        } as unknown as Request;
        const res = (await dispatchFetch(nav)) as Response;
        expect(await res.text()).toBe("<!doctype html>shell");
    });

    it("enables navigation preload on activate when supported", async () => {
        const enable = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(globalThis, "registration", {
            value: { navigationPreload: { enable } },
            configurable: true,
            writable: true,
        });
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "np", urls: ["/index.html"] })),
        );
        installPrecache();
        await dispatch("install");
        await dispatch("activate");
        expect(enable).toHaveBeenCalled();
        delete (globalThis as Record<string, unknown>).registration;
    });

    it("serves the navigation preload response instead of refetching", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "pp", urls: ["/index.html"] })),
        );
        installPrecache();
        await dispatch("install");

        const nav = {
            url: "https://app.test/dashboard",
            method: "GET",
            mode: "navigate",
        } as unknown as Request;
        let produced: Promise<Response> | Response | undefined;
        const event = {
            request: nav,
            respondWith: (r: Response | Promise<Response>) => {
                produced = r;
            },
            preloadResponse: Promise.resolve(new Response("preloaded")),
        };
        for (const listener of listeners.fetch) {
            listener(event);
            if (produced !== undefined) break;
        }
        const res = (await produced) as Response;
        expect(await res.text()).toBe("preloaded");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("createPartialResponse", () => {
    function full(): Response {
        return new Response("0123456789"); // 10 bytes
    }

    it("slices a closed byte range into a 206", async () => {
        const req = new Request("https://app.test/v.mp4", { headers: { range: "bytes=2-5" } });
        const res = await createPartialResponse(req, full());
        expect(res.status).toBe(206);
        expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
        expect(res.headers.get("content-length")).toBe("4");
        expect(await res.text()).toBe("2345");
    });

    it("supports open-ended and suffix ranges", async () => {
        const open = await createPartialResponse(
            new Request("https://app.test/v", { headers: { range: "bytes=7-" } }),
            full(),
        );
        expect(await open.text()).toBe("789");

        const suffix = await createPartialResponse(
            new Request("https://app.test/v", { headers: { range: "bytes=-3" } }),
            full(),
        );
        expect(suffix.headers.get("content-range")).toBe("bytes 7-9/10");
        expect(await suffix.text()).toBe("789");
    });

    it("returns 416 when the range is unsatisfiable, and passes through with no range", async () => {
        const bad = await createPartialResponse(
            new Request("https://app.test/v", { headers: { range: "bytes=50-60" } }),
            full(),
        );
        expect(bad.status).toBe(416);

        const none = await createPartialResponse(new Request("https://app.test/v"), full());
        expect(none.status).toBe(200);
    });

    it("serves a Range request from cache via a rangeRequests route", async () => {
        fetchMock.mockResolvedValue(new Response("0123456789"));
        installRuntimeCache([
            {
                match: /\/media\//,
                strategy: "cache-first",
                cacheName: "media",
                rangeRequests: true,
            },
        ]);
        const req = new Request("https://app.test/media/a.mp3", {
            headers: { range: "bytes=0-3" },
        });
        const res = (await dispatchFetch(req)) as Response;
        expect(res.status).toBe(206);
        expect(await res.text()).toBe("0123");
    });
});
