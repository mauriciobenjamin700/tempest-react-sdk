# Web Push + Service Worker

End-to-end push notifications. The SDK handles the browser side (permission,
`pushManager.subscribe`, `notificationclick`); the app provides the endpoints
through callbacks.

> Editable diagram: [push-flow.drawio](./diagrams/push-flow.drawio) (open it in [draw.io](https://app.diagrams.net)).

## Prerequisites

1. A backend that stores `PushSubscriptionJSON` and sends notifications via web-push (VAPID).
2. A registered service worker (`vite-plugin-pwa`, `registerServiceWorker`, or `navigator.serviceWorker.register`).
3. A `VITE_VAPID_PUBLIC_KEY` variable in the front end (the URL-safe base64 VAPID public key).

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

### Subscribe the user

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

Imperative version: `WebPushClient`. Typed errors:
`WebPushUnsupportedError`, `WebPushPermissionDeniedError`.

## Worker-thread (`sw.ts`)

Inside **your** service worker, import the handlers:

```ts
/// <reference lib="webworker" />
import {
  installPushHandler,
  installNotificationClickHandler,
  installSkipWaitingListener,
} from "tempest-react-sdk";

installSkipWaitingListener();

installPushHandler({
  defaultTitle: "Tempest",
  defaultIcon: "/icons/Logo.png",
  transform: (payload) => (payload.tag === "silent-ping" ? null : payload),
});

installNotificationClickHandler();
```

`installPushHandler` tries `event.data.json()` and falls back to
`event.data.text()`. Use `transform` to suppress or enrich notifications.

`installNotificationClickHandler` focuses the existing client when the URL
matches, or opens a new window.

## Compatibility

- iOS Safari only works when the app is installed as a PWA (Add to Home Screen).
- `usePushSubscription` exposes `supported` — hide the toggle when `false`.

## See also

- [HTTP](./http.md) — transport for the subscriptions
- Diagram: [push-flow.drawio](./diagrams/push-flow.drawio)
