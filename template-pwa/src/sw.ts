/// <reference lib="webworker" />
import {
    installBackgroundSync,
    installNotificationClickHandler,
    installPrecache,
    installPushHandler,
    installRuntimeCache,
    installSkipWaitingListener,
} from "tempest-react-sdk/sw";

/**
 * Service worker. Bundled to `dist/sw.js` by `vite.sw.config.ts` (see the
 * `build:sw` script) and registered from `src/main.tsx`.
 *
 * Layers, in order:
 *  1. Push + notifications + skip-waiting (the SDK push helpers).
 *  2. Background sync — failed POST/PUT/PATCH/DELETE to `/api` are queued and
 *     replayed online. Credential headers are never stored; on replay the
 *     worker asks the page for the current ones (`provideBackgroundSyncCredentials`
 *     in the page, next to your auth).
 *  3. Runtime caching: API GETs (network-first) + media (cache-first with
 *     Range support, so audio/video seeking works offline). Requests carrying
 *     `Authorization` bypass the cache unless the route sets
 *     `cacheAuthenticated: true`.
 *  4. Precache of the app shell so the app launches offline (API navigations
 *     excluded). Reads the `precache-manifest.json` emitted by
 *     `tempestPwaManifest()` in `vite.config.ts`.
 *
 * Cache names carry the `tempest-` prefix so `inspectCaches({ filter: "tempest-" })`
 * reports them. On logout, call `clearSessionData()` from the page: it drops
 * the runtime caches and the background-sync queue, keeping the precache.
 *
 * `installRuntimeCache` is registered BEFORE `installPrecache` so its specific
 * routes win over the precache catch-all. The trailing `activate` listener takes
 * control of open pages as soon as this worker activates; `installPrecache`
 * also calls `clients.claim()`, so it is harmless and stays useful if you drop
 * precaching.
 */
declare const self: ServiceWorkerGlobalScope;

installPushHandler({
    defaultTitle: "Notificação",
    defaultIcon: "/icon.svg",
    defaultBadge: "/icon.svg",
});

installNotificationClickHandler();
installSkipWaitingListener();

installBackgroundSync({ match: (url) => url.pathname.startsWith("/api/") });

installRuntimeCache([
    {
        match: (url) => url.pathname.startsWith("/api/"),
        strategy: "network-first",
        cacheName: "tempest-api",
        networkTimeoutSeconds: 5,
        maxEntries: 50,
        maxAgeSeconds: 60 * 5,
    },
    {
        match: (url) => /\.(mp3|mp4|webm|ogg|wav)$/.test(url.pathname),
        strategy: "cache-first",
        cacheName: "tempest-media",
        maxEntries: 20,
        rangeRequests: true,
    },
]);

installPrecache({
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});
