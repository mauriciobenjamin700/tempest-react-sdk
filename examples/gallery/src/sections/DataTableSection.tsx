import { useState } from "react";
import { DataTable, Money, useAnnounce, type DataTableColumn } from "tempest-react-sdk";
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

export function DataTableSection() {
    const [editable, setEditable] = useState<Row[]>(rows.slice(0, 4));
    const announce = useAnnounce();

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
