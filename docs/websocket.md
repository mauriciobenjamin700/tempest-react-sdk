# WebSocket

`createWebSocket` + `useWebSocket` espelham a API de SSE, mas adicionam o canal de **envio**. Use quando o cliente precisar mandar mensagens, não só receber.

!!! info "Quando WebSocket em vez de SSE?"
    SSE só recebe. Assim que o cliente precisa **enviar** (chat, cursores compartilhados, comandos em tempo real), você precisa de um canal bidirecional — é aí que entra o WebSocket. Se for só push servidor → cliente, [SSE](./sse.md) é mais simples.

## Quando usar

- Chat / colaboração real-time.
- Bidirecional, latência baixa.
- Frames binários (também suportados via `send(ArrayBuffer)`).

## API imperativa — `createWebSocket`

```ts
import { createWebSocket } from "tempest-react-sdk";

interface ChatEvent {
  user: string;
  text: string;
}

const socket = createWebSocket<ChatEvent>(`${import.meta.env.VITE_WS_URL}/chat`, {
  pingInterval: 30_000, // mantém o socket vivo
  maxRetries: 10,
  onOpen: () => console.log("ws aberto"),
  onMessage: ({ data }) => render(data),
  onClose: (event) => console.log("fechou", event.code),
  onStatusChange: (status) => console.log("WS", status),
});

// Enviar — retorna false se o socket não estiver aberto:
const sent = socket.send(JSON.stringify({ user: "ana", text: "oi" }));

// Frame binário:
socket.send(new Uint8Array([1, 2, 3]).buffer);

// Encerrar (não tenta reconectar):
socket.close();

// Forçar reconexão imediata (zera o contador):
socket.reconnect();
```

`onMessage` recebe `{ data, raw }` — `data` já vem JSON-parsed (fallback pra string), `raw` é o `MessageEvent` original.

### Reconexão, ping e fechamento limpo

```text
Backoff: 1s → 2s → 4s → ... (limitado em 30s), até maxRetries (default 10)
```

- Reconnect exponencial igual ao SSE (default `maxRetries: 10`).
- `pingInterval` (ms) envia `pingPayload` periodicamente — default `JSON.stringify({ type: "ping" })`. Passe `0` (default) pra desativar.
- `respondToPing` (default `true`) responde `pongPayload` a todo frame `{"type":"ping"}` que **chega**. É esse o heartbeat que o `tempest-fastapi-sdk` espera: sem o `pong` ele fecha o socket com o código `4408` ao estourar `WS_HEARTBEAT_TIMEOUT_SECONDS`.
- `queueWhileClosed` (default `false`) guarda o que você tentar enviar enquanto o socket está caído e drena na próxima abertura, mais antigo primeiro, com teto em `maxQueuedMessages` (default 100).
- **Reconnect só dispara em `close.wasClean === false`.** Fechamentos limpos (`socket.close()` ou um close normal do servidor) **não** tentam reabrir.

!!! warning "`send()` é no-op quando o socket não está aberto"
    Se você chamar `send()` antes do status virar `"open"` (ou após um `close`), nada é enviado e o retorno é `false`. Sempre confira `status === "open"` (ou o boolean de retorno) antes de assumir que a mensagem saiu.

    Ligue `queueWhileClosed: true` quando a ação **não pode** sumir: aí o `send()` bufferiza durante o backoff e devolve `true`, e a fila é despejada no `open` seguinte. A fila morre no `close()` — nada sobrevive a um fechamento explícito.

!!! danger "Contra o servidor Tempest, não ligue `pingInterval`"
    O `tempest-fastapi-sdk` **manda** o ping e quer o `pong` de volta. Um `{"type":"ping"}` vindo do cliente é frame desconhecido pra ele — um handler estrito recusa. Deixe `pingInterval: 0` (default) e o `respondToPing` cuida do heartbeat.

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
        Enviar
      </button>
      {ws.status === "error" && <button onClick={ws.reconnect}>Reconectar</button>}
    </div>
  );
}
```

- O hook devolve `{ status, lastMessage, send, reconnect }`.
- `enabled: false` não abre o socket; mudar a URL reabre. **Todos** os callbacks (`onOpen`, `onMessage`, `onClose`, `onError`) passam por ref: arrow function inline é seguro, sempre roda a closure atual e nunca reabre o socket.
- Opções que moldam a conexão (`protocols`, `maxRetries`, `initialBackoff`, `maxBackoff`, `pingInterval`, `queueWhileClosed`) fazem parte do handshake — mudar uma **reabre** o socket com o valor novo, em vez de ser ignorada em silêncio.

!!! warning "`lastMessage` é foto, não fila"
    Cada frame vira um `setState`, então dois que cheguem no mesmo tick colapsam num render só e você enxerga apenas o último. Uma única ação no servidor costuma emitir vários frames em sequência. Para **stream** use `onMessage`, que dispara uma vez por frame; `lastMessage` serve pra renderizar estado atual.
- `send` é estável (`useCallback`) — pode ir em deps sem reabrir nada.
- Cleanup automático no unmount (fechamento limpo, não tenta reconectar).

## Status

`"idle" | "connecting" | "open" | "closing" | "closed" | "error"` — `error` indica que o socket esgotou `maxRetries` após fechamentos não-limpos.

## Recap

- `createWebSocket(url, options)` abre um WebSocket bidirecional; o controller expõe `send`, `close`, `reconnect` e `status`.
- `send()` retorna `false` (no-op) quando o socket não está aberto — sempre cheque antes.
- Reconnect exponencial só dispara em fechamento **não-limpo**; closes limpos não reabrem.
- `pingInterval` + `pingPayload` mantêm a conexão viva.
- `useWebSocket` amarra tudo ao componente e expõe `status`/`lastMessage`/`send`/`reconnect`.

## Veja também

- [SSE](./sse.md) — quando só recebe (mais simples)
- [HTTP](./http.md)
