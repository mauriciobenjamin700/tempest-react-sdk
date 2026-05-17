# Server-Sent Events

Wrapper sobre `EventSource` com reconnect exponencial, heartbeat opt-in e parsing JSON. Caso de uso original: stream de notificações (`NEW-ALO`, `PAYMENT-SUCCESS`, etc.) do alofans-frontend.

## Quando usar

- Push unilateral servidor → cliente, sem necessidade de envio do cliente.
- Reconexão automática barata.
- Autenticação por cookie (`withCredentials: true`).

Pra envio bidirecional, use [WebSocket](./websocket.md).

## API imperativa — `createEventStream`

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

Reconnect: 1s → 2s → 4s → ... → 30s, max 10 tentativas. Heartbeats não disparam `onMessage` — só mantêm o socket vivo.

## Hook — `useEventStream`

```tsx
import { useEventStream } from "tempest-react-sdk";

useEventStream<StreamEvent>(`${API}/notifications/stream`, {
  enabled: !!user,
  withCredentials: true,
  onMessage: ({ data }) => add(data),
});
```

- `enabled: false` desconecta o stream (use enquanto espera o `user` carregar).
- Mudar a URL re-abre a conexão; mudar o `onMessage` não (callback via ref).
- Cleanup automático no unmount.

## Status

`"idle" | "connecting" | "open" | "closed" | "error"` — `error` indica que o stream esgotou tentativas.

## Veja também

- [WebSocket](./websocket.md)
- [Offline](./offline.md) — persistir histórico recebido por SSE
- [HTTP](./http.md)
