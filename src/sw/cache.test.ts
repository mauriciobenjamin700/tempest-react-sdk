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

describe("installRuntimeCache — strategy edges", () => {
    it("stale-while-revalidate serves the cache immediately and refreshes behind it", async () => {
        installRuntimeCache([
            { match: /\/swr\//, strategy: "stale-while-revalidate", cacheName: "swr" },
        ]);
        const req = new Request("https://app.test/swr/a.json");

        let version = 1;
        fetchMock.mockImplementation(async () => new Response(`v${version}`));

        const first = (await dispatchFetch(req)) as Response;
        expect(await first.text()).toBe("v1");

        version = 2;
        const second = (await dispatchFetch(req)) as Response;
        expect(await second.text()).toBe("v1");

        await new Promise((resolve) => setTimeout(resolve, 0));
        const third = (await dispatchFetch(req)) as Response;
        expect(await third.text()).toBe("v2");
    });

    it("stale-while-revalidate throws with neither network nor cache", async () => {
        installRuntimeCache([
            { match: /\/swr2\//, strategy: "stale-while-revalidate", cacheName: "swr2" },
        ]);
        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await expect(dispatchFetch(new Request("https://app.test/swr2/a"))).rejects.toThrow(
            "no network and no cache",
        );
    });

    it("treats a cached response past maxAgeSeconds as a miss", async () => {
        const stale = new Response("old", {
            headers: { date: new Date(Date.now() - 600_000).toUTCString() },
        });
        (await cacheStorage.open("aged")).store.set("https://app.test/aged/a.json", stale);

        installRuntimeCache([
            { match: /\/aged\//, strategy: "cache-first", cacheName: "aged", maxAgeSeconds: 60 },
        ]);
        fetchMock.mockResolvedValueOnce(new Response("fresh"));
        const res = (await dispatchFetch(new Request("https://app.test/aged/a.json"))) as Response;
        expect(await res.text()).toBe("fresh");
    });

    it("keeps a cached response with no date header regardless of maxAgeSeconds", async () => {
        (await cacheStorage.open("nodate")).store.set(
            "https://app.test/nodate/a.json",
            new Response("kept"),
        );
        installRuntimeCache([
            { match: /\/nodate\//, strategy: "cache-first", cacheName: "nodate", maxAgeSeconds: 1 },
        ]);
        const res = (await dispatchFetch(
            new Request("https://app.test/nodate/a.json"),
        )) as Response;
        expect(await res.text()).toBe("kept");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not cache a non-ok response", async () => {
        installRuntimeCache([{ match: /\/e\//, strategy: "cache-first", cacheName: "err" }]);
        fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
        const res = (await dispatchFetch(new Request("https://app.test/e/a"))) as Response;
        expect(res.status).toBe(500);
        expect((await (await cacheStorage.open("err")).keys()).length).toBe(0);
    });

    it("network-first falls back to cache when the network outruns networkTimeoutSeconds", async () => {
        installRuntimeCache([
            {
                match: /\/slow\//,
                strategy: "network-first",
                cacheName: "slow",
                networkTimeoutSeconds: 0.01,
            },
        ]);
        (await cacheStorage.open("slow")).store.set(
            "https://app.test/slow/a",
            new Response("cached"),
        );
        fetchMock.mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve(new Response("late")), 200)),
        );
        const res = (await dispatchFetch(new Request("https://app.test/slow/a"))) as Response;
        expect(await res.text()).toBe("cached");
    });

    it("network-first throws when there is neither network nor cache", async () => {
        installRuntimeCache([{ match: /\/nf\//, strategy: "network-first", cacheName: "nf" }]);
        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await expect(dispatchFetch(new Request("https://app.test/nf/a"))).rejects.toThrow(
            "no network and no cache",
        );
    });

    it("accepts a predicate as `match`", async () => {
        const match = vi.fn((url: URL) => url.pathname.endsWith(".woff2"));
        installRuntimeCache([{ match, strategy: "cache-first", cacheName: "fonts" }]);
        fetchMock.mockResolvedValue(new Response("font"));

        expect(await dispatchFetch(new Request("https://app.test/f/a.png"))).toBe("passthrough");
        const hit = (await dispatchFetch(new Request("https://app.test/f/a.woff2"))) as Response;
        expect(await hit.text()).toBe("font");
        expect(match).toHaveBeenCalled();
    });
});

describe("installPrecache — options and fetch edges", () => {
    function dispatchLifecycle(type: "install" | "activate"): Promise<void> {
        const waits: Promise<unknown>[] = [];
        const event = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
        for (const listener of listeners[type]) listener(event);
        return Promise.all(waits).then(() => undefined);
    }

    it("honours skipWaiting: false and navigationPreload: false", async () => {
        const enable = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(globalThis, "registration", {
            value: { navigationPreload: { enable } },
            configurable: true,
            writable: true,
        });
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "opt", urls: ["/index.html"] })),
        );
        installPrecache({ skipWaiting: false, navigationPreload: false });
        await dispatchLifecycle("install");
        await dispatchLifecycle("activate");

        expect(
            (globalThis as unknown as { skipWaiting: ReturnType<typeof vi.fn> }).skipWaiting,
        ).not.toHaveBeenCalled();
        expect(enable).not.toHaveBeenCalled();
        delete (globalThis as Record<string, unknown>).registration;
    });

    it("reads a custom manifest url and cache name", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "c1", urls: ["/index.html"] })),
        );
        installPrecache({ manifestUrl: "/pc.json", cacheName: "custom" });
        await dispatchLifecycle("install");

        expect(fetchMock).toHaveBeenCalledWith("/pc.json", { cache: "no-cache" });
        expect(await cacheStorage.keys()).toContain("custom-c1");
    });

    it("skips the navigation fallback for denylisted paths", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "dl", urls: ["/index.html"] })),
        );
        installPrecache({ navigateFallbackDenylist: [/^\/api\//] });
        await dispatchLifecycle("install");

        const nav = {
            url: "https://app.test/api/stream",
            method: "GET",
            mode: "navigate",
        } as unknown as Request;
        expect(await dispatchFetch(nav)).toBe("passthrough");
    });

    it("ignores cross-origin and non-GET requests", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "xo", urls: ["/index.html"] })),
        );
        installPrecache();
        await dispatchLifecycle("install");

        expect(await dispatchFetch(new Request("https://cdn.other/lib.js"))).toBe("passthrough");
        expect(
            await dispatchFetch(new Request("https://app.test/index.html", { method: "POST" })),
        ).toBe("passthrough");
    });

    it("serves a precached asset from the cache and refetches when it is missing", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ version: "as", urls: ["/assets/app.js"] })),
        );
        installPrecache();
        await dispatchLifecycle("install");

        const hit = (await dispatchFetch(
            new Request("https://app.test/assets/app.js"),
        )) as Response;
        expect(await hit.text()).toBe("x");

        (await cacheStorage.open("tempest-precache-as")).store.clear();
        fetchMock.mockResolvedValueOnce(new Response("from network"));
        const miss = (await dispatchFetch(
            new Request("https://app.test/assets/app.js"),
        )) as Response;
        expect(await miss.text()).toBe("from network");
    });

    it("throws on an offline navigation with no cached shell", async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version: "ns", urls: [] })));
        installPrecache();
        await dispatchLifecycle("install");
        fetchMock.mockRejectedValueOnce(new Error("offline"));

        const nav = {
            url: "https://app.test/dashboard",
            method: "GET",
            mode: "navigate",
        } as unknown as Request;
        await expect(dispatchFetch(nav)).rejects.toThrow("no cached app shell");
    });
});

describe("createPartialResponse — malformed ranges", () => {
    it("rejects a range with neither start nor end", async () => {
        const res = await createPartialResponse(
            new Request("https://app.test/v", { headers: { range: "bytes=-" } }),
            new Response("0123456789"),
        );
        expect(res.status).toBe(416);
    });

    it("rejects a syntactically invalid range header", async () => {
        const res = await createPartialResponse(
            new Request("https://app.test/v", { headers: { range: "items=1-2" } }),
            new Response("0123456789"),
        );
        expect(res.status).toBe(416);
    });

    it("clamps an end past the resource length", async () => {
        const res = await createPartialResponse(
            new Request("https://app.test/v", { headers: { range: "bytes=8-99" } }),
            new Response("0123456789"),
        );
        expect(res.headers.get("content-range")).toBe("bytes 8-9/10");
        expect(await res.text()).toBe("89");
    });
});
