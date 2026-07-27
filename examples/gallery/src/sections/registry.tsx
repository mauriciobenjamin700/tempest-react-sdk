import type { ComponentType } from "react";
import { ButtonsSection } from "./ButtonsSection";
import { FormFieldsSection } from "./FormFieldsSection";
import { FormPrimitivesSection } from "./FormPrimitivesSection";
import { InputsAdvancedSection } from "./InputsAdvancedSection";
import { FeedbackSection } from "./FeedbackSection";
import { DataDisplaySection } from "./DataDisplaySection";
import { DisplayMediaSection } from "./DisplayMediaSection";
import { ModalSection } from "./ModalSection";
import { OverlaysSection } from "./OverlaysSection";
import { DisclosureSection } from "./DisclosureSection";
import { NavigationSection } from "./NavigationSection";
import { AdvancedComponentsSection } from "./AdvancedComponentsSection";
import { TableSection } from "./TableSection";
import { DataTableSection } from "./DataTableSection";
import { DataVizScalesSection } from "./DataVizScalesSection";
import { ImageCropperSection } from "./ImageCropperSection";
import { ChatSection } from "./ChatSection";
import { DashboardLayoutSection } from "./DashboardLayoutSection";
import { FilterBarSection } from "./FilterBarSection";
import { MarkdownSection } from "./MarkdownSection";
import { MasonrySection } from "./MasonrySection";
import { TourSection } from "./TourSection";
import { TransferSection } from "./TransferSection";
import { CodeBlockSection } from "./CodeBlockSection";
import { QRCodeSection } from "./QRCodeSection";
import { SchedulerSection } from "./SchedulerSection";
import { SparklineSection } from "./SparklineSection";
import { VirtualTableSection } from "./VirtualTableSection";
import { NotificationCenterSection } from "./NotificationCenterSection";
import { MaterialSection } from "./MaterialSection";
import { FormsSection } from "./FormsSection";
import { BRFormsSection } from "./BRFormsSection";
import { FoundationSection } from "./FoundationSection";
import { ThemeI18nSection } from "./ThemeI18nSection";
import { MetaSection } from "./MetaSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { PWASection } from "./PWASection";
import { UtilsSection } from "./UtilsSection";
import { LayoutSection } from "./LayoutSection";
import { NavExtraSection } from "./NavExtraSection";
import { InputsExtraSection } from "./InputsExtraSection";
import { FeedbackExtraSection } from "./FeedbackExtraSection";
import { HeadlessSection } from "./HeadlessSection";
import { HooksStateSection } from "./HooksStateSection";
import { HooksDomSection } from "./HooksDomSection";
import { AuthAccessRecipeSection } from "./AuthAccessRecipeSection";
import { HttpRecipeSection } from "./HttpRecipeSection";
import { QueryRecipeSection } from "./QueryRecipeSection";
import { RealtimeRecipeSection } from "./RealtimeRecipeSection";
import { GeoSection } from "./GeoSection";
import { BrazilMapSection } from "./BrazilMapSection";
import { ThemeFactorySection } from "./ThemeFactorySection";
import { IconsSection } from "./IconsSection";
import { UtilitiesCssSection } from "./UtilitiesCssSection";
import { HierarchyFlowSection } from "./HierarchyFlowSection";
import { CaptureMediaSection } from "./CaptureMediaSection";

/** Sidebar grouping for sections, in display order. */
export type SectionGroup = "Componentes" | "Hooks" | "Receitas" | "Fundação";

export const GROUP_ORDER: SectionGroup[] = ["Componentes", "Hooks", "Receitas", "Fundação"];

export interface SectionEntry {
    /** Anchor id used in the URL hash and `id` attribute. */
    id: string;
    /** Sidebar label. */
    label: string;
    /** Extra keywords (component/hook names) to make search find this section. */
    keywords: string;
    /** Sidebar group. */
    group: SectionGroup;
    /** The section component. */
    Component: ComponentType;
}

/**
 * Single source of truth for every gallery section. `App` renders the sidebar
 * (grouped + searchable) and the page body from this list, in order.
 */
export const SECTIONS: SectionEntry[] = [
    // ── Componentes ──────────────────────────────────────────────────────────
    {
        id: "buttons",
        label: "Buttons",
        keywords: "button icon loading",
        group: "Componentes",
        Component: ButtonsSection,
    },
    {
        id: "layout",
        label: "Layout (AppShell · Page · Container)",
        keywords: "appshell page container center spacer divider safearea show hide layout",
        group: "Componentes",
        Component: LayoutSection,
    },
    {
        id: "nav-extra",
        label: "Navbar · Sidebar · Bottom nav",
        keywords: "navbar sidebar bottomnavigation navigationmenu segmentedcontrol",
        group: "Componentes",
        Component: NavExtraSection,
    },
    {
        id: "inputs-extra",
        label: "Inputs avançados (Date · Pin · Slider)",
        keywords:
            "datepicker daterangepicker calendar passwordinput pininput slider multiselect stepperinput label errortext kbd dropzone",
        group: "Componentes",
        Component: InputsExtraSection,
    },
    {
        id: "feedback-extra",
        label: "Alert · Timeline · BottomSheet",
        keywords: "alert timeline toggle togglegroup bottomsheet modalsprovider usemodals",
        group: "Componentes",
        Component: FeedbackExtraSection,
    },
    {
        id: "headless",
        label: "Headless & render-props",
        keywords: "portal clickoutside conditionalwrapper for visuallyhidden resizable",
        group: "Componentes",
        Component: HeadlessSection,
    },
    {
        id: "form-fields",
        label: "Form fields",
        keywords: "input select textarea searchbar",
        group: "Componentes",
        Component: FormFieldsSection,
    },
    {
        id: "form-primitives",
        label: "Checkbox · Radio · Switch",
        keywords: "checkbox radio switch toggle",
        group: "Componentes",
        Component: FormPrimitivesSection,
    },
    {
        id: "inputs-advanced",
        label: "Toggle · Rating · Range · Combobox",
        keywords: "toggle ratingstars rangeslider combobox chipinput",
        group: "Componentes",
        Component: InputsAdvancedSection,
    },
    {
        id: "feedback",
        label: "Badges · Cards · Skeleton",
        keywords: "badge card skeleton spinner",
        group: "Componentes",
        Component: FeedbackSection,
    },
    {
        id: "data-display",
        label: "Stat · Tag · Money · Banner",
        keywords:
            "stat tag money banner relativetime datalist descriptionlist copybutton truncatetext",
        group: "Componentes",
        Component: DataDisplaySection,
    },
    {
        id: "display-media",
        label: "Avatar · Image · Carousel",
        keywords: "avatar image aspectratio carousel",
        group: "Componentes",
        Component: DisplayMediaSection,
    },
    {
        id: "modal",
        label: "Modal & Toast",
        keywords: "modal confirmdialog toast usetoast",
        group: "Componentes",
        Component: ModalSection,
    },
    {
        id: "overlays",
        label: "Popover · Dropdown · HoverCard",
        keywords: "popover dropdownmenu hovercard contextmenu menubar command",
        group: "Componentes",
        Component: OverlaysSection,
    },
    {
        id: "disclosure",
        label: "Accordion · Collapsible · Scroll",
        keywords: "accordion collapsible scrollarea",
        group: "Componentes",
        Component: DisclosureSection,
    },
    {
        id: "navigation",
        label: "AppBar · Tabs · Tooltip · Drawer",
        keywords: "appbar breadcrumbs drawer tabs tooltip",
        group: "Componentes",
        Component: NavigationSection,
    },
    {
        id: "advanced",
        label: "Stepper · Progress · VirtualList",
        keywords: "stepper progress chipinput fileupload virtuallist grid stack",
        group: "Componentes",
        Component: AdvancedComponentsSection,
    },
    {
        id: "hierarchy-flow",
        label: "TreeView · Wizard",
        keywords: "treeview tree hierarquia permissoes wizard stepper multi-step fluxo etapas",
        group: "Componentes",
        Component: HierarchyFlowSection,
    },
    {
        id: "capture-media",
        label: "SignaturePad · Lightbox · AvatarGroup",
        keywords: "signaturepad assinatura canvas lightbox galeria foto avatargroup participantes",
        group: "Componentes",
        Component: CaptureMediaSection,
    },
    {
        id: "image-cropper",
        label: "ImageCropper (recorte)",
        keywords:
            "imagecropper crop recorte avatar foto perfil documento aspect zoom pan canvas fileupload",
        group: "Componentes",
        Component: ImageCropperSection,
    },
    {
        id: "table",
        label: "Table & Pagination",
        keywords: "table pagination emptystate errorstate",
        group: "Componentes",
        Component: TableSection,
    },
    {
        id: "data-table",
        label: "DataTable",
        keywords: "datatable sort",
        group: "Componentes",
        Component: DataTableSection,
    },
    {
        id: "virtual-table",
        label: "VirtualTable (40k linhas)",
        keywords:
            "virtualtable virtual tabela grande 10k 40k linhas virtualizacao scroll sticky header aria-rowcount aria-rowindex ordenar",
        group: "Componentes",
        Component: VirtualTableSection,
    },
    {
        id: "scheduler",
        label: "Scheduler (agenda)",
        keywords:
            "scheduler agenda calendario evento hora grade semana dia sobreposicao overlap allday dia-inteiro",
        group: "Componentes",
        Component: SchedulerSection,
    },
    {
        id: "sparkline",
        label: "Sparkline (mini-gráfico inline)",
        keywords:
            "sparkline mini grafico inline tendencia serie linha area barra tabela kpi sem eixo svg",
        group: "Componentes",
        Component: SparklineSection,
    },
    {
        id: "qrcode",
        label: "QRCode",
        keywords:
            "qrcode qr code pix boleto link convite svg encoder reed-solomon nivel correcao L M Q H",
        group: "Componentes",
        Component: QRCodeSection,
    },
    {
        id: "chat",
        label: "Chat",
        keywords:
            "chat thread conversa mensagem comentario comments bolha bubble typing digitando composer enviar retry falhou",
        group: "Componentes",
        Component: ChatSection,
    },
    {
        id: "dashboard-layout",
        label: "Dashboard (CSS)",
        keywords:
            "dashboard layout grid widget container query stat tile pagina css utilities span coluna",
        group: "Componentes",
        Component: DashboardLayoutSection,
    },
    {
        id: "filterbar",
        label: "FilterBar",
        keywords:
            "filterbar filtro filtros query builder chip condicao operador url searchparams lista",
        group: "Componentes",
        Component: FilterBarSection,
    },
    {
        id: "markdown",
        label: "Markdown",
        keywords:
            "markdown md render comentario texto rico tabela lista citacao xss sanitize seguro allowlist",
        group: "Componentes",
        Component: MarkdownSection,
    },
    {
        id: "masonry",
        label: "Masonry",
        keywords: "masonry mosaico colunas altura desigual cards pinterest grid coluna curta",
        group: "Componentes",
        Component: MasonrySection,
    },
    {
        id: "tour",
        label: "Tour",
        keywords: "tour coachmark onboarding passo a passo spotlight destaque guia walkthrough",
        group: "Componentes",
        Component: TourSection,
    },
    {
        id: "transfer",
        label: "Transfer",
        keywords:
            "transfer dual list duas listas mover permissao papel selecionar subconjunto busca acento",
        group: "Componentes",
        Component: TransferSection,
    },
    {
        id: "codeblock",
        label: "CodeBlock",
        keywords:
            "codeblock code bloco codigo sintaxe highlight realce linguagem ts bash sql json copiar linha numero",
        group: "Componentes",
        Component: CodeBlockSection,
    },
    {
        id: "material",
        label: "Material (ListTile · FAB · Rail)",
        keywords: "floatingactionbutton listtile navigationrail timepicker refreshindicator",
        group: "Componentes",
        Component: MaterialSection,
    },
    // ── Formulários (Componentes) ────────────────────────────────────────────
    {
        id: "forms",
        label: "Forms (zod)",
        keywords: "form usezodform zod validation",
        group: "Componentes",
        Component: FormsSection,
    },
    {
        id: "br-forms",
        label: "BR Forms (CPF/CNPJ/CEP)",
        keywords: "cpfinput cnpjinput cepinput moneyinput phoneinput useviacep",
        group: "Componentes",
        Component: BRFormsSection,
    },
    // ── Hooks ────────────────────────────────────────────────────────────────
    {
        id: "hooks-state",
        label: "Hooks — estado",
        keywords:
            "usetoggle usecounter uselocalstorage usedisclosure useliststate usemap useset usequeue useprevious useasync useisfirstrender",
        group: "Hooks",
        Component: HooksStateSection,
    },
    {
        id: "hooks-dom",
        label: "Hooks — DOM & timing",
        keywords:
            "usemediaquery usebreakpoint usewindowsize usehover useeventlistener useinterval usetimeout usethrottle usescrolllock useresizeobserver usedocumentvisibility usedocumenttitle usefavicon uselongpress usegeolocation usestablecallback usedeepmemo useclickoutside usefocustrap",
        group: "Hooks",
        Component: HooksDomSection,
    },
    {
        id: "meta",
        label: "Network · Clipboard · Share",
        keywords:
            "useonline useclipboard usekeyboardshortcut useidle useintersectionobserver share",
        group: "Hooks",
        Component: MetaSection,
    },
    {
        id: "utils",
        label: "Formatters",
        keywords: "formatcurrency formatdate formatphone formatcpf formatpercent",
        group: "Hooks",
        Component: UtilsSection,
    },
    // ── Receitas ─────────────────────────────────────────────────────────────
    {
        id: "recipe-http",
        label: "HTTP client",
        keywords:
            "createapiclient parseresponse uploadwithprogress retry usepoll idempotency http fetch",
        group: "Receitas",
        Component: HttpRecipeSection,
    },
    {
        id: "recipe-query",
        label: "Data fetching (TanStack Query)",
        keywords:
            "usequery usemutation createquerykeys queryprovider staletime cachetime refetchtime tanstack",
        group: "Receitas",
        Component: QueryRecipeSection,
    },
    {
        id: "recipe-realtime",
        label: "Tempo real (WebSocket)",
        keywords: "usewebsocket createwebsocket reconnect backoff realtime ws socket",
        group: "Receitas",
        Component: RealtimeRecipeSection,
    },
    {
        id: "geo",
        label: "Geolocalização (mapas & trajetória)",
        keywords:
            "geolocation geo trajectory map trajectorymap usepositiontracker createpositiontracker haversinekm pathlengthkm estimatetravel coordinate bearingdeg boundingbox osrm leaflet mercator latitude longitude",
        group: "Receitas",
        Component: GeoSection,
    },
    {
        id: "brazil-map",
        label: "Mapa do Brasil (UF + cidades)",
        keywords:
            "brazilmap mapa brasil estados cidades uf geojson choropleth brazilstatecityselect citiesbyuf ufchoices liststates getstate ibge municipios locations",
        group: "Receitas",
        Component: BrazilMapSection,
    },
    {
        id: "recipe-auth",
        label: "Auth & Access Control",
        keywords:
            "createauthstore authguard decodejwt isjwtexpired rbac can permission role access",
        group: "Receitas",
        Component: AuthAccessRecipeSection,
    },
    {
        id: "integrations",
        label: "SSE · Push · Audio",
        keywords: "useeventstream sse push audio playaudio",
        group: "Receitas",
        Component: IntegrationsSection,
    },
    {
        id: "notification-center",
        label: "NotificationCenter (inbox)",
        keywords:
            "notificationcenter notification inbox push notificacao lida nao-lida usenotificationinbox service worker postmessage",
        group: "Receitas",
        Component: NotificationCenterSection,
    },
    {
        id: "pwa",
        label: "PWA: Install · Push",
        keywords: "usebeforeinstallprompt installbutton installbanner usepushsubscription",
        group: "Receitas",
        Component: PWASection,
    },
    // ── Fundação ─────────────────────────────────────────────────────────────
    {
        id: "foundation",
        label: "Store (Zustand)",
        keywords: "createstore createselectors zustand",
        group: "Fundação",
        Component: FoundationSection,
    },
    {
        id: "dataviz-scales",
        label: "Escalas contínuas (heatmap)",
        keywords:
            "sequentialscale divergingscale scalesteps heatmap choropleth magnitude polaridade oklch rampa ordinal legenda",
        group: "Fundação",
        Component: DataVizScalesSection,
    },
    {
        id: "theme-factory",
        label: "createTheme · presets · tokens de gráfico",
        keywords:
            "createtheme applytheme themepresets oklch marca brand paleta contraste chart tokens",
        group: "Fundação",
        Component: ThemeFactorySection,
    },
    {
        id: "icons",
        label: "Ícones por slug (/icons)",
        keywords:
            "icon icons lucide slug dynamicicon nome name shard lazy iconprovider iconnames preloadicons",
        group: "Fundação",
        Component: IconsSection,
    },
    {
        id: "utilities-css",
        label: "utilities.css (camada opt-in)",
        keywords:
            "utilities css layout container stack cluster grid-auto form-grid card scroll-x truncate",
        group: "Fundação",
        Component: UtilitiesCssSection,
    },
    {
        id: "theme-i18n",
        label: "Tema + i18n",
        keywords: "usetheme usei18n themeprovider i18nprovider",
        group: "Fundação",
        Component: ThemeI18nSection,
    },
];
