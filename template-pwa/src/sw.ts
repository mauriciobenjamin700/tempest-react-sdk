/// <reference lib="webworker" />
import {
    installNotificationClickHandler,
    installPushHandler,
    installSkipWaitingListener,
} from "tempest-react-sdk/sw";

/**
 * Service worker. Bundled to `dist/sw.js` by `vite.sw.config.ts` (see the
 * `build:sw` script) and registered from `src/main.tsx`.
 *
 * The three SDK helpers wire the boilerplate:
 *  - `installPushHandler` parses the `push` payload (JSON, plain-text fallback)
 *    and shows a notification.
 *  - `installNotificationClickHandler` focuses an open tab on click, or opens a
 *    new one at the payload's `url`.
 *  - `installSkipWaitingListener` activates a waiting worker when the page posts
 *    `{ type: "SKIP_WAITING" }` (paired with `registerServiceWorker`'s
 *    `onUpdate` in `main.tsx`).
 */
declare const self: ServiceWorkerGlobalScope;

installPushHandler({
    defaultTitle: "Notificação",
    defaultIcon: "/icon.svg",
    defaultBadge: "/icon.svg",
});

installNotificationClickHandler();
installSkipWaitingListener();

// Take control of open pages as soon as this worker activates.
self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});
