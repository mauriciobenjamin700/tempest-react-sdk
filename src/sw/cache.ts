/**
 * @tempest-limits file-lines — precache, runtime strategies (cache-first, network-
 * first, stale-while-revalidate), expiry and the inspect/clear helpers all address
 * the same Cache Storage namespace, and the naming scheme that keeps them from
 * evicting each other is the file's whole contract.
 */
/**
 * Service-worker caching helpers — a small, dependency-free subset of what
 * Workbox provides: precaching of the build's app shell (so the app launches
 * offline) plus runtime caching strategies for fonts, APIs and images.
 *
 * Import these inside your own `sw.ts`. They run in the service-worker global
 * scope, not the main thread. Pair `installPrecache` with the
 * `tempestPwaManifest()` Vite plugin (from `tempest-react-sdk/vite`), which
 * emits the `precache-manifest.json` this reads at install time.
 *
 * @example
 *   /// <reference lib="webworker" />
 *   import { installRuntimeCache, installPrecache } from "tempest-react-sdk/sw";
 *
 *   // Register specific routes FIRST so they win over the precache catch-all.
 *   installRuntimeCache([
 *     { match: /\/api\//, strategy: "network-first", cacheName: "tempest-api", maxAgeSeconds: 300 },
 *   ]);
 *   installPrecache();
 */

/** Minimal shape of the events we touch, to avoid pulling in `lib.webworker`. */
interface ExtendableEventLike {
    waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
    request: Request;
    respondWith(response: Response | Promise<Response>): void;
    /** Resolves to the navigation-preload response when it is enabled, else `undefined`. */
    preloadResponse?: Promise<Response | undefined>;
}

/** Minimal shape of `registration.navigationPreload` (Navigation Preload API). */
interface NavigationPreloadManagerLike {
    enable(): Promise<void>;
    disable(): Promise<void>;
}

interface CacheSwGlobal {
    addEventListener(type: "install", listener: (event: ExtendableEventLike) => void): void;
    addEventListener(type: "activate", listener: (event: ExtendableEventLike) => void): void;
    addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
    clients: { claim(): Promise<void> };
    skipWaiting(): Promise<void>;
    location: { origin: string };
    registration?: { navigationPreload?: NavigationPreloadManagerLike };
}

function getSwScope(): CacheSwGlobal {
    return globalThis as unknown as CacheSwGlobal;
}

/** Caching strategy for a runtime route. Mirrors the common Workbox trio. */
export type RuntimeStrategy = "cache-first" | "network-first" | "stale-while-revalidate";

/** A single runtime-caching rule, matched against each `GET` request. */
export interface RuntimeRoute {
    /** A `RegExp` tested against the full URL, or a predicate over the parsed URL. */
    match: RegExp | ((url: URL, request: Request) => boolean);
    /** How to resolve a match. */
    strategy: RuntimeStrategy;
    /** Cache bucket name for this route. */
    cacheName: string;
    /** Trim the cache to at most this many entries (FIFO) after each write. */
    maxEntries?: number;
    /** Treat a cached response older than this (seconds) as a miss. */
    maxAgeSeconds?: number;
    /** For `network-first`: fall back to cache after this timeout (seconds). */
    networkTimeoutSeconds?: number;
    /**
     * Serve HTTP `Range` requests (206 Partial Content) by slicing the cached
     * full response. Enable for audio/video so seeking works offline. The full
     * resource is cached once (the `Range` header is stripped before caching).
     */
    rangeRequests?: boolean;
    /**
     * Opt in to caching requests that carry an `Authorization` header, and
     * responses marked `Cache-Control: private`. Default `false`.
     *
     * Cache Storage is keyed by URL and outlives the session: without this
     * gate, a `GET /api/me` stored for one account was served to the next
     * account on the same browser whenever the network failed or exceeded
     * `networkTimeoutSeconds` (reproduced in Chromium 153, 11/10/2026). With
     * the default, authenticated requests bypass the route entirely and reach
     * the network as if no service worker were installed.
     *
     * When enabled, every stored entry gets `Vary: Authorization` appended, so
     * the Cache API only matches it for the same bearer — another account (or no
     * account) misses instead of reading it. A token rotated while online simply
     * repopulates the entry. Pair it with `clearSessionData()` on logout, which
     * removes the entries themselves. `Cache-Control: no-store` is never cached,
     * opt-in or not.
     */
    cacheAuthenticated?: boolean;
}

/** Options for {@link installPrecache}. */
export interface InstallPrecacheOptions {
    /** URL of the manifest emitted by `tempestPwaManifest()`. Default `/precache-manifest.json`. */
    manifestUrl?: string;
    /** Cache name prefix; the manifest `version` is appended. Default `tempest-precache`. */
    cacheName?: string;
    /** App-shell document served for navigation requests offline. Default `/index.html`. */
    navigateFallback?: string;
    /** Navigation paths that should NOT use the fallback (e.g. `[/^\/api\//]`). */
    navigateFallbackDenylist?: RegExp[];
    /** Activate the new worker immediately after precaching. Default `true`. */
    skipWaiting?: boolean;
    /**
     * Enable the Navigation Preload API on `activate`, so the browser fetches
     * the navigation request in parallel with the worker boot and the handler
     * serves `event.preloadResponse` — cutting first-navigation latency after
     * the worker starts. Silently ignored where unsupported. Default `true`.
     */
    navigationPreload?: boolean;
}

interface PrecacheManifest {
    version: string;
    urls: string[];
}

let precacheName = "";
const precachedPaths = new Set<string>();

/**
 * Header stamped on every runtime-cache entry with the epoch milliseconds of the
 * write. `Date` alone is not enough: it is not a CORS-safelisted response
 * header, so for a cross-origin API the worker reads `null` and `maxAgeSeconds`
 * would never expire anything.
 */
const CACHED_AT_HEADER = "x-tempest-cached-at";

/**
 * Whether a cached response has aged past `maxAgeSeconds`. Reads the
 * {@link CACHED_AT_HEADER} stamp written by the runtime cache, and falls back to
 * `Date` for entries written before the stamp existed.
 */
function isExpired(response: Response, maxAgeSeconds?: number): boolean {
    if (!maxAgeSeconds) return false;
    const stamp = Number(response.headers.get(CACHED_AT_HEADER));
    const dateHeader = response.headers.get("date");
    const storedAt = stamp > 0 ? stamp : dateHeader ? new Date(dateHeader).getTime() : NaN;
    if (Number.isNaN(storedAt)) return false;
    return (Date.now() - storedAt) / 1000 > maxAgeSeconds;
}

/** The `Cache-Control` directives of a response, lower-cased. */
function cacheControlDirectives(response: Response): string[] {
    return (response.headers.get("cache-control") ?? "")
        .toLowerCase()
        .split(",")
        .map((directive) => directive.trim().split("=")[0]);
}

/**
 * Whether a network response may be written to the route's cache: it must be
 * `ok`, never `no-store`, and `private` only under `cacheAuthenticated`.
 */
function isStorable(response: Response, route: RuntimeRoute): boolean {
    if (!response.ok) return false;
    const directives = cacheControlDirectives(response);
    if (directives.includes("no-store")) return false;
    return route.cacheAuthenticated === true || !directives.includes("private");
}

/**
 * Write a response to the route's cache with the {@link CACHED_AT_HEADER} stamp
 * and, under `cacheAuthenticated`, `Vary: Authorization` appended so the entry
 * only matches the bearer that produced it. Skips responses that
 * {@link isStorable} rejects, then trims the cache to `maxEntries`.
 */
async function store(
    cache: Cache,
    request: Request,
    response: Response,
    route: RuntimeRoute,
): Promise<void> {
    if (!isStorable(response, route)) return;
    const headers = new Headers(response.headers);
    headers.set(CACHED_AT_HEADER, String(Date.now()));
    if (route.cacheAuthenticated) {
        const vary = headers.get("vary");
        const varies = (vary ?? "")
            .toLowerCase()
            .split(",")
            .map((name) => name.trim());
        if (!varies.includes("authorization") && !varies.includes("*")) {
            headers.set("vary", vary ? `${vary}, Authorization` : "Authorization");
        }
    }
    const copy = response.clone();
    await cache.put(
        request,
        new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers }),
    );
    await trimCache(route.cacheName, route.maxEntries);
}

/** Drop oldest entries until the cache holds at most `maxEntries`. */
async function trimCache(cacheName: string, maxEntries?: number): Promise<void> {
    if (!maxEntries) return;
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    for (const key of keys.slice(0, keys.length - maxEntries)) {
        await cache.delete(key);
    }
}

async function cacheFirst(request: Request, route: RuntimeRoute): Promise<Response> {
    const cache = await caches.open(route.cacheName);
    const cached = await cache.match(request);
    if (cached && !isExpired(cached, route.maxAgeSeconds)) return cached;

    const response = await fetch(request);
    await store(cache, request, response, route);
    return response;
}

async function networkFirst(request: Request, route: RuntimeRoute): Promise<Response> {
    const cache = await caches.open(route.cacheName);

    const network = (async (): Promise<Response> => {
        const response = await fetch(request);
        await store(cache, request, response, route);
        return response;
    })();

    const timeoutMs = (route.networkTimeoutSeconds ?? 0) * 1000;
    try {
        if (timeoutMs > 0) {
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("network-timeout")), timeoutMs),
            );
            return await Promise.race([network, timeout]);
        }
        return await network;
    } catch {
        const cached = await cache.match(request);
        if (cached && !isExpired(cached, route.maxAgeSeconds)) return cached;
        throw new Error("network-first: no network and no cache");
    }
}

async function staleWhileRevalidate(request: Request, route: RuntimeRoute): Promise<Response> {
    const cache = await caches.open(route.cacheName);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then(async (response) => {
            await store(cache, request, response, route);
            return response;
        })
        .catch(() => undefined);

    const fresh = cached && !isExpired(cached, route.maxAgeSeconds) ? cached : undefined;
    if (fresh) return fresh;
    const response = await network;
    if (response) return response;
    throw new Error("stale-while-revalidate: no network and no cache");
}

function runRoute(request: Request, route: RuntimeRoute): Promise<Response> {
    switch (route.strategy) {
        case "cache-first":
            return cacheFirst(request, route);
        case "network-first":
            return networkFirst(request, route);
        case "stale-while-revalidate":
            return staleWhileRevalidate(request, route);
    }
}

function routeMatches(route: RuntimeRoute, url: URL, request: Request): boolean {
    return typeof route.match === "function"
        ? route.match(url, request)
        : route.match.test(url.href);
}

/**
 * Build a `206 Partial Content` response from a full one for an HTTP `Range`
 * request. Supports `bytes=start-end`, open-ended `bytes=start-` and suffix
 * `bytes=-suffixLength` (the last N bytes). Returns the original response when there is no usable
 * `Range` header, or a `416` when the range is unsatisfiable.
 *
 * @param request The incoming request (its `Range` header drives the slice).
 * @param response The full (200) response to slice.
 */
export async function createPartialResponse(
    request: Request,
    response: Response,
): Promise<Response> {
    const rangeHeader = request.headers.get("range");
    if (!rangeHeader) return response;

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (match[1] === "" && match[2] === "")) {
        return new Response(null, { status: 416, statusText: "Range Not Satisfiable" });
    }

    const buffer = await response.clone().arrayBuffer();
    const total = buffer.byteLength;

    let start: number;
    let end: number;
    if (match[1] === "") {
        const suffix = Number(match[2]);
        start = Math.max(0, total - suffix);
        end = total - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
    }

    if (start > end || start >= total) {
        return new Response(null, {
            status: 416,
            statusText: "Range Not Satisfiable",
            headers: { "Content-Range": `bytes */${total}` },
        });
    }

    const slice = buffer.slice(start, end + 1);
    const headers = new Headers(response.headers);
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(slice.byteLength));
    headers.set("Accept-Ranges", "bytes");

    return new Response(slice, {
        status: 206,
        statusText: "Partial Content",
        headers,
    });
}

/**
 * Install a `fetch` handler that resolves matching `GET` requests with the
 * given runtime strategies. Non-matching requests are left untouched (no
 * `respondWith`), so a later {@link installPrecache} can handle them.
 *
 * A request carrying `Authorization` is also left untouched unless its route
 * sets `cacheAuthenticated`, and a response with `Cache-Control: no-store`
 * (or `private`, without that opt-in) is served but never stored. `maxAgeSeconds`
 * applies to every read, including the offline fallback: an expired entry is a
 * miss, never a last resort. Under `rangeRequests`, the full resource is cached
 * once (the `Range` header stripped) and each range is sliced from it.
 *
 * Register this BEFORE `installPrecache` so specific routes win over the
 * precache catch-all.
 *
 * @param routes Ordered rules; the first whose `match` passes handles the request.
 */
export function installRuntimeCache(routes: RuntimeRoute[]): void {
    const sw = getSwScope();
    sw.addEventListener("fetch", (event) => {
        const request = event.request;
        if (request.method !== "GET") return;

        const url = new URL(request.url);
        const route = routes.find((candidate) => routeMatches(candidate, url, request));
        if (!route) return;
        if (!route.cacheAuthenticated && request.headers.has("authorization")) return;

        if (route.rangeRequests && request.headers.has("range")) {
            const full = new Request(request.url, {
                headers: stripRange(request.headers),
                credentials: request.credentials,
                mode: request.mode === "navigate" ? "same-origin" : request.mode,
            });
            event.respondWith(
                runRoute(full, route).then((response) => createPartialResponse(request, response)),
            );
            return;
        }

        event.respondWith(runRoute(request, route));
    });
}

/** Copy headers without the `Range` header (so the cached entry is the full file). */
function stripRange(headers: Headers): Headers {
    const out = new Headers(headers);
    out.delete("range");
    return out;
}

/**
 * Precache the app shell at `install` and serve it offline:
 *  - reads `precache-manifest.json` (emitted by `tempestPwaManifest()`),
 *  - caches every listed URL under a versioned cache,
 *  - on `activate`, deletes stale precache versions and claims open clients,
 *  - on `fetch`, serves precached assets cache-first and falls back to the
 *    `navigateFallback` document for offline navigations (SPA routing).
 *
 * Same-origin only. Register this LAST, after any {@link installRuntimeCache}.
 */
export function installPrecache(options: InstallPrecacheOptions = {}): void {
    const sw = getSwScope();
    const {
        manifestUrl = "/precache-manifest.json",
        cacheName = "tempest-precache",
        navigateFallback = "/index.html",
        navigateFallbackDenylist = [],
        skipWaiting = true,
        navigationPreload = true,
    } = options;

    sw.addEventListener("install", (event) => {
        event.waitUntil(
            (async () => {
                const response = await fetch(manifestUrl, { cache: "no-cache" });
                const manifest = (await response.json()) as PrecacheManifest;
                precacheName = `${cacheName}-${manifest.version}`;

                const cache = await caches.open(precacheName);
                await cache.addAll(manifest.urls);
                for (const url of manifest.urls) {
                    precachedPaths.add(new URL(url, sw.location.origin).pathname);
                }
                if (skipWaiting) await sw.skipWaiting();
            })(),
        );
    });

    sw.addEventListener("activate", (event) => {
        event.waitUntil(
            (async () => {
                const keys = await caches.keys();
                await Promise.all(
                    keys
                        .filter((key) => key.startsWith(`${cacheName}-`) && key !== precacheName)
                        .map((key) => caches.delete(key)),
                );
                if (navigationPreload && sw.registration?.navigationPreload) {
                    await sw.registration.navigationPreload.enable();
                }
                await sw.clients.claim();
            })(),
        );
    });

    sw.addEventListener("fetch", (event) => {
        const request = event.request;
        if (request.method !== "GET") return;

        const url = new URL(request.url);
        if (url.origin !== sw.location.origin) return;

        // SPA navigations: serve the cached app shell when offline.
        if (request.mode === "navigate") {
            if (navigateFallbackDenylist.some((re) => re.test(url.pathname))) return;
            event.respondWith(
                (async () => {
                    try {
                        const preloaded = await event.preloadResponse;
                        if (preloaded) return preloaded;
                        return await fetch(request);
                    } catch {
                        const cache = await caches.open(precacheName);
                        const shell = await cache.match(navigateFallback);
                        if (shell) return shell;
                        throw new Error("offline and no cached app shell");
                    }
                })(),
            );
            return;
        }

        // Precached static assets: cache-first.
        if (precachedPaths.has(url.pathname)) {
            event.respondWith(
                (async () => {
                    const cache = await caches.open(precacheName);
                    const cached = await cache.match(request);
                    return cached ?? fetch(request);
                })(),
            );
        }
    });
}
