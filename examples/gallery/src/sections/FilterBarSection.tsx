import { useMemo, useState } from "react";
import {
    Badge,
    FilterBar,
    filtersToSearchParams,
    type Filter,
    type FilterField,
} from "tempest-react-sdk";
import { Example } from "../Example";

const CAMPOS: FilterField[] = [
    { name: "titulo", label: "Título", type: "text", placeholder: "parte do título" },
    { name: "total", label: "Total", type: "number" },
    { name: "criadoEm", label: "Criado em", type: "date" },
    {
        name: "status",
        label: "Status",
        type: "select",
        options: [
            { value: "draft", label: "Rascunho" },
            { value: "sent", label: "Enviado" },
            { value: "paid", label: "Pago" },
            { value: "canceled", label: "Cancelado" },
        ],
    },
    { name: "urgente", label: "Urgente", type: "boolean" },
];

/**
 * Demo of `FilterBar`.
 *
 * The URL line under the bar is the point: a filter set that cannot survive a reload
 * is one people re-enter every time they open a link somebody sent them.
 */
export function FilterBarSection() {
    const [filtros, setFiltros] = useState<Filter[]>([
        { field: "status", operator: "eq", value: "paid" },
    ]);

    const query = useMemo(() => filtersToSearchParams(filtros).toString(), [filtros]);

    return (
        <Example
            id="filterbar-basic"
            title="Filtros de uma lista"
            note="Combinados com **E**, achatados. Cada chip lê em palavras ('Status é Pago'), e o mesmo texto é o nome acessível do botão de remover. Adicione um filtro e veja a query embaixo."
            code={`import { FilterBar, filtersFromSearchParams, filtersToSearchParams } from "tempest-react-sdk";

const [filtros, setFiltros] = useState<Filter[]>(() =>
  filtersFromSearchParams(new URLSearchParams(location.search), CAMPOS),
);

<FilterBar fields={CAMPOS} value={filtros} onChange={setFiltros} />

// e pra buscar:
fetch(\`/api/pedidos?\${filtersToSearchParams(filtros)}\`)`}
            props={[
                {
                    name: "fields",
                    type: "FilterField[]",
                    description: "Campos que podem ser filtrados.",
                },
                { name: "value", type: "Filter[]", description: "Filtros aplicados. Controlado." },
                {
                    name: "onChange",
                    type: "(filters: Filter[]) => void",
                    description: "Próximo conjunto, combinado com E.",
                },
                {
                    name: "actions",
                    type: "ReactNode",
                    description: "Ao lado dos controles — 'salvar visão', contador.",
                },
                {
                    name: "locale",
                    type: '"pt-BR" | "en"',
                    default: '"pt-BR"',
                    description: "Rótulos.",
                },
            ]}
        >
            <div style={{ display: "grid", gap: "var(--tempest-space-3)" }}>
                <FilterBar
                    fields={CAMPOS}
                    value={filtros}
                    onChange={setFiltros}
                    actions={<Badge variant="neutral">{filtros.length} no total</Badge>}
                />

                <code
                    style={{
                        display: "block",
                        padding: "var(--tempest-space-3)",
                        borderRadius: "var(--tempest-radius-md)",
                        backgroundColor: "var(--tempest-surface-2)",
                        fontFamily: "var(--tempest-font-mono)",
                        fontSize: "var(--tempest-text-xs)",
                        overflowWrap: "anywhere",
                    }}
                >
                    /api/pedidos?{query || "(sem filtros)"}
                </code>
            </div>
        </Example>
    );
}
