import { useState } from "react";
import {
    Alert,
    BottomSheet,
    Button,
    ModalsProvider,
    Timeline,
    Toggle,
    ToggleGroup,
    ToggleGroupItem,
    useModals,
} from "tempest-react-sdk";
import { Bell, Bold, Check, Italic, Truck, Underline } from "lucide-react";
import { Example } from "../Example";

/** Child rendered inside the local <ModalsProvider> so it can call useModals. */
function ModalsDemo() {
    const modals = useModals();

    return (
        <div className="gallery-toolbar">
            <Button
                onClick={() =>
                    modals.open({
                        title: "Detalhes do pedido",
                        children: (
                            <p>
                                Pedido #1042 confirmado. Voce sera notificado quando sair para
                                entrega.
                            </p>
                        ),
                    })
                }
            >
                Abrir modal
            </Button>
            <Button
                variant="danger"
                onClick={() =>
                    modals.confirm({
                        title: "Excluir item",
                        message: "Tem certeza? Essa acao nao pode ser desfeita.",
                        danger: true,
                        confirmLabel: "Excluir",
                        onConfirm: () => console.log("excluido"),
                    })
                }
            >
                Confirmar exclusao
            </Button>
        </div>
    );
}

/** Gallery section: Alert, Timeline, Toggle, ToggleGroup, BottomSheet and imperative modals. */
export function FeedbackExtraSection() {
    const [pressed, setPressed] = useState<boolean>(false);
    const [format, setFormat] = useState<string[]>(["bold"]);
    const [sheetOpen, setSheetOpen] = useState<boolean>(false);

    return (
        <section className="gallery-section" id="feedback-extra">
            <h3>Alert · Timeline · Toggle · BottomSheet · Modals</h3>
            <p className="description">
                Componentes de feedback e interacao extra: avisos inline, feeds de eventos, botoes
                de dois estados, folha inferior mobile e modais imperativos.
            </p>

            <Example
                title="Alert"
                id="ex-alert-feedback-extra"
                note="Aviso inline com tom, aparencia e botao de fechar opcional."
                code={`import { Alert } from "tempest-react-sdk";

<Alert
    variant="success"
    title="Tudo certo"
    description="Suas alteracoes foram salvas."
    onClose={() => console.log("dispensado")}
/>

<Alert variant="warning" appearance="outline" title="Atencao">
    Revise os dados antes de enviar.
</Alert>`}
                props={[
                    {
                        name: "variant",
                        type: '"neutral" | "info" | "success" | "warning" | "danger"',
                        default: '"info"',
                        description: "Tom de cor do aviso.",
                    },
                    {
                        name: "appearance",
                        type: '"soft" | "solid" | "outline"',
                        default: '"soft"',
                        description: "Estilo visual do fundo/borda.",
                    },
                    {
                        name: "title",
                        type: "ReactNode",
                        description: "Titulo em negrito no topo.",
                    },
                    {
                        name: "description",
                        type: "ReactNode",
                        description: "Texto secundario abaixo do titulo.",
                    },
                    {
                        name: "icon",
                        type: "ReactNode",
                        description: "Icone opcional a esquerda.",
                    },
                    {
                        name: "onClose",
                        type: "() => void",
                        description: "Exibe o botao de fechar e dispara ao clicar.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <Alert
                        variant="success"
                        title="Tudo certo"
                        description="Suas alteracoes foram salvas."
                        icon={<Check size={18} />}
                        onClose={() => console.log("dispensado")}
                    />
                    <Alert variant="warning" appearance="outline" title="Atencao">
                        Revise os dados antes de enviar.
                    </Alert>
                </div>
            </Example>

            <Example
                title="Timeline"
                id="ex-timeline-feedback-extra"
                note="Feed vertical de eventos com marcadores coloridos e coluna de meta."
                code={`import { Timeline } from "tempest-react-sdk";

<Timeline
    items={[
        { id: "1", title: "Pedido criado", meta: "10:24", marker: "primary" },
        { id: "2", title: "Pagamento aprovado", meta: "10:25", marker: "success" },
        { id: "3", title: "Saiu para entrega", meta: "11:00", marker: "warning" },
    ]}
/>`}
                props={[
                    {
                        name: "items",
                        type: "TimelineItem[]",
                        description: "Entradas { id, title, description?, meta?, icon?, marker? }.",
                    },
                    {
                        name: "connector",
                        type: "boolean",
                        default: "true",
                        description: "Exibe a linha conectando os marcadores.",
                    },
                ]}
            >
                <Timeline
                    items={[
                        {
                            id: "1",
                            title: "Pedido criado",
                            description: "Aguardando pagamento.",
                            meta: "10:24",
                            marker: "primary",
                        },
                        {
                            id: "2",
                            title: "Pagamento aprovado",
                            meta: "10:25",
                            marker: "success",
                        },
                        {
                            id: "3",
                            title: "Saiu para entrega",
                            meta: "11:00",
                            marker: "warning",
                            icon: <Truck size={12} />,
                        },
                    ]}
                />
            </Example>

            <Example
                title="Toggle"
                id="ex-toggle-feedback-extra"
                note="Botao de dois estados controlado via pressed + onPressedChange."
                code={`import { Toggle } from "tempest-react-sdk";
import { Bell } from "lucide-react";
import { useState } from "react";

const [pressed, setPressed] = useState(false);

<Toggle pressed={pressed} onPressedChange={setPressed}>
    <Bell size={16} /> Notificacoes {pressed ? "ligadas" : "desligadas"}
</Toggle>`}
                props={[
                    {
                        name: "pressed",
                        type: "boolean",
                        description: "Estado controlado. Use com onPressedChange.",
                    },
                    {
                        name: "defaultPressed",
                        type: "boolean",
                        default: "false",
                        description: "Estado inicial no modo nao controlado.",
                    },
                    {
                        name: "onPressedChange",
                        type: "(pressed: boolean) => void",
                        description: "Disparado com o proximo estado ao ativar.",
                    },
                    {
                        name: "size",
                        type: '"sm" | "md" | "lg"',
                        default: '"md"',
                        description: "Tamanho visual.",
                    },
                    {
                        name: "variant",
                        type: '"default" | "outline"',
                        default: '"default"',
                        description: "Estilo visual.",
                    },
                ]}
            >
                <Toggle pressed={pressed} onPressedChange={setPressed}>
                    <Bell size={16} /> Notificacoes {pressed ? "ligadas" : "desligadas"}
                </Toggle>
            </Example>

            <Example
                title="ToggleGroup"
                id="ex-toggle-group-feedback-extra"
                note='Conjunto de itens com selecao. type="multiple" mantem um array de valores.'
                code={`import { ToggleGroup, ToggleGroupItem } from "tempest-react-sdk";
import { Bold, Italic, Underline } from "lucide-react";
import { useState } from "react";

const [format, setFormat] = useState<string[]>(["bold"]);

<ToggleGroup
    type="multiple"
    value={format}
    onValueChange={(value) => setFormat(value as string[])}
>
    <ToggleGroupItem value="bold" aria-label="Negrito"><Bold size={16} /></ToggleGroupItem>
    <ToggleGroupItem value="italic" aria-label="Itálico"><Italic size={16} /></ToggleGroupItem>
    <ToggleGroupItem value="underline" aria-label="Sublinhado"><Underline size={16} /></ToggleGroupItem>
</ToggleGroup>`}
                props={[
                    {
                        name: "type",
                        type: '"single" | "multiple"',
                        default: '"single"',
                        description: "single mantem uma string; multiple mantem um array.",
                    },
                    {
                        name: "value",
                        type: "string | string[]",
                        description: "Valor controlado (string em single, array em multiple).",
                    },
                    {
                        name: "defaultValue",
                        type: "string | string[]",
                        description: "Valor inicial no modo nao controlado.",
                    },
                    {
                        name: "onValueChange",
                        type: "(value: string | string[]) => void",
                        description: "Disparado com o proximo valor ao mudar a selecao.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <ToggleGroup
                        type="multiple"
                        value={format}
                        onValueChange={(value) => setFormat(value as string[])}
                    >
                        <ToggleGroupItem value="bold" aria-label="Negrito">
                            <Bold size={16} />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="italic" aria-label="Itálico">
                            <Italic size={16} />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="underline" aria-label="Sublinhado">
                            <Underline size={16} />
                        </ToggleGroupItem>
                    </ToggleGroup>
                    <p className="example-note">Ativos: {format.join(", ") || "nenhum"}</p>
                </div>
            </Example>

            <Example
                title="BottomSheet"
                id="ex-bottom-sheet-feedback-extra"
                note="Folha inferior mobile controlada por open + onClose, aberta por um Button."
                code={`import { BottomSheet, Button } from "tempest-react-sdk";
import { useState } from "react";

const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Abrir filtros</Button>

<BottomSheet open={open} onClose={() => setOpen(false)} title="Filtros">
    <p>Conteudo da folha inferior.</p>
    <Button onClick={() => setOpen(false)}>Fechar</Button>
</BottomSheet>`}
                props={[
                    {
                        name: "open",
                        type: "boolean",
                        description: "Estado controlado de abertura.",
                    },
                    {
                        name: "onClose",
                        type: "() => void",
                        description: "Disparado ao dispensar (backdrop, Esc, handle).",
                    },
                    {
                        name: "title",
                        type: "ReactNode",
                        description: "Titulo opcional no topo da folha.",
                    },
                    {
                        name: "showHandle",
                        type: "boolean",
                        default: "true",
                        description: "Exibe o indicador de arrastar no topo.",
                    },
                    {
                        name: "dismissOnBackdrop",
                        type: "boolean",
                        default: "true",
                        description: "Fecha ao clicar no fundo.",
                    },
                ]}
            >
                <div className="gallery-toolbar">
                    <Button onClick={() => setSheetOpen(true)}>Abrir filtros</Button>
                    <BottomSheet
                        open={sheetOpen}
                        onClose={() => setSheetOpen(false)}
                        title="Filtros"
                    >
                        <div className="gallery-stack">
                            <p>Conteudo da folha inferior.</p>
                            <Button onClick={() => setSheetOpen(false)}>Fechar</Button>
                        </div>
                    </BottomSheet>
                </div>
            </Example>

            <Example
                title="ModalsProvider + useModals"
                id="ex-modals-feedback-extra"
                note="API imperativa de modais. Envolva a subarvore em <ModalsProvider> e use useModals num filho."
                code={`import { ModalsProvider, useModals, Button } from "tempest-react-sdk";

function Demo() {
    const modals = useModals();
    return (
        <>
            <Button
                onClick={() =>
                    modals.open({ title: "Detalhes", children: <p>Pedido confirmado.</p> })
                }
            >
                Abrir modal
            </Button>
            <Button
                variant="danger"
                onClick={() =>
                    modals.confirm({
                        title: "Excluir item",
                        message: "Tem certeza?",
                        danger: true,
                        onConfirm: () => console.log("excluido"),
                    })
                }
            >
                Confirmar exclusao
            </Button>
        </>
    );
}

<ModalsProvider>
    <Demo />
</ModalsProvider>`}
                props={[
                    {
                        name: "open(options)",
                        type: "(o: OpenModalOptions) => string",
                        description: "Empilha um modal de conteudo. Retorna o id.",
                    },
                    {
                        name: "confirm(options)",
                        type: "(o: ConfirmModalOptions) => string",
                        description: "Empilha um dialogo de confirmacao. Retorna o id.",
                    },
                    {
                        name: "close(id)",
                        type: "(id: string) => void",
                        description: "Remove o modal com o id informado.",
                    },
                    {
                        name: "closeAll()",
                        type: "() => void",
                        description: "Remove todos os modais da pilha.",
                    },
                ]}
            >
                <ModalsProvider>
                    <ModalsDemo />
                </ModalsProvider>
            </Example>
        </section>
    );
}
