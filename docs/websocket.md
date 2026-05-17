# WebSocket

`createWebSocket` + `useWebSocket` espelham a API de SSE. Use quando o cliente precisar **enviar** mensagens também.

## Quando usar

- Chat / colaboração real-time.
- Bidirecional, latência baixa.
- Frames binários (também suportados via `send(ArrayBuffer)`).

## Imperativo

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

- Reconnect exponencial igual ao SSE (max 10).
- `pingInterval` envia `pingPayload` (default `{"type":"ping"}`) periodicamente.
- Reconnect só dispara em `close.wasClean === false` — fechamentos limpos não tentam reabrir.

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
            Enviar
        </button>
    );
}
```

## Veja também

- [SSE](./sse.md)
- [HTTP](./http.md)
