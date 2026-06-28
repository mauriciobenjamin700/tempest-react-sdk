import { useEffect, useState } from "react";
import { useI18n, useTheme } from "tempest-react-sdk";
import { ButtonsSection } from "./sections/ButtonsSection";
import { FormFieldsSection } from "./sections/FormFieldsSection";
import { FormPrimitivesSection } from "./sections/FormPrimitivesSection";
import { InputsAdvancedSection } from "./sections/InputsAdvancedSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { DataDisplaySection } from "./sections/DataDisplaySection";
import { DisplayMediaSection } from "./sections/DisplayMediaSection";
import { ModalSection } from "./sections/ModalSection";
import { OverlaysSection } from "./sections/OverlaysSection";
import { DisclosureSection } from "./sections/DisclosureSection";
import { NavigationSection } from "./sections/NavigationSection";
import { AdvancedComponentsSection } from "./sections/AdvancedComponentsSection";
import { TableSection } from "./sections/TableSection";
import { DataTableSection } from "./sections/DataTableSection";
import { MaterialSection } from "./sections/MaterialSection";
import { FormsSection } from "./sections/FormsSection";
import { BRFormsSection } from "./sections/BRFormsSection";
import { FoundationSection } from "./sections/FoundationSection";
import { ThemeI18nSection } from "./sections/ThemeI18nSection";
import { MetaSection } from "./sections/MetaSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { PWASection } from "./sections/PWASection";
import { UtilsSection } from "./sections/UtilsSection";

const SECTIONS: { id: string; label: string }[] = [
    { id: "buttons", label: "Buttons" },
    { id: "form-fields", label: "Form fields" },
    { id: "form-primitives", label: "Checkbox · Radio · Switch" },
    { id: "inputs-advanced", label: "Toggle · Rating · Range · Combobox" },
    { id: "feedback", label: "Badges · Cards · Skeleton" },
    { id: "data-display", label: "Stat · Tag · Money · Banner" },
    { id: "display-media", label: "Avatar · Image · Carousel" },
    { id: "modal", label: "Modal & Toast" },
    { id: "overlays", label: "Popover · Dropdown · HoverCard" },
    { id: "disclosure", label: "Accordion · Collapsible · Scroll" },
    { id: "navigation", label: "Tabs · Tooltip · Drawer" },
    { id: "advanced", label: "Stepper · Progress · VirtualList" },
    { id: "table", label: "Table & Pagination" },
    { id: "data-table", label: "DataTable" },
    { id: "material", label: "Material (ListTile · FAB · Rail)" },
    { id: "forms", label: "Forms (zod)" },
    { id: "br-forms", label: "BR Forms (CPF/CNPJ/CEP)" },
    { id: "foundation", label: "Store (Zustand)" },
    { id: "theme-i18n", label: "Tema + i18n" },
    { id: "meta", label: "Network · Clipboard · Share" },
    { id: "integrations", label: "SSE · Push · Audio" },
    { id: "pwa", label: "PWA: Install · Push" },
    { id: "utils", label: "Utils" },
];

export function App() {
    const i18n = useI18n();
    const theme = useTheme();
    const [active, setActive] = useState<string>("buttons");

    useEffect(() => {
        const handler = (): void => {
            const fromTop = window.scrollY + 120;
            let current = SECTIONS[0]?.id ?? "buttons";
            for (const section of SECTIONS) {
                const el = document.getElementById(section.id);
                if (el && el.offsetTop <= fromTop) current = section.id;
            }
            setActive(current);
        };
        window.addEventListener("scroll", handler, { passive: true });
        handler();
        return () => window.removeEventListener("scroll", handler);
    }, []);

    return (
        <div className="gallery-shell">
            <aside className="gallery-sidebar">
                <h1>tempest-react-sdk</h1>
                <p>{i18n.t("gallery.subtitle")}</p>
                <nav className="gallery-nav">
                    {SECTIONS.map((section) => (
                        <a
                            key={section.id}
                            href={`#${section.id}`}
                            className={active === section.id ? "active" : ""}
                        >
                            {section.label}
                        </a>
                    ))}
                </nav>
            </aside>
            <main className="gallery-main">
                <header className="gallery-header">
                    <div>
                        <h2>{i18n.t("gallery.title")}</h2>
                        <span className="meta">
                            tema: {theme.resolvedTheme} · idioma: {i18n.locale}
                        </span>
                    </div>
                </header>
                <ButtonsSection />
                <FormFieldsSection />
                <FormPrimitivesSection />
                <InputsAdvancedSection />
                <FeedbackSection />
                <DataDisplaySection />
                <DisplayMediaSection />
                <ModalSection />
                <OverlaysSection />
                <DisclosureSection />
                <NavigationSection />
                <AdvancedComponentsSection />
                <TableSection />
                <DataTableSection />
                <MaterialSection />
                <FormsSection />
                <BRFormsSection />
                <FoundationSection />
                <ThemeI18nSection />
                <MetaSection />
                <IntegrationsSection />
                <PWASection />
                <UtilsSection />
            </main>
        </div>
    );
}
