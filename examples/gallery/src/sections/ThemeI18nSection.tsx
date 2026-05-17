import { useI18n, useTheme } from "tempest-react-sdk";

export function ThemeI18nSection() {
    const theme = useTheme();
    const i18n = useI18n();

    return (
        <section className="gallery-section" id="theme-i18n">
            <h3>Tema + i18n</h3>
            <p className="description">
                Troca light/dark/system atualiza <code>data-tempest-theme</code> e todas as
                variáveis CSS. i18n persistido em localStorage; <code>html[lang]</code> sincronizado.
            </p>

            <div className="gallery-row">
                <div>
                    <div style={{ fontSize: 12, color: "var(--tempest-text-muted)", marginBottom: 6 }}>
                        Tema
                    </div>
                    <div className="theme-toggle-group">
                        {(["light", "dark", "system"] as const).map((mode) => (
                            <button
                                key={mode}
                                className={theme.theme === mode ? "active" : ""}
                                onClick={() => theme.setTheme(mode)}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--tempest-text-muted)", marginTop: 8 }}>
                        Aplicado: <strong>{theme.resolvedTheme}</strong>
                    </p>
                </div>

                <div>
                    <div style={{ fontSize: 12, color: "var(--tempest-text-muted)", marginBottom: 6 }}>
                        Idioma
                    </div>
                    <div className="theme-toggle-group">
                        {i18n.availableLocales.map((locale) => (
                            <button
                                key={locale}
                                className={i18n.locale === locale ? "active" : ""}
                                onClick={() => i18n.setLocale(locale)}
                            >
                                {locale}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <p>
                <strong>{i18n.t("gallery.greet", { name: "Tempest" })}</strong>
            </p>
            <p>{i18n.plural("gallery.notifications", 1)}</p>
            <p>{i18n.plural("gallery.notifications", 5)}</p>
            <p>
                Número: <code>{i18n.formatNumber(1234.56, { style: "currency", currency: "BRL" })}</code>
            </p>
            <p>
                Data: <code>{i18n.formatDate(new Date(), { dateStyle: "full" })}</code>
            </p>
        </section>
    );
}
