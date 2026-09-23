import { useState } from "react";
import {
    Badge,
    Button,
    FilterPanel,
    Input,
    Select,
    useDraftFilters,
    usePaginatedQuery,
} from "tempest-react-sdk";
import { Example } from "../Example";

interface LogRow {
    id: number;
    code: string;
    level: string;
    city: string;
}

interface LogFilter {
    code: string;
    level: string;
    city: string;
}

const EMPTY: LogFilter = { code: "", level: "all", city: "" };

const CODES = ["AUTH_EXPIRED", "AUTH_DENIED", "DB_TIMEOUT", "UPLOAD_TOO_BIG", "RATE_LIMIT"];
const LEVELS = ["error", "warn", "info"];
const CITIES = ["Teresina", "Recife", "Fortaleza", "Brasília"];

const LOGS: LogRow[] = Array.from({ length: 95 }, (_, i) => ({
    id: i + 1,
    code: CODES[i % CODES.length] ?? "",
    level: LEVELS[i % LEVELS.length] ?? "",
    city: CITIES[i % CITIES.length] ?? "",
}));

/**
 * The fake server: filters and pages the rows the way an API would.
 *
 * @param filter - The applied filter.
 * @param page - 1-based page.
 * @param size - Page size.
 * @returns The page envelope.
 */
function listLogs(filter: LogFilter, page: number, size: number) {
    const code = filter.code.trim().toLowerCase();
    const rows = LOGS.filter(
        (row) =>
            (!code || row.code.toLowerCase().includes(code)) &&
            (filter.level === "all" || row.level === filter.level) &&
            (!filter.city || row.city === filter.city),
    );
    const start = (page - 1) * size;
    return {
        items: rows.slice(start, start + size),
        total: rows.length,
        page,
        size,
        pages: Math.ceil(rows.length / size),
    };
}

/**
 * Demo of `FilterPanel` + `useDraftFilters` over `usePaginatedQuery`.
 *
 * The request counter is the point: typing in the fields sends nothing, one click
 * (or Enter) sends one request, and applying from page 7 lands on page 1.
 */
export function FilterPanelExample() {
    const [requests, setRequests] = useState<number>(0);
    const filters = useDraftFilters(EMPTY);
    const logs = usePaginatedQuery<LogRow>({
        queryKey: ["gallery-logs", filters.applied],
        pageSize: 5,
        queryFn: (params) => {
            setRequests((count) => count + 1);
            return listLogs(filters.applied, params.page ?? 1, 5);
        },
    });

    return (
        <Example
            id="filterpanel-draft"
            title="Conjunto fixo de filtros, aplicado no clique"
            note="Digite à vontade: nada é pedido. **Filtrar** (ou Enter) aplica o rascunho e volta para a página 1; **Limpar filtros** zera rascunho e aplicado juntos. Clicar num código aplica só ele, no mesmo gesto."
            code={`const filters = useDraftFilters({ code: "", level: "all", city: "" });
const logs = usePaginatedQuery({
  queryKey: ["logs", filters.applied],
  queryFn: (params) => api.listLogs({ ...params, ...filters.applied }),
});

<FilterPanel
  onApply={() => filters.apply()}
  onClear={filters.clear}
  applyDisabled={!filters.isDirty}
>
  <Input label="Código" value={filters.draft.code}
    onChange={(e) => filters.set({ code: e.target.value })} />
  <Select label="Nível" … />
</FilterPanel>`}
            props={[
                { name: "children", type: "ReactNode", description: "Os campos. Uma célula cada." },
                {
                    name: "onApply",
                    type: "() => void",
                    description: "Vira <form>: botão Filtrar e Enter.",
                },
                {
                    name: "onClear",
                    type: "() => void",
                    description: "Mostra Limpar filtros só quando presente.",
                },
                { name: "applyDisabled", type: "boolean", description: "Passe !filters.isDirty." },
                {
                    name: "actions",
                    type: "ReactNode",
                    description: "Ações que não são campo — exportar, atualizar.",
                },
                {
                    name: "minFieldWidth",
                    type: "string",
                    default: '"12rem"',
                    description: "Piso do campo; a grade segue a largura do painel.",
                },
                {
                    name: "columns",
                    type: "ResponsiveValue<number | string>",
                    description: "Colunas fixas por viewport, como no Grid.",
                },
            ]}
        >
            <div style={{ display: "grid", gap: "var(--tempest-space-3)" }}>
                <FilterPanel
                    onApply={() => filters.apply()}
                    onClear={filters.clear}
                    applyDisabled={!filters.isDirty}
                    actions={
                        <Button type="button" variant="secondary" size="sm">
                            Exportar CSV
                        </Button>
                    }
                >
                    <Input
                        label="Código"
                        placeholder="AUTH"
                        value={filters.draft.code}
                        onChange={(event) => filters.set({ code: event.target.value })}
                    />
                    <Select
                        label="Nível"
                        value={filters.draft.level}
                        onChange={(event) => filters.set({ level: event.target.value })}
                        options={[
                            { value: "all", label: "Todos" },
                            ...LEVELS.map((level) => ({ value: level, label: level })),
                        ]}
                    />
                    <Select
                        label="Município"
                        value={filters.draft.city}
                        onChange={(event) => filters.set({ city: event.target.value })}
                        options={[
                            { value: "", label: "Todos" },
                            ...CITIES.map((city) => ({ value: city, label: city })),
                        ]}
                    />
                </FilterPanel>

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--tempest-space-2)",
                        alignItems: "center",
                    }}
                >
                    <Badge variant="neutral">{requests} requisições</Badge>
                    <Badge variant={filters.isDirty ? "warning" : "success"}>
                        {filters.isDirty ? "rascunho não aplicado" : "aplicado"}
                    </Badge>
                    <span>
                        Página {logs.pageNumber} de {logs.pageCount} · {logs.total} registros
                    </span>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={logs.prev}
                        disabled={!logs.hasPrev}
                    >
                        Anterior
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={logs.next}
                        disabled={!logs.hasNext}
                    >
                        Próxima
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => logs.setPage(7)}>
                        Ir para a página 7
                    </Button>
                </div>

                <ul style={{ margin: 0, paddingLeft: "var(--tempest-space-5)" }}>
                    {logs.items.map((row) => (
                        <li key={row.id}>
                            #{row.id} ·{" "}
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                onClick={() => filters.apply({ code: row.code })}
                            >
                                {row.code}
                            </Button>{" "}
                            · {row.level} · {row.city}
                        </li>
                    ))}
                </ul>
            </div>
        </Example>
    );
}
