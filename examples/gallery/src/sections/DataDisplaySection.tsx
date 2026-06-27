import { useState } from "react";
import {
    Stat,
    Tag,
    Banner,
    Money,
    RelativeTime,
    TruncateText,
    DataList,
    DescriptionList,
    CopyButton,
} from "tempest-react-sdk";
import { Example } from "../Example";

interface Member {
    id: number;
    name: string;
    role: string;
}

const members: Member[] = [
    { id: 1, name: "Ana Lima", role: "Designer" },
    { id: 2, name: "João Pedro", role: "Backend" },
    { id: 3, name: "Marina Costa", role: "Produto" },
];

const longText =
    "A Tempest React SDK reúne componentes, hooks e integrações reutilizáveis " +
    "consumidos por todos os apps frontend da Tempest, com foco em produtividade " +
    "e consistência visual.";

export function DataDisplaySection() {
    const [showTag, setShowTag] = useState(true);
    const [showBanner, setShowBanner] = useState(true);

    return (
        <section className="gallery-section" id="data-display">
            <h3>Stat · Tag · Banner · Money · listas</h3>
            <p className="description">
                Componentes de apresentação de dados: métricas, etiquetas, avisos, formatação
                monetária e temporal, e listas estruturadas.
            </p>

            <Example
                title="Stat"
                note="Métricas com variação e tendência."
                code={`<div className="gallery-grid">
  <Stat label="Receita" value="R$ 12.345" delta="+12,4%" trend="up" hint="vs. mês anterior" />
  <Stat label="Churn" value="2,1%" delta="-0,3%" trend="down" hint="vs. mês anterior" />
  <Stat label="Usuários ativos" value="8.901" delta="0%" trend="flat" hint="estável" />
</div>`}
            >
                <div className="gallery-grid">
                    <Stat
                        label="Receita"
                        value="R$ 12.345"
                        delta="+12,4%"
                        trend="up"
                        hint="vs. mês anterior"
                    />
                    <Stat
                        label="Churn"
                        value="2,1%"
                        delta="-0,3%"
                        trend="down"
                        hint="vs. mês anterior"
                    />
                    <Stat
                        label="Usuários ativos"
                        value="8.901"
                        delta="0%"
                        trend="flat"
                        hint="estável"
                    />
                </div>
            </Example>

            <Example
                title="Tag"
                note="Variantes e uma etiqueta removível."
                code={`<Tag variant="neutral">neutral</Tag>
<Tag variant="primary">primary</Tag>
<Tag variant="success">success</Tag>
<Tag variant="warning">warning</Tag>
<Tag variant="danger">danger</Tag>
<Tag variant="info">info</Tag>
{showTag && (
  <Tag variant="primary" onRemove={() => setShowTag(false)}>
    removível
  </Tag>
)}`}
            >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Tag variant="neutral">neutral</Tag>
                    <Tag variant="primary">primary</Tag>
                    <Tag variant="success">success</Tag>
                    <Tag variant="warning">warning</Tag>
                    <Tag variant="danger">danger</Tag>
                    <Tag variant="info">info</Tag>
                    {showTag && (
                        <Tag variant="primary" onRemove={() => setShowTag(false)}>
                            removível
                        </Tag>
                    )}
                </div>
            </Example>

            <Example
                title="Banner"
                note="Aviso informativo e um aviso de atenção dispensável."
                code={`<Banner variant="info" title="Atualização disponível">
  Uma nova versão do SDK está pronta para instalar.
</Banner>
{showBanner && (
  <Banner
    variant="warning"
    title="Atenção"
    dismissible
    onDismiss={() => setShowBanner(false)}
  >
    Sua sessão expira em 5 minutos.
  </Banner>
)}`}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Banner variant="info" title="Atualização disponível">
                        Uma nova versão do SDK está pronta para instalar.
                    </Banner>
                    {showBanner && (
                        <Banner
                            variant="warning"
                            title="Atenção"
                            dismissible
                            onDismiss={() => setShowBanner(false)}
                        >
                            Sua sessão expira em 5 minutos.
                        </Banner>
                    )}
                </div>
            </Example>

            <Example
                title="Money · RelativeTime · CopyButton"
                note="Formatação monetária por locale, tempo relativo e cópia para área de transferência."
                code={`<Money cents={1990} />
<Money cents={500} currency="USD" locale="en-US" />
<RelativeTime date={new Date(Date.now() - 3600_000)} />
<CopyButton value="npm i tempest-react-sdk" />`}
            >
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                    <Money cents={1990} />
                    <Money cents={500} currency="USD" locale="en-US" />
                    <RelativeTime date={new Date(Date.now() - 3600_000)} />
                    <CopyButton value="npm i tempest-react-sdk" />
                </div>
            </Example>

            <Example
                title="DataList · DescriptionList · TruncateText"
                note="Listas renderizadas por callback, pares termo/descrição e texto truncado."
                code={`<DataList
  items={members}
  renderItem={(m) => (
    <span>
      {m.name} — <em>{m.role}</em>
    </span>
  )}
  empty="Nenhum membro."
/>

<DescriptionList
  items={[
    { term: "Pacote", description: "tempest-react-sdk" },
    { term: "Licença", description: "MIT" },
    { term: "Runtime", description: "React 18/19" },
  ]}
/>

<div style={{ maxWidth: 280 }}>
  <TruncateText lines={2}>{longText}</TruncateText>
</div>`}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <DataList
                        items={members}
                        renderItem={(m: Member) => (
                            <span>
                                {m.name} — <em>{m.role}</em>
                            </span>
                        )}
                        empty="Nenhum membro."
                    />
                    <DescriptionList
                        items={[
                            { term: "Pacote", description: "tempest-react-sdk" },
                            { term: "Licença", description: "MIT" },
                            { term: "Runtime", description: "React 18/19" },
                        ]}
                    />
                    <div style={{ maxWidth: 280 }}>
                        <TruncateText lines={2}>{longText}</TruncateText>
                    </div>
                </div>
            </Example>
        </section>
    );
}
