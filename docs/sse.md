# Server-Sent Events

Wrapper sobre `EventSource` com reconnect exponencial, heartbeat opt-in e parsing JSON. Caso de uso original: stream de notificações (`NEW-ALO`, `PAYMENT-SUCCESS`, etc.) do alofans-frontend.

!!! info "SSE vs WebSocket — qual escolher?"
SSE é unidirecional (servidor → cliente), roda sobre HTTP comum, reconecta sozinho e autentica por cookie sem cerimônia. Se o cliente **não precisa enviar** mensagens, SSE é mais simples e barato. Pra tráfego bidirecional (chat, colaboração), use [WebSocket](./websocket.md).

## Quando usar

- Push unilateral servidor → cliente, sem necessidade de envio do cliente.
- Reconexão automática barata.
- Autenticação por cookie (`withCredentials: true`).

## API imperativa — `createEventStream`

Use fora de React (services, inicialização) quando você gerencia o ciclo de vida na mão:

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
    onOpen: () => console.log("SSE aberto"),
    onMessage: ({ event, data, id }) => {
      if (event === "payment") handlePayment(data);
      else addNotification(data);
    },
    onStatusChange: (status) => console.log("SSE", status),
    onError: (err) => console.error(err),
  },
);

// Mais tarde, ao desmontar / deslogar:
stream.close();

// Forçar reconexão imediata (zera o contador de tentativas):
stream.reconnect();

// Ler o status atual:
console.log(stream.status);
```

Cada `onMessage` recebe `{ event, data, id, raw }`: `event` é o nome do evento SSE (default `"message"`), `data` já vem JSON-parsed (com fallback pra string crua), `id` é o `lastEventId` do servidor e `raw` é o `MessageEvent` original.

### Reconexão e heartbeat

```text
Backoff: 1s → 2s → 4s → 8s → ... (limitado em 30s), até maxRetries (default 10)
```

- A cada erro o stream fecha, agenda reconexão com backoff exponencial e emite status `"closed"`. Ao reabrir com sucesso, o contador zera.
- Esgotadas as `maxRetries`, o status vira `"error"` e o stream para de tentar.
- Eventos listados em `heartbeatEvents` (default `["ping"]`) **não** disparam `onMessage` — só mantêm o socket vivo.

!!! tip "Configure os `heartbeatEvents` conforme seu backend"
Se o servidor envia keep-alives sob outro nome de evento (ex.: `"keepalive"`), liste-o em `heartbeatEvents` pra não poluir o `onMessage` com pings.

## Hook — `useEventStream`

Dentro de componentes, o hook amarra o ciclo de vida do stream ao componente — abre na montagem, fecha no unmount:

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
      enabled: !!user, // só conecta quando o usuário existe
      withCredentials: true,
      onMessage: ({ data }) => addToInbox(data),
    },
  );

  return (
    <div>
      <span>Stream: {status}</span>
      {status === "error" && <button onClick={reconnect}>Reconectar</button>}
      {lastMessage && <p>Última: {lastMessage.data.message}</p>}
    </div>
  );
}
```

- `enabled: false` desconecta o stream (use enquanto espera o `user` carregar).
- Mudar a URL re-abre a conexão; mudar o `onMessage` **não** (callback via ref interna — sem reconexões à toa).
- `lastMessage` guarda a última mensagem recebida (heartbeats não contam).
- Cleanup automático no unmount.

!!! warning "`error` significa que esgotou as tentativas"
Quando o status chega em `"error"`, o stream desistiu sozinho. Ofereça um botão chamando `reconnect()` (que zera o contador) em vez de esperar uma reconexão automática que não vem mais.

## Status

`"idle" | "connecting" | "open" | "closed" | "error"`:

- `idle` — ainda não conectou (ou `enabled: false`).
- `connecting` — handshake em andamento.
- `open` — conectado e recebendo.
- `closed` — fechado, possivelmente aguardando reconexão.
- `error` — esgotou `maxRetries`, não tenta mais.

## Recap

- `createEventStream(url, options)` abre um SSE com reconnect exponencial; o controller expõe `close`, `reconnect` e `status`.
- `useEventStream(url, options)` é o wrapper React: amarra o ciclo de vida ao componente, expõe `status`/`lastMessage`/`reconnect` e respeita `enabled`.
- Heartbeats (default `["ping"]`) mantêm o socket vivo sem disparar `onMessage`.
- Status `"error"` = esgotou tentativas; ofereça `reconnect()` ao usuário.

## Veja também

- [WebSocket](./websocket.md) — quando o cliente também precisa enviar
- [Offline](./offline.md) — persistir histórico recebido por SSE
- [Audio](./audio.md) — tocar um som ao receber certos eventos
- [HTTP](./http.md)
