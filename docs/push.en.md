# Web Push + Service Worker

Browser push notifications have two halves that talk to each other: the **main thread** (your UI asks for permission and creates the subscription) and the **worker thread** (the service worker receives the push and draws the notification, even with the tab closed). The `push` module of `tempest-react-sdk` covers both halves — the browser side (permission, `pushManager.subscribe`, `notificationclick`) belongs to the SDK; the persistence endpoints and the push delivery belong to your app, through callbacks.

> Editable diagram: [push-flow.drawio](./diagrams/push-flow.drawio) (open it in [draw.io](https://app.diagrams.net)).

## How Web Push works (the 30-second view)

1. The app asks the user for **permission** (`Notification.requestPermission()`).
2. Once granted, the browser creates a **`PushSubscription`** signed with your **VAPID public** key.
3. The app sends the subscription JSON to **your backend**, which stores it.
4. Later, the backend uses the **VAPID private** key to send a push to the subscription's endpoint.
5. The **service worker** wakes up on the `push` event, reads the payload, and calls `showNotification`.

The SDK gives you steps 1–3 (and the step-5 handlers); steps 3 (storage) and 4 (delivery) are the backend's responsibility.

!!! info "What VAPID is, in one sentence"
    VAPID (_Voluntary Application Server Identification_) is a key pair (public +
    private) that identifies your server to the browser's push service. The
    **public** one goes in the front end (`VITE_VAPID_PUBLIC_KEY`); the
    **private** one stays on the backend and is never exposed. Generate the pair
    once with `npx web-push generate-vapid-keys`.

## Prerequisites

1. A backend that stores `PushSubscriptionJSON` and sends notifications via web-push (VAPID).
2. A registered service worker (`vite-plugin-pwa`, `registerServiceWorker`, or `navigator.serviceWorker.register`).
3. A `VITE_VAPID_PUBLIC_KEY` variable in the front end (the URL-safe base64 VAPID public key).

!!! warning "The hook does NOT register the service worker"
    `usePushSubscription` assumes the SW is already registered and uses
    `navigator.serviceWorker.ready` by default. Register the SW yourself (step
    below) — or pass `getRegistration` to reuse your own registration. Without a
    registered SW, `subscribe()` never resolves.

## Main-thread

### Register the SW

```ts
import { registerServiceWorker, skipWaiting } from "tempest-react-sdk";

registerServiceWorker({
  url: "/sw.js",
  onUpdate: (waiting) => {
    if (confirm("New version available. Reload?")) {
      skipWaiting(waiting);
      window.location.reload();
    }
  },
});
```

!!! tip "Auto-update (no `vite-plugin-pwa`)"
    If you'd rather have every deploy reach the user on its own — no "reload?" prompt — turn on `autoUpdate`. The helper then calls `registration.update()` on an interval (`updateIntervalMs`, default 1h) and reloads the page as soon as a new worker takes control (`controllerchange`), guarded against reload loops. It's the `vite-plugin-pwa` auto-update behaviour, implemented directly on `navigator.serviceWorker` with no dependency on it:

    ```ts
    import { registerServiceWorker } from "tempest-react-sdk";

    registerServiceWorker({
      url: "/sw.js",
      autoUpdate: true, // poll + reload on controllerchange
      updateIntervalMs: 60 * 60 * 1000, // 1h (default)
      reloadOnActivate: true, // default; set `false` to only poll
    });
    ```

    Set `reloadOnActivate: false` when you want to keep polling but control the reload yourself (e.g. show a toast first).

### Subscribe the user (with the hook)

```tsx
import { usePushSubscription, Button } from "tempest-react-sdk";

const push = usePushSubscription({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
  onUnsubscribe: () => api.delete("/webpush/my"),
});

<Button loading={push.loading} onClick={() => push.subscribe()}>
  {push.subscribed ? "Unsubscribe" : "Receive notifications"}
</Button>;
```

The hook exposes `supported`, `permission`, `subscribed`, `loading`, `error`, `subscribe()`, `unsubscribe()`, and `refresh()`. Imperative version: `WebPushClient`. Typed errors: `WebPushUnsupportedError`, `WebPushPermissionDeniedError`.

### Permission and subscription flow (complete example)

This component shows the full lifecycle state — unsupported, permission denied, subscribed, toggle — and handles the permission-denied error:

```tsx
import { usePushSubscription, WebPushPermissionDeniedError, Button } from "tempest-react-sdk";
import { api } from "./api";

export function PushToggle() {
  const push = usePushSubscription({
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
    onUnsubscribe: () => api.delete("/webpush/my"),
  });

  // 1. Browser without support (iOS Safari outside a PWA, old browsers)
  if (!push.supported) {
    return <p>Notifications are not supported in this browser.</p>;
  }

  // 2. User blocked it in the browser settings
  if (push.permission === "denied") {
    return <p>Notification permission blocked. Allow it in the browser settings.</p>;
  }

  async function handleSubscribe() {
    try {
      await push.subscribe();
    } catch (err) {
      if (err instanceof WebPushPermissionDeniedError) {
        alert("You need to allow notifications to receive them.");
      }
    }
  }

  // 3. Toggle the subscription
  return (
    <Button
      loading={push.loading}
      onClick={() => (push.subscribed ? push.unsubscribe() : handleSubscribe())}
    >
      {push.subscribed ? "Unsubscribe" : "Receive notifications"}
    </Button>
  );
}
```

### Imperative version — `WebPushClient`

When you need the flow outside React (a vanilla button, a setup script), use the class directly:

```ts
import { WebPushClient } from "tempest-react-sdk";

const client = new WebPushClient({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => fetch("/webpush/subscribe", { method: "POST", body: JSON.stringify(sub) }),
});

if (WebPushClient.isSupported()) {
  await client.subscribe(); // asks for permission + creates subscription + calls onSubscribe
}
```

## Worker-thread (`sw.ts`)

Inside **your** service worker, import the handlers from the `tempest-react-sdk/sw` subpath:

```ts
/// <reference lib="webworker" />
import {
  installPushHandler,
  installNotificationClickHandler,
  installSkipWaitingListener,
} from "tempest-react-sdk/sw";

installSkipWaitingListener();

installPushHandler({
  defaultTitle: "Tempest",
  defaultIcon: "/icons/Logo.png",
  transform: (payload) => (payload.tag === "silent-ping" ? null : payload),
});

installNotificationClickHandler();
```

!!! tip "Import from `tempest-react-sdk/sw`, not the root barrel"
    The worker helpers have a dedicated subpath: `tempest-react-sdk/sw`. It is
    **pure and React-free** — importing from it keeps your `sw.ts` bundle tiny
    (~1 KB) and stops the SDK's component graph from leaking into the worker
    scope. Importing from the root barrel (`tempest-react-sdk`) also works thanks
    to tree-shaking, but the subpath is the bulletproof way. It's exactly what
    [`create-tempest-app --pwa`](./scaffold.md#pwa-mode-pwa) generates.

`installPushHandler` tries `event.data.json()` and falls back to `event.data.text()`. Use `transform` to suppress (`null`) or enrich notifications.

`installNotificationClickHandler` focuses the existing client when the URL matches, or opens a new window.

!!! tip "Offline caching lives in the same module"
    `tempest-react-sdk/sw` also exports `installPrecache` (offline app shell) and
    `installRuntimeCache` (per-route caching: cache-first / network-first /
    stale-while-revalidate). Together with the `tempestPwaManifest()` plugin from
    `tempest-react-sdk/vite`, they reach parity with `vite-plugin-pwa` for the
    common case — with no new dependency. It's what
    [`create-tempest-app --pwa`](./scaffold.md#pwa-mode-pwa) wires for you.

!!! tip "`urlBase64ToUint8Array` and `isPushSupported` are exported"
    You rarely call them by hand — `WebPushClient` already uses both internally
    (`applicationServerKey` requires a `Uint8Array`, not the base64 string).
    They're in the barrel for anyone who needs a support check outside the hook
    (`isPushSupported()`) or a fully custom subscription flow.

## Compatibility

- iOS Safari only works when the app is installed as a PWA (Add to Home Screen).
- `usePushSubscription` exposes `supported` — hide the toggle when `false`.

## Recap

- **VAPID**: public in the front end, private on the backend only. Generate it once with `web-push`.
- **You register the SW**; the hook only subscribes/unsubscribes over a ready registration.
- **`usePushSubscription`** gives you all the state (`supported`/`permission`/`subscribed`/`loading`/`error`) + actions; **`WebPushClient`** is the imperative version.
- **Worker handlers** (`installPushHandler`/`installNotificationClickHandler`/`installSkipWaitingListener`) go inside _your_ `sw.ts`.
- **iOS** only receives push in an installed PWA — hide the toggle when `!supported`.

### See also

- [HTTP](./http.en.md) — transport for the subscriptions to the backend
- Diagram: [push-flow.drawio](./diagrams/push-flow.drawio)
