import { useState } from "react";
import {
    Navbar,
    Sidebar,
    BottomNavigation,
    NavigationMenu,
    SegmentedControl,
    Button,
} from "tempest-react-sdk";
import {
    Home,
    Search,
    User,
    Bell,
    LayoutDashboard,
    Settings,
    Users,
    BarChart3,
    List,
    LayoutGrid,
    Calendar,
} from "lucide-react";
import { Example } from "../Example";

/**
 * Gallery section covering navigation shells: the top app bar, the desktop
 * sidebar, the mobile bottom tab bar, the horizontal dropdown menu, and the
 * iOS-style segmented control. Each demo wires real `value`/`onChange` state so
 * clicking updates the active item live.
 */
export function NavExtraSection() {
    const [sidebarTab, setSidebarTab] = useState<string>("dashboard");
    const [collapsed, setCollapsed] = useState<boolean>(false);
    const [bottomTab, setBottomTab] = useState<string>("home");
    const [view, setView] = useState<string>("list");

    return (
        <section className="gallery-section" id="nav-extra">
            <h3>Navbar · Sidebar · Bottom nav</h3>
            <p className="description">
                Cascas de navegação do SDK: barra superior de três slots, sidebar de desktop, tab
                bar inferior mobile, menu horizontal com submenus e o segmented control estilo iOS.
                Todos os demos usam estado real de item ativo.
            </p>

            <Example
                title="Navbar"
                id="ex-navbar"
                note="App bar de três slots — logo, nav e actions — que colapsa graciosamente no mobile."
                code={`<Navbar
    sticky={false}
    logo={<strong>Tempest</strong>}
    nav={
        <NavigationMenu
            items={[
                { label: "Home", href: "#" },
                { label: "Docs", href: "#" },
            ]}
        />
    }
    actions={
        <>
            <Button variant="ghost" size="sm">
                Entrar
            </Button>
            <Button size="sm">Criar conta</Button>
        </>
    }
/>`}
                props={[
                    {
                        name: "logo",
                        type: "ReactNode",
                        description: "Slot esquerdo — logo + marca.",
                    },
                    {
                        name: "nav",
                        type: "ReactNode",
                        description: "Slot central — links de navegação.",
                    },
                    {
                        name: "actions",
                        type: "ReactNode",
                        description: "Slot direito — menu de usuário / ações.",
                    },
                    {
                        name: "sticky",
                        type: "boolean",
                        default: "true",
                        description: "Fixa a barra no topo do container de scroll.",
                    },
                    {
                        name: "tone",
                        type: '"surface" | "primary" | "transparent"',
                        default: '"surface"',
                        description: "Tom visual da barra.",
                    },
                    {
                        name: "bordered",
                        type: "boolean",
                        default: "true",
                        description: "Renderiza uma borda inferior fina.",
                    },
                ]}
            >
                <div
                    className="gallery-stack"
                    style={{ border: "1px solid var(--tempest-border)", borderRadius: 8 }}
                >
                    <Navbar
                        sticky={false}
                        logo={<strong>Tempest</strong>}
                        nav={
                            <NavigationMenu
                                items={[
                                    { label: "Home", href: "#" },
                                    { label: "Docs", href: "#" },
                                ]}
                            />
                        }
                        actions={
                            <>
                                <Button variant="ghost" size="sm">
                                    Entrar
                                </Button>
                                <Button size="sm">Criar conta</Button>
                            </>
                        }
                    />
                </div>
            </Example>

            <Example
                title="Sidebar"
                id="ex-sidebar"
                note="Navegação lateral de desktop com item ativo controlado e modo colapsado (só ícones)."
                code={`const [tab, setTab] = useState("dashboard");
const [collapsed, setCollapsed] = useState(false);

<Sidebar
    collapsed={collapsed}
    header={<strong>Tempest</strong>}
    items={[
        { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
        { key: "users", label: "Usuários", icon: <Users size={18} />, badge: 12 },
        { key: "reports", label: "Relatórios", icon: <BarChart3 size={18} /> },
        { key: "settings", label: "Ajustes", icon: <Settings size={18} /> },
    ]}
    value={tab}
    onChange={setTab}
/>`}
                props={[
                    {
                        name: "items",
                        type: "SidebarItem[]",
                        description:
                            "Itens de navegação (key, label, icon?, badge?, disabled?, href?).",
                    },
                    { name: "value", type: "string", description: "Key do item ativo." },
                    {
                        name: "onChange",
                        type: "(key: string) => void",
                        description: "Dispara com a key ao clicar num item.",
                    },
                    {
                        name: "header",
                        type: "ReactNode",
                        description: "Slot superior — logo + marca.",
                    },
                    {
                        name: "footer",
                        type: "ReactNode",
                        description: "Slot inferior — ajustes/perfil/logout.",
                    },
                    {
                        name: "collapsed",
                        type: "boolean",
                        default: "false",
                        description: "Modo colapsado — apenas ícones visíveis.",
                    },
                    {
                        name: "width",
                        type: "number | string",
                        default: "240",
                        description: "Largura quando expandido.",
                    },
                    {
                        name: "collapsedWidth",
                        type: "number | string",
                        default: "64",
                        description: "Largura quando colapsado.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <div className="gallery-toolbar">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCollapsed((prev) => !prev)}
                        >
                            {collapsed ? "Expandir" : "Colapsar"}
                        </Button>
                        <span>
                            Ativo: <code>{sidebarTab}</code>
                        </span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            height: 280,
                            border: "1px solid var(--tempest-border)",
                            borderRadius: 8,
                            overflow: "hidden",
                        }}
                    >
                        <Sidebar
                            collapsed={collapsed}
                            header={!collapsed ? <strong>Tempest</strong> : undefined}
                            items={[
                                {
                                    key: "dashboard",
                                    label: "Dashboard",
                                    icon: <LayoutDashboard size={18} />,
                                },
                                {
                                    key: "users",
                                    label: "Usuários",
                                    icon: <Users size={18} />,
                                    badge: 12,
                                },
                                {
                                    key: "reports",
                                    label: "Relatórios",
                                    icon: <BarChart3 size={18} />,
                                },
                                {
                                    key: "settings",
                                    label: "Ajustes",
                                    icon: <Settings size={18} />,
                                },
                            ]}
                            value={sidebarTab}
                            onChange={setSidebarTab}
                        />
                    </div>
                </div>
            </Example>

            <Example
                title="BottomNavigation"
                id="ex-bottom-navigation"
                note="Tab bar inferior mobile (3–5 itens). Clique para mudar o item ativo ao vivo."
                code={`const [tab, setTab] = useState("home");

<BottomNavigation
    items={[
        { key: "home", label: "Início", icon: <Home size={20} /> },
        { key: "search", label: "Buscar", icon: <Search size={20} /> },
        { key: "alerts", label: "Alertas", icon: <Bell size={20} />, badge: 3 },
        { key: "profile", label: "Perfil", icon: <User size={20} /> },
    ]}
    value={tab}
    onChange={setTab}
/>`}
                props={[
                    {
                        name: "items",
                        type: "BottomNavigationItem[]",
                        description: "Itens (key, label, icon?, badge?, disabled?).",
                    },
                    { name: "value", type: "string", description: "Key selecionada." },
                    {
                        name: "onChange",
                        type: "(key: string) => void",
                        description: "Chamado com a nova key ao clicar.",
                    },
                    {
                        name: "showLabels",
                        type: "boolean",
                        default: "true",
                        description: "Mostra o label abaixo de cada ícone.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <span>
                        Ativo: <code>{bottomTab}</code>
                    </span>
                    <div
                        style={{
                            width: 360,
                            maxWidth: "100%",
                            border: "1px solid var(--tempest-border)",
                            borderRadius: 8,
                            overflow: "hidden",
                        }}
                    >
                        <BottomNavigation
                            items={[
                                { key: "home", label: "Início", icon: <Home size={20} /> },
                                { key: "search", label: "Buscar", icon: <Search size={20} /> },
                                {
                                    key: "alerts",
                                    label: "Alertas",
                                    icon: <Bell size={20} />,
                                    badge: 3,
                                },
                                { key: "profile", label: "Perfil", icon: <User size={20} /> },
                            ]}
                            value={bottomTab}
                            onChange={setBottomTab}
                        />
                    </div>
                </div>
            </Example>

            <Example
                title="NavigationMenu"
                id="ex-navigation-menu"
                note="Menu horizontal com submenus em dropdown (hover, foco ou clique). Fecha no Escape ou clique fora."
                code={`<NavigationMenu
    items={[
        { label: "Home", href: "#" },
        {
            label: "Produtos",
            children: [
                { label: "Analytics", href: "#analytics" },
                { label: "Billing", onSelect: () => alert("Billing") },
            ],
        },
        {
            label: "Empresa",
            children: [
                { label: "Sobre", href: "#sobre" },
                { label: "Carreiras", href: "#carreiras" },
            ],
        },
        { label: "Contato", href: "#" },
    ]}
/>`}
                props={[
                    {
                        name: "items",
                        type: "NavigationMenuItem[]",
                        description:
                            "Entradas de topo (label, href?, onSelect?, children?). children abre submenu.",
                    },
                ]}
            >
                <div
                    className="gallery-row"
                    style={{
                        padding: 12,
                        minHeight: 140,
                        alignItems: "flex-start",
                        border: "1px solid var(--tempest-border)",
                        borderRadius: 8,
                    }}
                >
                    <NavigationMenu
                        items={[
                            { label: "Home", href: "#" },
                            {
                                label: "Produtos",
                                children: [
                                    { label: "Analytics", href: "#analytics" },
                                    { label: "Billing", onSelect: () => alert("Billing") },
                                ],
                            },
                            {
                                label: "Empresa",
                                children: [
                                    { label: "Sobre", href: "#sobre" },
                                    { label: "Carreiras", href: "#carreiras" },
                                ],
                            },
                            { label: "Contato", href: "#" },
                        ]}
                    />
                </div>
            </Example>

            <Example
                title="SegmentedControl"
                id="ex-segmented-control"
                note="Pílula conectada com 2–5 opções mutuamente exclusivas, estilo iOS."
                code={`const [view, setView] = useState("list");

<SegmentedControl
    aria-label="Modo de visualização"
    value={view}
    onChange={setView}
    options={[
        { value: "list", label: "Lista", icon: <List size={16} /> },
        { value: "grid", label: "Grade", icon: <LayoutGrid size={16} /> },
        { value: "calendar", label: "Agenda", icon: <Calendar size={16} /> },
    ]}
/>`}
                props={[
                    {
                        name: "options",
                        type: "SegmentedControlOption[]",
                        description: "Segmentos (value, label, icon?, disabled?).",
                    },
                    { name: "value", type: "string", description: "Valor selecionado." },
                    {
                        name: "onChange",
                        type: "(value: string) => void",
                        description: "Dispara com o novo valor ao selecionar.",
                    },
                    {
                        name: "size",
                        type: '"sm" | "md" | "lg"',
                        default: '"md"',
                        description: "Tamanho visual.",
                    },
                    {
                        name: "fullWidth",
                        type: "boolean",
                        default: "false",
                        description: "Estica para a largura total do container.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <SegmentedControl
                        aria-label="Modo de visualização"
                        value={view}
                        onChange={setView}
                        options={[
                            { value: "list", label: "Lista", icon: <List size={16} /> },
                            { value: "grid", label: "Grade", icon: <LayoutGrid size={16} /> },
                            {
                                value: "calendar",
                                label: "Agenda",
                                icon: <Calendar size={16} />,
                            },
                        ]}
                    />
                    <span>
                        Visualização: <code>{view}</code>
                    </span>
                </div>
            </Example>
        </section>
    );
}
