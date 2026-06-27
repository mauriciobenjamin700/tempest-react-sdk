# Server-Sent Events

A wrapper over `EventSource` with exponential reconnect, opt-in heartbeat, and JSON parsing. Original use case: the notifications stream (`NEW-ALO`, `PAYMENT-SUCCESS`, etc.) from alofans-frontend.

!!! info "SSE vs WebSocket — which one?"
    SSE is one-way (server → client), runs over plain HTTP, reconnects on its own, and authenticates via cookies with no ceremony. If the client **does not need to send** messages, SSE is simpler and cheaper. For bidirectional traffic (chat, collaboration), use [WebSocket](./websocket.md).

## When to use

- One-way server → client push, with no need for the client to send.
- Cheap automatic reconnection.
- Cookie-based authentication (`withCredentials: true`).

## Imperative API — `createEventStream`

Use it outside React (services, bootstrap) when you manage the lifecycle yourself:

```ts
import { createEventStream } from "tempest-react-sdk";

interface StreamEvent {
  type: "NOTIFY" | "PAYMENT-SUCCESS";
  message: string;
}

const stream = createEventStream<StreamEvent>(
  `${import.meta.env.VITE_API_URL}/notifications/stream`,
  {
    withCredentials: true,
    namedEvents: ["notification", "payment"],
    heartbeatEvents: ["ping"],
    maxRetries: 10,
    onOpen: () => console.log("SSE open"),
    onMessage: ({ event, data, id }) => {
      if (event === "payment") handlePayment(data);
      else addNotification(data);
    },
    onStatusChange: (status) => console.log("SSE", status),
    onError: (err) => console.error(err),
  },
);

// Later, on unmount / logout:
stream.close();

// Force an immediate reconnect (resets the retry counter):
stream.reconnect();

// Read the current status:
console.log(stream.status);
```

Each `onMessage` receives `{ event, data, id, raw }`: `event` is the SSE event name (default `"message"`), `data` is already JSON-parsed (with raw-string fallback), `id` is the server's `lastEventId`, and `raw` is the original `MessageEvent`.

### Reconnection and heartbeat

```text
Backoff: 1s → 2s → 4s → 8s → ... (capped at 30s), up to maxRetries (default 10)
```

- On every error the stream closes, schedules a reconnect with exponential backoff, and emits status `"closed"`. On a successful reopen the counter resets.
- Once `maxRetries` is exhausted, the status becomes `"error"` and the stream stops trying.
- Events listed in `heartbeatEvents` (default `["ping"]`) do **not** fire `onMessage` — they only keep the socket alive.

!!! tip "Match `heartbeatEvents` to your backend"
    If the server sends keep-alives under a different event name (e.g. `"keepalive"`), list it in `heartbeatEvents` so it doesn't pollute `onMessage` with pings.

## Hook — `useEventStream`

Inside components, the hook ties the stream's lifecycle to the component — opens on mount, closes on unmount:

```tsx
import { useEventStream } from "tempest-react-sdk";

interface Notification {
  id: string;
  message: string;
}

export function NotificationListener({ user }: { user: { id: string } | null }) {
  const { status, lastMessage, reconnect } = useEventStream<Notification>(
    `${import.meta.env.VITE_API_URL}/notifications/stream`,
    {
      enabled: !!user, // only connects once the user exists
      withCredentials: true,
      onMessage: ({ data }) => addToInbox(data),
    },
  );

  return (
    <div>
      <span>Stream: {status}</span>
      {status === "error" && <button onClick={reconnect}>Reconnect</button>}
      {lastMessage && <p>Latest: {lastMessage.data.message}</p>}
    </div>
  );
}
```

- `enabled: false` disconnects the stream (use it while waiting for `user` to load).
- Changing the URL re-opens the connection; changing `onMessage` does **not** (callback held in an internal ref — no pointless reconnects).
- `lastMessage` holds the last received message (heartbeats don't count).
- Automatic cleanup on unmount.

!!! warning "`error` means it exhausted its attempts"
    When the status reaches `"error"`, the stream gave up on its own. Offer a button calling `reconnect()` (which resets the counter) instead of waiting for an automatic reconnect that won't come.

## Status

`"idle" | "connecting" | "open" | "closed" | "error"`:

- `idle` — not connected yet (or `enabled: false`).
- `connecting` — handshake in progress.
- `open` — connected and receiving.
- `closed` — closed, possibly waiting to reconnect.
- `error` — exhausted `maxRetries`, no longer trying.

## Recap

- `createEventStream(url, options)` opens an SSE with exponential reconnect; the controller exposes `close`, `reconnect`, and `status`.
- `useEventStream(url, options)` is the React wrapper: ties the lifecycle to the component, exposes `status`/`lastMessage`/`reconnect`, and respects `enabled`.
- Heartbeats (default `["ping"]`) keep the socket alive without firing `onMessage`.
- Status `"error"` = attempts exhausted; offer the user a `reconnect()`.

## See also

- [WebSocket](./websocket.md) — when the client also needs to send
- [Offline](./offline.md) — persist the history received over SSE
- [Audio](./audio.md) — play a sound when certain events arrive
- [HTTP](./http.md)
