import { BarList, Card } from "tempest-react-sdk";
import { Example } from "../Example";

const PLANOS = [
    { label: "Free", value: 1284 },
    { label: "Pro", value: 412 },
    { label: "Team", value: 168 },
    { label: "Enterprise", value: 47 },
    { label: "Legacy", value: 21 },
    { label: "Trial", value: 12 },
    { label: "Parceiro", value: 5 },
];

const ERROS = [
    { label: "POST /pedidos", value: 38, color: "var(--tempest-danger)" },
    { label: "GET /relatorios", value: 21, color: "var(--tempest-warning)" },
    { label: "POST /login", value: 9 },
];

const VAZIO = [
    { label: "Concluídas", value: 0 },
    { label: "Em andamento", value: 0 },
];

/**
 * Demo of `BarList` — the ranked distribution block.
 *
 * The empty example is the one worth looking at: a panel on its first day has a
 * zero total, and the naive `(part / total) * 100` renders `NaN%` there.
 */
export function BarListSection() {
    return (
        <>
            <Example
                id="bar-list-basic"
                title="Distribuição ranqueada"
                note="Ordena decrescente por padrão. A maior barra preenche a trilha; o percentual é a fatia do total — dois números diferentes de propósito."
                code={`import { BarList } from "tempest-react-sdk";

<BarList
  items={[
    { label: "Free", value: 1284 },
    { label: "Pro", value: 412 },
    { label: "Team", value: 168 },
  ]}
  valueFormatter={(n) => n.toLocaleString("pt-BR")}
  showPercentage
/>`}
                props={[
                    {
                        name: "items",
                        type: "BarListItem[]",
                        description: "{ label, value, color? }. Valor não-finito é descartado.",
                    },
                    {
                        name: "showPercentage",
                        type: "boolean",
                        default: "false",
                        description: "Fatia do total ao lado do valor.",
                    },
                    {
                        name: "sort",
                        type: '"desc" | "asc" | "none"',
                        default: '"desc"',
                        description: '"none" respeita a ordem que você passou.',
                    },
                    {
                        name: "max / otherLabel",
                        type: "number / string",
                        description:
                            "Top-N, com o resto agregado numa linha só quando otherLabel é dado.",
                    },
                ]}
            >
                <Card style={{ maxWidth: "26rem" }}>
                    <BarList
                        items={PLANOS.slice(0, 4)}
                        valueFormatter={(n) => n.toLocaleString("pt-BR")}
                        showPercentage
                    />
                </Card>
            </Example>

            <Example
                id="bar-list-top-n"
                title="Top-N com “Outros”"
                note="max corta a cauda; otherLabel soma o que sobrou numa linha. Sobrando uma linha só, ela aparece com o próprio nome — colapsar uma linha em “Outros” esconderia o nome dela à toa."
                code={`<BarList items={planos} max={4} otherLabel="Outros" showPercentage />`}
            >
                <Card style={{ maxWidth: "26rem" }}>
                    <BarList items={PLANOS} max={4} otherLabel="Outros" showPercentage />
                </Card>
            </Example>

            <Example
                id="bar-list-formatter"
                title="Formatação e cor por item"
                note="valueFormatter manda no número. color sobrescreve o token de série daquela linha — use quando a cor já significa algo na sua UI (erro, sucesso)."
                code={`<BarList
  items={[
    { label: "POST /pedidos", value: 38, color: "var(--tempest-danger)" },
    { label: "GET /relatorios", value: 21, color: "var(--tempest-warning)" },
    { label: "POST /login", value: 9 },
  ]}
  valueFormatter={(n) => \`\${n} erros\`}
  sort="none"
  showPercentage
/>`}
            >
                <Card style={{ maxWidth: "26rem" }}>
                    <BarList
                        items={ERROS}
                        valueFormatter={(n) => `${n} erros`}
                        sort="none"
                        showPercentage
                    />
                </Card>
            </Example>

            <Example
                id="bar-list-empty"
                title="Total zero — 0%, não NaN%"
                note="Painel no primeiro dia tem soma zero. O percentual passa por percentOf, então sai 0% em vez do NaN% que a divisão crua produziria."
                code={`<BarList items={[{ label: "Concluídas", value: 0 }]} showPercentage />`}
            >
                <Card style={{ maxWidth: "26rem" }}>
                    <BarList items={VAZIO} showPercentage />
                </Card>
            </Example>
        </>
    );
}
