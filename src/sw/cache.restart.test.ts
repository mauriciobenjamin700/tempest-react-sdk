import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CacheModuleNamespace from "./cache";

type Listener = (event: unknown) => void;
type CacheModule = typeof CacheModuleNamespace;

const ORIGIN = "https://app.test";

function keyOf(req: Request | string): string {
    return typeof req === "string" ? new URL(req, ORIGIN).href : req.url;
}

/** In-memory Cache (subset of the Cache API), keyed by request URL. */
class FakeCache {
    store = new Map<string, Response>();
    async match(req: Request | string): Promise<Response | undefined> {
        return this.store.get(keyOf(req))?.clone();
    }
    async put(req: Request | string, res: Response): Promise<void> {
        this.store.set(keyOf(req), res);
    }
    async addAll(urls: string[]): Promise<void> {
        for (const url of urls) this.store.set(keyOf(url), new Response(`cached ${url}`));
    }
    async keys(): Promise<Request[]> {
        return [...this.store.keys()].map((url) => new Request(url));
    }
    async delete(req: Request | string): Promise<boolean> {
        return this.store.delete(keyOf(req));
    }
}

/** Cache Storage that outlives every simulated worker run, as the real one does. */
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

const STUB_KEYS = ["addEventListener", "clients", "skipWaiting", "location", "caches", "fetch"];
const ORIGINAL: Record<string, unknown> = {};

let listeners: Record<string, Listener[]>;
let cacheStorage: FakeCacheStorage;
let fetchMock: ReturnType<typeof vi.fn>;

function define(key: string, value: unknown): void {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

beforeEach(() => {
    cacheStorage = new FakeCacheStorage();
    fetchMock = vi.fn();
    for (const key of STUB_KEYS) ORIGINAL[key] = (globalThis as Record<string, unknown>)[key];
    define("clients", { claim: vi.fn().mockResolvedValue(undefined) });
    define("skipWaiting", vi.fn().mockResolvedValue(undefined));
    define("location", { origin: ORIGIN });
    define("caches", cacheStorage);
    define("fetch", fetchMock);
});

afterEach(() => {
    for (const key of STUB_KEYS) {
        if (ORIGINAL[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
        else define(key, ORIGINAL[key]);
    }
    vi.restoreAllMocks();
});

/**
 * Start a fresh worker run: the browser re-evaluates `sw.js` from the top with
 * the same Cache Storage, and only the events of this run reach the new
 * listeners. `install` is not repeated on a restart.
 */
async function bootWorker(
    setup: (mod: CacheModule) => void = (mod) => mod.installPrecache(),
): Promise<void> {
    listeners = { install: [], activate: [], fetch: [] };
    define("addEventListener", (name: string, listener: Listener) => {
        (listeners[name] ??= []).push(listener);
    });
    vi.resetModules();
    setup(await import("./cache"));
}

function lifecycle(type: "install" | "activate"): Promise<void> {
    const waits: Promise<unknown>[] = [];
    const event = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
    for (const listener of listeners[type]) listener(event);
    return Promise.all(waits).then(() => undefined);
}

/**
 * Dispatch a fetch event through every listener, as the browser does. A second
 * `respondWith` throws `InvalidStateError`, which is what a real worker does.
 */
async function dispatchFetch(request: Request): Promise<Response | "passthrough"> {
    let produced: Promise<Response> | Response | undefined;
    const event = {
        request,
        respondWith: (r: Response | Promise<Response>) => {
            if (produced !== undefined)
                throw new DOMException("already responded", "InvalidStateError");
            produced = r;
        },
        waitUntil: () => undefined,
    };
    for (const listener of listeners.fetch) listener(event);
    if (produced === undefined) return "passthrough";
    return produced;
}

function navigation(path: string): Request {
    return { url: `${ORIGIN}${path}`, method: "GET", mode: "navigate" } as unknown as Request;
}

function manifest(version: string, urls: string[]): Response {
    return new Response(JSON.stringify({ version, urls }));
}

async function installAndActivate(version: string, urls: string[]): Promise<void> {
    await bootWorker();
    fetchMock.mockResolvedValueOnce(manifest(version, urls));
    await lifecycle("install");
    await lifecycle("activate");
}

describe("installPrecache — after the browser restarts the worker (#572)", () => {
    it("serves the cached app shell to an offline navigation in a run that never saw install", async () => {
        await installAndActivate("v1", ["/index.html", "/assets/app.js"]);

        await bootWorker();
        fetchMock.mockRejectedValue(new TypeError("offline"));
        const res = (await dispatchFetch(navigation("/dashboard"))) as Response;

        expect(await res.text()).toBe("cached /index.html");
    });

    it("serves precached assets from the cache, not the network, after a restart", async () => {
        await installAndActivate("v1", ["/index.html", "/assets/app.js"]);

        await bootWorker();
        fetchMock.mockReset();
        const first = (await dispatchFetch(new Request(`${ORIGIN}/assets/app.js`))) as Response;
        const second = (await dispatchFetch(new Request(`${ORIGIN}/assets/app.js`))) as Response;

        expect(await first.text()).toBe("cached /assets/app.js");
        expect(await second.text()).toBe("cached /assets/app.js");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("leaves a non-precached request to the network once the precache is known", async () => {
        await installAndActivate("v1", ["/index.html"]);

        await bootWorker();
        await dispatchFetch(new Request(`${ORIGIN}/index.html`));
        expect(await dispatchFetch(new Request(`${ORIGIN}/other.json`))).toBe("passthrough");
    });

    it("answers a non-precached request from the network while the precache is still being read", async () => {
        await installAndActivate("v1", ["/index.html"]);

        await bootWorker();
        fetchMock.mockResolvedValueOnce(new Response("from network"));
        const res = (await dispatchFetch(new Request(`${ORIGIN}/other.json`))) as Response;

        expect(await res.text()).toBe("from network");
    });

    it("keeps serving its own version while a newer worker is installed and waiting", async () => {
        await installAndActivate("v1", ["/index.html"]);

        await bootWorker();
        fetchMock.mockResolvedValueOnce(manifest("v2", ["/index.html"]));
        await lifecycle("install");
        (await cacheStorage.open("tempest-precache-v2")).store.set(
            `${ORIGIN}/index.html`,
            new Response("v2 shell"),
        );

        await bootWorker();
        fetchMock.mockRejectedValue(new TypeError("offline"));
        const res = (await dispatchFetch(navigation("/"))) as Response;

        expect(await res.text()).toBe("cached /index.html");
        expect(await cacheStorage.keys()).toEqual(
            expect.arrayContaining(["tempest-precache-v1", "tempest-precache-v2"]),
        );
    });

    it("keeps the new version and drops the old one when the waiting worker activates in a later run", async () => {
        await installAndActivate("v1", ["/index.html"]);

        await bootWorker();
        fetchMock.mockResolvedValueOnce(manifest("v2", ["/index.html", "/assets/v2.js"]));
        await lifecycle("install");

        await bootWorker();
        await lifecycle("activate");

        expect(await cacheStorage.keys()).toEqual(["tempest-precache-v2"]);
        fetchMock.mockReset();
        const res = (await dispatchFetch(new Request(`${ORIGIN}/assets/v2.js`))) as Response;
        expect(await res.text()).toBe("cached /assets/v2.js");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never deletes a precache on activate when it cannot tell which one is current", async () => {
        await cacheStorage.open("tempest-precache-a");
        await cacheStorage.open("tempest-precache-b");

        await bootWorker();
        await lifecycle("activate");

        expect(await cacheStorage.keys()).toEqual(["tempest-precache-a", "tempest-precache-b"]);
    });

    it("lets a runtime route win a precached path without a second respondWith", async () => {
        await installAndActivate("v1", ["/index.html", "/api/config.json"]);

        await bootWorker((mod) => {
            mod.installRuntimeCache([
                { match: /\/api\//, strategy: "network-first", cacheName: "tempest-api" },
            ]);
            mod.installPrecache();
        });
        fetchMock.mockResolvedValueOnce(new Response("fresh config"));
        const res = (await dispatchFetch(new Request(`${ORIGIN}/api/config.json`))) as Response;

        expect(await res.text()).toBe("fresh config");
    });

    it("lets a runtime route win a precached path in the run that installed it", async () => {
        await bootWorker((mod) => {
            mod.installRuntimeCache([
                { match: /\/api\//, strategy: "network-first", cacheName: "tempest-api" },
            ]);
            mod.installPrecache();
        });
        fetchMock.mockResolvedValueOnce(manifest("v1", ["/index.html", "/api/config.json"]));
        await lifecycle("install");
        await lifecycle("activate");
        fetchMock.mockResolvedValueOnce(new Response("fresh config"));

        const res = (await dispatchFetch(new Request(`${ORIGIN}/api/config.json`))) as Response;

        expect(await res.text()).toBe("fresh config");
    });
});

describe("installPrecache — unreadable precache state", () => {
    it("treats a corrupted state entry as no recorded version and deletes nothing on activate", async () => {
        const cache = await cacheStorage.open("tempest-precache-x");
        await cache.put(`${ORIGIN}/__tempest-precache-state__`, new Response("not json"));
        await cacheStorage.open("tempest-precache-y");

        await bootWorker();
        await lifecycle("activate");

        expect(await cacheStorage.keys()).toEqual(["tempest-precache-x", "tempest-precache-y"]);
    });

    it("falls back to the network when Cache Storage cannot be read after a restart", async () => {
        await installAndActivate("v1", ["/index.html"]);

        await bootWorker();
        vi.spyOn(cacheStorage, "keys").mockRejectedValueOnce(new Error("storage gone"));
        fetchMock.mockResolvedValueOnce(new Response("from network"));
        const res = (await dispatchFetch(new Request(`${ORIGIN}/index.html`))) as Response;

        expect(await res.text()).toBe("from network");
    });
});
