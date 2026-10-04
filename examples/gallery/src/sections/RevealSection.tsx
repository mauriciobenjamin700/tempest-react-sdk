import { useState } from "react";
import { Button, Card, Reveal, type RevealVariant } from "tempest-react-sdk";
import { Example } from "../Example";

const ETAPAS: { id: string; titulo: string; corpo: string }[] = [
    { id: "1", titulo: "Diagnóstico", corpo: "Mapeamos o fluxo atual e onde ele perde tempo." },
    { id: "2", titulo: "Protótipo", corpo: "Uma tela navegável em duas semanas." },
    { id: "3", titulo: "Piloto", corpo: "Um time usa de verdade, com métrica antes e depois." },
    { id: "4", titulo: "Escala", corpo: "O resto da operação entra por ondas." },
];

const VARIANTES: RevealVariant[] = ["fade", "up", "down", "left", "right", "scale"];

/** Passo entre irmãos, em ms. */
const STAGGER = 90;

/**
 * Demo of `Reveal`.
 *
 * The "Rever" buttons remount the list through `key`, because `once` is the
 * default and a revealed element stays revealed — that is the behaviour being
 * shown, so replaying it needs a fresh element, not a prop.
 */
export function RevealSection() {
    const [rodada, setRodada] = useState<number>(0);
    const [rodadaVariantes, setRodadaVariantes] = useState<number>(0);

    return (
        <section className="gallery-section" id="reveal">
            <h3>Reveal</h3>
            <Example
                id="reveal-stagger"
                title="Lista escalonada por delay"
                note="Cada item entra quando chega à viewport, uma vez. O escalonamento é o `index` do `map` vezes um passo — não precisa de componente de grupo. Com `prefers-reduced-motion: reduce` tudo aparece parado."
                code={`import { Reveal } from "tempest-react-sdk";

<ol>
  {etapas.map((etapa, index) => (
    <Reveal key={etapa.id} as="li" delay={index * 90}>
      <Card title={etapa.titulo}>{etapa.corpo}</Card>
    </Reveal>
  ))}
</ol>`}
                props={[
                    {
                        name: "variant",
                        type: '"fade" | "up" | "down" | "left" | "right" | "scale"',
                        default: '"up"',
                        description: "Como o conteúdo entra.",
                    },
                    {
                        name: "delay",
                        type: "number (ms)",
                        description: "Espera antes de entrar. Escalone com index * passo.",
                    },
                    {
                        name: "duration",
                        type: "number (ms)",
                        default: "--tempest-duration-slower",
                        description: "Duração da entrada.",
                    },
                    {
                        name: "as",
                        type: "keyof JSX.IntrinsicElements",
                        default: '"div"',
                        description: 'Elemento a renderizar — "li" dentro de lista.',
                    },
                    {
                        name: "once",
                        type: "boolean",
                        default: "true",
                        description: "Revela uma vez. false: esconde de novo ao sair de vista.",
                    },
                    {
                        name: "threshold",
                        type: "number",
                        default: "0.15",
                        description:
                            "Fração do elemento (ou da viewport, se ele for mais alto) que precisa aparecer.",
                    },
                    {
                        name: "rootMargin",
                        type: "string",
                        default: '"0px"',
                        description: "Margem do root, como no IntersectionObserver.",
                    },
                ]}
            >
                <Button variant="secondary" size="sm" onClick={() => setRodada((n) => n + 1)}>
                    Rever
                </Button>
                <ol
                    key={rodada}
                    style={{
                        listStyle: "none",
                        padding: 0,
                        margin: "1rem 0 0",
                        display: "grid",
                        gap: "0.75rem",
                    }}
                >
                    {ETAPAS.map((etapa, index) => (
                        <Reveal key={etapa.id} as="li" delay={index * STAGGER}>
                            <Card title={etapa.titulo}>
                                <p style={{ margin: 0 }}>{etapa.corpo}</p>
                            </Card>
                        </Reveal>
                    ))}
                </ol>
            </Example>

            <Example
                id="reveal-variants"
                title="Variantes"
                note="A distância percorrida vem de `--tempest-reveal-distance` (1.5rem) e a escala inicial de `--tempest-reveal-scale` (0.95)."
                code={`<Reveal variant="left">…</Reveal>
<Reveal variant="scale" duration={600}>…</Reveal>`}
            >
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRodadaVariantes((n) => n + 1)}
                >
                    Rever
                </Button>
                <div
                    key={rodadaVariantes}
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))",
                        gap: "0.75rem",
                        marginTop: "1rem",
                    }}
                >
                    {VARIANTES.map((variante, index) => (
                        <Reveal key={variante} variant={variante} delay={index * STAGGER}>
                            <Card>
                                <code>{variante}</code>
                            </Card>
                        </Reveal>
                    ))}
                </div>
            </Example>

            <Example
                id="reveal-tall"
                title="Bloco mais alto que a tela"
                note="Com `threshold={0.5}` um bloco de 2,2 viewports nunca fica 50% visível — um observer cru não revelaria nunca. O `Reveal` reescala o threshold pela fração alcançável e revela quando o bloco ocupa metade da viewport."
                code={`<Reveal threshold={0.5} variant="fade">
  <Card style={{ minHeight: "220vh" }}>…</Card>
</Reveal>`}
            >
                <Reveal threshold={0.5} variant="fade" data-testid="reveal-tall">
                    <Card title="Seção longa" style={{ minHeight: "220vh" }}>
                        <p style={{ margin: 0 }}>
                            Conteúdo mais alto que a viewport, como um artigo ou uma tabela comprida
                            dentro de uma landing.
                        </p>
                    </Card>
                </Reveal>
            </Example>
        </section>
    );
}
