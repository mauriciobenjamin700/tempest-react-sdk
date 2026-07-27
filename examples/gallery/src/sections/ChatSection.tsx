import { useState } from "react";
import { Avatar, Chat, type ChatMessage } from "tempest-react-sdk";
import { Example } from "../Example";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const NOW = Date.now();

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
        <>
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
        </>
    );
}
