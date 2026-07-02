import { useEffect, useMemo, useState } from "react";
import { useI18n, useTheme } from "tempest-react-sdk";
import { GROUP_ORDER, SECTIONS, type SectionEntry } from "./sections/registry";

type ThemeMode = "light" | "dark" | "system";

function matches(section: SectionEntry, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
        section.label.toLowerCase().includes(q) ||
        section.keywords.toLowerCase().includes(q) ||
        section.id.includes(q)
    );
}

export function App() {
    const i18n = useI18n();
    const theme = useTheme();
    const [active, setActive] = useState<string>(SECTIONS[0]?.id ?? "");
    const [query, setQuery] = useState<string>("");

    const visible = useMemo(() => SECTIONS.filter((s) => matches(s, query)), [query]);

    const grouped = useMemo(
        () =>
            GROUP_ORDER.map((group) => ({
                group,
                items: visible.filter((s) => s.group === group),
            })).filter((g) => g.items.length > 0),
        [visible],
    );

    useEffect(() => {
        const handler = (): void => {
            const fromTop = window.scrollY + 120;
            let current = visible[0]?.id ?? "";
            for (const section of visible) {
                const el = document.getElementById(section.id);
                if (el && el.offsetTop <= fromTop) current = section.id;
            }
            setActive(current);
        };
        window.addEventListener("scroll", handler, { passive: true });
        handler();
        return () => window.removeEventListener("scroll", handler);
    }, [visible]);

    return (
        <div className="gallery-shell">
            <aside className="gallery-sidebar">
                <h1>tempest-react-sdk</h1>
                <p>{i18n.t("gallery.subtitle")}</p>
                <input
                    className="gallery-search"
                    type="search"
                    placeholder="Buscar componente, hook…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Buscar seções"
                />
                <nav className="gallery-nav">
                    {grouped.length === 0 && <p className="gallery-empty">Nada encontrado.</p>}
                    {grouped.map(({ group, items }) => (
                        <div key={group} className="gallery-nav-group">
                            <span className="gallery-nav-group-title">{group}</span>
                            {items.map((section) => (
                                <a
                                    key={section.id}
                                    href={`#${section.id}`}
                                    className={active === section.id ? "active" : ""}
                                >
                                    {section.label}
                                </a>
                            ))}
                        </div>
                    ))}
                </nav>
            </aside>
            <main className="gallery-main">
                <header className="gallery-header">
                    <div>
                        <h2>{i18n.t("gallery.title")}</h2>
                        <span className="meta">
                            {visible.length}/{SECTIONS.length} seções · tema: {theme.resolvedTheme}{" "}
                            · idioma: {i18n.locale}
                        </span>
                    </div>
                    <div className="gallery-controls">
                        <div className="theme-toggle-group" role="group" aria-label="Tema">
                            {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    className={theme.theme === mode ? "active" : ""}
                                    onClick={() => theme.setTheme(mode)}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="lang-toggle"
                            onClick={() => i18n.setLocale(i18n.locale === "pt-BR" ? "en" : "pt-BR")}
                        >
                            {i18n.locale === "pt-BR" ? "EN" : "PT"}
                        </button>
                    </div>
                </header>
                {visible.map(({ id, Component }) => (
                    <Component key={id} />
                ))}
            </main>
        </div>
    );
}
