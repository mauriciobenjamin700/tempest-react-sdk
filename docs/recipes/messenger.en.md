# Real-time messenger

Marina works in the support center of an online store. All day long she answers
customers who write through the site's chat: "my order never arrived", "I want a
different size", "where is my invoice". She handles several people at once, sometimes
from a laptop, sometimes from her phone on the bus, with the network dropping and
coming back.

Her screen needs two things that look simple and are not: **see everything live** and
**never lose a message** — neither the one that arrives nor the one she sends.

In this recipe you build that whole screen with the SDK. 🚀

## What we are going to build

- 📥 **Conversation queue** with a preview of the last message, relative time,
  unread counter and the customer's presence dot.
- 💬 **The conversation**, with history loading upwards as you scroll, without the
  screen jumping.
- ⚡ **Optimistic send**: the message shows up at once, as "sending", and turns into
  "failed — try again" if the server refuses it.
- 🖼️ **Attached photo** with a progress bar inside the bubble.
- ✍️ **"João is typing…"** in both directions.
- 🔌 **A WebSocket that drops and comes back** without duplicating or shuffling
  messages, with a quiet notice while it reconnects and a button when it gives up.
- 🔢 **Unread counts** on the queue badge and in the tab title: `(3) Atendimento`.
- 📱 **Phone**: list **or** conversation, with a back button, and the URL keeping
  which conversation is open.

And every state a real screen has: loading, empty, error and success.

## The backend contract

The backend is a FastAPI service built on `tempest-fastapi-sdk` (see the
[full-stack integration](../integration-fastapi.md)). The session is a cookie, on the
same origin as the app. There are a handful of REST routes and one WebSocket:

| Route | What it does |
| --- | --- |
| `GET /api/auth/me` | The agent who is logged in |
| `GET /api/support/conversations` | The queue, most recent first |
| `GET /api/support/conversations/{id}/messages?cursor=&limit=` | Cursor-paginated history, **newest first** |
| `POST /api/support/conversations/{id}/messages` | Sends a message (`Idempotency-Key` header) |
| `POST /api/support/conversations/{id}/read` | Clears that conversation's unread count |
| `POST /api/support/attachments` | Uploads the image (multipart) and returns the attachment |
| `WS /ws/support` | Live events |

A conversation in the queue (the UI copy is Brazilian Portuguese, so is the data):

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

A message. `seq` is a **per-conversation**, increasing counter assigned by the server;
`client_id` is the id the **app** generated before sending:

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

History comes back in the `tempest-fastapi-sdk` cursor envelope
(`{ "items": [...], "next_cursor": "...", "has_more": true, "limit": 30 }`) and the
socket events are these:

```json
{ "type": "message.created", "message": { "id": "m-9f1c", "seq": 81, "...": "..." } }
{ "type": "typing", "conversation_id": "c-48213", "user_id": "cu-77", "user_name": "João Pereira" }
{ "type": "presence", "user_id": "cu-77", "online": false }
{ "type": "conversation.read", "conversation_id": "c-48213", "seq": 81 }
{ "type": "ping" }
```

`ping` is the server heartbeat: the SDK answers `pong` on its own.

## The files

```text
src/
├── App.tsx                     routes + providers
├── lib/api.ts                  HTTP client
├── pages/SupportPage.tsx       the page: columns, phone, connection banner
└── support/
    ├── contract.ts             types and the event schema
    ├── inbox-state.ts          live state (reducer)
    ├── thread.tsx              orders, dedupes and converts for <Chat>
    ├── use-support-inbox.ts    socket + sending + read receipts
    ├── ConversationList.tsx    the queue
    ├── ConversationView.tsx    the conversation
    └── support.module.css
```

Let's go one by one.

## 1. The HTTP client

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";

export const api = createApiClient({
    baseURL: "/api",
    withCredentials: true,
    csrf: true,
});
```

A single [`createApiClient`](../http.md#createapiclient) for the whole app. With a
cookie session, `withCredentials` sends the cookie and `csrf: true` echoes the
`csrf_token` into the `X-CSRF-Token` header on every write — see
[CSRF](../http.md#csrf-a-session-cookie-needs-its-pair).

## 2. The typed contract

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

The message types come out of the **same** `zod` schema that validates every socket
frame. What TypeScript promises and what arrives at runtime are the same thing.

!!! warning "Put `ping` in the schema"
    With [`schema`](../websocket.md#validating-the-frame-with-schema), every frame that
    does not match goes to `onValidationError`. So does the server heartbeat
    (`{"type":"ping"}`): without a `ping` entry in the union you get a warning on every
    beat. The `pong` goes out either way — but the console becomes useless.

The query keys (`conversationsKey`, `messagesKey`) live here because three different
files read and write them.

## 3. The live state

History comes from REST and lives in the TanStack Query cache. Everything that arrives
**afterwards** — socket messages, who is typing, presence, read receipts — and
everything that has **not left yet** (the optimistic messages) lives in a reducer:

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

Note three details:

- **`message` removes the pending item** with the same `client_id`. That is how the
  optimistic bubble "becomes" the confirmed one.
- **`message` also clears its author from "typing"**: whoever just sent a message is
  no longer typing, even if the stop event never arrives.
- **`typing-expired` only deletes when `at` matches.** Each typing event schedules its
  own expiry; if the customer kept typing, a newer event arrived with another `at`, and
  the old expiry does not wipe the indicator mid-sentence.

`bumpConversation` moves the conversation to the top of the queue and updates the
preview and unread count, straight in the cache — without refetching the list.

## 4. The thread: ordering and deduplication

A message can arrive through **three** paths: in the history, in the socket event and
in the response to the `POST` you made yourself. After a reconnect the history is
reloaded and brings back what the socket had already delivered. Without care, the same
message shows up twice, or out of order.

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

What keeps the screen right:

1. **One `Map` keyed by `id`** merges history and live: the same message coming from
   two places takes one slot.
2. **Order by `seq`, not by time.** Server and client clocks disagree; `seq` is the
   order in which the server accepted. [`<Chat>`](../components/advanced-chat.md#chat)
   **never reorders** what it receives — order is your job, and it is decided here.
3. **A pending item whose `client_id` is already confirmed disappears.** The reducer
   already does this, but a reloaded history can bring your message **before** the
   `POST` response. Filtering here closes that window.
4. **The bubble `id` is the `client_id` when there is one.** The optimistic and the
   confirmed bubble share the same `id`, so React reuses the element: nothing flickers,
   the photo does not reload.
5. **An upload in progress becomes a [`<Progress>`](../components/feedback.md#progress)
   in `body`.** `ChatMessage.body` is a `ReactNode`, not a `string`.

!!! info "Read ticks"
    Your messages with `seq` up to `customer_read_seq` (or the latest
    `conversation.read`) get `status: "read"` and show coloured ✓✓. The others get
    `"sent"`. Pending ones stay `"sending"` or `"failed"`.

## 5. Socket, sending and read receipts

This is the heart of the recipe: a hook that opens **one** WebSocket for the whole
inbox and exposes everything the screen does.

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

Piece by piece.

### The socket

[`useWebSocket`](../websocket.md#hook-usewebsocket) does the heavy lifting: reconnect
with backoff and jitter, abandoning a hung handshake, waiting for the radio to come
back and answering the `tempest-fastapi-sdk` `ping`.

- `schema: socketEventSchema` — a frame outside the contract never reaches `onMessage`.
- `silenceTimeout: 75_000` — if the link dies silently (the phone left coverage), the
  socket is declared dead and reopens. Use ~2.5× your server's ping interval.
- **No `pingInterval`.** Against the Tempest server, the server pings.
- `onReconnected` invalidates everything under `["support"]`: whatever happened while
  you were away comes through REST, and the dedupe in step 4 merges it with what is
  already on screen.
- `onLost` keeps the reason (`"exhausted"` or `"rejected"`) so the page shows the right
  notice. The table of when the SDK reopens is in
  [Reconnect or not](../websocket.md#reconnect-or-not).

!!! tip "Inline callbacks are safe"
    `onMessage` reads `openConversationId` and `me` from the current render's closure.
    It works because the hook keeps callbacks in a ref: switching conversations does
    **not** reopen the socket.

### Dedupe on the way in

`seen` is a `Set` of ids already processed. It exists because two frames can arrive in
the same tick — before any re-render — and the closure's `state` does not know about
the first one yet. Without it, the same customer message would count **two** unread.
Your `POST` response goes through the same `receive`, so the socket echo of your own
message is ignored too.

### Why send over HTTP and not over the socket

`socket.send()` returns `true` when the frame **left the browser**, not when the server
accepted it. There is no reply, no validation error, no way to learn the `seq`. The
`POST` gives you all of that:

- **an ack carrying the stored message** (with `seq`), which goes through `receive`;
- **a typed error** when it fails, turned into a sentence by
  [`describeApiError`](../http.md#from-a-typed-error-to-the-sentence-on-screen-describeapierror);
- **idempotency**: `client_id` goes in the body **and** in the `Idempotency-Key` header
  (generated by [`generateIdempotencyKey`](../http.md#generateidempotencykey)). If the
  response got lost and Marina taps "try again", the server recognises the key and
  returns the same message instead of creating another one.

And as a bonus: while the socket reconnects, sending keeps working.

!!! note "The path id goes through `encodeIdSegment`"
    The conversation id comes from the server and becomes part of a URL.
    [`encodeIdSegment`](../http.md#dynamic-id-in-the-path-encodeidsegment) stops an id
    containing `/` or `..` from pointing at another route.

### The photo

`sendImage` checks type and size **before** any request and creates the optimistic
bubble with a `blob:` URL of the photo itself — Marina sees the image right away.
`deliver` uploads the file with [`uploadWithProgress`](../http.md#uploadwithprogress),
which uses XHR underneath precisely to report progress, and only then sends the
message with the attachment.

If the upload succeeded and the message `POST` failed, the attachment is kept in
`uploaded`: "try again" **does not upload the photo again**.

### Typing

`notifyTyping` sends at most one event every 3 s per conversation, and only counts it
as sent when `send()` returns `true`.

!!! warning "Do not turn on `queueWhileClosed` for ephemeral events"
    The socket queue flushes everything on reconnect. A "typing" from two minutes ago
    arriving all at once is a lie. An event that loses meaning over time should
    **vanish** while the socket is closed — which is the default.

### Read

`markRead` clears the badge in the cache **immediately** and tells the server. If that
call fails, the list is refetched and the badge comes back with the real number. It
runs when a conversation is opened and on every customer message that arrives while
it is open.

## 6. The conversation queue

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

Each state has its own look:

| State | What shows |
| --- | --- |
| Loading | Five [`Skeleton`](../components/feedback.md#skeleton) rows shaped like the real row |
| Error | [`ErrorState`](../components/feedback.md#errorstate) with the error sentence and "Tentar novamente" |
| Empty | [`EmptyState`](../components/feedback.md#emptystate) — an empty queue is good news 🎉 |
| With conversations | [`ListTile`](../components/data.md#listtile) with [`Avatar`](../components/identity.md#avatar) + presence, [`RelativeTime`](../components/utility.md#relativetime) and an unread [`Badge`](../components/feedback.md#badge) |

Presence comes from the live state when there is one and falls back to the list's
`online` when no event for that customer has arrived yet.

!!! tip "The badge says the number out loud"
    `aria-label="2 não lidas"` — for a screen reader, a bare "2" next to a name means
    nothing.

## 7. The conversation

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

### Infinite history, upwards

[`useCursorQuery`](../integration-fastapi.md#cursor-usecursorquery) paginates the
history: each `fetchNextPage` brings 30 **older** messages.

`<Chat>` has no "reached the top" callback, so the recipe listens to the thread's
scroll with `onScrollCapture` on the container. The `scroll` event does not bubble, but
the **capture** phase goes through the ancestors — that is what lets the parent hear a
child it does not control. Near the top, `loadOlder` fires.

The classic problem: older messages are inserted **above** what you are reading, and
the screen jumps. The fix is to remember the **distance to the bottom** before loading
(`scrollHeight - scrollTop`) and restore it once the page has arrived, in a
`useLayoutEffect` — before the browser paints.

!!! info "Why distance to the bottom, not height"
    Chrome and Firefox have *scroll anchoring* and sometimes fix the position on their
    own. Adding the height difference on top of that correction would jump twice as
    far. "Distance to the bottom" is idempotent: if the browser already adjusted, you
    write the same value. And it is refreshed on every scroll while loading, so
    scrolling during the load is respected too.

The **Mensagens anteriores** button in the header does the same and covers keyboard
users.

!!! tip "A page that does not fill the screen sorts itself out"
    If the first 30 messages fit on screen, the thread starts at `scrollTop` 0, the
    first scroll fires `loadOlder` and pages keep coming until the screen is full or
    history runs out.

### The rest of the conversation

- **Loading**: the real header and three bubble-shaped `Skeleton`s, one on the right.
- **Error with nothing to show**: `ErrorState` wired to `history.refetch`. If the error
  happened while fetching an **older** page, the conversation stays on screen.
- **Empty**: `<Chat>`'s `emptyState` invites a welcome.
- **Attachment**: a hidden `input type="file"` and an `iconOnly`
  [`Button`](../components/actions.md#button) with an `aria-label`, passed in
  `composerActions`.
- **Typing**: `<Chat>` accepts `div` attributes and the field's `input` event bubbles
  up to it — `onInput` tells the server. The other way round, `typing` takes the names
  and the component writes "João Pereira está digitando…".
- **Closed ticket**: `composerDisabled` and the placeholder explain why you cannot
  write.
- **Failed**: `onRetry` wires the button on the red bubble; the text stays readable so
  Marina can decide whether to resend.

## 8. The page and the phone

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

### The open conversation lives in the URL

`/atendimento/:conversationId?` — so Android's back button closes the conversation, a
link to `/atendimento/c-48213` opens straight into it, and reloading the page does not
lose your place.

### Two columns or one

[`useBreakpoint`](../hooks.md#responsive-usebreakpoint) tells you whether it is a
phone (below `md`, 768 px). On desktop, queue and conversation side by side. On a
phone, **either** the queue **or** the conversation, and the conversation header gains
a back arrow. The CSS uses the same cut (`max-width: 767px`) to turn the grid into one
column.

!!! tip "`100dvh`, not `100vh`"
    On a phone, `100vh` counts the address bar that hides and shows; the input ends up
    behind it. `dvh` follows the visible area.

### The connection notice

| `connection` | What Marina sees |
| --- | --- |
| `connecting` | Nothing — it is the first open, it lasts an instant |
| `online` | Nothing |
| `reconnecting` | Yellow [`Banner`](../components/feedback.md#banner): "Reconectando…" — and sending keeps working |
| `lost` | Red `Banner` with "Tentar de novo", which calls `reconnect()` |

!!! check "Reconnecting is not an error"
    Saying "the connection dropped" on every attempt scares someone whose session is
    coming back on its own. The loud notice is only for `onLost`, the one state where
    the person can do something — see
    [Reconnecting ≠ error](../websocket.md#reconnecting-error).

The tab title sums the unread counts with
[`useDocumentTitle`](../hooks.md#title-and-favicon-usedocumenttitle-usefavicon): with
support in a background tab, `(3) Atendimento` is what brings Marina back.

`App.tsx` just wires the pieces: [`QueryProvider`](../query.md#provider) for the cache,
`ToastProvider` for the failed-send notices, and the routes.

??? note "Technical details: what if the socket skips a `seq`?"
    Within one connection the server delivers in order, but an event can get lost
    between the drop and `onReconnected`. The recipe reloads everything on reconnect,
    which covers that gap. If your history is large and the refetch is heavy, you can
    detect the gap in `receive` (`message.seq` greater than the last known `seq` + 1)
    and invalidate only that conversation.

## Recap

- 🔌 **One socket**, with `useWebSocket` + `schema` (with `ping` in it),
  `silenceTimeout` and no `pingInterval` against the Tempest server.
- 🧮 **Order by `seq`, dedupe by `id` and by `client_id`.** `<Chat>` never reorders:
  order is yours.
- ⚡ **Optimistic send over HTTP** with `generateIdempotencyKey`: ack, typed error and
  retry without duplicates. The socket only **receives**.
- 🖼️ **Photo with `uploadWithProgress`**, an instant `blob:` preview and the attachment
  kept so a retry does not upload again.
- 📜 **History upwards** with `useCursorQuery` and the distance to the bottom restored
  in a `useLayoutEffect`.
- 🔢 **Unread counts in the TanStack Query cache**, updated by events, without
  refetching the list.
- 📱 **The URL keeps the conversation**, `useBreakpoint` picks one or two columns.
