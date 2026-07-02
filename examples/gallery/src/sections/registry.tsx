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
        id: "theme-i18n",
        label: "Tema + i18n",
        keywords: "usetheme usei18n themeprovider i18nprovider",
        group: "Fundação",
        Component: ThemeI18nSection,
    },
];
