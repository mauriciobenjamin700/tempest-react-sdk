# WebSocket

`createWebSocket` + `useWebSocket` mirror the SSE API but add a **send** channel. Use them when the client needs to send messages, not just receive.

!!! info "When WebSocket instead of SSE?"
SSE only receives. As soon as the client needs to **send** (chat, shared cursors, real-time commands), you need a bidirectional channel — that's where WebSocket comes in. If it's purely server → client push, [SSE](./sse.md) is simpler.

## When to use

- Chat / real-time collaboration.
- Bidirectional, low latency.
- Binary frames (also supported via `send(ArrayBuffer)`).

## Imperative API — `createWebSocket`

```ts
import { createWebSocket } from "tempest-react-sdk";

interface ChatEvent {
  user: string;
  text: string;
}

const socket = createWebSocket<ChatEvent>(`${import.meta.env.VITE_WS_URL}/chat`, {
  pingInterval: 30_000, // keeps the socket alive
  maxRetries: 10,
  onOpen: () => console.log("ws open"),
  onMessage: ({ data }) => render(data),
  onClose: (event) => console.log("closed", event.code),
  onStatusChange: (status) => console.log("WS", status),
});

// Send — returns false if the socket isn't open:
const sent = socket.send(JSON.stringify({ user: "ana", text: "hi" }));

// Binary frame:
socket.send(new Uint8Array([1, 2, 3]).buffer);

// Close (does not try to reconnect):
socket.close();

// Force an immediate reconnect (resets the counter):
socket.reconnect();
```

`onMessage` receives `{ data, raw }` — `data` is already JSON-parsed (string fallback), `raw` is the original `MessageEvent`.

### Reconnection, ping, and clean close

```text
Backoff: 1s → 2s → 4s → ... (capped at 30s), up to maxRetries (default 10)
```

- Exponential reconnect, same as SSE (default `maxRetries: 10`).
- `pingInterval` (ms) sends `pingPayload` periodically — default `JSON.stringify({ type: "ping" })`. Pass `0` (default) to disable.
- **Reconnect only fires on `close.wasClean === false`.** Clean closes (`socket.close()` or a normal server close) do **not** try to reopen.

!!! warning "`send()` is a no-op when the socket isn't open"
If you call `send()` before the status becomes `"open"` (or after a `close`), nothing is sent and the return value is `false`. Always check `status === "open"` (or the returned boolean) before assuming the message went out.

## Hook — `useWebSocket`

```tsx
import { useState } from "react";
import { useWebSocket } from "tempest-react-sdk";

interface ChatEvent {
  user: string;
  text: string;
}

export function Chat({ enabled }: { enabled: boolean }) {
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState<ChatEvent[]>([]);

  const ws = useWebSocket<ChatEvent>(`${import.meta.env.VITE_WS_URL}/chat`, {
    enabled,
    pingInterval: 30_000,
    onMessage: ({ data }) => setLog((prev) => [...prev, data]),
  });

  function sendMessage() {
    const ok = ws.send(JSON.stringify({ user: "me", text: draft }));
    if (ok) setDraft("");
  }

  return (
    <div>
      <span>Status: {ws.status}</span>
      <ul>
        {log.map((m, i) => (
          <li key={i}>
            <strong>{m.user}:</strong> {m.text}
          </li>
        ))}
      </ul>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button disabled={ws.status !== "open"} onClick={sendMessage}>
        Send
      </button>
      {ws.status === "error" && <button onClick={ws.reconnect}>Reconnect</button>}
    </div>
  );
}
```

- The hook returns `{ status, lastMessage, send, reconnect }`.
- `enabled: false` does not open the socket; changing the URL reopens; changing `onMessage` does not (internal ref).
- `send` is stable (`useCallback`) — safe to put in deps without reopening anything.
- Automatic cleanup on unmount (clean close, no reconnect attempts).

## Status

`"idle" | "connecting" | "open" | "closing" | "closed" | "error"` — `error` means the socket exhausted `maxRetries` after non-clean closes.

## Recap

- `createWebSocket(url, options)` opens a bidirectional WebSocket; the controller exposes `send`, `close`, `reconnect`, and `status`.
- `send()` returns `false` (no-op) when the socket isn't open — always check first.
- Exponential reconnect only fires on a **non-clean** close; clean closes do not reopen.
- `pingInterval` + `pingPayload` keep the connection alive.
- `useWebSocket` ties everything to the component and exposes `status`/`lastMessage`/`send`/`reconnect`.

## See also

- [SSE](./sse.md) — when you only receive (simpler)
- [HTTP](./http.md)
