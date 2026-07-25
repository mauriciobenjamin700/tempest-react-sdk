import { useEffect, useState } from "react";
import {
    applyTheme,
    Badge,
    Button,
    Card,
    createTheme,
    Input,
    SegmentedControl,
    themeContrast,
    themePresets,
    type ThemePresetName,
} from "tempest-react-sdk";
import { Example } from "../Example";

const PRESET_NAMES: ThemePresetName[] = ["tempest", "violet", "emerald", "rose", "slate", "amber"];
const CHART_TOKENS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Live brand switching, which is the only honest way to demo a theme factory:
 * every component on this page is repainted by the same token overrides, so a
 * preset that looked fine in isolation shows its problems here.
 */
export function ThemeFactorySection() {
    const [preset, setPreset] = useState<ThemePresetName>("tempest");
    const [radius, setRadius] = useState("md");

    useEffect(() => {
        return applyTheme(
            createTheme({
                ...themePresets[preset],
                radius: radius as "none" | "sm" | "md" | "lg" | "xl" | "full",
            }),
        );
    }, [preset, radius]);

    const contrast = themeContrast(themePresets[preset]);

    return (
        <section className="gallery-section" id="theme-factory">
            <h3>createTheme · presets · tokens de gráfico</h3>
            <p className="description">
                Uma cor de marca gera as escalas de <code>primary</code>/<code>gray</code>, os
                status, a escala de radius, o focus ring e as cores de série — nos dois esquemas,
                com o ramp do dark invertido. Troque o preset e veja a página inteira reagir.
            </p>

            <Example
                title="Trocar a marca ao vivo"
                note="applyTheme é dono de um <style id='tempest-theme'> e reescreve o conteúdo — acionar à vontade não empilha folha morta."
                code={`const [preset, setPreset] = useState<ThemePresetName>("tempest");

useEffect(() => {
  return applyTheme(createTheme(themePresets[preset]));
}, [preset]);`}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <SegmentedControl
                        value={preset}
                        onChange={(value) => setPreset(value as ThemePresetName)}
                        options={PRESET_NAMES.map((name) => ({ value: name, label: name }))}
                    />

                    <SegmentedControl
                        value={radius}
                        onChange={setRadius}
                        options={["none", "sm", "md", "lg", "xl", "full"].map((value) => ({
                            value,
                            label: value,
                        }))}
                    />

                    <div
                        style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
                    >
                        <Button>Ação primária</Button>
                        <Button variant="secondary">Secundária</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Badge appearance="soft">soft</Badge>
                        <Badge appearance="solid">solid</Badge>
                        <Input
                            label="Campo com focus ring"
                            name="theme-demo"
                            placeholder="Foque aqui"
                        />
                    </div>
                </div>
            </Example>

            <Example
                title="Escala gerada (primary 50 → 900)"
                note="Derivada em OKLCH: a matiz da cor de entrada é preservada nos dez degraus, e a croma dela define a intensidade do ramp inteiro."
                code={`const theme = createTheme({ primary: "#7c3aed" });
theme.light["--tempest-primary-500"]; // "#7c3aed"
theme.dark["--tempest-primary-500"];  // ramp invertido`}
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => (
                        <div
                            key={step}
                            title={`--tempest-primary-${step}`}
                            style={{
                                width: 64,
                                height: 48,
                                borderRadius: "var(--tempest-radius-sm)",
                                background: `var(--tempest-primary-${step})`,
                                border: "1px solid var(--tempest-border)",
                                display: "flex",
                                alignItems: "flex-end",
                                justifyContent: "center",
                                fontSize: 10,
                                color: step >= 500 ? "#fff" : "var(--tempest-text)",
                                paddingBottom: 2,
                            }}
                        >
                            {step}
                        </div>
                    ))}
                </div>
            </Example>

            <Example
                title="Contraste é medido, não convencionado"
                note="O texto sobre a marca é escolhido por contraste, e o passo do texto sobre a tinta soft desce no ramp até passar de 4.5:1 (AA)."
                code={`themeContrast({ primary: "#fde047" }); // 15.2 — texto escuro escolhido
themeContrast({ primary: "#003d99" }); //  9.8 — texto branco escolhido`}
            >
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div
                        style={{
                            padding: "12px 16px",
                            borderRadius: "var(--tempest-radius-md)",
                            background: "var(--tempest-primary)",
                            color: "var(--tempest-primary-foreground)",
                        }}
                    >
                        texto sobre a marca
                    </div>
                    <div
                        style={{
                            padding: "12px 16px",
                            borderRadius: "var(--tempest-radius-md)",
                            background: "var(--tempest-primary-soft)",
                            color: "var(--tempest-primary-on-soft)",
                        }}
                    >
                        texto sobre a tinta soft
                    </div>
                    <Badge appearance="soft">
                        contraste da marca: {contrast ? contrast.toFixed(2) : "—"}:1
                    </Badge>
                </div>
            </Example>

            <Example
                title="Tokens de série (--tempest-chart-1..8)"
                note="O módulo /charts lê esses tokens em runtime, então trocar o preset move os gráficos junto. São categóricas, espaçadas por matiz — não um ramp."
                code={`applyTheme(createTheme({
  primary: "#0f766e",
  chart: ["#0f766e", "#f97316", "#9333ea"],
}));`}
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {CHART_TOKENS.map((index) => (
                        <Card
                            key={index}
                            style={{ padding: 8, display: "flex", gap: 8, alignItems: "center" }}
                        >
                            <span
                                style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: "var(--tempest-radius-full)",
                                    background: `var(--tempest-chart-${index})`,
                                }}
                            />
                            <code style={{ fontSize: 11 }}>chart-{index}</code>
                        </Card>
                    ))}
                </div>
            </Example>
        </section>
    );
}
