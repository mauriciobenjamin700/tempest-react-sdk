import { useEffect, useState } from "react";
import {
    DataTable,
    Money,
    useAnnounce,
    type DataTableColumn,
    type DataTableSort,
} from "tempest-react-sdk";
import { Example } from "../Example";

type Row = { id: number; name: string; role: string; salary: number };

const rows: Row[] = [
    { id: 1, name: "Ana Lima", role: "Designer", salary: 850000 },
    { id: 2, name: "João Pedro", role: "Backend", salary: 920000 },
    { id: 3, name: "Marina Costa", role: "Produto", salary: 1010000 },
    { id: 4, name: "Carlos Souza", role: "Frontend", salary: 880000 },
    { id: 5, name: "Beatriz Rocha", role: "Data", salary: 940000 },
    { id: 6, name: "Diego Alves", role: "DevOps", salary: 990000 },
    { id: 7, name: "Fernanda Dias", role: "QA", salary: 760000 },
    { id: 8, name: "Rafael Melo", role: "Backend", salary: 970000 },
];

const columns = [
    { key: "name" as const, header: "Nome", sortable: true },
    { key: "role" as const, header: "Cargo", sortable: true },
    {
        key: "salary" as const,
        header: "Salário",
        align: "right" as const,
        sortable: true,
        render: (row: Row) => <Money cents={row.salary} />,
    },
];

/** Columns whose Nome and Salário cells can be edited in place. */
const editableColumns: DataTableColumn<Row>[] = [
    {
        key: "name",
        header: "Nome",
        editable: true,
        validate: (value) => (String(value).trim().length < 3 ? "Mínimo de 3 letras." : null),
    },
    { key: "role", header: "Cargo" },
    {
        key: "salary",
        header: "Salário",
        align: "right",
        editable: true,
        editorType: "number",
        render: (row) => <Money cents={row.salary} />,
        validate: (value) => (Number(value) <= 0 ? "Precisa ser positivo." : null),
    },
];

/** Rows the fake backend owns, so a page can be sliced out of them. */
const serverRows: Row[] = Array.from({ length: 23 }, (_, index) => ({
    id: index + 1,
    name: `Pessoa ${String(index + 1).padStart(2, "0")}`,
    role: ["Backend", "Frontend", "Data", "Produto"][index % 4] ?? "Backend",
    salary: 700000 + index * 13000,
}));

/**
 * A paginated endpoint, faked with a delay.
 *
 * Sorting and searching happen here, over the whole collection — which is the
 * entire point of the server mode: the browser only ever sees one page, so it
 * cannot answer either question itself.
 */
async function fetchPage(params: {
    page: number;
    pageSize: number;
    sort: DataTableSort<Row> | null;
    term: string;
}): Promise<{ items: Row[]; total: number }> {
    await new Promise((resolve) => setTimeout(resolve, 450));

    const term = params.term.trim().toLowerCase();
    let rowsForQuery = term
        ? serverRows.filter((row) => `${row.name} ${row.role}`.toLowerCase().includes(term))
        : serverRows;

    if (params.sort) {
        const { key, direction } = params.sort;
        const factor = direction === "asc" ? 1 : -1;
        rowsForQuery = [...rowsForQuery].sort((a, b) =>
            a[key] > b[key] ? factor : a[key] < b[key] ? -factor : 0,
        );
    }

    const start = (params.page - 1) * params.pageSize;
    return {
        items: rowsForQuery.slice(start, start + params.pageSize),
        total: rowsForQuery.length,
    };
}

export function DataTableSection() {
    const [editable, setEditable] = useState<Row[]>(rows.slice(0, 4));
    const announce = useAnnounce();

    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<DataTableSort<Row> | null>(null);
    const [term, setTerm] = useState("");
    const [pageData, setPageData] = useState<{ items: Row[]; total: number }>({
        items: [],
        total: 0,
    });
    const [loading, setLoading] = useState(true);

    /**
     * Refetch whenever the query changes, ignoring a response that lost the race.
     *
     * `usePaginatedQuery` does this for a real app; the gallery consumes no
     * backend, so the state is wired by hand to keep the example self-contained.
     */
    useEffect(() => {
        let current = true;
        setLoading(true);
        fetchPage({ page, pageSize: 5, sort, term }).then((result) => {
            if (!current) return;
            setPageData(result);
            setLoading(false);
        });
        return () => {
            current = false;
        };
    }, [page, sort, term]);

    /**
     * Fake backend: slow, and it refuses the literal name "erro".
     *
     * Rejecting on a value you can type on purpose is the only way to actually see the
     * rollback plus the error state in a browser.
     */
    async function save({ row, key, value }: { row: Row; key: keyof Row; value: unknown }) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (key === "name" && String(value).toLowerCase() === "erro") {
            throw new Error("O servidor recusou: nome reservado.");
        }
        setEditable((current) =>
            current.map((item) => (item.id === row.id ? { ...item, [key]: value } : item)),
        );
    }

    return (
        <section className="gallery-section" id="data-table">
            <h3>DataTable</h3>
            <p className="description">
                Tabela genérica e tipada com busca, ordenação por coluna, paginação e renderização
                customizada de células.
            </p>

            <Example
                title="DataTable com busca e paginação"
                note="Colunas ordenáveis, busca por nome/cargo e 5 linhas por página. A coluna de salário usa render com <Money />."
                code={`type Row = { id: number; name: string; role: string; salary: number };

<DataTable
  data={rows}
  columns={[
    { key: "name", header: "Nome", sortable: true },
    { key: "role", header: "Cargo", sortable: true },
    {
      key: "salary",
      header: "Salário",
      align: "right",
      sortable: true,
      render: (row) => <Money cents={row.salary} />,
    },
  ]}
  searchable
  searchKeys={["name", "role"]}
  pageSize={5}
/>`}
            >
                <DataTable<Row>
                    data={rows}
                    columns={columns}
                    searchable
                    searchKeys={["name", "role"]}
                    pageSize={5}
                />
            </Example>

            <Example
                id="data-table-server"
                title="Paginação no servidor — página, ordenação e busca controladas"
                note="A tabela recebe só a página atual. totalItems manda no número de páginas, e clicar num cabeçalho ou digitar na busca reporta pra fora em vez de mexer nas linhas que já estão na tela — ordenar a página seria ordenar cinco linhas alegando ter ordenado 23. Entre páginas as linhas antigas ficam esmaecidas; no primeiro carregamento aparecem placeholders."
                code={`const { data, isFetching } = usePaginatedQuery({
  queryKey: ["pessoas", page, sort, term],
  queryFn: () => api.get(\`/pessoas?\${filtersToQueryParams(filtros)}\`),
});

<DataTable
  data={data?.items ?? []}
  columns={columns}
  rowKey={(row) => row.id}
  pageSize={5}
  totalItems={data?.total ?? 0}
  page={page}
  onPageChange={setPage}
  onSortChange={setSort}
  searchable
  onSearchChange={setTerm}
  loading={isFetching}
/>`}
                props={[
                    {
                        name: "totalItems",
                        type: "number",
                        description:
                            "Liga o modo servidor. Conta as páginas por esse número, não por data.length.",
                    },
                    {
                        name: "page / onPageChange",
                        type: "number / (page: number) => void",
                        description: "Página controlada. Obrigatória no modo servidor.",
                    },
                    {
                        name: "onSortChange",
                        type: "(sort: DataTableSort<T> | null) => void",
                        description:
                            "Cabeçalho reporta asc → desc → null. As linhas não são reordenadas.",
                    },
                    {
                        name: "onSearchChange",
                        type: "(term: string) => void",
                        description: "Busca delegada. Debounce, se quiser, é seu.",
                    },
                    {
                        name: "loading",
                        type: "boolean",
                        default: "false",
                        description:
                            "Com linhas na tela, esmaece e marca aria-busy; sem linhas, desenha placeholders.",
                    },
                ]}
            >
                <DataTable<Row>
                    data={pageData.items}
                    columns={columns}
                    rowKey={(row) => row.id}
                    pageSize={5}
                    totalItems={pageData.total}
                    page={page}
                    onPageChange={setPage}
                    onSortChange={(next) => {
                        setSort(next);
                        setPage(1);
                    }}
                    searchable
                    onSearchChange={(next) => {
                        setTerm(next);
                        setPage(1);
                    }}
                    loading={loading}
                    emptyMessage="Nada encontrado para essa busca."
                />
            </Example>

            <Example
                id="data-table-inline-edit"
                title="Edição inline — otimista, com rollback visível"
                note='Clique numa célula de Nome ou Salário. Enter confirma, Escape descarta, Tab anda pra próxima editável. Salvar "erro" no nome faz o backend de mentira recusar: a célula volta ao valor antigo E mostra o motivo — reverter em silêncio é pior do que não ser otimista.'
                code={`const columns: DataTableColumn<Row>[] = [
  {
    key: "name",
    header: "Nome",
    editable: true,
    validate: (value) => (String(value).trim().length < 3 ? "Mínimo de 3 letras." : null),
  },
  {
    key: "salary",
    header: "Salário",
    align: "right",
    editable: true,
    editorType: "number",
    render: (row) => <Money cents={row.salary} />,
  },
];

<DataTable
  data={rows}
  columns={columns}
  rowKey={(row) => row.id}
  onCellChange={({ row, key, value }) => api.patch(\`/pessoas/\${row.id}\`, { body: { [key]: value } })}
/>`}
                props={[
                    {
                        name: "editable",
                        type: "boolean",
                        description: "Na coluna. Sem onCellChange na tabela, segue read-only.",
                    },
                    {
                        name: "onCellChange",
                        type: "(change) => void | Promise<void>",
                        description:
                            "Rejeitar faz rollback + erro na célula (role=alert amarrado por aria-describedby).",
                    },
                    {
                        name: "validate",
                        type: "(value, row) => string | null",
                        description: "Bloqueia o commit e mantém o editor aberto com aria-invalid.",
                    },
                    {
                        name: "editorType",
                        type: '"text" | "number" | "date" | "email" | "tel" | "url"',
                        default: '"text"',
                        description: "type do input; number já converte com Number().",
                    },
                ]}
            >
                <div className="gallery-stack" style={{ maxWidth: "none" }}>
                    <DataTable<Row>
                        data={editable}
                        columns={editableColumns}
                        rowKey={(row) => row.id}
                        onCellChange={save}
                        pageSize={4}
                    />
                    <button type="button" onClick={() => announce("Anúncio de teste")}>
                        Disparar useAnnounce()
                    </button>
                    <p>
                        Ligue o leitor de tela: o save bem-sucedido é anunciado por{" "}
                        <code>useAnnounce</code>, porque é o único evento aqui sem representação na
                        tela.
                    </p>
                </div>
            </Example>

            <Example
                title="Estado vazio"
                note="Sem dados, a tabela mostra a mensagem de empty."
                code={`<DataTable
  data={[]}
  columns={columns}
  emptyMessage="Nenhum colaborador cadastrado."
/>`}
            >
                <DataTable<Row>
                    data={[]}
                    columns={columns}
                    emptyMessage="Nenhum colaborador cadastrado."
                />
            </Example>
        </section>
    );
}
