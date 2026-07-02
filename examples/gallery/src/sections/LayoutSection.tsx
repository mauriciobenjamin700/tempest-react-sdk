import {
    AppShell,
    Page,
    Container,
    Center,
    Spacer,
    Divider,
    SafeArea,
    Show,
    Hide,
    Navbar,
    Button,
    Spinner,
} from "tempest-react-sdk";
import { LayoutDashboard, Plus } from "lucide-react";
import { Example } from "../Example";

/**
 * Gallery section demonstrating the SDK layout primitives: AppShell, Page,
 * Container, Center, Spacer, Divider, SafeArea and the responsive Show/Hide
 * wrappers.
 */
export function LayoutSection() {
    return (
        <section className="gallery-section" id="layout">
            <h3>Layout</h3>
            <p className="description">
                Primitivos de layout do SDK: estrutura de app (AppShell + Page), containers,
                centralização, espaçadores, divisores, safe-area para notch e wrappers responsivos
                (Show/Hide).
            </p>

            <Example
                title="AppShell"
                id="ex-appshell"
                note="Compõe navbar + sidebar + conteúdo + bottom nav com comportamento responsivo."
                code={`import { AppShell, Navbar, Page } from "tempest-react-sdk";

<AppShell
    navbar={<Navbar logo={<strong>Tempest</strong>} />}
    sidebar={<nav>Menu lateral</nav>}
    bottomNav={<nav>Navegação inferior</nav>}
>
    <Page title="Dashboard" description="Bem-vindo de volta">
        Conteúdo principal da página.
    </Page>
</AppShell>`}
                props={[
                    {
                        name: "navbar",
                        type: "ReactNode",
                        description: "Barra superior (renderiza em todo breakpoint).",
                    },
                    {
                        name: "sidebar",
                        type: "ReactNode",
                        description: "Navegação lateral (oculta abaixo de sidebarBreakpoint).",
                    },
                    {
                        name: "bottomNav",
                        type: "ReactNode",
                        description: "Navegação inferior mobile (oculta em md+).",
                    },
                    {
                        name: "footer",
                        type: "ReactNode",
                        description: "Rodapé renderizado após o conteúdo.",
                    },
                    {
                        name: "sidebarBreakpoint",
                        type: '"sm" | "md" | "lg" | "xl"',
                        default: '"md"',
                        description: "Breakpoint em que a sidebar aparece.",
                    },
                ]}
            >
                <div
                    style={{
                        height: 260,
                        border: "1px solid var(--tempest-border)",
                        overflow: "hidden",
                    }}
                >
                    <AppShell
                        navbar={<Navbar logo={<strong>Tempest</strong>} bordered />}
                        sidebar={
                            <nav style={{ padding: "12px", width: 140, fontSize: 14 }}>
                                <div>Início</div>
                                <div>Pedidos</div>
                                <div>Config</div>
                            </nav>
                        }
                        bottomNav={
                            <nav style={{ padding: "8px 12px", fontSize: 14 }}>
                                Início · Pedidos · Config
                            </nav>
                        }
                    >
                        <Page title="Dashboard" description="Bem-vindo de volta" padded>
                            Conteúdo principal da página.
                        </Page>
                    </AppShell>
                </div>
            </Example>

            <Example
                title="Page"
                id="ex-page"
                note="Wrapper de página com header (título, descrição, ações), toolbar e conteúdo."
                code={`import { Page, Button } from "tempest-react-sdk";
import { Plus } from "lucide-react";

<Page
    eyebrow="Vendas"
    title="Pedidos"
    description="Acompanhe seus pedidos recentes"
    actions={<Button variant="primary">Novo</Button>}
>
    Lista de pedidos aqui.
</Page>`}
                props={[
                    {
                        name: "title",
                        type: "ReactNode",
                        description: "Título renderizado como <h1>.",
                    },
                    {
                        name: "eyebrow",
                        type: "ReactNode",
                        description: "Subtítulo / breadcrumb acima do título.",
                    },
                    {
                        name: "description",
                        type: "ReactNode",
                        description: "Descrição abaixo do título.",
                    },
                    {
                        name: "actions",
                        type: "ReactNode",
                        description: "Slot de ações à direita no header.",
                    },
                    {
                        name: "toolbar",
                        type: "ReactNode",
                        description: "Barra de filtros/abas abaixo do header.",
                    },
                    {
                        name: "footer",
                        type: "ReactNode",
                        description: "Slot de rodapé no fim do conteúdo.",
                    },
                    {
                        name: "padded",
                        type: "boolean",
                        default: "true",
                        description: "Padding da página.",
                    },
                ]}
            >
                <div style={{ border: "1px solid var(--tempest-border)" }}>
                    <Page
                        eyebrow="Vendas"
                        title="Pedidos"
                        description="Acompanhe seus pedidos recentes"
                        actions={
                            <Button variant="primary">
                                <Plus size={16} /> Novo
                            </Button>
                        }
                        padded
                    >
                        Lista de pedidos aqui.
                    </Page>
                </div>
            </Example>

            <Example
                title="Container"
                id="ex-container"
                note="Container horizontal com max-width por preset e padding lateral responsivo."
                code={`import { Container } from "tempest-react-sdk";

<Container size="sm">
    Conteúdo limitado a uma largura máxima e centralizado.
</Container>`}
                props={[
                    {
                        name: "size",
                        type: '"sm" | "md" | "lg" | "xl" | "full"',
                        default: '"lg"',
                        description: "Preset de largura máxima.",
                    },
                ]}
            >
                <div
                    style={{
                        border: "1px solid var(--tempest-border)",
                        background: "var(--tempest-surface)",
                    }}
                >
                    <Container size="sm">
                        <div
                            style={{
                                background: "var(--tempest-surface-2)",
                                padding: 16,
                                borderRadius: 8,
                            }}
                        >
                            Conteúdo limitado a uma largura máxima (size="sm") e centralizado.
                        </div>
                    </Container>
                </div>
            </Example>

            <Example
                title="Center"
                id="ex-center"
                note="Centraliza filhos horizontal, vertical ou em ambos os eixos."
                code={`import { Center, Spinner } from "tempest-react-sdk";

<Center axis="both" minHeight={200}>
    <Spinner />
</Center>`}
                props={[
                    {
                        name: "axis",
                        type: '"both" | "horizontal" | "vertical"',
                        default: '"both"',
                        description: "Eixo de centralização.",
                    },
                    {
                        name: "minHeight",
                        type: "number | string",
                        description: "Altura mínima do container.",
                    },
                    {
                        name: "fullWidth",
                        type: "boolean",
                        default: "true",
                        description: "Ocupa 100% da largura do pai.",
                    },
                ]}
            >
                <div style={{ border: "1px solid var(--tempest-border)" }}>
                    <Center axis="both" minHeight={200}>
                        <Spinner />
                    </Center>
                </div>
            </Example>

            <Example
                title="Spacer"
                id="ex-spacer"
                note="Espaçador flexível — empurra irmãos em um container flex (flex: 1)."
                code={`import { Spacer, Button } from "tempest-react-sdk";

<div style={{ display: "flex", alignItems: "center" }}>
    <Button>Cancelar</Button>
    <Spacer />
    <Button variant="primary">Salvar</Button>
</div>`}
                props={[
                    {
                        name: "axis",
                        type: '"both" | "x" | "y"',
                        default: '"both"',
                        description: "Eixo ao longo do qual o spacer cresce.",
                    },
                ]}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        border: "1px solid var(--tempest-border)",
                        padding: 12,
                        borderRadius: 8,
                    }}
                >
                    <Button>Cancelar</Button>
                    <Spacer />
                    <Button variant="primary">Salvar</Button>
                </div>
            </Example>

            <Example
                title="Divider"
                id="ex-divider"
                note="Separador visual horizontal ou vertical, com label e variante opcionais."
                code={`import { Divider } from "tempest-react-sdk";

<>
    <p>Seção A</p>
    <Divider />
    <p>Seção B</p>
    <Divider label="ou" />
    <Divider variant="dashed" />
</>`}
                props={[
                    {
                        name: "orientation",
                        type: '"horizontal" | "vertical"',
                        default: '"horizontal"',
                        description: "Orientação do separador.",
                    },
                    {
                        name: "variant",
                        type: '"solid" | "dashed"',
                        default: '"solid"',
                        description: "Estilo da linha.",
                    },
                    {
                        name: "label",
                        type: "ReactNode",
                        description: "Label central (apenas horizontal).",
                    },
                    {
                        name: "align",
                        type: '"start" | "center" | "end"',
                        default: '"center"',
                        description: "Posição do label.",
                    },
                ]}
            >
                <div style={{ width: "100%" }}>
                    <p style={{ margin: 0 }}>Seção A</p>
                    <Divider />
                    <p style={{ margin: 0 }}>Seção B</p>
                    <Divider label="ou" />
                    <Divider variant="dashed" />
                    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 32 }}>
                        <span>esquerda</span>
                        <Divider orientation="vertical" />
                        <span>direita</span>
                    </div>
                </div>
            </Example>

            <Example
                title="SafeArea"
                id="ex-safearea"
                note="Aplica padding env(safe-area-inset-*) para evitar notch / barra de navegação do dispositivo."
                code={`import { SafeArea, Navbar } from "tempest-react-sdk";

<SafeArea edges={["top", "left", "right"]}>
    <Navbar logo={<strong>App</strong>} />
</SafeArea>`}
                props={[
                    {
                        name: "edges",
                        type: "SafeAreaEdge[]",
                        default: '["top","right","bottom","left"]',
                        description: "Bordas que recebem o padding de safe-area.",
                    },
                    {
                        name: "inline",
                        type: "boolean",
                        default: "false",
                        description: "Renderiza com display: contents.",
                    },
                ]}
            >
                <div style={{ border: "1px solid var(--tempest-border)" }}>
                    <SafeArea edges={["top", "left", "right"]}>
                        <Navbar logo={<strong>App</strong>} bordered={false} />
                    </SafeArea>
                </div>
            </Example>

            <Example
                title="Show"
                id="ex-show"
                note="Renderiza filhos condicionalmente por breakpoint. Redimensione a janela para ver mudar."
                code={`import { Show } from "tempest-react-sdk";

<>
    <Show below="md">Você está em uma tela pequena (&lt; md).</Show>
    <Show above="md">Você está em uma tela grande (&gt;= md).</Show>
</>`}
                props={[
                    {
                        name: "above",
                        type: "Breakpoint",
                        description: "Renderiza quando a largura é >= esse breakpoint.",
                    },
                    {
                        name: "below",
                        type: "Breakpoint",
                        description: "Renderiza quando a largura é < esse breakpoint.",
                    },
                    {
                        name: "only",
                        type: "Breakpoint | Breakpoint[]",
                        description: "Renderiza apenas nos breakpoints listados.",
                    },
                ]}
            >
                <div
                    style={{
                        border: "1px solid var(--tempest-border)",
                        padding: 16,
                        borderRadius: 8,
                    }}
                >
                    <Show below="md">
                        <strong>Tela pequena</strong> — visível abaixo de md.
                    </Show>
                    <Show above="md">
                        <strong>Tela grande</strong> — visível em md e acima.
                    </Show>
                </div>
            </Example>

            <Example
                title="Hide"
                id="ex-hide"
                note="Inverso de Show — oculta filhos quando a condição de breakpoint bate. Redimensione para ver."
                code={`import { Hide } from "tempest-react-sdk";

<>
    <Hide below="md">Oculto em telas pequenas (&lt; md).</Hide>
    <Hide above="md">Oculto em telas grandes (&gt;= md).</Hide>
</>`}
                props={[
                    {
                        name: "above",
                        type: "Breakpoint",
                        description: "Oculta quando a largura é >= esse breakpoint.",
                    },
                    {
                        name: "below",
                        type: "Breakpoint",
                        description: "Oculta quando a largura é < esse breakpoint.",
                    },
                    {
                        name: "only",
                        type: "Breakpoint | Breakpoint[]",
                        description: "Oculta nos breakpoints listados.",
                    },
                ]}
            >
                <div
                    style={{
                        border: "1px solid var(--tempest-border)",
                        padding: 16,
                        borderRadius: 8,
                    }}
                >
                    <Hide below="md">
                        <LayoutDashboard size={16} style={{ verticalAlign: "middle" }} /> Oculto
                        abaixo de md.
                    </Hide>
                    <Hide above="md">
                        <LayoutDashboard size={16} style={{ verticalAlign: "middle" }} /> Oculto em
                        md e acima.
                    </Hide>
                </div>
            </Example>
        </section>
    );
}
