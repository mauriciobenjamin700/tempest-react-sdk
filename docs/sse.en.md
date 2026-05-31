# Server-Sent Events

A wrapper over `EventSource` with exponential reconnect, opt-in heartbeat, and
JSON parsing. Original use case: the notifications stream (`NEW-ALO`,
`PAYMENT-SUCCESS`, etc.) from alofans-frontend.

## When to use

- One-way server → client push, with no need for the client to send.
- Cheap automatic reconnection.
- Cookie-based authentication (`withCredentials: true`).

For bidirectional traffic, use [WebSocket](./websocket.md).

## Imperative API — `createEventStream`

```ts
import { createEventStream } from "tempest-react-sdk";

const stream = createEventStream<StreamEvent>(`${API}/notifications/stream`, {
  withCredentials: true,
  namedEvents: ["notification", "payment"],
  heartbeatEvents: ["ping"],
  maxRetries: 10,
  onMessage: ({ event, data }) => {
    if (event === "payment") handlePayment(data);
    else addNotification(data);
  },
  onStatusChange: (status) => console.log("SSE", status),
});

stream.close();
```

Reconnect: 1s → 2s → 4s → ... → 30s, max 10 attempts. Heartbeats do not fire
`onMessage` — they only keep the socket alive.

## Hook — `useEventStream`

```tsx
import { useEventStream } from "tempest-react-sdk";

useEventStream<StreamEvent>(`${API}/notifications/stream`, {
  enabled: !!user,
  withCredentials: true,
  onMessage: ({ data }) => add(data),
});
```

- `enabled: false` disconnects the stream (use it while waiting for `user` to load).
- Changing the URL re-opens the connection; changing `onMessage` does not (callback via ref).
- Automatic cleanup on unmount.

## Status

`"idle" | "connecting" | "open" | "closed" | "error"` — `error` means the stream
exhausted its attempts.

## See also

- [WebSocket](./websocket.md)
- [Offline](./offline.md) — persist the history received over SSE
- [HTTP](./http.md)
