import { Badge, Sparkline, Table } from "tempest-react-sdk";
import { Example } from "../Example";

const VENDAS = [12, 18, 15, 22, 19, 27, 31, 28, 35, 33, 41, 38];
const FALHAS = [4, 3, 5, 2, 6, 3, 2, 1, 2, 4, 3, 2];

const PEDIDOS = [
    { id: "8421", cliente: "Ana Souza", total: "R$ 1.240,00", status: "Pago" },
    { id: "8422", cliente: "Bruno Lima", total: "R$ 380,00", status: "Enviado" },
    { id: "8423", cliente: "Cida Alves", total: "R$ 2.115,00", status: "Rascunho" },
];

/** One stat tile, from the utility layer. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="tempest-widget-frame">
            <span className="tempest-text-muted tempest-text-xs">{label}</span>
            <strong className="tempest-text-2xl tempest-numeric">{value}</strong>
            {hint && <span className="tempest-text-subtle tempest-text-xs">{hint}</span>}
        </div>
    );
}

/**
 * Demo of the dashboard layer in `utilities.css`.
 *
 * No component is involved: it is the opt-in CSS layer plus plain elements, which is
 * the point — a page layout should not need a component to own it.
 */
export function DashboardLayoutSection() {
    return (
        <Example
            id="dashboard-layout"
            title="Página de dashboard (só CSS)"
            note="Nenhum componente novo: é o `utilities.css` opt-in. As colunas reagem à largura do **contêiner** (`@container`), então esta mesma marcação funciona full-bleed, dentro de um sidebar layout ou num drawer. Redimensione a janela."
            code={`import "tempest-react-sdk/utilities.css";

<div className="tempest-page">
  <header className="tempest-page-header">
    <div>
      <h1 className="tempest-page-title">Operação</h1>
      <p className="tempest-page-subtitle">Últimos 30 dias</p>
    </div>
  </header>

  <div className="tempest-stat-row">
    <div className="tempest-widget-frame">…</div>
  </div>

  <div className="tempest-dashboard">
    <section className="tempest-widget tempest-widget-two-thirds">
      <div className="tempest-widget-frame">
        <div className="tempest-widget-header">
          <h2 className="tempest-widget-title">Vendas por dia</h2>
        </div>
        <div className="tempest-widget-body">…</div>
      </div>
    </section>
    <section className="tempest-widget tempest-widget-third">…</section>
    <section className="tempest-widget tempest-widget-half">…</section>
    <section className="tempest-widget tempest-widget-half">…</section>
  </div>
</div>`}
            props={[
                {
                    name: ".tempest-dashboard",
                    type: "grid de 12 colunas",
                    description: "Vira container de tamanho (`container-type: inline-size`).",
                },
                {
                    name: ".tempest-widget",
                    type: "span 1 / -1",
                    description:
                        "Largura total por default; os spans abaixo abrem conforme o contêiner.",
                },
                {
                    name: "-half · -third · -quarter · -two-thirds",
                    type: "span por container query",
                    description: "Abrem em 40rem e 64rem de **contêiner**, não de viewport.",
                },
                {
                    name: ".tempest-widget-tall",
                    type: "grid-row: span 2",
                    description: "Gráfico ao lado de uma pilha de tiles.",
                },
                {
                    name: ".tempest-stat-row",
                    type: "auto-fit",
                    description: "Fileira de tiles sem span nenhum. `--tempest-stat-min` ajusta.",
                },
                {
                    name: ".tempest-widget-frame / -header / -title / -body",
                    type: "moldura",
                    description: "`-body` tem `min-height: 0` pra um gráfico caber na linha.",
                },
            ]}
        >
            <div className="tempest-page" style={{ paddingBlock: 0 }}>
                <header className="tempest-page-header">
                    <div>
                        <h1 className="tempest-page-title">Operação</h1>
                        <p className="tempest-page-subtitle">Últimos 30 dias</p>
                    </div>
                    <Badge variant="success">no ar</Badge>
                </header>

                <div className="tempest-stat-row">
                    <Tile label="Pedidos" value="1.284" hint="+12% vs. período anterior" />
                    <Tile label="Ticket médio" value="R$ 412" hint="+3%" />
                    <Tile label="Falhas de envio" value="24" hint="-8%" />
                    <Tile label="Estoque crítico" value="7" hint="3 SKUs sem reposição" />
                </div>

                <div className="tempest-dashboard">
                    <section className="tempest-widget tempest-widget-two-thirds">
                        <div className="tempest-widget-frame">
                            <div className="tempest-widget-header">
                                <h2 className="tempest-widget-title">Vendas por dia</h2>
                                <span className="tempest-text-subtle tempest-text-xs">12 dias</span>
                            </div>
                            <div className="tempest-widget-body">
                                <Sparkline
                                    data={VENDAS}
                                    width={320}
                                    height={72}
                                    label="Vendas por dia"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="tempest-widget tempest-widget-third">
                        <div className="tempest-widget-frame">
                            <div className="tempest-widget-header">
                                <h2 className="tempest-widget-title">Falhas</h2>
                            </div>
                            <div className="tempest-widget-body">
                                <Sparkline
                                    data={FALHAS}
                                    width={160}
                                    height={72}
                                    variant="bar"
                                    label="Falhas por dia"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="tempest-widget tempest-widget-half">
                        <div className="tempest-widget-frame">
                            <div className="tempest-widget-header">
                                <h2 className="tempest-widget-title">Últimos pedidos</h2>
                            </div>
                            <div className="tempest-widget-body">
                                <Table
                                    columns={[
                                        { key: "id", header: "#" },
                                        { key: "cliente", header: "Cliente" },
                                        { key: "total", header: "Total" },
                                        { key: "status", header: "Status" },
                                    ]}
                                    data={PEDIDOS}
                                    rowKey={(row) => row.id}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="tempest-widget tempest-widget-half">
                        <div className="tempest-widget-frame">
                            <div className="tempest-widget-header">
                                <h2 className="tempest-widget-title">Notas da operação</h2>
                            </div>
                            <div className="tempest-widget-body">
                                <p className="tempest-text-sm" style={{ margin: 0 }}>
                                    A janela de manutenção do banco é domingo, 02:00–04:00. O time
                                    de dados foi avisado e o deploy fica travado no sábado.
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </Example>
    );
}
