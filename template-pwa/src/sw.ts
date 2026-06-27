/// <reference lib="webworker" />
import {
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
 *  2. Runtime caching for API GETs (network-first) — tweak/remove to taste.
 *  3. Precache of the app shell so the app launches offline. Reads the
 *     `precache-manifest.json` emitted by `tempestPwaManifest()` in
 *     `vite.config.ts`.
 *
 * `installRuntimeCache` is registered BEFORE `installPrecache` so its specific
 * routes win over the precache catch-all.
 */
declare const self: ServiceWorkerGlobalScope;

installPushHandler({
    defaultTitle: "Notificação",
    defaultIcon: "/icon.svg",
    defaultBadge: "/icon.svg",
});

installNotificationClickHandler();
installSkipWaitingListener();

installRuntimeCache([
    {
        match: (url) => url.pathname.startsWith("/api/"),
        strategy: "network-first",
        cacheName: "api",
        networkTimeoutSeconds: 5,
        maxEntries: 50,
        maxAgeSeconds: 60 * 5,
    },
]);

installPrecache({
    navigateFallback: "/index.html",
    // Don't serve the app shell for API navigations.
    navigateFallbackDenylist: [/^\/api\//],
});

// Take control of open pages as soon as this worker activates. `installPrecache`
// also calls `clients.claim()`; this is harmless if you drop precaching.
self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});
