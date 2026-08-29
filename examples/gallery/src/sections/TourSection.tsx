import { useState } from "react";
import { Button, Card, Tour, type TourStep } from "tempest-react-sdk";
import { Example } from "../Example";

const PASSOS: TourStep[] = [
    {
        target: "#tour-novo",
        title: "Comece aqui",
        body: "Todo pedido nasce deste botão. Ele continua clicável enquanto o tour está aberto.",
    },
    {
        target: "#tour-filtros",
        title: "Filtre o período",
        body: "O card vira de lado quando não cabe embaixo do alvo.",
        placement: "right",
    },
    {
        target: "#tour-resumo",
        body: "Sem título, só corpo — o card é descrito pelo texto.",
        placement: "top",
    },
    {
        target: "#nao-existe",
        title: "Alvo ausente",
        body: "Este passo aponta pra um elemento que não está na página. Em vez de sumir, ele aparece centralizado.",
    },
];

/**
 * Demo of `Tour`.
 *
 * The fourth step points at nothing on purpose: a step whose element is hidden by
 * permission is the case that decides whether a tour breaks or degrades, and it is
 * the one nobody demos.
 */
export function TourSection() {
    const [aberto, setAberto] = useState(false);
    const [concluido, setConcluido] = useState(false);

    return (
        <section className="gallery-section" id="tour">
            <h3>Tour</h3>
            <Example
                id="tour-basic"
                title="Tour guiado"
                note="Escurece a página, destaca um elemento por vez e explica. O elemento destacado continua clicável — tente clicar em `Novo pedido` com o tour aberto. Setas andam, `Esc` sai."
                code={`import { Tour } from "tempest-react-sdk";

const [aberto, setAberto] = useState(!storage.get("tour-v1"));

<Tour
  open={aberto}
  steps={[
    { target: "#novo-pedido", title: "Comece aqui", body: "Todo pedido nasce deste botão." },
    { target: "[data-tour='filtros']", body: "E filtre por período aqui.", placement: "right" },
  ]}
  onClose={() => setAberto(false)}
  onFinish={() => storage.set("tour-v1", true)}
/>`}
                props={[
                    { name: "steps", type: "TourStep[]", description: "As paradas, em ordem." },
                    { name: "open", type: "boolean", description: "Controlado pelo app." },
                    {
                        name: "onClose",
                        type: "() => void",
                        description: "`Esc`, botão de fechar, pular ou clique no escuro.",
                    },
                    {
                        name: "onFinish",
                        type: "() => void",
                        description: "Depois do último passo. Persistir 'já viu' é do app.",
                    },
                    {
                        name: "index / onIndexChange",
                        type: "number / (i: number) => void",
                        description: "Opcional: o app dirige o passo atual.",
                    },
                    {
                        name: "spotlightPadding",
                        type: "number",
                        default: "4",
                        description: "Folga em volta do elemento destacado.",
                    },
                ]}
            >
                <div style={{ display: "grid", gap: "var(--tempest-space-4)" }}>
                    <div
                        style={{ display: "flex", gap: "var(--tempest-space-3)", flexWrap: "wrap" }}
                    >
                        <Button id="tour-novo" onClick={() => setConcluido(false)}>
                            Novo pedido
                        </Button>
                        <Button id="tour-filtros" variant="secondary">
                            Filtros
                        </Button>
                        <Button onClick={() => setAberto(true)}>Rodar o tour</Button>
                    </div>

                    <Card id="tour-resumo" title="Resumo do dia">
                        <p style={{ margin: 0 }}>
                            42 pedidos · R$ 18.430,00
                            {concluido ? " · tour concluído" : ""}
                        </p>
                    </Card>

                    <Tour
                        steps={PASSOS}
                        open={aberto}
                        onClose={() => setAberto(false)}
                        onFinish={() => setConcluido(true)}
                    />
                </div>
            </Example>
        </section>
    );
}
