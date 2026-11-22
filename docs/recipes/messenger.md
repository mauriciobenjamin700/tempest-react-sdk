# Mensageiro em tempo real

A Marina trabalha na central de atendimento de uma loja online. O dia inteiro ela
responde clientes que escrevem pelo chat do site: "meu pedido não chegou", "quero
trocar o tamanho", "cadê a nota fiscal". Ela atende várias pessoas ao mesmo tempo,
às vezes do notebook, às vezes do celular, no ônibus, com a rede caindo e voltando.

A tela dela precisa de duas coisas que parecem simples e não são: **ver tudo ao
vivo** e **nunca perder uma mensagem** — nem a que chega, nem a que ela manda.

Nesta receita você monta essa tela inteira com o SDK. 🚀

## O que vamos construir

- 📥 **Fila de conversas** com prévia da última mensagem, horário relativo, contador
  de não lidas e bolinha de presença do cliente.
- 💬 **A conversa** com o histórico carregando para cima conforme você rola, sem a
  tela pular.
- ⚡ **Envio otimista**: a mensagem aparece na hora, com "enviando", e vira "falhou —
  tentar de novo" se o servidor recusar.
- 🖼️ **Foto anexada** com barra de progresso dentro da bolha.
- ✍️ **"João está digitando…"** nos dois sentidos.
- 🔌 **WebSocket que cai e volta** sem duplicar nem embaralhar mensagens, com aviso
  discreto enquanto reconecta e um botão quando desiste.
- 🔢 **Não lidas** no badge da fila e no título da aba: `(3) Atendimento`.
- 📱 **Celular**: lista **ou** conversa, com botão de voltar, e a URL guardando qual
  conversa está aberta.

E todos os estados de uma tela de verdade: carregando, vazia, com erro e com sucesso.

## O contrato com o backend

O backend é um serviço FastAPI sobre o `tempest-fastapi-sdk` (veja a
[integração full-stack](../integration-fastapi.md)). A sessão é por cookie, na mesma
origem do app. São seis rotas REST e um WebSocket:

| Rota | O que faz |
| --- | --- |
| `GET /api/auth/me` | Quem é a atendente logada |
| `GET /api/support/conversations` | A fila, da mais recente para a mais antiga |
| `GET /api/support/conversations/{id}/messages?cursor=&limit=` | Histórico paginado por cursor, **mais nova primeiro** |
| `POST /api/support/conversations/{id}/messages` | Envia uma mensagem (header `Idempotency-Key`) |
| `POST /api/support/conversations/{id}/read` | Zera as não lidas daquela conversa |
| `POST /api/support/attachments` | Sobe a imagem (multipart) e devolve o anexo |
| `WS /ws/support` | Eventos ao vivo |

Uma conversa da fila:

```json
{
  "id": "c-48213",
  "subject": "Pedido #48213 não chegou",
  "status": "open",
  "customer": { "id": "cu-77", "name": "João Pereira", "avatar_url": null, "online": true },
  "last_message": { "body": "Já faz 10 dias", "author_id": "cu-77", "created_at": "2026-11-22T14:03:00Z" },
  "unread_count": 2,
  "customer_read_seq": 70
}
```

Uma mensagem. O `seq` é um contador **por conversa**, crescente, dado pelo servidor; o
`client_id` é o id que o **app** gerou antes de enviar:

```json
{
  "id": "m-9f1c",
  "conversation_id": "c-48213",
  "seq": 81,
  "client_id": "3b0c1f9e-6a43-4d2f-9a51-0c7d4e2b8a10",
  "author_id": "ag-1",
  "author_name": "Marina Costa",
  "body": "Seu pedido saiu hoje da transportadora 🚚",
  "attachments": [],
  "created_at": "2026-11-22T14:05:12Z"
}
```

O histórico volta no envelope de cursor do `tempest-fastapi-sdk`
(`{ "items": [...], "next_cursor": "...", "has_more": true, "limit": 30 }`) e os
eventos do socket são estes:

```json
{ "type": "message.created", "message": { "id": "m-9f1c", "seq": 81, "...": "..." } }
{ "type": "typing", "conversation_id": "c-48213", "user_id": "cu-77", "user_name": "João Pereira" }
{ "type": "presence", "user_id": "cu-77", "online": false }
{ "type": "conversation.read", "conversation_id": "c-48213", "seq": 81 }
{ "type": "ping" }
```

O `ping` é o heartbeat do servidor: o SDK responde `pong` sozinho.

## Os arquivos

```text
src/
├── App.tsx                     rotas + providers
├── lib/api.ts                  cliente HTTP
├── pages/SupportPage.tsx       a página: colunas, celular, banner de conexão
└── support/
    ├── contract.ts             tipos e schema dos eventos
    ├── inbox-state.ts          estado ao vivo (reducer)
    ├── thread.tsx              ordena, deduplica e converte para o <Chat>
    ├── use-support-inbox.ts    socket + envio + leitura
    ├── ConversationList.tsx    a fila
    ├── ConversationView.tsx    a conversa
    └── support.module.css
```

Vamos um por um.

## 1. O cliente HTTP

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";

export const api = createApiClient({
    baseURL: "/api",
    withCredentials: true,
    csrf: true,
});
```

Um [`createApiClient`](../http.md#createapiclient) só, para o app inteiro. Com sessão
por cookie, `withCredentials` manda o cookie e `csrf: true` ecoa o `csrf_token` no
header `X-CSRF-Token` em toda escrita — veja
[CSRF](../http.md#csrf-o-cookie-de-sessao-precisa-de-um-par).

## 2. O contrato tipado

```ts
// src/support/contract.ts
import { z } from "zod";

export interface Agent {
    id: string;
    name: string;
    avatar_url: string | null;
}

const attachmentSchema = z.object({
    kind: z.literal("image"),
    url: z.string(),
    name: z.string(),
    width: z.number(),
    height: z.number(),
});

const messageSchema = z.object({
    id: z.string(),
    conversation_id: z.string(),
    seq: z.number().int(),
    client_id: z.string().nullable(),
    author_id: z.string(),
    author_name: z.string(),
    body: z.string(),
    attachments: z.array(attachmentSchema),
    created_at: z.string(),
});

export type Attachment = z.infer<typeof attachmentSchema>;
export type Message = z.infer<typeof messageSchema>;

export interface Conversation {
    id: string;
    subject: string;
    status: "open" | "waiting" | "closed";
    customer: {
        id: string;
        name: string;
        avatar_url: string | null;
        online: boolean;
    };
    last_message: {
        body: string;
        author_id: string;
        created_at: string;
    } | null;
    unread_count: number;
    customer_read_seq: number;
}

export const socketEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("ping") }),
    z.object({ type: z.literal("message.created"), message: messageSchema }),
    z.object({
        type: z.literal("typing"),
        conversation_id: z.string(),
        user_id: z.string(),
        user_name: z.string(),
    }),
    z.object({ type: z.literal("presence"), user_id: z.string(), online: z.boolean() }),
    z.object({
        type: z.literal("conversation.read"),
        conversation_id: z.string(),
        seq: z.number().int(),
    }),
]);

export type SocketEvent = z.infer<typeof socketEventSchema>;

export const conversationsKey: readonly ["support", "conversations"] = ["support", "conversations"];

export function messagesKey(conversationId: string): readonly ["support", "messages", string] {
    return ["support", "messages", conversationId];
}
```

Os tipos das mensagens saem do **mesmo** schema `zod` que vai validar cada frame do
socket. Assim o que o TypeScript promete e o que chega em runtime são a mesma coisa.

!!! warning "Ponha o `ping` no schema"
    Com [`schema`](../websocket.md#validar-o-frame-com-schema), todo frame que não casa
    vai para o `onValidationError`. O heartbeat do servidor (`{"type":"ping"}`) também:
    sem a entrada `ping` na união, você ganha um aviso a cada batida. O `pong` sai de
    qualquer jeito — mas o console fica inútil.

As chaves de query (`conversationsKey`, `messagesKey`) moram aqui porque três arquivos
diferentes leem e escrevem nelas.

## 3. O estado ao vivo

O histórico vem do REST e mora no cache do TanStack Query. Tudo que chega **depois**
— mensagens pelo socket, quem está digitando, presença, confirmação de leitura — e
tudo que ainda **não saiu** (as mensagens otimistas) mora num reducer:

```ts
// src/support/inbox-state.ts
import type { Attachment, Conversation, Message } from "@/support/contract";

export interface PendingMessage {
    clientId: string;
    conversationId: string;
    text: string;
    image: { file: File; previewUrl: string } | null;
    uploaded: Attachment | null;
    progress: number | null;
    status: "sending" | "failed";
    createdAt: number;
}

export interface TypingEntry {
    userId: string;
    name: string;
    at: number;
}

export interface InboxState {
    live: Record<string, Message[]>;
    pending: Record<string, PendingMessage[]>;
    typing: Record<string, TypingEntry[]>;
    presence: Record<string, boolean>;
    readSeq: Record<string, number>;
}

export type InboxAction =
    | { type: "message"; message: Message }
    | { type: "pending"; item: PendingMessage }
    | {
          type: "patch-pending";
          conversationId: string;
          clientId: string;
          patch: Partial<PendingMessage>;
      }
    | { type: "typing"; conversationId: string; userId: string; name: string; at: number }
    | { type: "typing-expired"; conversationId: string; userId: string; at: number }
    | { type: "presence"; userId: string; online: boolean }
    | { type: "read"; conversationId: string; seq: number };

export const initialInboxState: InboxState = {
    live: {},
    pending: {},
    typing: {},
    presence: {},
    readSeq: {},
};

export function inboxReducer(state: InboxState, action: InboxAction): InboxState {
    switch (action.type) {
        case "message": {
            const { message } = action;
            const id = message.conversation_id;
            const live = (state.live[id] ?? []).filter((item) => item.id !== message.id);
            return {
                ...state,
                live: { ...state.live, [id]: [...live, message] },
                pending: {
                    ...state.pending,
                    [id]: (state.pending[id] ?? []).filter(
                        (item) => item.clientId !== message.client_id,
                    ),
                },
                typing: {
                    ...state.typing,
                    [id]: (state.typing[id] ?? []).filter(
                        (entry) => entry.userId !== message.author_id,
                    ),
                },
            };
        }
        case "pending": {
            const id = action.item.conversationId;
            return {
                ...state,
                pending: { ...state.pending, [id]: [...(state.pending[id] ?? []), action.item] },
            };
        }
        case "patch-pending": {
            const id = action.conversationId;
            return {
                ...state,
                pending: {
                    ...state.pending,
                    [id]: (state.pending[id] ?? []).map((item) =>
                        item.clientId === action.clientId ? { ...item, ...action.patch } : item,
                    ),
                },
            };
        }
        case "typing": {
            const id = action.conversationId;
            const others = (state.typing[id] ?? []).filter(
                (entry) => entry.userId !== action.userId,
            );
            const entry: TypingEntry = { userId: action.userId, name: action.name, at: action.at };
            return { ...state, typing: { ...state.typing, [id]: [...others, entry] } };
        }
        case "typing-expired": {
            const id = action.conversationId;
            return {
                ...state,
                typing: {
                    ...state.typing,
                    [id]: (state.typing[id] ?? []).filter(
                        (entry) => !(entry.userId === action.userId && entry.at === action.at),
                    ),
                },
            };
        }
        case "presence":
            return { ...state, presence: { ...state.presence, [action.userId]: action.online } };
        case "read": {
            const current = state.readSeq[action.conversationId] ?? 0;
            return {
                ...state,
                readSeq: {
                    ...state.readSeq,
                    [action.conversationId]: Math.max(current, action.seq),
                },
            };
        }
    }
}

export function bumpConversation(
    list: Conversation[] | undefined,
    message: Message,
    countAsUnread: boolean,
): Conversation[] | undefined {
    if (!list) return list;
    const current = list.find((item) => item.id === message.conversation_id);
    if (!current) return list;
    const updated: Conversation = {
        ...current,
        last_message: {
            body: message.body || "📷 Imagem",
            author_id: message.author_id,
            created_at: message.created_at,
        },
        unread_count: countAsUnread ? current.unread_count + 1 : current.unread_count,
    };
    return [updated, ...list.filter((item) => item.id !== current.id)];
}
```

Repare em três detalhes:

- **`message` remove o pendente** com o mesmo `client_id`. É assim que a bolha
  otimista "vira" a confirmada.
- **`message` também tira o autor de "digitando"**: quem acabou de mandar a mensagem
  não está mais digitando, mesmo que o evento de parar nunca chegue.
- **`typing-expired` só apaga se o `at` bate.** Cada evento de digitação agenda a
  própria expiração; se o cliente continuou digitando, chegou um evento novo com
  outro `at`, e a expiração antiga não apaga o indicador no meio da frase.

`bumpConversation` sobe a conversa para o topo da fila e atualiza prévia e
não lidas, direto no cache — sem refazer a requisição da lista.

## 4. A thread: ordenar e deduplicar

Uma mensagem pode chegar por **três** caminhos: no histórico, no evento do socket e
na resposta do `POST` que você mesmo fez. Depois de uma reconexão, o histórico é
recarregado e traz de novo o que o socket já tinha entregado. Sem cuidado, a mesma
mensagem aparece duas vezes, ou fora de ordem.

```tsx
// src/support/thread.tsx
import { Progress, type ChatAttachment, type ChatMessage } from "tempest-react-sdk";

import type { Attachment, Message } from "@/support/contract";
import type { PendingMessage } from "@/support/inbox-state";

export interface ThreadInput {
    history: readonly Message[];
    live: readonly Message[];
    pending: readonly PendingMessage[];
    myId: string;
    customerReadSeq: number;
}

function toChatAttachments(list: readonly Attachment[]): ChatAttachment[] {
    return list.map((item) => ({ kind: "image", url: item.url, name: item.name, alt: item.name }));
}

function fromServer(message: Message, input: ThreadInput): ChatMessage {
    const mine = message.author_id === input.myId;
    return {
        id: message.client_id ?? message.id,
        authorId: message.author_id,
        authorName: message.author_name,
        sentAt: Date.parse(message.created_at),
        body: message.body || undefined,
        attachments:
            message.attachments.length > 0 ? toChatAttachments(message.attachments) : undefined,
        status: mine ? (message.seq <= input.customerReadSeq ? "read" : "sent") : undefined,
    };
}

function fromPending(item: PendingMessage, myId: string): ChatMessage {
    const uploading = item.status === "sending" && item.progress !== null;
    return {
        id: item.clientId,
        authorId: myId,
        sentAt: item.createdAt,
        status: item.status,
        body: uploading ? (
            <Progress value={item.progress ?? 0} max={100} label="Enviando imagem" showLabel />
        ) : (
            item.text || undefined
        ),
        attachments: item.image
            ? [{ kind: "image", url: item.image.previewUrl, alt: item.image.file.name }]
            : undefined,
    };
}

export function buildThread(input: ThreadInput): ChatMessage[] {
    const byId = new Map<string, Message>();
    for (const message of [...input.history, ...input.live]) byId.set(message.id, message);

    const confirmed = [...byId.values()].sort((a, b) => a.seq - b.seq);
    const confirmedClientIds = new Set<string | null>(confirmed.map((m) => m.client_id));
    const waiting = input.pending
        .filter((item) => !confirmedClientIds.has(item.clientId))
        .sort((a, b) => a.createdAt - b.createdAt);

    return [
        ...confirmed.map((message) => fromServer(message, input)),
        ...waiting.map((item) => fromPending(item, input.myId)),
    ];
}
```

O que garante a tela certa:

1. **Um `Map` por `id`** junta histórico e ao vivo: a mesma mensagem vinda de dois
   lugares ocupa uma posição só.
2. **Ordena por `seq`, não por horário.** Relógio de servidor e de cliente discordam;
   o `seq` é a ordem em que o servidor aceitou. O [`<Chat>`](../components/advanced-chat.md#chat)
   **nunca reordena** o que recebe — a ordem é responsabilidade sua, e é aqui que
   ela é decidida.
3. **Pendente cujo `client_id` já foi confirmado some.** O reducer já faz isso, mas
   um histórico recarregado pode trazer a sua mensagem **antes** da resposta do
   `POST`. Filtrar aqui fecha essa janela.
4. **O `id` da bolha é o `client_id` quando existe.** A bolha otimista e a confirmada
   têm o mesmo `id`, então o React reaproveita o elemento: nada pisca, a foto não
   recarrega.
5. **Upload em andamento vira um [`<Progress>`](../components/feedback.md#progress)
   no `body`.** O `body` do `ChatMessage` é `ReactNode`, não `string`.

!!! info "Ticks de leitura"
    Mensagem sua com `seq` até o `customer_read_seq` (ou o último
    `conversation.read`) recebe `status: "read"` e mostra ✓✓ pintado. As outras,
    `"sent"`. Pendentes ficam com `"sending"` ou `"failed"`.

## 5. O socket, o envio e a leitura

Este é o coração da receita: um hook que abre **um** WebSocket para a caixa de
entrada inteira e expõe tudo que a tela faz.

```ts
// src/support/use-support-inbox.ts
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useRef, useState } from "react";
import {
    describeApiError,
    encodeIdSegment,
    generateIdempotencyKey,
    uploadWithProgress,
    useToast,
    useWebSocket,
    type WebSocketLostReason,
} from "tempest-react-sdk";

import { api } from "@/lib/api";
import {
    conversationsKey,
    socketEventSchema,
    type Agent,
    type Attachment,
    type Conversation,
    type Message,
    type SocketEvent,
} from "@/support/contract";
import {
    bumpConversation,
    inboxReducer,
    initialInboxState,
    type InboxState,
    type PendingMessage,
} from "@/support/inbox-state";

const SOCKET_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/support`;
const TYPING_TTL_MS = 6_000;
const TYPING_THROTTLE_MS = 3_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type Connection = "connecting" | "online" | "reconnecting" | "lost";

export interface SupportInbox {
    state: InboxState;
    connection: Connection;
    lostReason: WebSocketLostReason | null;
    reconnect: () => void;
    sendText: (conversationId: string, text: string) => void;
    sendImage: (conversationId: string, file: File) => void;
    retry: (conversationId: string, clientId: string) => void;
    notifyTyping: (conversationId: string) => void;
    markRead: (conversationId: string) => void;
}

export function useSupportInbox(me: Agent, openConversationId: string | null): SupportInbox {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [state, dispatch] = useReducer(inboxReducer, initialInboxState);
    const [opened, setOpened] = useState<boolean>(false);
    const [lostReason, setLostReason] = useState<WebSocketLostReason | null>(null);
    const seen = useRef<Set<string>>(new Set());
    const lastTypingSent = useRef<Record<string, number>>({});

    const markRead = useCallback(
        (conversationId: string): void => {
            queryClient.setQueryData<Conversation[]>(conversationsKey, (list) =>
                list?.map((item) =>
                    item.id === conversationId ? { ...item, unread_count: 0 } : item,
                ),
            );
            api.post<void>(`/support/conversations/${encodeIdSegment(conversationId)}/read`).catch(
                () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
            );
        },
        [queryClient],
    );

    function receive(message: Message): void {
        if (seen.current.has(message.id)) return;
        seen.current.add(message.id);
        dispatch({ type: "message", message });

        const fromCustomer = message.author_id !== me.id;
        const isOpen = message.conversation_id === openConversationId;
        const known = queryClient
            .getQueryData<Conversation[]>(conversationsKey)
            ?.some((item) => item.id === message.conversation_id);
        if (!known) {
            void queryClient.invalidateQueries({ queryKey: conversationsKey });
            return;
        }
        queryClient.setQueryData<Conversation[]>(conversationsKey, (list) =>
            bumpConversation(list, message, fromCustomer && !isOpen),
        );
        if (fromCustomer && isOpen) markRead(message.conversation_id);
    }

    function handleEvent(event: SocketEvent): void {
        switch (event.type) {
            case "ping":
                return;
            case "message.created":
                receive(event.message);
                return;
            case "typing": {
                if (event.user_id === me.id) return;
                const at = Date.now();
                const target = { conversationId: event.conversation_id, userId: event.user_id };
                dispatch({ type: "typing", ...target, name: event.user_name, at });
                window.setTimeout(
                    () => dispatch({ type: "typing-expired", ...target, at }),
                    TYPING_TTL_MS,
                );
                return;
            }
            case "presence":
                dispatch({ type: "presence", userId: event.user_id, online: event.online });
                return;
            case "conversation.read":
                dispatch({ type: "read", conversationId: event.conversation_id, seq: event.seq });
                return;
        }
    }

    const socket = useWebSocket<SocketEvent>(SOCKET_URL, {
        schema: socketEventSchema,
        silenceTimeout: 75_000,
        onValidationError: (issues, raw) => {
            console.warn("Evento fora do contrato, descartado", issues, raw.slice(0, 120));
        },
        onOpen: () => {
            setOpened(true);
            setLostReason(null);
        },
        onReconnected: () => {
            void queryClient.invalidateQueries({ queryKey: ["support"] });
        },
        onLost: (reason) => setLostReason(reason),
        onMessage: ({ data }) => handleEvent(data),
    });

    function patch(item: PendingMessage, changes: Partial<PendingMessage>): void {
        dispatch({
            type: "patch-pending",
            conversationId: item.conversationId,
            clientId: item.clientId,
            patch: changes,
        });
    }

    async function deliver(item: PendingMessage): Promise<void> {
        try {
            let attachment: Attachment | null = item.uploaded;
            if (item.image && !attachment) {
                const form = new FormData();
                form.append("file", item.image.file);
                attachment = await uploadWithProgress<Attachment>({
                    url: api.url("/support/attachments"),
                    body: form,
                    withCredentials: true,
                    csrf: true,
                    onProgress: ({ fraction }) => {
                        if (fraction !== null)
                            patch(item, { progress: Math.round(fraction * 100) });
                    },
                });
                patch(item, { uploaded: attachment, progress: null });
            }
            const message = await api.post<Message>(
                `/support/conversations/${encodeIdSegment(item.conversationId)}/messages`,
                {
                    body: {
                        client_id: item.clientId,
                        body: item.text,
                        attachments: attachment ? [attachment] : [],
                    },
                    headers: { "Idempotency-Key": item.clientId },
                },
            );
            receive(message);
            if (item.image) URL.revokeObjectURL(item.image.previewUrl);
        } catch (error) {
            patch(item, { status: "failed", progress: null });
            toast.error(describeApiError(error, "A mensagem não saiu. Toque nela para reenviar."));
        }
    }

    function enqueue(item: PendingMessage): void {
        dispatch({ type: "pending", item });
        void deliver(item);
    }

    return {
        state,
        connection:
            socket.status === "open"
                ? "online"
                : lostReason !== null
                  ? "lost"
                  : opened
                    ? "reconnecting"
                    : "connecting",
        lostReason,
        reconnect: socket.reconnect,
        markRead,
        sendText: (conversationId, text) =>
            enqueue({
                clientId: generateIdempotencyKey(),
                conversationId,
                text,
                image: null,
                uploaded: null,
                progress: null,
                status: "sending",
                createdAt: Date.now(),
            }),
        sendImage: (conversationId, file) => {
            if (!file.type.startsWith("image/")) {
                toast.error("Só dá para anexar imagens (JPG, PNG ou WebP).");
                return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                toast.error("A imagem passa de 10 MB.");
                return;
            }
            enqueue({
                clientId: generateIdempotencyKey(),
                conversationId,
                text: "",
                image: { file, previewUrl: URL.createObjectURL(file) },
                uploaded: null,
                progress: 0,
                status: "sending",
                createdAt: Date.now(),
            });
        },
        retry: (conversationId, clientId) => {
            const item = state.pending[conversationId]?.find((p) => p.clientId === clientId);
            if (!item) return;
            const again: PendingMessage = {
                ...item,
                status: "sending",
                progress: item.image && !item.uploaded ? 0 : null,
            };
            patch(item, again);
            void deliver(again);
        },
        notifyTyping: (conversationId) => {
            const now = Date.now();
            if (now - (lastTypingSent.current[conversationId] ?? 0) < TYPING_THROTTLE_MS) return;
            if (socket.send(JSON.stringify({ type: "typing", conversation_id: conversationId }))) {
                lastTypingSent.current[conversationId] = now;
            }
        },
    };
}
```

Pedaço por pedaço.

### O socket

O [`useWebSocket`](../websocket.md#hook-usewebsocket) faz o trabalho pesado:
reconexão com backoff e jitter, abandono de handshake pendurado, espera do rádio
voltar e resposta ao `ping` do `tempest-fastapi-sdk`.

- `schema: socketEventSchema` — frame fora do contrato não chega no `onMessage`.
- `silenceTimeout: 75_000` — se o link morrer em silêncio (o celular saiu da
  cobertura), o socket é dado como morto e reabre. Use ~2,5× o intervalo de ping
  do seu servidor.
- **Sem `pingInterval`.** Contra o servidor Tempest quem pinga é ele.
- `onReconnected` invalida tudo sob `["support"]`: o que aconteceu enquanto você
  estava fora vem pelo REST, e a deduplicação do passo 4 junta com o que já estava
  na tela.
- `onLost` guarda o motivo (`"exhausted"` ou `"rejected"`) para a página mostrar o
  aviso certo. A tabela de quando o SDK reabre está em
  [Reconectar ou não](../websocket.md#reconectar-ou-nao).

!!! tip "Callbacks inline são seguros"
    `onMessage` lê `openConversationId` e `me` da closure do render atual. Funciona
    porque o hook guarda os callbacks por ref: trocar de conversa **não** reabre o
    socket.

### Deduplicação na entrada

O `seen` é um `Set` de ids já processados. Ele existe porque dois frames podem
chegar no mesmo tick — antes de qualquer re-render — e o `state` da closure ainda
não sabe do primeiro. Sem ele, a mesma mensagem do cliente contaria **duas** não
lidas. A resposta do seu `POST` passa pelo mesmo `receive`, então o eco do socket
da sua própria mensagem também é ignorado.

### Por que enviar por HTTP e não pelo socket

`socket.send()` devolve `true` quando o frame **saiu do navegador**, não quando o
servidor aceitou. Não há resposta, não há erro de validação, não há como saber o
`seq`. O `POST` dá tudo isso:

- **ack com a mensagem gravada** (com `seq`), que entra pelo `receive`;
- **erro tipado** quando falha, que vira frase com
  [`describeApiError`](../http.md#do-erro-tipado-para-a-frase-na-tela-describeapierror);
- **idempotência**: o `client_id` vai no corpo **e** no header `Idempotency-Key`
  (gerado por [`generateIdempotencyKey`](../http.md#generateidempotencykey)). Se a
  resposta se perdeu e a Marina toca em "tentar de novo", o servidor reconhece a
  chave e devolve a mesma mensagem em vez de criar outra.

E de brinde: enquanto o socket reconecta, enviar continua funcionando.

!!! note "O id do caminho passa por `encodeIdSegment`"
    O id da conversa vem do servidor e vira pedaço de URL.
    [`encodeIdSegment`](../http.md#id-dinamico-no-path-encodeidsegment) impede que um
    id com `/` ou `..` aponte para outra rota.

### A foto

`sendImage` valida tipo e tamanho **antes** de qualquer requisição e cria a bolha
otimista com um `blob:` da própria foto — a Marina vê a imagem na hora.
`deliver` sobe o arquivo com
[`uploadWithProgress`](../http.md#uploadwithprogress), que usa XHR por baixo
justamente para reportar progresso, e só então manda a mensagem com o anexo.

Se o upload deu certo e o `POST` da mensagem falhou, o anexo fica guardado em
`uploaded`: o "tentar de novo" **não sobe a foto outra vez**.

### Digitando

`notifyTyping` manda no máximo um evento a cada 3 s por conversa, e só conta como
enviado quando `send()` devolve `true`.

!!! warning "Não ligue `queueWhileClosed` para evento efêmero"
    A fila do socket despeja tudo na reconexão. Um "digitando" de dois minutos atrás
    chegando de uma vez é mentira. Evento que perde o sentido com o tempo deve
    **sumir** quando o socket está fechado — que é o padrão.

### Lidas

`markRead` zera o badge no cache **na hora** e avisa o servidor. Se o aviso falhar,
a lista é recarregada e o badge volta com o número real. É chamado ao abrir a
conversa e a cada mensagem do cliente que chega com ela aberta.

## 6. A fila de conversas

```tsx
// src/support/ConversationList.tsx
import type { UseQueryResult } from "@tanstack/react-query";
import {
    Avatar,
    Badge,
    EmptyState,
    ErrorState,
    ListTile,
    RelativeTime,
    Skeleton,
    describeApiError,
} from "tempest-react-sdk";
import { Icon } from "tempest-react-sdk/icons";

import type { Conversation } from "@/support/contract";
import styles from "@/support/support.module.css";

export interface ConversationListProps {
    query: UseQueryResult<Conversation[]>;
    myId: string;
    activeId: string | null;
    presence: Record<string, boolean>;
    onOpen: (conversationId: string) => void;
}

function preview(conversation: Conversation, myId: string): string {
    const last = conversation.last_message;
    if (!last) return conversation.subject;
    const prefix = last.author_id === myId ? "Você: " : "";
    return `${prefix}${last.body || "📷 Imagem"}`;
}

export function ConversationList({
    query,
    myId,
    activeId,
    presence,
    onOpen,
}: ConversationListProps) {
    if (query.isPending) {
        return (
            <div className={styles.listSkeleton} aria-busy="true" aria-label="Carregando conversas">
                {[0, 1, 2, 3, 4].map((row) => (
                    <div key={row} className={styles.skeletonRow}>
                        <Skeleton variant="circle" width={40} height={40} />
                        <div className={styles.skeletonText}>
                            <Skeleton variant="text" width="60%" />
                            <Skeleton variant="text" width="85%" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (query.isError) {
        return (
            <ErrorState
                title="Não deu para carregar as conversas"
                description={describeApiError(query.error, "Verifique sua conexão.")}
                onRetry={() => void query.refetch()}
            />
        );
    }

    if (query.data.length === 0) {
        return (
            <EmptyState
                icon={<Icon name="inbox" size={32} />}
                title="Fila vazia 🎉"
                description="Quando um cliente abrir um atendimento, ele aparece aqui."
            />
        );
    }

    return (
        <nav aria-label="Conversas">
            <ul className={styles.list}>
                {query.data.map((conversation) => {
                    const { customer } = conversation;
                    const online = presence[customer.id] ?? customer.online;
                    return (
                        <li key={conversation.id}>
                            <ListTile
                                selected={conversation.id === activeId}
                                onClick={() => onOpen(conversation.id)}
                                leading={
                                    <Avatar
                                        name={customer.name}
                                        src={customer.avatar_url ?? undefined}
                                        status={online ? "online" : "offline"}
                                    />
                                }
                                title={customer.name}
                                subtitle={preview(conversation, myId)}
                                trailing={
                                    <span className={styles.meta}>
                                        {conversation.last_message && (
                                            <RelativeTime
                                                date={conversation.last_message.created_at}
                                            />
                                        )}
                                        {conversation.unread_count > 0 && (
                                            <Badge
                                                variant="primary"
                                                appearance="solid"
                                                shape="pill"
                                                aria-label={`${conversation.unread_count} não lidas`}
                                            >
                                                {conversation.unread_count > 99
                                                    ? "99+"
                                                    : conversation.unread_count}
                                            </Badge>
                                        )}
                                    </span>
                                }
                            />
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
```

Cada estado tem a própria cara:

| Estado | O que aparece |
| --- | --- |
| Carregando | Cinco linhas de [`Skeleton`](../components/feedback.md#skeleton) no formato da linha real |
| Erro | [`ErrorState`](../components/feedback.md#errorstate) com a frase do erro e "Tentar novamente" |
| Vazia | [`EmptyState`](../components/feedback.md#emptystate) — fila zerada é boa notícia 🎉 |
| Com conversas | [`ListTile`](../components/data.md#listtile) com [`Avatar`](../components/identity.md#avatar) + presença, [`RelativeTime`](../components/utility.md#relativetime) e [`Badge`](../components/feedback.md#badge) de não lidas |

A presença vem do estado ao vivo quando existe e cai para o `online` da lista quando
ainda não chegou nenhum evento daquele cliente.

!!! tip "O badge diz o número em voz alta"
    `aria-label="2 não lidas"` — para o leitor de tela, "2" sozinho ao lado de um
    nome não significa nada.

## 7. A conversa

```tsx
// src/support/ConversationView.tsx
import { useEffect, useLayoutEffect, useRef, type ReactNode, type UIEvent } from "react";
import {
    Avatar,
    Button,
    Chat,
    EmptyState,
    ErrorState,
    Skeleton,
    describeApiError,
    encodeIdSegment,
    useCursorQuery,
    type CursorPage,
} from "tempest-react-sdk";
import { Icon } from "tempest-react-sdk/icons";

import { api } from "@/lib/api";
import { messagesKey, type Agent, type Conversation, type Message } from "@/support/contract";
import styles from "@/support/support.module.css";
import { buildThread } from "@/support/thread";
import type { SupportInbox } from "@/support/use-support-inbox";

const LOAD_OLDER_THRESHOLD_PX = 160;

export interface ConversationViewProps {
    conversation: Conversation;
    me: Agent;
    inbox: SupportInbox;
    onBack: (() => void) | null;
}

export function ConversationView({ conversation, me, inbox, onBack }: ConversationViewProps) {
    const { id, customer } = conversation;
    const box = useRef<HTMLDivElement | null>(null);
    const fileInput = useRef<HTMLInputElement | null>(null);
    const distanceFromBottom = useRef<number | null>(null);
    const { markRead } = inbox;

    const history = useCursorQuery<Message>({
        queryKey: messagesKey(id),
        limit: 30,
        queryFn: (params) =>
            api.get<CursorPage<Message>>(`/support/conversations/${encodeIdSegment(id)}/messages`, {
                params: { ...params },
            }),
    });

    const messages = buildThread({
        history: history.items,
        live: inbox.state.live[id] ?? [],
        pending: inbox.state.pending[id] ?? [],
        myId: me.id,
        customerReadSeq: Math.max(conversation.customer_read_seq, inbox.state.readSeq[id] ?? 0),
    });
    const oldestId = messages[0]?.id;
    const online = inbox.state.presence[customer.id] ?? customer.online;
    const closed = conversation.status === "closed";

    useEffect(() => {
        markRead(id);
    }, [id, markRead]);

    useLayoutEffect(() => {
        const thread = box.current?.querySelector<HTMLElement>("[role='log']");
        if (!thread || distanceFromBottom.current === null || history.isFetchingNextPage) return;
        thread.scrollTop = thread.scrollHeight - distanceFromBottom.current;
        distanceFromBottom.current = null;
    }, [oldestId, history.isFetchingNextPage]);

    function loadOlder(): void {
        const thread = box.current?.querySelector<HTMLElement>("[role='log']");
        if (!thread || !history.hasNextPage || history.isFetchingNextPage) return;
        distanceFromBottom.current = thread.scrollHeight - thread.scrollTop;
        history.fetchNextPage();
    }

    function onThreadScroll(event: UIEvent<HTMLDivElement>): void {
        const target = event.target as HTMLElement;
        if (target.getAttribute("role") !== "log") return;
        if (distanceFromBottom.current !== null) {
            distanceFromBottom.current = target.scrollHeight - target.scrollTop;
            return;
        }
        if (target.scrollTop < LOAD_OLDER_THRESHOLD_PX) loadOlder();
    }

    const header: ReactNode = (
        <div className={styles.threadHeader}>
            {onBack && (
                <Button
                    variant="ghost"
                    iconOnly
                    aria-label="Voltar para as conversas"
                    onClick={onBack}
                >
                    <Icon name="arrow-left" size={20} />
                </Button>
            )}
            <Avatar
                name={customer.name}
                src={customer.avatar_url ?? undefined}
                status={online ? "online" : "offline"}
                size="sm"
            />
            <div className={styles.threadTitle}>
                <strong>{customer.name}</strong>
                <span>
                    {online ? "Online agora" : "Offline"} · {conversation.subject}
                </span>
            </div>
            {history.hasNextPage && (
                <Button
                    variant="link"
                    size="sm"
                    loading={history.isFetchingNextPage}
                    onClick={loadOlder}
                >
                    Mensagens anteriores
                </Button>
            )}
        </div>
    );

    if (history.isLoading) {
        return (
            <div
                className={styles.threadSkeleton}
                aria-busy="true"
                aria-label="Carregando mensagens"
            >
                {header}
                <Skeleton width="55%" height={48} />
                <Skeleton width="40%" height={48} className={styles.ownSkeleton} />
                <Skeleton width="65%" height={72} />
            </div>
        );
    }

    if (history.error && history.items.length === 0) {
        return (
            <div className={styles.threadSkeleton}>
                {header}
                <ErrorState
                    title="Não deu para abrir esta conversa"
                    description={describeApiError(history.error, "Tente de novo em instantes.")}
                    onRetry={history.refetch}
                />
            </div>
        );
    }

    const attach: ReactNode = (
        <>
            <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) inbox.sendImage(id, file);
                }}
            />
            <Button
                variant="ghost"
                iconOnly
                aria-label="Anexar imagem"
                disabled={closed}
                onClick={() => fileInput.current?.click()}
            >
                <Icon name="paperclip" size={18} />
            </Button>
        </>
    );

    return (
        <div ref={box} className={styles.chatBox} onScrollCapture={onThreadScroll}>
            <Chat
                messages={messages}
                currentUserId={me.id}
                header={header}
                typing={(inbox.state.typing[id] ?? []).map((entry) => entry.name)}
                renderAvatar={(message) => (
                    <Avatar
                        name={
                            message.authorId === me.id
                                ? me.name
                                : (message.authorName ?? customer.name)
                        }
                        size="sm"
                    />
                )}
                onSend={(text) => inbox.sendText(id, text)}
                onRetry={(message) => inbox.retry(id, message.id)}
                composerActions={attach}
                composerDisabled={closed}
                placeholder={closed ? "Atendimento encerrado" : "Escreva para o cliente…"}
                onInput={() => inbox.notifyTyping(id)}
                emptyState={
                    <EmptyState
                        icon={<Icon name="message-circle" size={32} />}
                        title="Nenhuma mensagem ainda"
                        description={`Dê boas-vindas a ${customer.name} e pergunte como pode ajudar.`}
                    />
                }
            />
        </div>
    );
}
```

### Histórico infinito, para cima

O [`useCursorQuery`](../integration-fastapi.md#cursor-usecursorquery) pagina o
histórico: cada `fetchNextPage` traz 30 mensagens **mais antigas**.

O `<Chat>` não tem um "chegou no topo", então a receita escuta o scroll da thread
com `onScrollCapture` no contêiner. Evento de `scroll` não borbulha, mas a fase de
**captura** passa pelos ancestrais — é isso que deixa o pai ouvir a rolagem de um
filho que ele não controla. Perto do topo, `loadOlder` dispara.

O problema clássico: as mensagens antigas entram **acima** do que você está lendo,
e a tela pula. A solução é guardar a **distância até o fim** antes de carregar
(`scrollHeight - scrollTop`) e restaurá-la depois que a página chegou, num
`useLayoutEffect` — antes do navegador pintar.

!!! info "Por que distância até o fim, e não altura"
    Chrome e Firefox têm *scroll anchoring* e às vezes já corrigem a posição
    sozinhos. Somar a diferença de altura por cima dessa correção pularia o dobro.
    "Distância até o fim" é idempotente: se o navegador já ajustou, você escreve o
    mesmo valor. E ela é atualizada a cada scroll enquanto carrega, então rolar
    durante o carregamento também é respeitado.

O botão **Mensagens anteriores** no cabeçalho faz a mesma coisa e cobre quem usa
teclado.

!!! tip "Página que não enche a tela se resolve sozinha"
    Se as 30 primeiras mensagens cabem na tela, a thread nasce com `scrollTop` 0, o
    primeiro scroll dispara `loadOlder` e as páginas vão chegando até encher ou o
    histórico acabar.

### O resto da conversa

- **Carregando**: o cabeçalho real e três `Skeleton` em forma de bolha, um à direita.
- **Erro sem nada para mostrar**: `ErrorState` com `history.refetch`. Se o erro foi
  ao buscar uma página **antiga**, a conversa continua na tela.
- **Vazia**: o `emptyState` do `<Chat>` convida a dar boas-vindas.
- **Anexo**: um `input type="file"` escondido e um [`Button`](../components/actions.md#button)
  `iconOnly` com `aria-label`, passados em `composerActions`.
- **Digitando**: o `<Chat>` aceita atributos de `div` e o evento `input` do campo
  borbulha até ele — `onInput` avisa o servidor. Na direção oposta, `typing` recebe
  os nomes e o componente escreve "João Pereira está digitando…".
- **Atendimento encerrado**: `composerDisabled` e o placeholder explicam por que não
  dá para escrever.
- **Falhou**: `onRetry` liga o botão na bolha vermelha; o texto continua legível
  para a Marina decidir se reenvia.

## 8. A página e o celular

```tsx
// src/pages/SupportPage.tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import {
    Banner,
    Button,
    EmptyState,
    ErrorState,
    Skeleton,
    useBreakpoint,
    useDocumentTitle,
} from "tempest-react-sdk";
import { Icon } from "tempest-react-sdk/icons";

import { api } from "@/lib/api";
import { conversationsKey, type Agent, type Conversation } from "@/support/contract";
import { ConversationList } from "@/support/ConversationList";
import { ConversationView } from "@/support/ConversationView";
import styles from "@/support/support.module.css";
import { useSupportInbox } from "@/support/use-support-inbox";

function SupportInboxScreen({ me }: { me: Agent }) {
    const { conversationId = null } = useParams();
    const navigate = useNavigate();
    const { isMobile } = useBreakpoint();
    const inbox = useSupportInbox(me, conversationId);
    const conversations = useQuery({
        queryKey: conversationsKey,
        queryFn: () => api.get<Conversation[]>("/support/conversations"),
    });

    const list = conversations.data ?? [];
    const active = list.find((item) => item.id === conversationId) ?? null;
    const unread = list.reduce((total, item) => total + item.unread_count, 0);
    useDocumentTitle(unread > 0 ? `(${unread}) Atendimento` : "Atendimento");

    const showList = !isMobile || conversationId === null;
    const showThread = !isMobile || conversationId !== null;

    return (
        <div className={styles.page}>
            {inbox.connection === "reconnecting" && (
                <Banner variant="warning" title="Reconectando…">
                    Mensagens novas aparecem assim que a conexão voltar. O que você enviar continua
                    saindo.
                </Banner>
            )}
            {inbox.connection === "lost" && (
                <Banner
                    variant="danger"
                    title={
                        inbox.lostReason === "rejected"
                            ? "Sua sessão não tem acesso ao atendimento"
                            : "Sem conexão com o atendimento"
                    }
                    action={
                        <Button size="sm" onClick={inbox.reconnect}>
                            Tentar de novo
                        </Button>
                    }
                >
                    Você não vai receber mensagens novas até reconectar.
                </Banner>
            )}

            <div className={styles.columns}>
                {showList && (
                    <aside className={styles.sidebar}>
                        <h1 className={styles.sidebarTitle}>Atendimento</h1>
                        <ConversationList
                            query={conversations}
                            myId={me.id}
                            activeId={conversationId}
                            presence={inbox.state.presence}
                            onOpen={(id) => navigate(`/atendimento/${encodeURIComponent(id)}`)}
                        />
                    </aside>
                )}
                {showThread && (
                    <section className={styles.thread} aria-label="Conversa">
                        {active ? (
                            <ConversationView
                                key={active.id}
                                conversation={active}
                                me={me}
                                inbox={inbox}
                                onBack={isMobile ? () => navigate("/atendimento") : null}
                            />
                        ) : conversations.isPending && conversationId !== null ? (
                            <Skeleton height="100%" />
                        ) : (
                            <EmptyState
                                icon={<Icon name="messages-square" size={32} />}
                                title={
                                    conversationId === null
                                        ? "Escolha uma conversa"
                                        : "Conversa não encontrada"
                                }
                                description={
                                    conversationId === null
                                        ? "As mensagens do cliente aparecem aqui, em tempo real."
                                        : "Ela pode ter sido transferida para outra equipe."
                                }
                                action={
                                    conversationId !== null ? (
                                        <Button
                                            variant="outline"
                                            onClick={() => navigate("/atendimento")}
                                        >
                                            Voltar para a fila
                                        </Button>
                                    ) : undefined
                                }
                            />
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}

export function SupportPage() {
    const me = useQuery({
        queryKey: ["auth", "me"],
        queryFn: () => api.get<Agent>("/auth/me"),
        staleTime: Infinity,
    });

    if (me.isPending) return <Skeleton height="100dvh" />;
    if (me.isError) {
        return (
            <ErrorState
                title="Não deu para abrir o atendimento"
                onRetry={() => void me.refetch()}
            />
        );
    }
    return <SupportInboxScreen me={me.data} />;
}
```

```css
/* src/support/support.module.css */
.page {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--tempest-bg);
}

.columns {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(280px, 360px) 1fr;
    min-height: 0;
}

.sidebar {
    overflow-y: auto;
    border-right: 1px solid var(--tempest-border);
    background: var(--tempest-surface);
}

.sidebarTitle {
    margin: 0;
    padding: var(--tempest-space-4);
    font-size: var(--tempest-text-lg);
}

.list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--tempest-space-1);
    font-size: var(--tempest-text-xs);
    color: var(--tempest-text-muted);
}

.thread,
.chatBox {
    min-width: 0;
    min-height: 0;
    height: 100%;
}

.threadHeader {
    display: flex;
    align-items: center;
    gap: var(--tempest-space-3);
}

.threadTitle {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
}

.threadTitle strong,
.threadTitle span {
    overflow: hidden;
    font-size: var(--tempest-text-sm);
    color: var(--tempest-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.listSkeleton,
.threadSkeleton {
    display: flex;
    flex-direction: column;
    gap: var(--tempest-space-3);
    padding: var(--tempest-space-4);
}

.skeletonRow {
    display: flex;
    align-items: center;
    gap: var(--tempest-space-3);
}

.skeletonText {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--tempest-space-2);
}

.ownSkeleton {
    align-self: flex-end;
}

@media (max-width: 767px) {
    .columns {
        grid-template-columns: 1fr;
    }

    .sidebar {
        border-right: 0;
    }
}
```

```tsx
// src/App.tsx
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { QueryProvider, ToastProvider } from "tempest-react-sdk";

import { SupportPage } from "@/pages/SupportPage";

const router = createBrowserRouter([
    { path: "/", element: <Navigate to="/atendimento" replace /> },
    { path: "/atendimento/:conversationId?", element: <SupportPage /> },
]);

export function App() {
    return (
        <QueryProvider>
            <ToastProvider>
                <RouterProvider router={router} />
            </ToastProvider>
        </QueryProvider>
    );
}
```

### A conversa aberta mora na URL

`/atendimento/:conversationId?` — com isso o botão voltar do Android fecha a
conversa, um link para `/atendimento/c-48213` abre direto nela, e recarregar a
página não perde onde você estava.

### Duas colunas ou uma

[`useBreakpoint`](../hooks.md#responsive-usebreakpoint) diz se é celular (abaixo de
`md`, 768 px). No desktop, fila e conversa lado a lado. No celular, **ou** a fila
**ou** a conversa, e o cabeçalho da conversa ganha a seta de voltar. O CSS usa o
mesmo corte (`max-width: 767px`) para a grade virar uma coluna.

!!! tip "`100dvh`, não `100vh`"
    No celular, `100vh` conta a barra de endereço que some e aparece; o campo de
    digitar fica escondido atrás dela. `dvh` acompanha a área visível.

### O aviso de conexão

| `connection` | O que a Marina vê |
| --- | --- |
| `connecting` | Nada — é a primeira abertura, dura um instante |
| `online` | Nada |
| `reconnecting` | [`Banner`](../components/feedback.md#banner) amarelo: "Reconectando…" — e o envio continua funcionando |
| `lost` | `Banner` vermelho com "Tentar de novo", que chama `reconnect()` |

!!! check "Reconectando não é erro"
    Mostrar "a conexão caiu" a cada tentativa assusta quem está com a sessão voltando
    sozinha. O aviso forte é só para `onLost`, o único estado em que a pessoa pode
    fazer alguma coisa — veja [Reconectando ≠ erro](../websocket.md#reconectando-erro).

O título da aba soma as não lidas com
[`useDocumentTitle`](../hooks.md#titulo-e-favicon-usedocumenttitle-usefavicon): com
o atendimento numa aba de fundo, `(3) Atendimento` é o que faz a Marina voltar.

`App.tsx` só liga as peças: [`QueryProvider`](../query.md#provider) para o cache,
`ToastProvider` para os avisos de envio que falhou e as rotas.

??? note "Detalhes técnicos: e se o socket pular um `seq`?"
    Dentro de uma conexão o servidor entrega em ordem, mas um evento pode se perder
    entre a queda e o `onReconnected`. A receita recarrega tudo na reconexão, o que
    cobre esse buraco. Se o seu histórico for grande e o refetch pesar, dá para
    detectar o buraco no `receive` (`message.seq` maior que o último `seq` conhecido
    + 1) e invalidar só aquela conversa.

## Recap

- 🔌 **Um socket só**, com `useWebSocket` + `schema` (com o `ping` dentro),
  `silenceTimeout` e sem `pingInterval` contra o servidor Tempest.
- 🧮 **Ordem por `seq`, deduplicação por `id` e por `client_id`.** O `<Chat>` nunca
  reordena: a ordem é sua.
- ⚡ **Envio otimista por HTTP** com `generateIdempotencyKey`: ack, erro tipado e
  retry sem duplicar. O socket só **recebe**.
- 🖼️ **Foto com `uploadWithProgress`**, preview `blob:` na hora e o anexo guardado
  para o retry não subir de novo.
- 📜 **Histórico para cima** com `useCursorQuery` e a distância até o fim restaurada
  num `useLayoutEffect`.
- 🔢 **Não lidas no cache** do TanStack Query, atualizadas pelos eventos, sem
  refazer a lista.
- 📱 **URL guarda a conversa**, `useBreakpoint` decide uma ou duas colunas.
