import { useMemo, useState } from "react";
import {
    Button,
    DIVERGING_STEP_COUNT,
    divergingScale,
    scaleSteps,
    SEQUENTIAL_STEP_COUNT,
    sequentialScale,
} from "tempest-react-sdk";
import { BarChart, LineChart } from "tempest-react-sdk/charts";
import { Example } from "../Example";

const HOURS = ["08", "10", "12", "14", "16", "18", "20"];
const DAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/**
 * Deterministic occupancy grid, 0–100.
 *
 * A fixed formula rather than `Math.random`: the demo must render the same cells on
 * every reload, so a visual difference means the scale changed.
 */
const GRID = DAYS.map((_, d) =>
    HOURS.map((_, h) => Math.round(((d * 7 + h * 13) % 17) * (100 / 16))),
);

/** Budget variance per region, diverging around the 100 target. */
const VARIANCE = [
    { region: "Sudeste", actual: 128 },
    { region: "Sul", actual: 112 },
    { region: "Centro-Oeste", actual: 101 },
    { region: "Nordeste", actual: 94 },
    { region: "Norte", actual: 81 },
];

/** The legend a continuous scale requires — a ramp labelled at both ends. */
function ScaleLegend({
    kind,
    from,
    to,
    mid,
}: {
    kind: "sequential" | "diverging";
    from: string;
    to: string;
    mid?: string;
}) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span>{from}</span>
            <span style={{ display: "flex" }} aria-hidden>
                {scaleSteps(kind).map((color) => (
                    <span key={color} style={{ background: color, width: 22, height: 12 }} />
                ))}
            </span>
            {mid && <span style={{ opacity: 0.7 }}>({mid})</span>}
            <span>{to}</span>
        </div>
    );
}

/** Monthly revenue in BRL — wide enough to overflow a fixed 60 px axis. */
const REVENUE = [
    { month: "jul", total: 92_400 },
    { month: "ago", total: 118_900 },
    { month: "set", total: 131_200 },
    { month: "out", total: 164_750 },
    { month: "nov", total: 186_430 },
];

/** Appointments per weekday, keyed as the API sends them. */
const WEEK = [
    { day: "seg", done: 34, noShow: 3 },
    { day: "ter", done: 29, noShow: 5 },
    { day: "qua", done: 31, noShow: 2 },
    { day: "qui", done: 27, noShow: 4 },
    { day: "sex", done: 22, noShow: 6 },
];

const BRL_FULL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_AXIS = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
});

/**
 * Demo of the continuous scales.
 *
 * Each example ships the legend and a table view alongside the coloured marks —
 * colour alone is never the only way to read the number.
 */
export function DataVizScalesSection() {
    const [ordinal, setOrdinal] = useState(false);
    const [showTable, setShowTable] = useState(false);

    const heat = useMemo(() => sequentialScale({ min: 0, max: 100, ordinal }), [ordinal]);
    const variance = useMemo(() => divergingScale({ min: 80, max: 130, center: 100 }), []);

    return (
        <section className="gallery-section" id="dataviz-scales">
            <h3>Escalas contínuas — magnitude e polaridade</h3>
            <p className="description">
                As 8 cores de série codificam <strong>identidade</strong>. Um heatmap ou choropleth
                codifica <strong>quanto</strong>, e isso pede <em>um</em> hue escalonado por
                claridade. Os passos são calculados em OKLCH e validados por script — claridade
                monótona, gap mínimo entre passos, hue único.
            </p>

            <Example
                title="sequentialScale — heatmap de ocupação"
                code={`const cor = sequentialScale({ min: 0, max: 100 });

<rect fill={cor(valor)} />`}
                note="Devolve var(--tempest-chart-sequential-N), então o tema escuro vem de graça. Ligue “ordinal” para ver a escala pular os passos que somem na superfície."
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button
                            variant={ordinal ? "primary" : "secondary"}
                            onClick={() => setOrdinal((v) => !v)}
                        >
                            ordinal: {ordinal ? "on" : "off"}
                        </Button>
                        <Button variant="secondary" onClick={() => setShowTable((v) => !v)}>
                            {showTable ? "esconder" : "ver"} tabela
                        </Button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6 }}>
                        <span />
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`,
                                gap: 2,
                                fontSize: 10,
                                color: "var(--tempest-text-muted)",
                            }}
                        >
                            {HOURS.map((h) => (
                                <span key={h} style={{ textAlign: "center" }}>
                                    {h}h
                                </span>
                            ))}
                        </div>

                        {GRID.map((row, d) => (
                            <div key={DAYS[d]} style={{ display: "contents" }}>
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--tempest-text-muted)",
                                        paddingRight: 6,
                                    }}
                                >
                                    {DAYS[d]}
                                </span>
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`,
                                        gap: 2,
                                    }}
                                >
                                    {row.map((value, h) => (
                                        <span
                                            key={HOURS[h]}
                                            title={`${DAYS[d]} ${HOURS[h]}h — ${value}%`}
                                            style={{
                                                background: heat(value),
                                                height: 26,
                                                borderRadius: 3,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <ScaleLegend kind="sequential" from="0%" to="100%" />

                    {showTable && (
                        <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
                            <caption style={{ textAlign: "left", paddingBottom: 4 }}>
                                Ocupação por dia e hora (%)
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col" style={{ textAlign: "left" }}>
                                        dia
                                    </th>
                                    {HOURS.map((h) => (
                                        <th key={h} scope="col">
                                            {h}h
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {GRID.map((row, d) => (
                                    <tr key={DAYS[d]}>
                                        <th scope="row" style={{ textAlign: "left" }}>
                                            {DAYS[d]}
                                        </th>
                                        {row.map((value, h) => (
                                            <td key={HOURS[h]} style={{ textAlign: "right" }}>
                                                {value}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Example>

            <Example
                title="divergingScale — variação contra a meta"
                code={`const desvio = divergingScale({ min: 80, max: 130, center: 100 });

<rect fill={desvio(realizado)} />`}
                note="O centro não precisa ser zero. Cada braço escala pelo próprio alcance, então o lado mais curto (aqui os negativos) não é achatado num passo só."
            >
                <div style={{ display: "grid", gap: 12, maxWidth: 460 }}>
                    {VARIANCE.map(({ region, actual }) => (
                        <div
                            key={region}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "9rem 1fr 3rem",
                                gap: 8,
                            }}
                        >
                            <span style={{ fontSize: 12 }}>{region}</span>
                            <span
                                style={{
                                    background: variance(actual),
                                    height: 20,
                                    borderRadius: 3,
                                }}
                                aria-hidden
                            />
                            <span style={{ fontSize: 12, textAlign: "right" }}>
                                {actual > 100 ? "+" : ""}
                                {actual - 100}%
                            </span>
                        </div>
                    ))}
                    <ScaleLegend kind="diverging" from="−20%" to="+30%" mid="meta" />
                    <p className="description">
                        O valor vai ao lado da barra de propósito: cor sozinha nunca é o único jeito
                        de ler o número.
                    </p>
                </div>
            </Example>

            <Example
                title="Todos os passos"
                code={`scaleSteps("sequential"); // ${SEQUENTIAL_STEP_COUNT} passos
scaleSteps("diverging");  // ${DIVERGING_STEP_COUNT} passos (5 = meio neutro)`}
                note="O meio da divergente é cinza de propósito — um meio colorido lê como uma terceira categoria em vez de “sem desvio”."
            >
                <div style={{ display: "grid", gap: 10 }}>
                    {(["sequential", "diverging"] as const).map((kind) => (
                        <div key={kind} style={{ display: "grid", gap: 4 }}>
                            <code style={{ fontSize: 11 }}>{kind}</code>
                            <div style={{ display: "flex", gap: 2 }}>
                                {scaleSteps(kind).map((color, i) => (
                                    <span
                                        key={color}
                                        title={`${kind}-${i + 1}`}
                                        style={{ background: color, width: 34, height: 30 }}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Example>

            <Example
                title="LineChart · BarChart — rótulos de série e eixo de valor"
                id="ex-chart-labels-axis"
                note='labels traduz a legenda e o tooltip sem remontar os dados; o eixo Y se ajusta ao maior rótulo (yAxisWidth="auto") e yAxisFormatter formata só o eixo.'
                code={`<LineChart
    data={revenue}
    index="month"
    categories={["total"]}
    labels={{ total: "Faturamento" }}
    valueFormatter={(v) => brlFull.format(v)}
    yAxisFormatter={(v) => brlAxis.format(v)}
/>

<BarChart
    data={week}
    index="day"
    categories={["done", "noShow"]}
    labels={{ done: "Realizadas", noShow: "Faltas" }}
    stack
/>`}
            >
                <div className="gallery-grid" style={{ alignItems: "start" }}>
                    <LineChart
                        data={REVENUE}
                        index="month"
                        categories={["total"]}
                        labels={{ total: "Faturamento" }}
                        valueFormatter={(value) => BRL_FULL.format(value)}
                        yAxisFormatter={(value) => BRL_AXIS.format(value)}
                        height={240}
                    />
                    <BarChart
                        data={WEEK}
                        index="day"
                        categories={["done", "noShow"]}
                        labels={{ done: "Realizadas", noShow: "Faltas" }}
                        stack
                        height={240}
                    />
                </div>
            </Example>
        </section>
    );
}
