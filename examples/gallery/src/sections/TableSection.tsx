import { useMemo, useState } from "react";
import {
    Badge,
    EmptyState,
    ErrorState,
    Pagination,
    SearchBar,
    Table,
    useClientFilter,
    useDebounce,
    usePagination,
    type TableColumn,
} from "tempest-react-sdk";
import { Example } from "../Example";

type Order = {
    id: string;
    customer: string;
    total: number;
    status: "paid" | "pending" | "failed";
    created_at: string;
};

const SEED: Order[] = [
    {
        id: "ord_001",
        customer: "Maria Silva",
        total: 129.9,
        status: "paid",
        created_at: "2026-05-14",
    },
    {
        id: "ord_002",
        customer: "João Souza",
        total: 89.0,
        status: "pending",
        created_at: "2026-05-13",
    },
    {
        id: "ord_003",
        customer: "Ana Carolina",
        total: 245.5,
        status: "paid",
        created_at: "2026-05-12",
    },
    {
        id: "ord_004",
        customer: "Pedro Lima",
        total: 32.0,
        status: "failed",
        created_at: "2026-05-11",
    },
    {
        id: "ord_005",
        customer: "Carlos Mendes",
        total: 412.3,
        status: "paid",
        created_at: "2026-05-10",
    },
    {
        id: "ord_006",
        customer: "Beatriz Faria",
        total: 78.0,
        status: "pending",
        created_at: "2026-05-09",
    },
];

export function TableSection() {
    const [search, setSearch] = useState("");
    const debounced = useDebounce(search, 250);
    const pagination = usePagination(1, 4);
    const [mode, setMode] = useState<"data" | "empty" | "error">("data");

    const filtered = useClientFilter<Order>(SEED, debounced, ["id", "customer"]);
    const page = useMemo(() => {
        const start = (pagination.page - 1) * pagination.size;
        return filtered.slice(start, start + pagination.size);
    }, [filtered, pagination.page, pagination.size]);

    const columns: TableColumn<Order>[] = [
        { key: "id", header: "ID", width: 110 },
        { key: "customer", header: "Cliente" },
        {
            key: "total",
            header: "Total",
            align: "right",
            render: (row) => `R$ ${row.total.toFixed(2)}`,
        },
        {
            key: "status",
            header: "Status",
            render: (row) => (
                <Badge
                    variant={
                        row.status === "paid"
                            ? "success"
                            : row.status === "pending"
                              ? "warning"
                              : "danger"
                    }
                >
                    {row.status}
                </Badge>
            ),
        },
        { key: "created_at", header: "Data" },
    ];

    return (
        <section className="gallery-section" id="table">
            <h3>Table + Pagination + EmptyState + ErrorState</h3>
            <p className="description">
                Listagem com busca debounced, paginação client-side, e troca entre estados
                possíveis.
            </p>

            <Example
                title="Tabela com busca, paginação e estados"
                note="Alterne entre data/empty/error nos botões e busque pra ver o filtro debounced."
                code={`const [search, setSearch] = useState("");
const debounced = useDebounce(search, 250);
const pagination = usePagination(1, 4);
const filtered = useClientFilter<Order>(SEED, debounced, ["id", "customer"]);

const columns: TableColumn<Order>[] = [
    { key: "id", header: "ID", width: 110 },
    { key: "customer", header: "Cliente" },
    { key: "total", header: "Total", align: "right", render: (row) => \`R$ \${row.total.toFixed(2)}\` },
    {
        key: "status",
        header: "Status",
        render: (row) => (
            <Badge variant={row.status === "paid" ? "success" : row.status === "pending" ? "warning" : "danger"}>
                {row.status}
            </Badge>
        ),
    },
    { key: "created_at", header: "Data" },
];

<SearchBar value={search} onChange={setSearch} placeholder="Buscar pedidos…" />

{mode === "error" ? (
    <ErrorState description="Não foi possível carregar os pedidos." onRetry={() => setMode("data")} />
) : mode === "empty" || page.length === 0 ? (
    <EmptyState title="Sem pedidos por aqui" description="Crie um pedido pra começar." />
) : (
    <>
        <Table<Order> columns={columns} data={page} rowKey={(row) => row.id} onRowClick={(row) => console.log("row click", row)} />
        <Pagination
            page={pagination.page}
            totalPages={Math.max(1, Math.ceil(filtered.length / pagination.size))}
            onPageChange={pagination.setPage}
            pageSize={pagination.size}
            onPageSizeChange={pagination.setSize}
            totalItems={filtered.length}
        />
    </>
)}`}
            >
                <div className="gallery-toolbar" style={{ marginBottom: 16 }}>
                    <SearchBar value={search} onChange={setSearch} placeholder="Buscar pedidos…" />
                    <div className="theme-toggle-group">
                        {(["data", "empty", "error"] as const).map((m) => (
                            <button
                                key={m}
                                className={mode === m ? "active" : ""}
                                onClick={() => setMode(m)}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {mode === "error" ? (
                    <ErrorState
                        description="Não foi possível carregar os pedidos."
                        onRetry={() => setMode("data")}
                    />
                ) : mode === "empty" || page.length === 0 ? (
                    <EmptyState
                        title="Sem pedidos por aqui"
                        description="Crie um pedido pra começar."
                    />
                ) : (
                    <>
                        <Table<Order>
                            columns={columns}
                            data={page}
                            rowKey={(row) => row.id}
                            onRowClick={(row) => console.log("row click", row)}
                        />
                        <Pagination
                            page={pagination.page}
                            totalPages={Math.max(1, Math.ceil(filtered.length / pagination.size))}
                            onPageChange={pagination.setPage}
                            pageSize={pagination.size}
                            onPageSizeChange={pagination.setSize}
                            totalItems={filtered.length}
                        />
                    </>
                )}
            </Example>
        </section>
    );
}
