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
4. **HTTPS**, or `localhost`. Service workers and the Push API do not exist on an insecure origin — including the LAN IP (`http://192.168.0.10:5173`) you test the phone against. Use an HTTPS tunnel (`cloudflared`, `ngrok`) for that.

!!! warning "The hook does NOT register the service worker"
    `usePushSubscription` assumes the SW is already registered and uses
    `navigator.serviceWorker.ready` by default. Register the SW yourself (step
    below) — or pass `getRegistration` to reuse your own registration. Without a
    registered SW, `subscribe()` never resolves.

## Adopting it in an app that already exists

This section is for the common case: **the app is already live** and you are
switching push on now. Nothing here asks you to adopt the scaffold,
`createViteConfig`, or become a PWA.

The checklist, in order:

1. Generate the VAPID pair and put the public half in the front end.
2. Have a service worker served **from the root** (three scenarios below).
3. Install the push handlers inside that SW.
4. Agree the contract for two endpoints with your backend.
5. Wire `usePushSubscription` to a button.
6. Tie `subscribe`/`unsubscribe` to **login and logout** — the step almost everybody forgets.

### 1. VAPID keys

```bash
npx web-push generate-vapid-keys
```

```dotenv
# .env — only the public half reaches the front end
VITE_VAPID_PUBLIC_KEY=BOxx…
```

The private half stays on the backend. Changing this pair later **invalidates
every existing subscription** — see [key rotation](#rotating-the-vapid-key).

### 2. The service worker: three scenarios

!!! danger "The SW file has to be served from the root of its scope"
    A service worker only controls pages **under its own path**: an
    `/assets/sw-abc123.js` controls `/assets/…` and nothing else — so
    `navigator.serviceWorker.ready` never resolves on your home page and
    `subscribe()` hangs forever, with nothing in the console.

    It is the most common way switching push on fails in a bundled app: the SW
    cannot go through the hashed asset pipeline. It has to land at `/sw.js` (or
    be served with a `Service-Worker-Allowed: /` header). Check it in
    **DevTools → Application → Service workers**: `Scope` must read `/`.

=== "a. I have no service worker at all"

    Create `src/sw.ts` and bundle it **separately** from the app, because the
    app's entry goes through the asset pipeline and the SW must not:

    ```ts
    /// <reference lib="webworker" />
    import {
      installNotificationClickHandler,
      installPushHandler,
      installSkipWaitingListener,
    } from "tempest-react-sdk/sw";

    declare const self: ServiceWorkerGlobalScope;

    installSkipWaitingListener();
    installPushHandler({ defaultTitle: "My App", defaultIcon: "/icons/logo.png" });
    installNotificationClickHandler();
    ```

    ```ts
    // vite.sw.config.ts — builds the worker alone, to dist/sw.js
    import { resolve } from "node:path";
    import { defineConfig } from "vite";

    export default defineConfig({
      build: {
        emptyOutDir: false, // keeps the app's dist/ intact
        lib: {
          entry: resolve(__dirname, "src/sw.ts"),
          formats: ["iife"], // classic worker, no import/export
          name: "sw",
          fileName: () => "sw.js",
        },
        rollupOptions: { output: { entryFileNames: "sw.js", inlineDynamicImports: true } },
      },
    });
    ```

    ```json
    {
      "scripts": {
        "build": "vite build && npm run build:sw",
        "build:sw": "vite build --config vite.sw.config.ts"
      }
    }
    ```

    Register it from the app entry:

    ```ts
    // src/main.tsx
    import { registerServiceWorker } from "tempest-react-sdk";

    registerServiceWorker({ url: "/sw.js" });
    ```

    !!! tip "No build step, if you prefer"
        A hand-written `public/sw.js` works too — files in `public/` are copied
        verbatim to the root of `dist/`. The cost is that you cannot `import` the
        SDK helpers in there: you write the `push` and `notificationclick`
        listeners yourself. Fine for the simple case; past that, bundle it.

=== "b. I already use `vite-plugin-pwa`"

    Only **`injectManifest`** mode lets you write the SW. If yours is on
    `generateSW` (the default), switch:

    ```ts
    // vite.config.ts
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: "auto",
    });
    ```

    Then in `src/sw.ts`, put the SDK handlers next to your Workbox ones — they do
    not compete, they are different events (`push`/`notificationclick` on one
    side, `fetch` on the other):

    ```ts
    /// <reference lib="webworker" />
    import { precacheAndRoute } from "workbox-precaching";
    import { installNotificationClickHandler, installPushHandler } from "tempest-react-sdk/sw";

    declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

    precacheAndRoute(self.__WB_MANIFEST); // what the plugin already did
    installPushHandler({ defaultTitle: "My App" });
    installNotificationClickHandler();
    ```

    Keep the plugin's registration (`virtual:pwa-register`) — do **not** call
    `registerServiceWorker` as well: two registrations of the same file fight
    over the update cycle.

=== "c. I already have my own SW"

    Two lines inside what you already have, and none of your code changes:

    ```ts
    import { installNotificationClickHandler, installPushHandler } from "tempest-react-sdk/sw";

    installPushHandler({ defaultTitle: "My App" });
    installNotificationClickHandler();
    ```

    Already have your own `addEventListener("push", …)`? Pick one of the two:
    both handlers running show **two** notifications for the same push, because
    each one calls `showNotification`.

    If you register the SW yourself and want to reuse that registration instead
    of `navigator.serviceWorker.ready`, pass `getRegistration`:

    ```ts
    const registration = await navigator.serviceWorker.register("/sw.js");

    usePushSubscription({
      vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      getRegistration: async () => registration,
      onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
    });
    ```

### 3. The contract with your backend

The SDK picks no route, verb or format — it hands you the
`PushSubscriptionJSON` and you decide. This is exactly what reaches
`onSubscribe`:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/dQw4w9Wg...",
  "expirationTime": null,
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=",
    "auth": "tBHItJI5svbpez7KI4CCXg=="
  }
}
```

Two routes close the cycle — and the **natural key is the `endpoint`**, not the
user:

| Route | When | Body |
| -- | -- | -- |
| `POST /webpush/subscribe` | subscribed (or re-synced) | the JSON above + the logged-in user, from the token |
| `DELETE /webpush/subscribe` | unsubscribed | `{ "endpoint": "…" }` |

!!! warning "One user has N subscriptions, one per browser"
    Phone, work laptop, Chrome and Firefox on the same machine: each is a
    subscription with its own endpoint. If the backend stores **one**
    subscription per user (`UPDATE … WHERE user_id = ?`), every new device
    silently switches the previous one off — the user installs on their phone and
    stops receiving on the desktop, with nothing explaining why.

    Store one row per endpoint, with `UNIQUE(endpoint)` and an indexed
    `user_id`. The `POST` is an **upsert by endpoint**: the same browser
    re-sending the same subscription (which happens on every `subscribe()` — see
    [re-syncing](#what-happens-when-a-subscription-already-exists)) must not
    create a duplicate row.

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
  onUnsubscribe: (sub) => api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
});

<Button loading={push.loading} onClick={() => push.subscribe()}>
  {push.subscribed ? "Unsubscribe" : "Receive notifications"}
</Button>;
```

The hook exposes `supported`, `permission`, `subscribed`, `loading`, `error`, `subscribe()`, `unsubscribe()`, and `refresh()`. Imperative version: `WebPushClient`. Typed errors: `WebPushUnsupportedError`, `WebPushPermissionDeniedError`.

#### What `subscribe()` does, step by step

1. `Notification.requestPermission()` — the browser prompt. A refusal throws `WebPushPermissionDeniedError`.
2. Gets the registration (`navigator.serviceWorker.ready`, or your `getRegistration`).
3. **If a subscription already exists in this browser, it reuses it** and calls `onSubscribe` again.
4. If none exists, it creates one with `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` and calls `onSubscribe`.

#### What happens when a subscription already exists

Step 3 is deliberate, and it is what makes the button double as a **re-sync**:
calling `subscribe()` in a browser that is already subscribed creates nothing new
— it re-sends the same subscription to your backend. That recovers the case where
the database lost the row (a restore, a migration, an environment swap) while the
browser stayed subscribed: without the re-send, that device would be subscribed in
the browser and unknown on the server — mute forever.

The price is on the backend: the `POST` **must** be an upsert by `endpoint`. A
blind insert turns one device into two rows, and the user gets every notification
twice.

!!! warning "`subscribed` always starts out `false`"
    Knowing whether a subscription exists takes `await pushManager.getSubscription()`,
    so the first render **cannot** know the answer: the hook returns `false` and
    corrects itself right after. A button that reads only `subscribed` flashes
    "Receive notifications" before turning into "Unsubscribe".

    Let the state settle before deciding the label — `loading` is `false` during
    that window, so use your own "already checked" flag:

    ```tsx
    const push = usePushSubscription({ /* … */ });
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        void push.refresh().finally(() => setChecked(true));
    }, [push.refresh]);

    if (!checked) return <Skeleton height={40} />;
    ```

!!! tip "`refresh()` is for state that changes outside your app"
    The user grants or blocks notifications in **browser settings**, or drops the
    subscription from `chrome://settings/content/notifications`, and your React
    never hears about it — there is no event for that. Call `refresh()` when the
    tab becomes visible again:

    ```tsx
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") void push.refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [push.refresh]);
    ```

### Permission and subscription flow (complete example)

This component shows the full lifecycle state — unsupported, permission denied, subscribed, toggle — and handles the permission-denied error:

```tsx
import { usePushSubscription, WebPushPermissionDeniedError, Button } from "tempest-react-sdk";
import { api } from "./api";

export function PushToggle() {
  const push = usePushSubscription({
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
    onUnsubscribe: (sub) =>
      api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
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

### Unsubscribing — what almost everybody gets wrong

`unsubscribe()` does two things, **in this order**:

1. it calls `onUnsubscribe(subscription)` — your delete route;
2. only then it calls `subscription.unsubscribe()` in the browser.

The order is a choice: if the backend fails, the subscription **stays** in the
browser and `unsubscribe()` throws. That is the safe side to fail on — the
opposite (deleting in the browser first) would lose the `endpoint`, and without it
the backend could never know which row to delete. It would keep pushing to a dead
endpoint until the push service answered `410`.

#### Delete by `endpoint`, not by session

```tsx
const push = usePushSubscription({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
  // ✅ the argument is the subscription being removed — use its endpoint
  onUnsubscribe: (sub) => api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
});
```

```tsx
// ❌ ignores the argument: the backend only knows "some device of this user left"
onUnsubscribe: () => api.delete("/webpush/my"),
```

The second pattern only works while the user has **one** device. With two, the
backend either deletes them all (the phone stops receiving because you switched
off on the desktop) or deletes an arbitrary one (and the desktop starts receiving
again on its own later). The `endpoint` is what identifies the device — that is
precisely why it is in the argument.

#### Unsubscribing does **not** revoke permission

`Notification.permission` stays `"granted"` after `unsubscribe()`, and there is no
API to revoke it — only the user can, in browser settings.

The practical consequence: `permission === "granted"` does **not** mean
subscribed. `subscribed` is what decides the button label; `permission` only tells
you whether you may still ask (`"default"`) or are blocked from outside
(`"denied"`). A second `subscribe()` after unsubscribing shows no prompt at all —
the permission is already there — and comes back instantly.

#### Logout and user switching

This is the hole that shows up in production, not in testing. The subscription
belongs to the **browser**, not the user: if Ana logs out and Bruno logs in on the
same Chrome, the endpoint is unchanged — and still tied to Ana in your database.
Bruno starts receiving Ana's notifications, on his device, with the app showing
his own account.

Unsubscribe on logout, **before** throwing the token away:

```ts
// src/stores/auth.ts — or wherever your logout lives
import { WebPushClient } from "tempest-react-sdk";

async function logout() {
    const push = new WebPushClient({
        vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
        onSubscribe: () => {},
        onUnsubscribe: (sub) =>
            api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
    });

    // With no token the DELETE returns 401 and the row is orphaned.
    await push.unsubscribe().catch(() => {
        // Network down: the backend cleans up when the push service answers 404/410.
    });

    auth.clear();
}
```

!!! tip "If you do not want to lose the permission you earned"
    `unsubscribe()` on logout keeps the permission (see above), so the next login
    only needs a `subscribe()` — no prompt, instant. Call it on login success, not
    from an onboarding screen:

    ```ts
    async function onLoginSuccess() {
        if (Notification.permission === "granted") await push.subscribe();
    }
    ```

    That also covers the device that was away for months: one `subscribe()` per
    login re-syncs the endpoint with the backend without bothering anybody.

!!! warning "Never call `unsubscribe()` in `beforeunload`"
    Closing the tab is not leaving the app — the subscription exists to receive
    push while the app is **closed**. Unsubscribing there switches push off for
    everyone who closes a tab, and `beforeunload` does not await a promise: the
    `DELETE` probably never leaves.

### Keeping the subscription alive

A subscription is not forever, and all three ways it dies are silent.

#### `pushsubscriptionchange`: the browser swaps it on its own

The browser may invalidate and recreate the subscription by itself — an internal
push-service key change, a reinstall on Android, time. The endpoint changes, your
database keeps the old one, and push simply **stops arriving** weeks after
everything worked.

The SDK ships no helper for this (the event only exists inside the worker and its
support is still uneven). It is 15 lines in your `sw.ts`:

```ts
/// <reference lib="webworker" />
import { urlBase64ToUint8Array } from "tempest-react-sdk";

declare const self: ServiceWorkerGlobalScope;

const VAPID_PUBLIC_KEY = "BOxx…"; // the same one the front end uses

self.addEventListener("pushsubscriptionchange", (event: Event) => {
    const change = event as Event & { oldSubscription?: PushSubscription };
    event.waitUntil(
        (async () => {
            const fresh = await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            await fetch("/webpush/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subscription: fresh.toJSON(),
                    replaces: change.oldSubscription?.endpoint ?? null,
                }),
            });
        })(),
    );
});
```

!!! note "With no session cookie, the worker needs another way to authenticate"
    The worker's `fetch` does not have your in-memory token. If your auth is an
    `HttpOnly` cookie, it rides along and this just works. If it is
    `Authorization: Bearer`, accept this route via `replaces` (the old endpoint
    already identifies the owner) or keep the token in IndexedDB to read here.

#### `404`/`410` from the push service: delete on the backend

When the user revokes permission, clears site data or uninstalls the PWA, nobody
tells you — the next send answers `404 Not Found` or `410 Gone`. Treat both as
"delete this row", or your table fills with dead endpoints and every send gets
slower:

```python
# backend (pywebpush example)
from pywebpush import WebPushException, webpush

try:
    webpush(subscription_info=sub, data=payload, vapid_private_key=KEY, vapid_claims=CLAIMS)
except WebPushException as exc:
    if exc.response is not None and exc.response.status_code in (404, 410):
        subscriptions.delete(endpoint=sub["endpoint"])
    else:
        raise
```

#### Rotating the VAPID key

A subscription is **signed** with the public key that created it. Changing the
VAPID pair invalidates every one of them: sends start failing with `403`.

And there is a trap here: because `subscribe()` reuses the existing subscription,
calling it after changing the key fixes **nothing** — it re-sends the old
subscription, signed with the old key. The way through is unsubscribe, then
subscribe:

```ts
await push.unsubscribe(); // clears browser + backend
await push.subscribe(); // creates one with the new key (no prompt: permission is already granted)
```

If you need this across your whole base, version the key on the client and
compare it against the one that created the subscription:

```ts
import { urlBase64ToUint8Array } from "tempest-react-sdk";

const sub = await client.getSubscription();
const current = sub?.options.applicationServerKey; // ArrayBuffer | null
const stale =
    !!current &&
    new Uint8Array(current).toString() !==
        new Uint8Array(urlBase64ToUint8Array(VAPID_PUBLIC_KEY)).toString();

if (stale) {
    await client.unsubscribe();
    await client.subscribe();
}
```

Better still: **do not rotate**. Keep the VAPID pair as a long-lived secret — it
identifies no user, only your server.

### Imperative version — `WebPushClient`

When you need the flow outside React (a vanilla button, a setup script), use the class directly:

```ts
import { WebPushClient } from "tempest-react-sdk";

const client = new WebPushClient({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: async (sub) => {
    await fetch("/webpush/subscribe", { method: "POST", body: JSON.stringify(sub) });
  },
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

## An in-app inbox (`NotificationCenter`)

A push shows an OS notification and then **disappears** — as far as your UI is
concerned it never existed. A user who dismissed the toast has nowhere to find it
again. That is the missing half of web push: an inbox inside the app.

The service worker runs **outside** the page and cannot touch React state. The
bridge is a message:

```ts
// src/sw.ts — inside your push handler
self.addEventListener("push", (event) => {
    const payload = event.data?.json() ?? {};
    event.waitUntil(
        (async () => {
            await self.registration.showNotification(payload.title, payload);
            const clients = await self.clients.matchAll({ includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: "tempest:notification", notification: payload });
            }
        })(),
    );
});
```

In the app, `useNotificationInbox` listens for that message by default:

```tsx
import { NotificationCenter, useNotificationInbox, Popover, Button } from "tempest-react-sdk";

export function NotificationsButton() {
    const inbox = useNotificationInbox();

    return (
        <Popover
            trigger={
                <Button variant="ghost" aria-label={`Notifications (${inbox.unreadCount} unread)`}>
                    🔔 {inbox.unreadCount > 0 && inbox.unreadCount}
                </Button>
            }
        >
            <NotificationCenter
                items={inbox.items}
                onMarkRead={inbox.markRead}
                onMarkAllRead={inbox.markAllRead}
                onDismiss={inbox.remove}
                onSelect={(item) => item.url && navigate(item.url)}
            />
        </Popover>
    );
}
```

### `useNotificationInbox`

| Option                  | Type                                  | Default                  |
| ----------------------- | ------------------------------------- | ------------------------ |
| `initialItems`          | `NotificationItem[]`                  | `[]`                     |
| `listenToServiceWorker` | `boolean`                             | `true`                   |
| `messageType`           | `string`                              | `"tempest:notification"` |
| `limit`                 | `number`                              | `100`                    |
| `onChange`              | `(items: NotificationItem[]) => void` | —                        |

Returns `{ items, unreadCount, add, markRead, markUnread, markAllRead, remove, clear }`.
An entry is `{ id, title, body?, receivedAt, read?, url?, data? }`.

!!! info "It filters by `type`, and that is not a detail"
    The service-worker message channel is **shared** — a sync-progress ping or a
    cache-updated notice travels the same path. Without filtering by `type`, all of
    that would land in the user's inbox.

!!! warning "Persistence is your decision"
    The hook keeps the list in memory and nothing more: where an inbox belongs
    (server, Dexie, `localStorage`) differs per app, and a wrong default would be
    worse than none. Use `onChange` to write and `initialItems` to read back.

    ```tsx
    const inbox = useNotificationInbox({
        initialItems: restored,
        onChange: (items) => storage.set("inbox", items),
    });
    ```

!!! tip "`limit` exists because a push-fed inbox grows without bound"
    100 by default, oldest dropped. Raise it if you persist and paginate.

### `NotificationCenter`

| Prop            | Type                                    | Default            |
| --------------- | --------------------------------------- | ------------------ |
| `items`         | `NotificationItem[]`                    | —                  |
| `title`         | `ReactNode` (`null` drops the header)   | `"Notificações"`   |
| `onSelect`      | `(item: NotificationItem) => void`      | —                  |
| `onMarkRead`    | `(id: string) => void`                  | —                  |
| `onMarkAllRead` | `() => void`                            | —                  |
| `onDismiss`     | `(id: string) => void`                  | —                  |
| `renderIcon`    | `(item: NotificationItem) => ReactNode` | —                  |
| `locale`        | `"pt-BR" \| "en"`                       | `"pt-BR"`          |
| `emptyState`    | `ReactNode`                             | `<EmptyState …/>`  |
| `now`           | `number` (timestamp reference)          | now, at render     |

!!! note "It is only the panel, not a popover"
    Mount it inside your own `Popover`, `Drawer` or route. A component owning both
    the inbox **and** a positioning strategy would fit fewer cases, not more.

!!! check "Opening is reading"
    Activating a notification calls `onMarkRead` alongside `onSelect` — otherwise
    every app would have to remember to call both, and the unread count would keep
    counting something the user already saw.

!!! tip "Unread is not colour alone"
    The row gets a left bar **and** a tinted background, plus `aria-current="true"`.
    Colour on its own survives neither monochrome nor colour blindness.

`renderIcon` pairs directly with the icons subpath:

```tsx
import { Icon } from "tempest-react-sdk/icons";

<NotificationCenter
    items={inbox.items}
    renderIcon={(item) => <Icon name={(item.data?.icon as string) ?? "bell"} size={16} />}
/>
```

## Compatibility

- iOS Safari only works when the app is installed as a PWA (Add to Home Screen) — and the app needs a `manifest.json` with `display: "standalone"` to be installable at all. Outside that, `isPushSupported()` answers `false` on iOS **even on current Safari**: that is not your bug.
- `usePushSubscription` exposes `supported` — hide the toggle when `false`.
- An insecure origin (`http://` that is not `localhost`) has neither service workers nor the Push API.

## When no notification arrives: where to look

| Symptom | Likely cause | Where to confirm |
| -- | -- | -- |
| `subscribe()` never resolves | the SW does not control the page (wrong scope, or never registered) | DevTools → Application → Service workers: `Scope` must be `/` and status `activated` |
| `supported === false` on iOS | the app is not installed as a PWA | Add to Home Screen, then open from the icon |
| Subscribed, backend got nothing | `onSubscribe` failed silently | the hook's `error`; `subscribe()` re-throws, so handle the `catch` |
| Push dies weeks later | the browser rotated the subscription | [`pushsubscriptionchange`](#pushsubscriptionchange-the-browser-swaps-it-on-its-own) |
| Send answers `403` | VAPID pair changed, or the front-end public key is not the pair of the backend's private one | [key rotation](#rotating-the-vapid-key) |
| Send answers `404`/`410` | user revoked/cleared data; dead endpoint | delete the row ([above](#404410-from-the-push-service-delete-on-the-backend)) |
| Duplicated notification | two `push` handlers in the SW, or a `POST` that is not an upsert by endpoint | your `sw.ts`; the subscriptions table |
| A user gets another account's notification | no unsubscribe on logout | [logout and user switching](#logout-and-user-switching) |
| `ReferenceError: window is not defined` in the SW | SDK older than 0.28.1 using `urlBase64ToUint8Array` in the worker | upgrade the SDK |

## Recap

- **VAPID**: public in the front end, private on the backend only. Generate it once with `web-push` and **do not rotate** — changing it invalidates every existing subscription.
- **You register the SW**; the hook only subscribes/unsubscribes over a ready registration. The file has to be served at `/sw.js` — a hashed SW inside `/assets/` does not control your home page, and then `subscribe()` hangs with no error.
- **In an app that already exists**: [three SW scenarios](#2-the-service-worker-three-scenarios) (none, `vite-plugin-pwa` on `injectManifest`, your own SW) — none of them asks you to adopt the rest of the SDK.
- **A subscription belongs to the browser, not the user**: store one row per `endpoint` (`UNIQUE`), upsert on `POST`, and **delete by `endpoint`** on `DELETE`. A user has as many devices as they like.
- **Unsubscribe on logout, before discarding the token** — otherwise the next user of that browser receives the previous one's notifications. The permission survives, so the next login re-subscribes with no prompt.
- **`unsubscribe()` does not revoke permission**: `permission === "granted"` does not mean subscribed. `subscribed` owns the button label.
- **`subscribed` starts `false`** (the check is async) and `refresh()` exists for state that changes outside the app (browser settings).
- **A subscription dies silently**: handle `pushsubscriptionchange` in the worker and delete on `404`/`410` on the backend.
- **`usePushSubscription`** gives you all the state (`supported`/`permission`/`subscribed`/`loading`/`error`) + actions; **`WebPushClient`** is the imperative version.
- **Worker handlers** (`installPushHandler`/`installNotificationClickHandler`/`installSkipWaitingListener`) go inside _your_ `sw.ts`.
- **iOS** only receives push in an installed PWA — hide the toggle when `!supported`.
- **`useNotificationInbox` + `NotificationCenter`** close the loop: the worker `postMessage`s, the hook holds the list (filtered by `type`, capped by `limit`) and the panel shows read/unread with a per-item action. Persistence stays with the app, via `onChange`/`initialItems`.

### See also

- [HTTP](./http.en.md) — transport for the subscriptions to the backend
- Diagram: [push-flow.drawio](./diagrams/push-flow.drawio)
