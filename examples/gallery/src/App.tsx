import { useEffect, useState } from "react";
import { useI18n, useTheme } from "tempest-react-sdk";
import { AdvancedComponentsSection } from "./sections/AdvancedComponentsSection";
import { BRFormsSection } from "./sections/BRFormsSection";
import { ButtonsSection } from "./sections/ButtonsSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { FormFieldsSection } from "./sections/FormFieldsSection";
import { FormPrimitivesSection } from "./sections/FormPrimitivesSection";
import { FormsSection } from "./sections/FormsSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { MetaSection } from "./sections/MetaSection";
import { ModalSection } from "./sections/ModalSection";
import { NavigationSection } from "./sections/NavigationSection";
import { TableSection } from "./sections/TableSection";
import { ThemeI18nSection } from "./sections/ThemeI18nSection";
import { UtilsSection } from "./sections/UtilsSection";

const SECTIONS: { id: string; label: string }[] = [
    { id: "buttons", label: "Buttons" },
    { id: "form-fields", label: "Form fields" },
    { id: "form-primitives", label: "Checkbox · Radio · Switch" },
    { id: "feedback", label: "Badges · Cards · Skeleton" },
    { id: "modal", label: "Modal & Toast" },
    { id: "navigation", label: "Tabs · Tooltip · Drawer" },
    { id: "advanced", label: "Stepper · Progress · VirtualList" },
    { id: "table", label: "Table & Pagination" },
    { id: "forms", label: "Forms (zod)" },
    { id: "br-forms", label: "BR Forms (CPF/CNPJ/CEP)" },
    { id: "theme-i18n", label: "Tema + i18n" },
    { id: "meta", label: "Network · Clipboard · Share" },
    { id: "integrations", label: "SSE · Push · Audio" },
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
                <FeedbackSection />
                <ModalSection />
                <NavigationSection />
                <AdvancedComponentsSection />
                <TableSection />
                <FormsSection />
                <BRFormsSection />
                <ThemeI18nSection />
                <MetaSection />
                <IntegrationsSection />
                <UtilsSection />
            </main>
        </div>
    );
}
