import { formatCurrency, Sparkline, Table } from "tempest-react-sdk";
import { Example } from "../Example";

interface Product {
    name: string;
    revenue: number;
    series: number[];
}

const PRODUCTS: Product[] = [
    { name: "Plano Pro", revenue: 48_200, series: [12, 18, 15, 24, 22, 31, 29] },
    { name: "Plano Base", revenue: 19_400, series: [22, 19, 20, 17, 14, 13, 11] },
    { name: "Add-on SMS", revenue: 3_120, series: [2, 2, 3, 2, 4, 3, 4] },
    { name: "Suporte", revenue: 9_800, series: [8, 8, 8, 8, 8, 8, 8] },
];

const CEILING = Math.max(...PRODUCTS.flatMap((p) => p.series));

const WAVE = [4, 9, 6, 14, 11, 18, 15, 22, 19, 27, 24, 31];

/**
 * Demo of `Sparkline` — the inline mini-chart with no axis and no legend.
 *
 * The two table columns exist to make the shared-axis trap visible side by
 * side: "Add-on SMS" swings from 2 to 4, and on its own scale that looks
 * identical to "Plano Pro" going from 12 to 31. Only the pinned column tells
 * the truth.
 */
export function SparklineSection() {
    return (
        <>
            <Example
                id="sparkline-variants"
                title="Variantes"
                note="Linha, área e barra sobre a mesma série. SVG puro na entrada raiz — sem recharts."
                code={`import { Sparkline } from "tempest-react-sdk";

<Sparkline data={serie} />
<Sparkline data={serie} variant="area" />
<Sparkline data={serie} variant="bar" />`}
                props={[
                    {
                        name: "data",
                        type: "readonly number[]",
                        description: "A série, em ordem. Valores não-finitos são descartados.",
                    },
                    {
                        name: "variant",
                        type: '"line" | "area" | "bar"',
                        default: '"line"',
                        description: "Qual marca desenhar.",
                    },
                    {
                        name: "width / height",
                        type: "number",
                        default: "88 / 24",
                        description: "Caixa de desenho em px.",
                    },
                    {
                        name: "color",
                        type: "string",
                        default: "var(--tempest-chart-1)",
                        description: "Qualquer cor CSS.",
                    },
                    {
                        name: "showEnd",
                        type: "boolean",
                        default: "true (exceto bar)",
                        description: "Ponto no último valor.",
                    },
                    {
                        name: "min / max",
                        type: "number",
                        default: "extremos da série",
                        description: "Fixa o eixo — é o que torna várias linhas comparáveis.",
                    },
                    {
                        name: "valueFormatter",
                        type: "(value: number) => string",
                        default: "String",
                        description: "Formata valores na descrição acessível.",
                    },
                    {
                        name: "label",
                        type: "string",
                        default: "descrição gerada",
                        description: "Nome acessível.",
                    },
                ]}
            >
                <div style={{ display: "grid", gap: "1rem" }}>
                    {(["line", "area", "bar"] as const).map((variant) => (
                        <div
                            key={variant}
                            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
                        >
                            <code style={{ minWidth: "3.5rem", fontSize: "0.8125rem" }}>
                                {variant}
                            </code>
                            <Sparkline data={WAVE} variant={variant} width={140} height={36} />
                        </div>
                    ))}
                </div>
            </Example>

            <Example
                id="sparkline-table"
                title="Numa coluna de tabela"
                note="Os dois sparklines por linha usam os mesmos dados. Só o da direita compartilha o eixo."
                code={`const teto = Math.max(...produtos.flatMap((p) => p.series));

<Table
  data={produtos}
  rowKey={(p) => p.name}
  columns={[
    { key: "name", header: "Produto" },
    {
      key: "own",
      header: "Escala própria",
      render: (p) => <Sparkline data={p.series} label={\`Tendência de \${p.name}\`} />,
    },
    {
      key: "shared",
      header: "Eixo compartilhado",
      render: (p) => (
        <Sparkline data={p.series} min={0} max={teto} label={\`Tendência de \${p.name}\`} />
      ),
    },
    { key: "revenue", header: "Receita", align: "right",
      render: (p) => formatCurrency(p.revenue) },
  ]}
/>`}
            >
                <Table
                    data={PRODUCTS}
                    rowKey={(product) => product.name}
                    columns={[
                        { key: "name", header: "Produto" },
                        {
                            key: "own",
                            header: "Escala própria",
                            render: (product: Product) => (
                                <Sparkline
                                    data={product.series}
                                    label={`Tendência de ${product.name}`}
                                />
                            ),
                        },
                        {
                            key: "shared",
                            header: "Eixo compartilhado",
                            render: (product: Product) => (
                                <Sparkline
                                    data={product.series}
                                    min={0}
                                    max={CEILING}
                                    label={`Tendência de ${product.name}`}
                                />
                            ),
                        },
                        {
                            key: "revenue",
                            header: "Receita",
                            align: "right" as const,
                            render: (product: Product) => formatCurrency(product.revenue),
                        },
                    ]}
                />
            </Example>

            <Example
                id="sparkline-edges"
                title="Casos de borda e cor"
                note="Série achatada fica centrada, buraco (NaN) não apaga o gráfico, e a cor aceita qualquer token."
                code={`<Sparkline data={[8, 8, 8, 8, 8]} />
<Sparkline data={[4, NaN, 9, 6, NaN, 12]} />
<Sparkline data={[3]} />
<Sparkline data={serie} color="var(--tempest-danger)" />`}
            >
                <div style={{ display: "grid", gap: "1rem" }}>
                    {[
                        { label: "achatada", node: <Sparkline data={[8, 8, 8, 8, 8]} /> },
                        {
                            label: "com buraco",
                            node: <Sparkline data={[4, Number.NaN, 9, 6, Number.NaN, 12]} />,
                        },
                        { label: "1 ponto", node: <Sparkline data={[3]} /> },
                        { label: "vazia", node: <Sparkline data={[]} /> },
                        {
                            label: "cor",
                            node: (
                                <Sparkline
                                    data={WAVE}
                                    variant="area"
                                    color="var(--tempest-danger)"
                                />
                            ),
                        },
                    ].map((row) => (
                        <div
                            key={row.label}
                            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
                        >
                            <code style={{ minWidth: "6rem", fontSize: "0.8125rem" }}>
                                {row.label}
                            </code>
                            {row.node}
                        </div>
                    ))}
                </div>
            </Example>
        </>
    );
}
