import { useState, type CSSProperties } from "react";
import { Button, Input, SearchBar, Stat } from "tempest-react-sdk";
import { Example } from "../Example";

const ROWS = [
    { id: 1, name: "Ana Lima", email: "ana@example.com", role: "Admin" },
    {
        id: 2,
        name: "João Pedro Silva Nogueira de Almeida",
        email: "joao@example.com",
        role: "Editor",
    },
    { id: 3, name: "Bruna Castro", email: "bruna@example.com", role: "Leitor" },
];

/**
 * Demo of the opt-in layer. Every block here is plain markup plus one or two
 * `tempest-*` classes — no CSS written in the gallery — which is the point being
 * demonstrated: the layer is what an app would otherwise hand-roll.
 */
export function UtilitiesCssSection() {
    const [query, setQuery] = useState("");

    return (
        <section className="gallery-section" id="utilities-css">
            <h3>utilities.css — camada de layout opt-in</h3>
            <p className="description">
                Importada à parte (<code>import "tempest-react-sdk/utilities.css"</code>), ~50
                classes escritas só com tokens. Não é um Tailwind: são as primitivas que todo app
                reescrevia — casca de página, grid responsivo, form de duas colunas, card, região
                que rola.
            </p>

            <Example
                title="Casca de página"
                note="container + page + page-header + cluster: título à esquerda, ações à direita, empilhando no celular."
                code={`<div className="tempest-container tempest-page">
  <header className="tempest-page-header">
    <div>
      <h1 className="tempest-page-title">Usuários</h1>
      <p className="tempest-page-subtitle">142 ativos · 8 convites pendentes</p>
    </div>
    <div className="tempest-cluster">
      <Button variant="secondary">Exportar</Button>
      <Button>Convidar</Button>
    </div>
  </header>
</div>`}
            >
                <div className="tempest-page" style={{ paddingBlock: 0 }}>
                    <header className="tempest-page-header">
                        <div>
                            <h1 className="tempest-page-title">Usuários</h1>
                            <p className="tempest-page-subtitle">
                                142 ativos · 8 convites pendentes
                            </p>
                        </div>
                        <div className="tempest-cluster">
                            <Button variant="secondary">Exportar</Button>
                            <Button>Convidar</Button>
                        </div>
                    </header>
                </div>
            </Example>

            <Example
                title="Toolbar: fill + fixed"
                note="tempest-fill leva min-width: 0, que é o que faz truncar funcionar dentro de flex; tempest-fixed impede o botão de encolher."
                code={`<div className="tempest-toolbar">
  <SearchBar wrapperClassName="tempest-fill" value={query} onChange={setQuery} />
  <Button className="tempest-fixed">Filtrar</Button>
</div>`}
            >
                <div className="tempest-toolbar">
                    <SearchBar
                        wrapperClassName="tempest-fill"
                        value={query}
                        onChange={setQuery}
                        placeholder="Buscar por nome ou e-mail"
                    />
                    <Button className="tempest-fixed" variant="secondary">
                        Filtrar
                    </Button>
                </div>
            </Example>

            <Example
                title="Grid responsivo sem media query"
                note="auto-fill + minmax(min(--tempest-grid-min, 100%), 1fr) — as colunas se ajustam ao espaço, não a um breakpoint. Ajuste por instância via custom property."
                code={`<div
  className="tempest-grid-auto"
  style={{ "--tempest-grid-min": "200px" } as React.CSSProperties}
>
  <Stat label="Ativos" value={142} />
  <Stat label="Convidados" value={8} />
  <Stat label="Bloqueados" value={3} />
</div>`}
            >
                <div
                    className="tempest-grid-auto"
                    style={{ "--tempest-grid-min": "200px" } as CSSProperties}
                >
                    <Stat label="Ativos" value={142} />
                    <Stat label="Convidados" value={8} />
                    <Stat label="Bloqueados" value={3} />
                    <Stat label="Convites expirados" value={12} />
                </div>
            </Example>

            <Example
                title="Form de duas colunas + form-span"
                note="Uma coluna no celular, duas a partir de 640px. tempest-form-span ocupa a linha inteira."
                code={`<div className="tempest-form-grid">
  <Input label="Nome" name="nome" />
  <Input label="E-mail" name="email" />
  <div className="tempest-form-span">
    <Input label="Observações" name="obs" />
  </div>
</div>`}
            >
                <div className="tempest-form-grid">
                    <Input label="Nome" name="u-nome" />
                    <Input label="E-mail" name="u-email" type="email" />
                    <Input label="CPF" name="u-cpf" />
                    <Input label="Telefone" name="u-tel" />
                    <div className="tempest-form-span">
                        <Input label="Observações" name="u-obs" />
                    </div>
                </div>
            </Example>

            <Example
                title="card + scroll-x + truncate + numeric"
                note="Sem scroll-x, uma tabela larga faz a PÁGINA rolar de lado — o defeito de layout mais comum em mobile. tempest-numeric usa tabular-nums para a coluna não dançar."
                code={`<div className="tempest-card tempest-scroll-x">
  <table>…</table>
</div>`}
            >
                <div className="tempest-card tempest-scroll-x">
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: "left" }}>Nome</th>
                                <th style={{ textAlign: "left" }}>E-mail</th>
                                <th style={{ textAlign: "right" }}>ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ROWS.map((row) => (
                                <tr key={row.id}>
                                    <td style={{ maxWidth: 160 }}>
                                        <div className="tempest-truncate">{row.name}</div>
                                    </td>
                                    <td className="tempest-text-muted">{row.email}</td>
                                    <td className="tempest-numeric" style={{ textAlign: "right" }}>
                                        {row.id * 1000}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Example>

            <Example
                title="Sidebar + conteúdo"
                note="Uma coluna abaixo de 768px, duas acima. A largura da sidebar é uma custom property."
                code={`<div
  className="tempest-sidebar-layout"
  style={{ "--tempest-sidebar-width": "180px" } as React.CSSProperties}
>
  <nav className="tempest-panel">…</nav>
  <div className="tempest-card">…</div>
</div>`}
            >
                <div
                    className="tempest-sidebar-layout"
                    style={{ "--tempest-sidebar-width": "180px" } as CSSProperties}
                >
                    <nav className="tempest-panel tempest-stack">
                        <a href="#utilities-css">Visão geral</a>
                        <a href="#utilities-css">Membros</a>
                        <a href="#utilities-css">Faturamento</a>
                    </nav>
                    <div className="tempest-card">
                        <p style={{ margin: 0 }}>
                            Conteúdo. Reduza a janela abaixo de 768px e as duas colunas viram uma.
                        </p>
                    </div>
                </div>
            </Example>
        </section>
    );
}
