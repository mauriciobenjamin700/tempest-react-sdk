# WebSocket

`createWebSocket` + `useWebSocket` mirror the SSE API. Use them when the client
also needs to **send** messages.

## When to use

- Chat / real-time collaboration.
- Bidirectional, low latency.
- Binary frames (also supported via `send(ArrayBuffer)`).

## Imperative

```ts
import { createWebSocket } from "tempest-react-sdk";

const socket = createWebSocket<ChatEvent>(`${API}/chat`, {
  pingInterval: 30_000,
  onOpen: () => console.log("ws open"),
  onMessage: ({ data }) => render(data),
});

socket.send(JSON.stringify({ text: "hi" }));
socket.close();
```

- Exponential reconnect, same as SSE (max 10).
- `pingInterval` sends `pingPayload` (default `{"type":"ping"}`) periodically.
- Reconnect only fires on `close.wasClean === false` — clean closes do not try to reopen.

## Hook

```tsx
import { useWebSocket } from "tempest-react-sdk";

function Chat() {
  const ws = useWebSocket<ChatEvent>(`${API}/chat`, {
    pingInterval: 30_000,
    onMessage: ({ data }) => addMessage(data),
  });
  return (
    <button disabled={ws.status !== "open"} onClick={() => ws.send("hi")}>
      Send
    </button>
  );
}
```

## See also

- [SSE](./sse.md)
- [HTTP](./http.md)
