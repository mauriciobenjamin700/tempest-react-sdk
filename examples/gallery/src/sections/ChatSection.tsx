import { useState } from "react";
import { Avatar, Chat, type ChatMessage } from "tempest-react-sdk";
import { Example } from "../Example";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const NOW = Date.now();

/**
 * Inline photo stand-in for the messenger example.
 *
 * A data URI rather than a remote placeholder: the docs capture runs without
 * network access, and a broken image there would be captured as the component's
 * own rendering.
 */
const ROOM_PHOTO =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">` +
            `<rect width="480" height="320" fill="#8100d7"/>` +
            `<rect x="40" y="120" width="160" height="120" fill="#ffffff" opacity="0.25"/>` +
            `<rect x="230" y="90" width="200" height="150" fill="#ffffff" opacity="0.18"/>` +
            `<text x="240" y="290" fill="#ffffff" font-family="system-ui" font-size="28" text-anchor="middle">sala do evento</text>` +
            `</svg>`,
    );

const THREAD: ChatMessage[] = [
    {
        id: "1",
        body: "Bom dia! O pedido 8421 chegou com uma caixa a menos.",
        authorId: "ana",
        authorName: "Ana Souza",
        sentAt: NOW - 26 * HOUR,
    },
    {
        id: "2",
        body: "Consigo a nota fiscal se ajudar.",
        authorId: "ana",
        authorName: "Ana Souza",
        sentAt: NOW - 26 * HOUR + MINUTE,
    },
    {
        id: "3",
        body: "Bom dia, Ana. Já estou olhando aqui.",
        authorId: "me",
        authorName: "Mauricio Benjamin",
        sentAt: NOW - 25 * HOUR,
        status: "read",
    },
    {
        id: "4",
        body: "O transportador confirmou: a caixa saiu num segundo volume, chega amanhã.",
        authorId: "me",
        authorName: "Mauricio Benjamin",
        sentAt: NOW - 3 * HOUR,
        status: "read",
    },
    {
        id: "5",
        body: "Perfeito, obrigada!",
        authorId: "ana",
        authorName: "Ana Souza",
        sentAt: NOW - 2 * MINUTE,
    },
];

/** The messenger thread: attachment, reply, reactions, group receipt, tombstone. */
const MESSENGER: ChatMessage[] = [
    {
        id: "z1",
        body: "Achei a sala pro evento — olha a foto",
        authorId: "ana",
        authorName: "Ana Souza",
        sentAt: NOW - 22 * MINUTE,
        attachments: [
            {
                kind: "image",
                url: ROOM_PHOTO,
                alt: "sala do evento",
            },
        ],
        reactions: [
            { emoji: "🔥", count: 2, reacted: true },
            { emoji: "👀", count: 1 },
        ],
    },
    {
        id: "z2",
        body: "A ata da reunião passada, pra referência",
        authorId: "bruno",
        authorName: "Bruno Lima",
        sentAt: NOW - 18 * MINUTE,
        attachments: [{ kind: "file", url: "#", name: "ata-2026-08.pdf", sizeBytes: 184_320 }],
    },
    {
        id: "z3",
        authorId: "ana",
        authorName: "Ana Souza",
        sentAt: NOW - 12 * MINUTE,
        attachments: [
            {
                kind: "voice",
                url: "#",
                durationMs: 14_000,
                waveform: [0.2, 0.5, 0.9, 0.6, 0.3, 0.8, 1, 0.4, 0.2, 0.7, 0.5, 0.3],
            },
        ],
    },
    {
        id: "z4",
        body: "Fechado, reservo pra sexta",
        authorId: "me",
        authorName: "Mauricio Benjamin",
        sentAt: NOW - 8 * MINUTE,
        quote: {
            messageId: "z1",
            senderName: "Ana Souza",
            excerpt: "Achei a sala pro evento — olha a foto",
            kind: "image",
        },
        receipt: { deliveredTo: 9, readBy: 4, totalRecipients: 9 },
    },
    {
        id: "z5",
        body: "Confirmado com o financeiro",
        authorId: "me",
        authorName: "Mauricio Benjamin",
        sentAt: NOW - 5 * MINUTE,
        edited: true,
        receipt: { deliveredTo: 9, readBy: 9, totalRecipients: 9 },
    },
    {
        id: "z6",
        authorId: "bruno",
        authorName: "Bruno Lima",
        sentAt: NOW - 3 * MINUTE,
        deleted: true,
    },
];

const FAILED: ChatMessage[] = [
    {
        id: "a",
        body: "Anexei o comprovante no ticket.",
        authorId: "me",
        sentAt: NOW - 6 * MINUTE,
        status: "sent",
    },
    {
        id: "b",
        body: "Esta não saiu — o wifi caiu no meio.",
        authorId: "me",
        sentAt: NOW - MINUTE,
        status: "failed",
    },
];

/**
 * Demo of `Chat`.
 *
 * The live example is stateful on purpose: sending has to show the optimistic
 * insert and the scroll landing on the newest message, which a static list cannot
 * demonstrate. The second example is the failure path, the part an app is most
 * likely to get wrong.
 */
export function ChatSection() {
    const [messages, setMessages] = useState<ChatMessage[]>(THREAD);
    const [typing, setTyping] = useState<string[]>([]);
    const [failed, setFailed] = useState<ChatMessage[]>(FAILED);
    const [messenger, setMessenger] = useState<ChatMessage[]>(MESSENGER);

    /** Optimistic insert, then a fake ack — what a real app does around its API. */
    const send = (text: string) => {
        const id = `local-${Date.now()}`;
        setMessages((current) => [
            ...current,
            {
                id,
                body: text,
                authorId: "me",
                authorName: "Mauricio Benjamin",
                sentAt: Date.now(),
                status: "sending",
            },
        ]);
        setTimeout(() => {
            setMessages((current) =>
                current.map((message) =>
                    message.id === id ? { ...message, status: "sent" } : message,
                ),
            );
            setTyping(["Ana Souza"]);
        }, 500);
        setTimeout(() => {
            setTyping([]);
            setMessages((current) => [
                ...current,
                {
                    id: `${id}-reply`,
                    body: "Recebido, vou verificar.",
                    authorId: "ana",
                    authorName: "Ana Souza",
                    sentAt: Date.now(),
                },
            ]);
        }, 2200);
    };

    return (
        <section className="gallery-section" id="chat">
            <h3>Chat</h3>
            <Example
                id="chat-basic"
                title="Thread com composer"
                note="Agrupa por autor e por dia, marca o lado do usuário atual e rola pro fim — mas só quando você já estava no fim. Envie algo pra ver o insert otimista e a resposta."
                code={`import { Chat } from "tempest-react-sdk";

<Chat
  messages={messages}
  currentUserId={me.id}
  typing={typingNames}
  onSend={(text) => send({ text })}
  renderAvatar={(m) => <Avatar name={m.authorName} size="sm" />}
/>`}
                props={[
                    {
                        name: "messages",
                        type: "ChatMessage[]",
                        description: "A thread, mais antiga primeiro. Nunca reordenada.",
                    },
                    {
                        name: "currentUserId",
                        type: "string",
                        description: "Autor tratado como 'seu': define lado, cor e os ticks.",
                    },
                    {
                        name: "onSend",
                        type: "(text: string) => void | Promise<void>",
                        description: "Renderiza o composer. Recebe o texto já trimado.",
                    },
                    {
                        name: "typing",
                        type: "string[]",
                        description:
                            "Quem está digitando. Um, dois ou a contagem é fraseado pra você.",
                    },
                    {
                        name: "groupWindowMs",
                        type: "number",
                        default: "300000",
                        description: "Intervalo que ainda mantém mensagens no mesmo bloco.",
                    },
                ]}
            >
                <div
                    style={{
                        height: 420,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: "var(--tempest-radius-lg)",
                    }}
                >
                    <Chat
                        messages={messages}
                        currentUserId="me"
                        typing={typing}
                        onSend={send}
                        renderAvatar={(message) => (
                            <Avatar name={message.authorName ?? message.authorId} size="sm" />
                        )}
                        header={<strong>Ana Souza · pedido 8421</strong>}
                    />
                </div>
            </Example>

            <Example
                id="chat-messenger"
                title="Mensageiro: anexo, resposta, reação, recibo e tombstone"
                note="Cada item aqui era coisa que todo app reescrevia sobre uma bolha de texto. Imagem abre no Lightbox, nota de voz desenha a waveform, o recibo de grupo separa 'entregue a todos' de 'lida por todos', e as ações vivem num menu — clique direito, toque longo ou o botão ⋮."
                code={`<Chat
  messages={messages}
  currentUserId={me.id}
  onReact={(message, emoji) => toggleReaction(message.id, emoji)}
  onQuoteClick={(message) => scrollToMessage(message.quote.messageId)}
  messageActions={(message) => [
    { label: "Responder", onSelect: () => reply(message) },
    { label: "Encaminhar", onSelect: () => forward(message) },
    { separator: true },
    { label: "Apagar", danger: true, onSelect: () => remove(message) },
  ]}
/>`}
                props={[
                    {
                        name: "attachments",
                        type: "ChatAttachment[]",
                        description:
                            "Imagem, vídeo, áudio, nota de voz com waveform, documento pra baixar.",
                    },
                    {
                        name: "quote",
                        type: "ChatQuote",
                        description:
                            "Stub da mensagem respondida. `revoked` apaga o trecho quando ela some.",
                    },
                    {
                        name: "receipt",
                        type: "ChatReceipt",
                        description:
                            "deliveredTo / readBy / totalRecipients — os ticks de um grupo.",
                    },
                    {
                        name: "onReact",
                        type: "(message, emoji) => void",
                        description: "Liga os chips. Reagir com o mesmo emoji limpa, não empilha.",
                    },
                    {
                        name: "messageActions",
                        type: "(message) => ContextMenuItem[]",
                        description: "Menu por mensagem. Mensagem apagada não recebe ações.",
                    },
                ]}
            >
                <div
                    style={{
                        height: 460,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: "var(--tempest-radius-lg)",
                    }}
                >
                    <Chat
                        messages={messenger}
                        currentUserId="me"
                        header={<strong>Evento de setembro · 10 pessoas</strong>}
                        renderAvatar={(message) => (
                            <Avatar name={message.authorName ?? message.authorId} size="sm" />
                        )}
                        onReact={(message, emoji) =>
                            setMessenger((current) =>
                                current.map((item) =>
                                    item.id === message.id
                                        ? {
                                              ...item,
                                              reactions: (item.reactions ?? []).map((reaction) =>
                                                  reaction.emoji === emoji
                                                      ? {
                                                            ...reaction,
                                                            reacted: !reaction.reacted,
                                                            count:
                                                                reaction.count +
                                                                (reaction.reacted ? -1 : 1),
                                                        }
                                                      : reaction,
                                              ),
                                          }
                                        : item,
                                ),
                            )
                        }
                        messageActions={(message) => [
                            { label: "Responder", onSelect: () => {} },
                            { label: "Encaminhar", onSelect: () => {} },
                            { separator: true },
                            {
                                label: "Apagar",
                                danger: true,
                                onSelect: () =>
                                    setMessenger((current) =>
                                        current.map((item) =>
                                            item.id === message.id
                                                ? {
                                                      id: item.id,
                                                      authorId: item.authorId,
                                                      authorName: item.authorName,
                                                      sentAt: item.sentAt,
                                                      deleted: true,
                                                  }
                                                : item,
                                        ),
                                    ),
                            },
                        ]}
                    />
                </div>
            </Example>

            <Example
                id="chat-failed"
                title="Mensagem que não saiu"
                note="Sem estado de falha, o usuário redigita o que já está na tela. A bolha mantém o texto legível e oferece o retry ao lado."
                code={`<Chat
  messages={messages}
  currentUserId={me.id}
  onRetry={(message) => resend(message.id)}
/>`}
            >
                <div
                    style={{
                        height: 240,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: "var(--tempest-radius-lg)",
                    }}
                >
                    <Chat
                        messages={failed}
                        currentUserId="me"
                        onRetry={(message) =>
                            setFailed((current) =>
                                current.map((item) =>
                                    item.id === message.id ? { ...item, status: "sent" } : item,
                                ),
                            )
                        }
                    />
                </div>
            </Example>

            <Example
                id="chat-comments"
                title="Thread de comentários"
                note="O mesmo componente sem `currentUserId` e sem `typing`: todo mundo do mesmo lado, com nome por bloco. É a leitura que um comentário de documento quer."
                code={`<Chat messages={comments} onSend={(text) => comment({ text })} placeholder="Comente" />`}
            >
                <div
                    style={{
                        height: 300,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: "var(--tempest-radius-lg)",
                    }}
                >
                    <Chat
                        messages={THREAD}
                        onSend={() => {}}
                        placeholder="Comente"
                        renderAvatar={(message) => (
                            <Avatar name={message.authorName ?? message.authorId} size="sm" />
                        )}
                    />
                </div>
            </Example>
        </section>
    );
}
