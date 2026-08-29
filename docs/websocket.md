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

- Reconnect exponencial igual ao SSE (default `maxRetries: 10`), com **jitter** de 30% (`jitter`, 0–1) somado a cada espera.
- `pingInterval` (ms) envia `pingPayload` periodicamente — default `JSON.stringify({ type: "ping" })`. Passe `0` (default) pra desativar.
- `respondToPing` (default `true`) responde `pongPayload` a todo frame `{"type":"ping"}` que **chega**. É esse o heartbeat que o `tempest-fastapi-sdk` espera: sem o `pong` ele fecha o socket com o código `4408` ao estourar `WS_HEARTBEAT_TIMEOUT_SECONDS`.
- `queueWhileClosed` (default `false`) guarda o que você tentar enviar enquanto o socket está caído e drena na próxima abertura, mais antigo primeiro, com teto em `maxQueuedMessages` (default 100).
- **Qual fechamento reabre** depende do código, não só de `wasClean` — a tabela está em [Reconectar ou não](#reconectar-ou-nao).

!!! tip "Por que jitter"
    Quando é o **servidor** que caiu, todo cliente conectado a ele acorda no mesmo cronograma e retenta no mesmo milissegundo — a máquina volta direto para uma estampida sincronizada e derruba as conexões de novo. O jitter só **soma** tempo (o piso continua previsível) e quebra o alinhamento. Passe `jitter: 0` quando quiser um cronograma exato, num teste por exemplo.

### Falhas que não disparam evento

Três modos de falha não geram `open`, `close` nem `error` — e é por isso que uma cadeia de retry montada só sobre eventos trava.

**1. O handshake que pendura.** Um `WebSocket` que não alcança o servidor **não falha**: fica em `CONNECTING`, calado. Medido no Chrome com o backend fora, 12 s depois o `readyState` ainda era `0` e a lista de eventos, vazia. Uma cadeia de retry construída só sobre eventos para na primeira tentativa pendurada e nunca mais anda — e pendurar, não recusar, é exatamente como um link móvel ruim se comporta, que é o cenário para o qual a reconexão existe.

`handshakeTimeout` (default **8000 ms**, `0` desativa) abandona a tentativa e agenda a próxima.

**2. O link que morre em voo.** O socket só reporta conexão que fecha limpo. Se o link morre no meio — o celular sai da cobertura, um intermediário derruba a conexão — o `readyState` fica em `OPEN` desse lado e nada mais chega. **Silêncio é o único sintoma disponível.**

`silenceTimeout` (ms, default `0` = desligado) é a janela tolerada. Ele é rearmado por **qualquer** frame que chega, não só por pong: tráfego é tráfego, e uma negociação em curso já prova que o link carrega dados. Use ~2,5× o intervalo de ping do servidor, para um ping perdido não ser confundido com queda.

```ts
const socket = createWebSocket(url, {
  silenceTimeout: 75_000,
  onMessage: ({ data }) => {
    // o servidor anuncia o próprio heartbeat: não fixe o valor nos dois lados
    if (data.type === "welcome") socket.setSilenceTimeout(data.heartbeat_seconds * 2500);
  },
});
```

**3. O rádio desligado.** Queimar tentativa contra um rádio desligado é como um celular esgota o orçamento dentro do túnel e desiste na saída dele. Com `waitForOnline` (default `true`), enquanto `navigator.onLine` for `false` o cronograma fica **suspenso** e o evento `online` dispara a próxima tentativa.

### Reconectar ou não

| Fechamento | Reabre? | Por quê |
| --- | --- | --- |
| `wasClean: false` (qualquer código) | ✅ | a conexão **morreu**, não terminou |
| `1001`, `1011`, `1012`, `1013` | ✅ | servidor indo embora por um motivo que acaba (deploy, restart, sobrecarga) |
| `4408` | ✅ | timeout de heartbeat do `tempest-fastapi-sdk` — é o **link** falhando |
| `1000` / `1005` limpo | ❌ | despedida de propósito: sessão encerrada, logout, stream terminado |
| `4400`–`4499` (menos `4408`) | ❌ → `onLost("rejected")` | recusa: sala inválida, não autorizado, proibido, cheio |

A mesma classificação está exportada, para quando o seu código precisar inspecionar um `CloseEvent` por conta própria: `isRejectionCloseCode(code)` responde se aquele fechamento é recusa, e `HEARTBEAT_CLOSE_CODE` é o `4408` com nome.

```ts
import { HEARTBEAT_CLOSE_CODE, isRejectionCloseCode } from "tempest-react-sdk";

onClose: (event) => {
  if (isRejectionCloseCode(event.code)) mostrarTelaDeAcessoNegado();
  else if (event.code === HEARTBEAT_CLOSE_CODE) registrar("heartbeat perdido");
};
```

!!! danger "O 4408 mora dentro da faixa de recusa e **não** é uma"
    A leitura óbvia — "4400–4499 é fatal" — torna **permanente** um pong perdido. O `tempest-fastapi-sdk` fecha com `4408` quando o `pong` não chegou dentro de `WS_HEARTBEAT_TIMEOUT_SECONDS`: isso é o link falhando, exatamente o caso para o qual a reconexão existe. O SDK já abre essa exceção para você.

### Reconectando ≠ erro

```ts
const socket = createWebSocket(url, {
  onReconnecting: (attempt, total) => setBanner(`Reconectando ${attempt}/${total}…`),
  onReconnected: () => refetchTudo(),
  onLost: (reason) => setBanner(reason === "rejected" ? "Acesso negado" : "Sem conexão"),
});
```

- `onReconnecting(attempt, total)` — uma tentativa foi **agendada**. Estado discreto, não erro: anunciar cada tentativa põe "a conexão caiu" na frente de quem está com a sessão voltando sozinha.
- `onReconnected()` — voltou depois de pelo menos uma tentativa. Nada é retomado por você: um servidor que guarda estado por conexão vê um cliente novo, então é aqui que você re-assina, re-entra ou refaz o fetch do que o intervalo invalidou.
- `onLost(reason)` — desistiu. É **este** que merece UI, porque é o único estado sobre o qual a pessoa pode agir: ofereça um "tentar de novo" que chama `reconnect()`.

### Entrar é diferente de cair

```ts
const socket = createWebSocket(url, { maxRetries: 0 });

try {
  await socket.opened;
} catch {
  mostrarErroDeEntrada();
}
```

`opened` resolve na primeira abertura e rejeita quando o socket morre **sem nunca ter aberto** (`websocket_rejected`, `websocket_exhausted` ou `websocket_closed`). Falhar ao entrar é um evento diferente de cair no meio: a primeira precisa ser reportada, a segunda deve reconectar em silêncio. Combine com `maxRetries: 0` quando a primeira tentativa tiver que falhar rápido em vez de gastar o cronograma inteiro contra um servidor que não está lá.

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

- O hook devolve `{ status, lastMessage, send, reconnect, setSilenceTimeout }`.
- `enabled: false` não abre o socket; mudar a URL reabre. **Todos** os callbacks (`onOpen`, `onMessage`, `onClose`, `onError`, `onReconnecting`, `onReconnected`, `onLost`) passam por ref: arrow function inline é seguro, sempre roda a closure atual e nunca reabre o socket.
- Opções que moldam a conexão (`protocols`, `maxRetries`, `initialBackoff`, `maxBackoff`, `jitter`, `handshakeTimeout`, `silenceTimeout`, `waitForOnline`, `pingInterval`, `queueWhileClosed`) fazem parte do handshake — mudar uma **reabre** o socket com o valor novo, em vez de ser ignorada em silêncio.

!!! warning "`lastMessage` é foto, não fila"
    Cada frame vira um `setState`, então dois que cheguem no mesmo tick colapsam num render só e você enxerga apenas o último. Uma única ação no servidor costuma emitir vários frames em sequência. Para **stream** use `onMessage`, que dispara uma vez por frame; `lastMessage` serve pra renderizar estado atual.
- `send` é estável (`useCallback`) — pode ir em deps sem reabrir nada.
- Cleanup automático no unmount (fechamento limpo, não tenta reconectar).

## Frame que não é JSON

Por padrão os dois transportes fazem `JSON.parse` do frame. Quando o parse falha —
o servidor devolveu HTML de erro, um `ping` em texto puro, um proxy injetou algo —
o SDK entrega a **string crua anunciada como o seu tipo**. É o comportamento
histórico e ele continua, porque mudá-lo quebraria quem depende dele; o que mudou
é que ele parou de ser silencioso.

```tsx
import { createWebSocket } from "tempest-react-sdk";

interface Evento {
    id: string;
    tipo: string;
}

const socket = createWebSocket<Evento>("wss://api.exemplo.com/eventos", {
    onParseError: (erro, raw) => {
        console.error("frame ilegível, descartado:", raw.slice(0, 120), erro);
    },
    onMessage: ({ data }) => {
        console.log(data.id);
    },
});
```

Com `onParseError` registrado, o frame quebrado **não chega** em `onMessage` — quem
pediu para ouvir a falha não pediu para também receber o frame. Sem ele, o frame é
entregue como antes e um build de desenvolvimento avisa **uma vez** por transporte
no console.

!!! warning "Por que o padrão antigo é uma armadilha"
    `data` tipado como `Evento` sendo na verdade uma `string` não explode no
    parse — explode no primeiro `data.id`, longe dali, sem nada apontando para o
    frame que causou. O aviso e o `onParseError` existem para o erro aparecer onde
    ele acontece.

!!! tip "`parser` continua mandando"
    Passar `parser` desliga tudo isso: o resultado dele é sempre entregue, porque
    decodificar texto, binário em base64 ou um protocolo próprio é justamente o
    propósito da opção. `onParseError` só entra em cena quando não há `parser`.

## Status

`"idle" | "connecting" | "open" | "closing" | "closed" | "error"` — `error` é terminal e chega junto com `onLost`: ou o cronograma esgotou (`"exhausted"`), ou o servidor recusou o cliente (`"rejected"`). Uma reconexão em curso passa por `"connecting"`, não por `"error"`.

## Recap

- `createWebSocket(url, options)` abre um WebSocket bidirecional; o controller expõe `send`, `close`, `reconnect`, `setSilenceTimeout`, `opened` e `status`.
- `send()` retorna `false` (no-op) quando o socket não está aberto — sempre cheque antes.
- Três falhas não disparam evento nenhum e têm knob próprio: handshake pendurado (`handshakeTimeout`), link morto em voo (`silenceTimeout`), rádio desligado (`waitForOnline`).
- Reabrir depende do código de fechamento, não só de `wasClean`: `4400`–`4499` é recusa (menos `4408`, que é o heartbeat e **reabre**); `1000` limpo é despedida.
- `onReconnecting` é estado discreto; `onLost` é o que merece UI e um botão de "tentar de novo".
- `opened` separa "não consegui entrar" de "caiu no meio" — a primeira é erro, a segunda reconecta sozinha.
- `pingInterval` + `pingPayload` mantêm a conexão viva.
- `useWebSocket` amarra tudo ao componente e expõe `status`/`lastMessage`/`send`/`reconnect`/`setSilenceTimeout`.

## Veja também

- [SSE](./sse.md) — quando só recebe (mais simples)
- [HTTP](./http.md)
