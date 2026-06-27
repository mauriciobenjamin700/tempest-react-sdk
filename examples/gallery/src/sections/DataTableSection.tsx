import { DataTable, Money } from "tempest-react-sdk";
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

export function DataTableSection() {
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
