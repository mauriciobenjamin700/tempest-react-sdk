import { useMemo, useState } from "react";
import { Badge, Button, Input, Money, VirtualTable } from "tempest-react-sdk";
import { Example } from "../Example";

interface Order {
    id: number;
    customer: string;
    city: string;
    status: "pago" | "pendente" | "cancelado";
    total: number;
    date: string;
}

const CITIES = ["São Paulo", "Belo Horizonte", "Recife", "Curitiba", "Manaus", "Salvador"];
const STATUS: Order["status"][] = ["pago", "pendente", "cancelado"];

/**
 * Build a deterministic dataset — no `Math.random`, so a reload shows the same
 * rows and a visual diff means something changed in the component.
 */
function buildOrders(count: number): Order[] {
    return Array.from({ length: count }, (_, i) => ({
        id: 100_000 + i,
        customer: `Cliente ${String(count - i).padStart(6, "0")}`,
        city: CITIES[i % CITIES.length],
        status: STATUS[i % STATUS.length],
        total: ((i * 7919) % 90_000) + 1000,
        date: `${String((i % 28) + 1).padStart(2, "0")}/0${(i % 9) + 1}/2026`,
    }));
}

const TONE: Record<Order["status"], "success" | "warning" | "danger"> = {
    pago: "success",
    pendente: "warning",
    cancelado: "danger",
};

const COLUMNS = [
    { key: "id" as const, header: "Pedido", width: 110, sortable: true },
    { key: "customer" as const, header: "Cliente", width: 200, sortable: true },
    { key: "city" as const, header: "Cidade", width: 160, sortable: true },
    {
        key: "status" as const,
        header: "Status",
        width: 130,
        sortable: true,
        render: (row: Order) => <Badge variant={TONE[row.status]}>{row.status}</Badge>,
    },
    {
        key: "total" as const,
        header: "Total",
        width: 130,
        align: "right" as const,
        sortable: true,
        render: (row: Order) => <Money cents={row.total} />,
    },
    { key: "date" as const, header: "Data", width: 120, sortable: true },
];

/**
 * Demo of `VirtualTable` at a size where `Table` and `DataTable` stop being an
 * answer: 40 000 rows in one scrollable grid, with a sticky sortable header.
 */
export function VirtualTableSection() {
    const orders = useMemo(() => buildOrders(40_000), []);
    const [jump, setJump] = useState("");
    const [scrollToIndex, setScrollToIndex] = useState<number | undefined>(undefined);
    const [selected, setSelected] = useState<Order | null>(null);

    return (
        <section className="gallery-section" id="virtual-table">
            <h3>VirtualTable — 40 000 linhas numa grade</h3>
            <p className="description">
                O <code>Table</code> renderiza tudo o que recebe e o <code>DataTable</code> pagina
                pra manter esse número pequeno. Aqui só a janela visível está no DOM — e continua
                sendo uma <code>&lt;table&gt;</code> de verdade, com cabeçalho fixo, colunas
                alinhadas pelo browser e <code>aria-rowcount</code>/<code>aria-rowindex</code>
                carregando os índices reais.
            </p>

            <Example
                title="Grade virtualizada com ordenação"
                code={`<VirtualTable
  data={orders}                  // 40 000 linhas
  columns={COLUMNS}
  rowHeight={40}
  height={480}
  rowKey={(row) => row.id}
  caption="Pedidos"
  onRowClick={(row) => setSelected(row)}
/>`}
                note="Clique num cabeçalho pra ordenar (asc → desc → sem ordem). Clique numa linha pra selecionar — Enter e Espaço também funcionam."
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <VirtualTable<Order>
                        data={orders}
                        columns={COLUMNS}
                        rowHeight={40}
                        height={480}
                        rowKey={(row) => row.id}
                        caption="Pedidos"
                        scrollToIndex={scrollToIndex}
                        onRowClick={(row) => setSelected(row)}
                    />
                    <p className="description">
                        {selected
                            ? `Selecionado: pedido ${selected.id} — ${selected.customer}`
                            : "Nenhuma linha selecionada."}
                    </p>
                </div>
            </Example>

            <Example
                title="Pular para uma linha"
                code={`const [scrollToIndex, setScrollToIndex] = useState<number>();

<VirtualTable scrollToIndex={scrollToIndex} … />`}
                note="Numa grade de 40 000 linhas, rolar até a 30 000 na mão não é uma opção."
            >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Input
                        placeholder="índice (0 a 39999)"
                        value={jump}
                        onChange={(e) => setJump(e.target.value)}
                    />
                    <Button
                        onClick={() => {
                            const parsed = Number(jump);
                            if (Number.isFinite(parsed)) setScrollToIndex(parsed);
                        }}
                    >
                        Ir
                    </Button>
                    <Button variant="secondary" onClick={() => setScrollToIndex(0)}>
                        Topo
                    </Button>
                </div>
            </Example>

            <Example
                title="Sem linhas"
                code={`<VirtualTable data={[]} emptyMessage="Nenhum pedido no período" … />`}
                note="Mesmo tratamento de estado vazio do Table."
            >
                <VirtualTable<Order>
                    data={[]}
                    columns={COLUMNS}
                    rowHeight={40}
                    height={160}
                    emptyMessage="Nenhum pedido no período"
                />
            </Example>
        </section>
    );
}
