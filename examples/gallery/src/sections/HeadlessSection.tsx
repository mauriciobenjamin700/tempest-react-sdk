import { useState } from "react";
import {
    Button,
    Card,
    ClickOutside,
    ConditionalWrapper,
    For,
    Portal,
    Resizable,
    VisuallyHidden,
} from "tempest-react-sdk";
import { Bell } from "lucide-react";
import { Example } from "../Example";

interface Task {
    id: number;
    label: string;
}

export function HeadlessSection() {
    const [portalOpen, setPortalOpen] = useState(false);
    const [boxOpen, setBoxOpen] = useState(true);
    const [wrapped, setWrapped] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([
        { id: 1, label: "Ler a documentação" },
        { id: 2, label: "Testar os componentes" },
    ]);

    return (
        <section className="gallery-section" id="headless">
            <h3>Headless & render-props</h3>
            <p className="description">
                Utilitários sem estilo próprio: portais, detecção de clique externo, wrappers
                condicionais, iteração com render-props, conteúdo acessível e painéis
                redimensionáveis.
            </p>

            <Example
                title="Portal"
                id="ex-portal"
                note="Renderiza os filhos diretamente no document.body, escapando de overflow e stacking contexts."
                code={`const [open, setOpen] = useState(false);

<Button onClick={() => setOpen((v) => !v)}>
    {open ? "Fechar overlay" : "Abrir overlay"}
</Button>
{open && (
    <Portal>
        <div
            style={{
                position: "fixed",
                bottom: 24,
                right: 24,
                zIndex: 1000,
                padding: "16px 20px",
                borderRadius: 8,
                background: "var(--tempest-surface, #fff)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
        >
            Renderizado via Portal no &lt;body&gt;.
        </div>
    </Portal>
)}`}
                props={[
                    {
                        name: "children",
                        type: "ReactNode",
                        description: "Conteúdo renderizado através do portal.",
                    },
                    {
                        name: "container",
                        type: "Element | null",
                        default: "document.body",
                        description: "Nó DOM alvo onde os filhos serão montados.",
                    },
                ]}
            >
                <div className="gallery-row">
                    <Button onClick={() => setPortalOpen((v) => !v)}>
                        {portalOpen ? "Fechar overlay" : "Abrir overlay"}
                    </Button>
                    {portalOpen && (
                        <Portal>
                            <div
                                style={{
                                    position: "fixed",
                                    bottom: 24,
                                    right: 24,
                                    zIndex: 1000,
                                    padding: "16px 20px",
                                    borderRadius: 8,
                                    background: "var(--tempest-surface, #fff)",
                                    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                                }}
                            >
                                Renderizado via Portal no &lt;body&gt;.
                            </div>
                        </Portal>
                    )}
                </div>
            </Example>

            <Example
                title="ClickOutside"
                id="ex-click-outside"
                note="Dispara onOutside ao detectar mousedown/touchstart fora da subárvore — ideal para fechar popovers e menus."
                code={`const [open, setOpen] = useState(true);

{open ? (
    <ClickOutside onOutside={() => setOpen(false)}>
        <Card title="Caixa aberta">
            Clique em qualquer lugar fora desta caixa para fechá-la.
        </Card>
    </ClickOutside>
) : (
    <Button onClick={() => setOpen(true)}>Reabrir caixa</Button>
)}`}
                props={[
                    {
                        name: "onOutside",
                        type: "(event: MouseEvent | TouchEvent) => void",
                        description: "Chamado quando um clique/toque ocorre fora da subárvore.",
                    },
                    {
                        name: "children",
                        type: "ReactNode",
                        description: "Conteúdo envolto pelo limite de clique-externo.",
                    },
                    {
                        name: "...props",
                        type: "HTMLAttributes<HTMLDivElement>",
                        description: "Atributos repassados ao <div> wrapper.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    {boxOpen ? (
                        <ClickOutside onOutside={() => setBoxOpen(false)}>
                            <Card title="Caixa aberta">
                                Clique em qualquer lugar fora desta caixa para fechá-la.
                            </Card>
                        </ClickOutside>
                    ) : (
                        <Button onClick={() => setBoxOpen(true)}>Reabrir caixa</Button>
                    )}
                </div>
            </Example>

            <Example
                title="ConditionalWrapper"
                id="ex-conditional-wrapper"
                note="Envolve os filhos com uma função wrapper apenas quando condition é true — sem duplicar a subárvore."
                code={`const [wrapped, setWrapped] = useState(true);

<ConditionalWrapper
    condition={wrapped}
    wrapper={(children) => (
        <a href="https://tempest.dev" target="_blank" rel="noreferrer">
            {children}
        </a>
    )}
>
    Conteúdo {wrapped ? "(envolto num link)" : "(texto puro)"}
</ConditionalWrapper>
<Button onClick={() => setWrapped((v) => !v)}>
    {wrapped ? "Remover wrapper" : "Aplicar wrapper"}
</Button>`}
                props={[
                    {
                        name: "condition",
                        type: "boolean",
                        description: "Quando true, os filhos passam por wrapper.",
                    },
                    {
                        name: "wrapper",
                        type: "(children: ReactNode) => ReactNode",
                        description: "Função aplicada aos filhos quando condition é true.",
                    },
                    {
                        name: "children",
                        type: "ReactNode",
                        description: "Conteúdo que pode ser envolto.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <ConditionalWrapper
                        condition={wrapped}
                        wrapper={(children) => (
                            <a href="https://tempest.dev" target="_blank" rel="noreferrer">
                                {children}
                            </a>
                        )}
                    >
                        Conteúdo {wrapped ? "(envolto num link)" : "(texto puro)"}
                    </ConditionalWrapper>
                    <Button onClick={() => setWrapped((v) => !v)}>
                        {wrapped ? "Remover wrapper" : "Aplicar wrapper"}
                    </Button>
                </div>
            </Example>

            <Example
                title="For"
                id="ex-for"
                note="Iterador tipado com render-props. Renderiza fallback quando a lista está vazia."
                code={`const [tasks, setTasks] = useState([
    { id: 1, label: "Ler a documentação" },
    { id: 2, label: "Testar os componentes" },
]);

<For each={tasks} fallback={<em>Nenhuma tarefa pendente.</em>}>
    {(task, index) => (
        <li key={task.id}>
            {index + 1}. {task.label}
        </li>
    )}
</For>
<Button onClick={() => setTasks([])}>Limpar lista</Button>`}
                props={[
                    {
                        name: "each",
                        type: "readonly T[]",
                        description: "A coleção a ser iterada.",
                    },
                    {
                        name: "children",
                        type: "(item: T, index: number) => ReactNode",
                        description: "Função de render chamada para cada item.",
                    },
                    {
                        name: "fallback",
                        type: "ReactNode",
                        default: "null",
                        description: "Renderizado quando each está vazio.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <ul>
                        <For each={tasks} fallback={<em>Nenhuma tarefa pendente.</em>}>
                            {(task, index) => (
                                <li key={task.id}>
                                    {index + 1}. {task.label}
                                </li>
                            )}
                        </For>
                    </ul>
                    <div className="gallery-row">
                        <Button onClick={() => setTasks([])}>Limpar lista</Button>
                        <Button
                            variant="secondary"
                            onClick={() =>
                                setTasks([
                                    { id: 1, label: "Ler a documentação" },
                                    { id: 2, label: "Testar os componentes" },
                                ])
                            }
                        >
                            Restaurar
                        </Button>
                    </div>
                </div>
            </Example>

            <Example
                title="VisuallyHidden"
                id="ex-visually-hidden"
                note="Esconde o conteúdo visualmente mantendo-o disponível para leitores de tela (padrão sr-only)."
                code={`<Button>
    <Bell size={16} aria-hidden="true" />
    <VisuallyHidden>Notificações</VisuallyHidden>
</Button>`}
                props={[
                    {
                        name: "as",
                        type: "keyof JSX.IntrinsicElements",
                        default: '"span"',
                        description: "Elemento intrínseco a renderizar.",
                    },
                    {
                        name: "children",
                        type: "ReactNode",
                        description: "Conteúdo lido por leitores de tela.",
                    },
                    {
                        name: "...props",
                        type: "HTMLAttributes<HTMLElement>",
                        description: "Atributos HTML repassados ao elemento.",
                    },
                ]}
            >
                <div className="gallery-row">
                    <Button>
                        <Bell size={16} aria-hidden="true" />
                        <VisuallyHidden>Notificações</VisuallyHidden>
                    </Button>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>
                        O botão é só um ícone, mas leitores de tela anunciam "Notificações".
                    </span>
                </div>
            </Example>

            <Example
                title="Resizable"
                id="ex-resizable"
                note="Layout de dois painéis com divisor arrastável. Arraste o divisor ou foque-o e use as setas (2% por passo)."
                code={`<div style={{ height: 180, border: "1px solid var(--tempest-border, #e2e2e2)" }}>
    <Resizable defaultSize={40} min={20} max={80} style={{ height: "100%" }}>
        <div style={{ padding: 12 }}>Painel A</div>
        <div style={{ padding: 12 }}>Painel B</div>
    </Resizable>
</div>`}
                props={[
                    {
                        name: "direction",
                        type: '"horizontal" | "vertical"',
                        default: '"horizontal"',
                        description: "Orientação da divisão entre os painéis.",
                    },
                    {
                        name: "defaultSize",
                        type: "number",
                        default: "50",
                        description: "Tamanho inicial do primeiro painel, em percentual.",
                    },
                    {
                        name: "min",
                        type: "number",
                        default: "10",
                        description: "Limite inferior do primeiro painel, em percentual.",
                    },
                    {
                        name: "max",
                        type: "number",
                        default: "90",
                        description: "Limite superior do primeiro painel, em percentual.",
                    },
                    {
                        name: "children",
                        type: "[ReactNode, ReactNode]",
                        description: "Exatamente dois painéis — [paneA, paneB].",
                    },
                ]}
            >
                <div
                    style={{
                        height: 180,
                        border: "1px solid var(--tempest-border, #e2e2e2)",
                        borderRadius: 8,
                        overflow: "hidden",
                    }}
                >
                    <Resizable defaultSize={40} min={20} max={80} style={{ height: "100%" }}>
                        <div
                            style={{ padding: 12, background: "rgba(0,0,0,0.03)", height: "100%" }}
                        >
                            Painel A
                        </div>
                        <div style={{ padding: 12, height: "100%" }}>Painel B</div>
                    </Resizable>
                </div>
            </Example>
        </section>
    );
}
