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
 *     { match: /\/api\//, strategy: "network-first", cacheName: "api", maxAgeSeconds: 300 },
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
}

interface CacheSwGlobal {
    addEventListener(type: "install", listener: (event: ExtendableEventLike) => void): void;
    addEventListener(type: "activate", listener: (event: ExtendableEventLike) => void): void;
    addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
    clients: { claim(): Promise<void> };
    skipWaiting(): Promise<void>;
    location: { origin: string };
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
}

interface PrecacheManifest {
    version: string;
    urls: string[];
}

let precacheName = "";
const precachedPaths = new Set<string>();

/** Whether a cached response has aged past `maxAgeSeconds` (best-effort, via `Date`). */
function isExpired(response: Response, maxAgeSeconds?: number): boolean {
    if (!maxAgeSeconds) return false;
    const dateHeader = response.headers.get("date");
    if (!dateHeader) return false;
    const age = (Date.now() - new Date(dateHeader).getTime()) / 1000;
    return age > maxAgeSeconds;
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
    if (response.ok) {
        await cache.put(request, response.clone());
        await trimCache(route.cacheName, route.maxEntries);
    }
    return response;
}

async function networkFirst(request: Request, route: RuntimeRoute): Promise<Response> {
    const cache = await caches.open(route.cacheName);

    const network = (async (): Promise<Response> => {
        const response = await fetch(request);
        if (response.ok) {
            await cache.put(request, response.clone());
            await trimCache(route.cacheName, route.maxEntries);
        }
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
        if (cached) return cached;
        throw new Error("network-first: no network and no cache");
    }
}

async function staleWhileRevalidate(request: Request, route: RuntimeRoute): Promise<Response> {
    const cache = await caches.open(route.cacheName);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then(async (response) => {
            if (response.ok) {
                await cache.put(request, response.clone());
                await trimCache(route.cacheName, route.maxEntries);
            }
            return response;
        })
        .catch(() => undefined);

    if (cached && !isExpired(cached, route.maxAgeSeconds)) return cached;
    const response = await network;
    if (response) return response;
    if (cached) return cached;
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
 * `bytes=-suffixLength`. Returns the original response when there is no usable
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
        // Suffix range: last N bytes.
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

        if (route.rangeRequests && request.headers.has("range")) {
            // Cache/serve the FULL resource once (no Range), then slice it.
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
