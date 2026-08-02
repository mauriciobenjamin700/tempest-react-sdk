import { useRef, useState } from "react";
import { AIChat, Avatar, type AIChatMessage, type AIChatVote } from "tempest-react-sdk";
import { Example } from "../Example";

const ANSWER = `Foram **12 pedidos** com entrega vencida esta semana. Os três piores:

| Pedido | Cliente | Dias |
| --- | --- | --- |
| 8421 | Aurora Ltda | 6 |
| 8390 | Meridiano | 4 |
| 8377 | Casa Vega | 3 |

A consulta que usei:

\`\`\`sql
SELECT id, cliente, current_date - previsao AS dias
FROM pedidos
WHERE previsao < current_date AND status <> 'entregue'
ORDER BY dias DESC;
\`\`\`

Quer que eu abra um ticket para os três?`;

const REASONING = `O usuário quer atraso, não volume. "Atrasado" aqui é previsão vencida com status diferente de entregue — cancelado não conta. Ordeno por dias de atraso decrescente e corto em três para não despejar a tabela inteira.`;

const SETTLED: AIChatMessage[] = [
    { id: "s", role: "system", content: "Você é o copiloto de operações. Responda em português." },
    {
        id: "u1",
        role: "user",
        content: "Quantos pedidos atrasaram esta semana?",
        attachments: [{ id: "f1", name: "pedidos-semana.csv", size: 18_432 }],
    },
    {
        id: "a1",
        role: "assistant",
        content: ANSWER,
        reasoning: REASONING,
        model: "opus-5",
    },
];

const FAILED: AIChatMessage[] = [
    { id: "u1", role: "user", content: "Gere o relatório completo do trimestre." },
    {
        id: "a1",
        role: "assistant",
        content: "Comecei pelo faturamento: o trimestre fechou em R$ 1,4 mi, com",
        error: "A conexão caiu no meio da resposta.",
        model: "opus-5",
    },
];

/** Chunks the fake stream emits, so the caret and the scroll have something to do. */
const CHUNKS = ANSWER.match(/[\s\S]{1,28}/g) ?? [];

/**
 * Demo of `AIChat`.
 *
 * The first example streams for real (a timer feeding `content` chunk by chunk)
 * because the caret, the stop button, the "thinking" state and the scroll that
 * follows the answer are the whole point of the component and none of them show up
 * on a static list. Stopping mid-answer is part of the demo: click **Parar**.
 */
export function AIChatSection() {
    const [turns, setTurns] = useState<AIChatMessage[]>([]);
    const [pending, setPending] = useState(false);
    const [votes, setVotes] = useState<Record<string, AIChatVote>>({});
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const stopped = useRef(false);

    const clearTimers = (): void => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    };

    /** Fake round trip: a short pause, then the answer arriving in chunks. */
    const ask = (prompt: string): void => {
        clearTimers();
        stopped.current = false;
        const answerId = `a-${Date.now()}`;
        setTurns((current) => [
            ...current,
            { id: `u-${Date.now()}`, role: "user", content: prompt },
        ]);
        setPending(true);

        timers.current.push(
            setTimeout(() => {
                setPending(false);
                setTurns((current) => [
                    ...current,
                    {
                        id: answerId,
                        role: "assistant",
                        content: "",
                        reasoning: REASONING,
                        model: "opus-5",
                        streaming: true,
                    },
                ]);

                let text = "";
                CHUNKS.forEach((chunk, index) => {
                    timers.current.push(
                        setTimeout(
                            () => {
                                if (stopped.current) return;
                                text += chunk;
                                const last = index === CHUNKS.length - 1;
                                setTurns((current) =>
                                    current.map((turn) =>
                                        turn.id === answerId
                                            ? { ...turn, content: text, streaming: !last }
                                            : turn,
                                    ),
                                );
                            },
                            60 * (index + 1),
                        ),
                    );
                });
            }, 900),
        );
    };

    const stop = (): void => {
        stopped.current = true;
        clearTimers();
        setPending(false);
        setTurns((current) =>
            current.map((turn) => (turn.streaming ? { ...turn, streaming: false } : turn)),
        );
    };

    return (
        <>
            <Example
                id="aichat-streaming"
                title="Conversa com um modelo, com streaming"
                note="Envie algo (ou clique numa sugestão) para ver os três pontinhos, o cursor no fim do texto, o botão Parar no lugar do Enviar e a rolagem seguindo a resposta. Passe o mouse num turno para ver as ações."
                code={`import { AIChat, type AIChatMessage } from "tempest-react-sdk";

<AIChat
  messages={turns}
  pending={pending}
  onSend={ask}
  onStop={() => controller.current?.abort()}
  onRegenerate={(turn) => reask(turn)}
  onFeedback={(turn, vote) => track("answer_rated", { id: turn.id, vote })}
  suggestions={["Quantos pedidos atrasaram esta semana?"]}
  composerFooter={<small>Pode errar — confira números antes de decidir.</small>}
/>`}
                props={[
                    {
                        name: "messages",
                        type: "AIChatMessage[]",
                        description: "O transcript, mais antigo primeiro. Nunca reordenado.",
                    },
                    {
                        name: "pending",
                        type: "boolean",
                        default: "false",
                        description: "Request no ar, nada de volta ainda — mostra os pontinhos.",
                    },
                    {
                        name: "onStop",
                        type: "() => void",
                        description: "Aborta o turno no ar. Troca Enviar por Parar; Escape também.",
                    },
                    {
                        name: "onRegenerate",
                        type: "(message) => void",
                        description: "Liga o 'gerar de novo' no último turno de assistente.",
                    },
                    {
                        name: "onFeedback",
                        type: "(message, vote) => void",
                        description: 'Liga 👍/👎. `vote` é "up" ou "down".',
                    },
                    {
                        name: "suggestions",
                        type: "string[]",
                        default: "[]",
                        description: "Prompts oferecidos numa conversa vazia.",
                    },
                ]}
            >
                <div
                    style={{
                        height: 520,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: "var(--tempest-radius-lg)",
                    }}
                >
                    <AIChat
                        messages={turns}
                        pending={pending}
                        onSend={ask}
                        onStop={stop}
                        onRegenerate={(turn) => ask(`Reformule: ${turn.content.slice(0, 24)}…`)}
                        onFeedback={(turn, vote) =>
                            setVotes((current) => ({ ...current, [turn.id]: vote }))
                        }
                        onEditSubmit={(turn, text) => {
                            setTurns((current) => current.slice(0, current.indexOf(turn)));
                            ask(text);
                        }}
                        votes={votes}
                        suggestions={[
                            "Quantos pedidos atrasaram esta semana?",
                            "Resuma o faturamento do trimestre",
                        ]}
                        header={<strong>Copiloto de operações</strong>}
                        composerFooter={
                            <small>Pode errar — confira números antes de decidir.</small>
                        }
                        renderAvatar={(turn) =>
                            turn.role === "assistant" ? <Avatar name="AI" size="sm" /> : null
                        }
                    />
                </div>
            </Example>

            <Example
                id="aichat-settled"
                title="Resposta pronta: Markdown, tabela, código, raciocínio e anexo"
                note="Turno de assistente ocupa a largura toda sem bolha — a resposta é o documento. O prompt é bolha estreita do outro lado, em texto puro. O raciocínio fica num bloco colapsável acima da resposta."
                code={`<AIChat
  messages={turns}
  showSystem
  onRegenerate={(turn) => reask(turn)}
  onFeedback={(turn, vote) => rate(turn, vote)}
/>`}
            >
                <div
                    style={{
                        height: 560,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: "var(--tempest-radius-lg)",
                    }}
                >
                    <AIChat
                        messages={SETTLED}
                        showSystem
                        onRegenerate={() => {}}
                        onFeedback={() => {}}
                        onEditSubmit={() => {}}
                        renderAvatar={(turn) =>
                            turn.role === "assistant" ? <Avatar name="AI" size="sm" /> : null
                        }
                    />
                </div>
            </Example>

            <Example
                id="aichat-error"
                title="A resposta cortou no meio"
                note="O pedaço que chegou continua legível — reler é o que a pessoa faz antes de decidir. O erro vai numa faixa própria, com o retry ao lado."
                code={`// o turno carrega o erro; o painel desenha a faixa e o retry
{ id: "a1", role: "assistant", content: "Comecei pelo faturamento…", error: "A conexão caiu." }

<AIChat messages={turns} onRetry={(turn) => resume(turn)} />`}
            >
                <div
                    style={{
                        height: 300,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: "var(--tempest-radius-lg)",
                    }}
                >
                    <AIChat messages={FAILED} onRetry={() => {}} onRegenerate={() => {}} />
                </div>
            </Example>
        </>
    );
}
