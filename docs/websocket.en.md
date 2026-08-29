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

- Exponential reconnect, same as SSE (default `maxRetries: 10`), with 30% **jitter** (`jitter`, 0–1) added to each wait.
- `pingInterval` (ms) sends `pingPayload` periodically — default `JSON.stringify({ type: "ping" })`. Pass `0` (default) to disable.
- `respondToPing` (default `true`) answers `pongPayload` to every **inbound** `{"type":"ping"}` frame. That is the heartbeat `tempest-fastapi-sdk` expects: without the `pong` it closes the socket with code `4408` once `WS_HEARTBEAT_TIMEOUT_SECONDS` passes.
- `queueWhileClosed` (default `false`) buffers whatever you send while the socket is down and drains it on the next open, oldest first, capped at `maxQueuedMessages` (default 100).
- **Which close reopens** depends on the code, not on `wasClean` alone — the table is in [Reconnect or not](#reconnect-or-not).

!!! tip "Why jitter"
    When the **server** is what went down, every client connected to it wakes on the same schedule and retries in the same millisecond — the box comes back up into a synchronized stampede and drops the connections again. Jitter only ever **adds** time (the floor stays predictable) and breaks the alignment. Pass `jitter: 0` when you want an exact schedule, in a test for instance.

### Failures that fire no event

Three failure modes produce no `open`, no `close` and no `error` — which is why a retry chain built on events alone gets stuck.

**1. The handshake that hangs.** A `WebSocket` that cannot reach its server does **not** fail: it sits in `CONNECTING`, silent. Measured in Chrome with the backend down, 12 s later `readyState` was still `0` and the event list empty. A retry chain built only on events stops on its first hung attempt and never moves again — and hanging, rather than refusing, is exactly how a bad mobile link behaves, which is the very case reconnection exists for.

`handshakeTimeout` (default **8000 ms**, `0` disables) abandons the attempt and schedules the next one.

**2. The link that dies in flight.** The socket only reports a connection that closes cleanly. When the link dies mid-flight — the phone leaves coverage, an intermediary drops the connection — `readyState` stays `OPEN` on this side and nothing ever arrives again. **Silence is the only symptom available.**

`silenceTimeout` (ms, default `0` = off) is the tolerated window. It is re-armed by **any** inbound frame, not just by a pong: traffic is traffic, and an exchange in progress already proves the link is carrying data. Use ~2.5× the server's ping interval, so one dropped ping is not mistaken for an outage.

```ts
const socket = createWebSocket(url, {
  silenceTimeout: 75_000,
  onMessage: ({ data }) => {
    // the server announces its own heartbeat: don't hard-code it on both ends
    if (data.type === "welcome") socket.setSilenceTimeout(data.heartbeat_seconds * 2500);
  },
});
```

**3. The radio that is switched off.** Burning retries against a radio that is off is how a phone exhausts its budget inside a tunnel and gives up right as it comes out the other side. With `waitForOnline` (default `true`), while `navigator.onLine` is `false` the schedule is **suspended** and the `online` event drives the next attempt.

### Reconnect or not

| Close | Reopens? | Why |
| --- | --- | --- |
| `wasClean: false` (any code) | ✅ | the connection **died**, it did not end |
| `1001`, `1011`, `1012`, `1013` | ✅ | server going away for a reason that ends (deploy, restart, overload) |
| `4408` | ✅ | `tempest-fastapi-sdk` heartbeat timeout — that is the **link** failing |
| clean `1000` / `1005` | ❌ | a goodbye meant on purpose: session over, logout, stream finished |
| `4400`–`4499` (minus `4408`) | ❌ → `onLost("rejected")` | refusal: invalid room, unauthorized, forbidden, full |

The same classification is exported, for when your own code has to inspect a `CloseEvent`: `isRejectionCloseCode(code)` answers whether that close is a refusal, and `HEARTBEAT_CLOSE_CODE` is `4408` with a name.

```ts
import { HEARTBEAT_CLOSE_CODE, isRejectionCloseCode } from "tempest-react-sdk";

onClose: (event) => {
  if (isRejectionCloseCode(event.code)) showAccessDenied();
  else if (event.code === HEARTBEAT_CLOSE_CODE) log("heartbeat lost");
};
```

!!! danger "4408 lives inside the refusal range and is **not** one"
    The obvious reading — "4400–4499 is fatal" — makes one dropped pong permanent. `tempest-fastapi-sdk` closes with `4408` when no `pong` arrived within `WS_HEARTBEAT_TIMEOUT_SECONDS`: that is the link failing, exactly the case reconnection exists for. The SDK carves out the exception for you.

### Reconnecting ≠ error

```ts
const socket = createWebSocket(url, {
  onReconnecting: (attempt, total) => setBanner(`Reconnecting ${attempt}/${total}…`),
  onReconnected: () => refetchEverything(),
  onLost: (reason) => setBanner(reason === "rejected" ? "Access denied" : "No connection"),
});
```

- `onReconnecting(attempt, total)` — an attempt was **scheduled**. A quiet state, not an error: announcing every attempt puts "the connection dropped" in front of someone whose session is coming back on its own.
- `onReconnected()` — back up after at least one attempt. Nothing is resumed for you: a server that keys state by connection sees a brand-new client, so this is where you re-subscribe, re-join or refetch whatever the gap invalidated.
- `onLost(reason)` — it gave up. **This** is the one that deserves UI, because it is the only state the person can act on: offer a "try again" that calls `reconnect()`.

### Joining is not dropping

```ts
const socket = createWebSocket(url, { maxRetries: 0 });

try {
  await socket.opened;
} catch {
  showJoinError();
}
```

`opened` resolves on the first open and rejects when the socket dies **without ever having opened** (`websocket_rejected`, `websocket_exhausted` or `websocket_closed`). Failing to join is a different event from dropping mid-session: the first has to be reported, the second should reconnect quietly. Pair it with `maxRetries: 0` when the first attempt should fail fast instead of spending the whole schedule against a server that is not there.

!!! warning "`send()` is a no-op when the socket isn't open"
    If you call `send()` before the status becomes `"open"` (or after a `close`), nothing is sent and the return value is `false`. Always check `status === "open"` (or the returned boolean) before assuming the message went out.

    Turn on `queueWhileClosed: true` when the action **must not** vanish: `send()` then buffers during the backoff and returns `true`, and the queue drains on the next open. The queue dies on `close()` — nothing survives an explicit shutdown.

!!! danger "Against a Tempest server, leave `pingInterval` off"
    `tempest-fastapi-sdk` **sends** the ping and wants the `pong` back. A client-originated `{"type":"ping"}` is an unknown frame to it — a strict handler rejects it. Keep `pingInterval: 0` (the default) and let `respondToPing` handle the heartbeat.

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

- The hook returns `{ status, lastMessage, send, reconnect, setSilenceTimeout }`.
- `enabled: false` does not open the socket; changing the URL reopens. **Every** callback (`onOpen`, `onMessage`, `onClose`, `onError`, `onReconnecting`, `onReconnected`, `onLost`) goes through a ref: an inline arrow function is safe, always runs the latest closure, and never reopens the socket.
- Connection-shaping options (`protocols`, `maxRetries`, `initialBackoff`, `maxBackoff`, `jitter`, `handshakeTimeout`, `silenceTimeout`, `waitForOnline`, `pingInterval`, `queueWhileClosed`) are part of the handshake — changing one **reopens** the socket with the new value instead of being silently ignored.

!!! warning "`lastMessage` is a snapshot, not a queue"
    Every frame is a `setState`, so two arriving in the same tick collapse into one render and you only ever see the later one. A single server action often emits several frames in a row. For **streams** use `onMessage`, which fires once per frame; `lastMessage` is for rendering current state.
- `send` is stable (`useCallback`) — safe to put in deps without reopening anything.
- Automatic cleanup on unmount (clean close, no reconnect attempts).

## A frame that is not JSON

Both transports `JSON.parse` the frame by default. When that fails — the server
returned an error page, a plain-text `ping` arrived, a proxy injected something —
the SDK delivers the **raw string announced as your type**. That is the historical
behaviour and it stays, because changing it would break whoever relies on it; what
changed is that it stopped being silent.

```tsx
import { createWebSocket } from "tempest-react-sdk";

interface Event {
    id: string;
    kind: string;
}

const socket = createWebSocket<Event>("wss://api.example.com/events", {
    onParseError: (error, raw) => {
        console.error("unreadable frame, dropped:", raw.slice(0, 120), error);
    },
    onMessage: ({ data }) => {
        console.log(data.id);
    },
});
```

With `onParseError` registered, the broken frame **does not reach** `onMessage` — a
caller who asked to hear about failures did not ask to also receive the frame.
Without it, the frame is delivered as before and a development build warns **once**
per transport in the console.

!!! warning "Why the old default is a trap"
    `data` typed as `Event` while actually being a `string` does not blow up at the
    parse — it blows up at the first `data.id`, far away, with nothing pointing at
    the frame that caused it. The warning and `onParseError` exist so the error
    shows up where it happens.

!!! tip "`parser` still wins"
    Passing `parser` switches all of this off: its result is always delivered,
    because decoding text, base64 binary or a protocol of your own is exactly what
    the option is for. `onParseError` only applies when there is no `parser`.

## Status

`"idle" | "connecting" | "open" | "closing" | "closed" | "error"` — `error` is terminal and arrives together with `onLost`: either the schedule ran out (`"exhausted"`) or the server refused the client (`"rejected"`). A reconnect in progress goes through `"connecting"`, not through `"error"`.

## Recap

- `createWebSocket(url, options)` opens a bidirectional WebSocket; the controller exposes `send`, `close`, `reconnect`, `setSilenceTimeout`, `opened`, and `status`.
- `send()` returns `false` (no-op) when the socket isn't open — always check first.
- Three failures fire no event at all and each has its own knob: a hung handshake (`handshakeTimeout`), a link that died in flight (`silenceTimeout`), a radio that is off (`waitForOnline`).
- Reopening depends on the close code, not on `wasClean` alone: `4400`–`4499` is a refusal (minus `4408`, the heartbeat, which **does** reopen); a clean `1000` is a goodbye.
- `onReconnecting` is a quiet state; `onLost` is what deserves UI and a "try again" button.
- `opened` separates "could not join" from "dropped mid-session" — the first is an error, the second reconnects on its own.
- `pingInterval` + `pingPayload` keep the connection alive.
- `useWebSocket` ties everything to the component and exposes `status`/`lastMessage`/`send`/`reconnect`/`setSilenceTimeout`.

## See also

- [SSE](./sse.md) — when you only receive (simpler)
- [HTTP](./http.md)
