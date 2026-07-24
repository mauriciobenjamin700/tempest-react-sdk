import { useRef, useState, type ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    CACHE_TIME,
    createQueryKeys,
    REFETCH_TIME,
    STALE_TIME,
    emptyOffsetPage,
    usePaginatedQuery,
    type OffsetPage,
    type OffsetParams,
} from "tempest-react-sdk";
import { Badge, Button, Input } from "tempest-react-sdk";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Example } from "../Example";

/**
 * Shape of a row used across the in-memory demos. No backend is involved — every
 * fetcher below resolves from a module-local array after a short `setTimeout`,
 * so the gallery runs fully offline.
 */
interface Task {
    /** Stable identifier. */
    id: string;
    /** Human-readable label. */
    title: string;
}

/** Resolve `value` after `ms`, faking a network round-trip. */
function delay<T>(value: T, ms = 600): Promise<T> {
    return new Promise<T>((resolve) => {
        setTimeout(() => resolve(value), ms);
    });
}

// --- Demo 1 + 2 share an in-memory "tasks" store -------------------------------

let taskStore: Task[] = [
    { id: "1", title: "Wire up QueryProvider" },
    { id: "2", title: "Type the query keys" },
    { id: "3", title: "Calibrate stale times" },
];
let nextTaskId = 4;

/** Mock list fetcher — returns a copy so the cache owns its own array. */
function fetchTasks(): Promise<Task[]> {
    return delay(taskStore.map((task) => ({ ...task })));
}

/** Mock create fetcher — appends to the store and echoes the new row. */
function createTask(title: string): Promise<Task> {
    const created: Task = { id: String(nextTaskId++), title };
    taskStore = [...taskStore, created];
    return delay(created, 400);
}

/**
 * Typed key factory for the `task` domain. Every `useQuery`/`invalidateQueries`
 * below builds its key through this object, so the prefixes never drift.
 */
const taskKeys = createQueryKeys("task", {
    list: () => ["list"] as const,
    byId: (id: string) => [id] as const,
});

/** Demo 1 — `createQueryKeys` driving a `useQuery` with loading + refetch. */
function QueryKeysDemo(): ReactElement {
    const tasks = useQuery({
        queryKey: taskKeys.list(),
        queryFn: fetchTasks,
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <code style={{ fontSize: 13 }}>
                taskKeys.list() = {JSON.stringify(taskKeys.list())}
            </code>
            <code style={{ fontSize: 13 }}>taskKeys.all = {JSON.stringify(taskKeys.all)}</code>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => tasks.refetch()}
                    disabled={tasks.isFetching}
                >
                    <RefreshCw size={16} /> refetch
                </Button>
                {tasks.isFetching && (
                    <Badge variant="info">
                        <Loader2 size={14} /> fetching…
                    </Badge>
                )}
            </div>

            {tasks.isLoading ? (
                <p style={{ color: "var(--tempest-text-muted, #888)" }}>Carregando…</p>
            ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(tasks.data ?? []).map((task) => (
                        <li key={task.id}>{task.title}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** Demo 2 — `useMutation` adds a row, then invalidates the list to refetch. */
function MutationInvalidationDemo(): ReactElement {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");

    const tasks = useQuery({
        queryKey: taskKeys.list(),
        queryFn: fetchTasks,
    });

    const addTask = useMutation({
        mutationFn: (newTitle: string) => createTask(newTitle),
        onSuccess: () => {
            // Mark the list stale → TanStack refetches it in the background.
            queryClient.invalidateQueries({ queryKey: taskKeys.list() });
        },
    });

    function handleAdd(): void {
        const trimmed = title.trim();
        if (!trimmed) return;
        addTask.mutate(trimmed);
        setTitle("");
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Input
                    value={title}
                    placeholder="Nova tarefa…"
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") handleAdd();
                    }}
                />
                <Button size="sm" onClick={handleAdd} disabled={addTask.isPending}>
                    <Plus size={16} /> adicionar
                </Button>
                {addTask.isPending && <Badge variant="info">salvando…</Badge>}
                {tasks.isFetching && !tasks.isLoading && (
                    <Badge variant="neutral">revalidando…</Badge>
                )}
            </div>

            <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(tasks.data ?? []).map((task) => (
                    <li key={task.id}>{task.title}</li>
                ))}
            </ul>
        </div>
    );
}

/** Demo 3 — named time presets wired into a single `useQuery`. */
function TimePresetsDemo(): ReactElement {
    const dashboard = useQuery({
        queryKey: ["dashboard", "status"],
        queryFn: () => delay({ online: 42, checkedAt: new Date().toLocaleTimeString() }),
        staleTime: STALE_TIME.LONG, // 30 min — só refaz fetch via invalidação até expirar
        gcTime: CACHE_TIME.LONG, // 1 h — quanto tempo o cache sobrevive sem observadores
        refetchInterval: REFETCH_TIME.FAST, // 30 s — polling em background
    });

    const rows: Array<{ name: string; ms: number; meaning: string }> = [
        { name: "STALE_TIME.LONG", ms: STALE_TIME.LONG, meaning: "dado fresco por 30 min" },
        { name: "CACHE_TIME.LONG", ms: CACHE_TIME.LONG, meaning: "cache vive 1 h sem uso" },
        { name: "REFETCH_TIME.FAST", ms: REFETCH_TIME.FAST, meaning: "refaz fetch a cada 30 s" },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: "left", padding: "4px 12px 4px 0" }}>Preset</th>
                        <th style={{ textAlign: "right", padding: "4px 12px 4px 0" }}>ms</th>
                        <th style={{ textAlign: "left", padding: "4px 0" }}>Significado</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.name}>
                            <td style={{ padding: "4px 12px 4px 0" }}>
                                <code>{row.name}</code>
                            </td>
                            <td style={{ textAlign: "right", padding: "4px 12px 4px 0" }}>
                                {row.ms}
                            </td>
                            <td style={{ padding: "4px 0" }}>{row.meaning}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Badge variant="success">online: {dashboard.data?.online ?? "—"}</Badge>
                <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                    última leitura: {dashboard.data?.checkedAt ?? "carregando…"}
                </span>
            </div>
        </div>
    );
}

// --- Demo 4 — offset pagination over an in-memory pager ------------------------

/** A larger in-memory dataset paginated by the mock pager below. */
const ALL_CITIES: string[] = [
    "São Paulo",
    "Rio de Janeiro",
    "Belo Horizonte",
    "Salvador",
    "Fortaleza",
    "Curitiba",
    "Recife",
    "Porto Alegre",
    "Manaus",
    "Belém",
    "Goiânia",
    "Campinas",
];

/**
 * Mock offset pager — reads `page` + `size` from {@link OffsetParams} and slices
 * the dataset into the Tempest/fastapi-pagination {@link OffsetPage} envelope.
 */
function fetchCities(params: OffsetParams): Promise<OffsetPage<string>> {
    const page = params.page ?? 1;
    const size = params.size ?? 4;
    if (ALL_CITIES.length === 0) return delay(emptyOffsetPage<string>(size));

    const start = (page - 1) * size;
    const items = ALL_CITIES.slice(start, start + size);
    const envelope: OffsetPage<string> = {
        items,
        total: ALL_CITIES.length,
        page,
        size,
        pages: Math.ceil(ALL_CITIES.length / size),
    };
    return delay(envelope, 500);
}

/** Demo 4 — `usePaginatedQuery` driving the mock offset pager. */
function PaginatedQueryDemo(): ReactElement {
    const cities = usePaginatedQuery<string>({
        queryKey: ["cities"],
        pageSize: 4,
        queryFn: fetchCities,
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Badge variant="info">
                    página {cities.pageNumber} / {cities.pageCount || "—"}
                </Badge>
                <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                    {cities.total} itens no total
                </span>
                {cities.isFetching && <Badge variant="neutral">carregando…</Badge>}
            </div>

            {cities.isLoading ? (
                <p style={{ color: "var(--tempest-text-muted, #888)" }}>Carregando…</p>
            ) : (
                <ul style={{ margin: 0, paddingLeft: 18, minHeight: 96 }}>
                    {cities.items.map((city) => (
                        <li key={city}>{city}</li>
                    ))}
                </ul>
            )}

            <div style={{ display: "flex", gap: 8 }}>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={cities.prev}
                    disabled={!cities.hasPrev || cities.isFetching}
                >
                    ← anterior
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={cities.next}
                    disabled={!cities.hasNext || cities.isFetching}
                >
                    próxima →
                </Button>
            </div>
        </div>
    );
}

const KEYS_CODE = `import { useQuery } from "@tanstack/react-query";
import { createQueryKeys } from "tempest-react-sdk";

// Typed factory — every key is prefixed with the scope ("task").
const taskKeys = createQueryKeys("task", {
    list: () => ["list"] as const,
    byId: (id: string) => [id] as const,
});
taskKeys.all;        // ["task"]            — broadest key for the domain
taskKeys.list();     // ["task", "list"]
taskKeys.byId("42"); // ["task", "42"]

function TaskList() {
    const tasks = useQuery({ queryKey: taskKeys.list(), queryFn: fetchTasks });
    if (tasks.isLoading) return <p>Carregando…</p>;
    return (
        <>
            <button onClick={() => tasks.refetch()} disabled={tasks.isFetching}>
                refetch
            </button>
            <ul>{tasks.data?.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
        </>
    );
}`;

const MUTATION_CODE = `import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function AddTask() {
    const queryClient = useQueryClient();
    const tasks = useQuery({ queryKey: taskKeys.list(), queryFn: fetchTasks });

    const addTask = useMutation({
        mutationFn: (title: string) => createTask(title),
        onSuccess: () => {
            // Same key factory → the invalidated key matches the query's key.
            queryClient.invalidateQueries({ queryKey: taskKeys.list() });
        },
    });

    return (
        <button onClick={() => addTask.mutate("Nova tarefa")} disabled={addTask.isPending}>
            adicionar
        </button>
    );
}`;

const PRESETS_CODE = `import { useQuery } from "@tanstack/react-query";
import { STALE_TIME, CACHE_TIME, REFETCH_TIME } from "tempest-react-sdk";

useQuery({
    queryKey: ["dashboard", "status"],
    queryFn: fetchDashboard,
    staleTime: STALE_TIME.LONG,        // 30 min — fresh window before refetch-on-mount
    gcTime: CACHE_TIME.LONG,           // 1 h   — cache lifetime with no observers
    refetchInterval: REFETCH_TIME.FAST, // 30 s  — background polling
});

// Presets (ms):
// STALE_TIME  → SHORT 30s · DEFAULT 5min · LONG 30min · INFINITE ∞
// CACHE_TIME  → SHORT 5min · DEFAULT 30min · LONG 1h
// REFETCH_TIME → REALTIME 5s · FAST 30s · DEFAULT 60s · SLOW 5min`;

const PAGINATED_CODE = `import { usePaginatedQuery, emptyOffsetPage } from "tempest-react-sdk";
import type { OffsetPage, OffsetParams } from "tempest-react-sdk";

// Mock offset pager → slices a dataset into the fastapi-pagination envelope.
function fetchCities(params: OffsetParams): Promise<OffsetPage<string>> {
    const page = params.page ?? 1;
    const size = params.size ?? 4;
    if (ALL_CITIES.length === 0) return Promise.resolve(emptyOffsetPage<string>(size));
    const start = (page - 1) * size;
    return Promise.resolve({
        items: ALL_CITIES.slice(start, start + size),
        total: ALL_CITIES.length,
        page,
        size,
        pages: Math.ceil(ALL_CITIES.length / size),
    });
}

function CityList() {
    // The hook owns page state and sends { page, size } to queryFn.
    const cities = usePaginatedQuery<string>({
        queryKey: ["cities"],
        pageSize: 4,
        queryFn: fetchCities,
    });
    return (
        <>
            <p>página {cities.pageNumber} / {cities.pageCount}</p>
            <ul>{cities.items.map((c) => <li key={c}>{c}</li>)}</ul>
            <button onClick={cities.prev} disabled={!cities.hasPrev}>← anterior</button>
            <button onClick={cities.next} disabled={!cities.hasNext}>próxima →</button>
        </>
    );
}`;

/**
 * Gallery section demonstrating the SDK's TanStack Query helpers against
 * in-memory mock fetchers (no backend). Covers typed query keys, mutation +
 * invalidation, the time presets, and offset pagination.
 */
export function QueryRecipeSection(): ReactElement {
    // Keep a ref so re-renders don't reset demo identity (no behavioral need,
    // but documents that the store is module-scoped, shared across demos 1 & 2).
    const storeRef = useRef(taskStore);
    void storeRef;

    return (
        <section className="gallery-section" id="recipe-query">
            <h3>Data fetching (TanStack Query)</h3>
            <p className="description">
                Os wrappers de query do SDK calibram tempos de cache e padronizam chaves — você
                continua usando <code>useQuery</code>/<code>useMutation</code> do{" "}
                <code>@tanstack/react-query</code>. Todos os demos abaixo rodam contra fetchers em
                memória (sem rede): nada precisa de backend.
            </p>

            <Example
                id="ex-query-keys"
                title="createQueryKeys + useQuery"
                note="Factory de chaves tipadas alimentando um useQuery; lista + refetch + isFetching."
                code={KEYS_CODE}
                props={[
                    {
                        name: "scope",
                        type: "string",
                        description: "Prefixo do domínio, anteposto a toda chave gerada.",
                    },
                    {
                        name: "entries",
                        type: "Record<string, (...a) => readonly unknown[] | readonly unknown[]>",
                        description: "Mapa de builders/tuplas; vira métodos tipados na saída.",
                    },
                    {
                        name: "→ .all",
                        type: "readonly [scope]",
                        description:
                            "Chave mais ampla, gerada automaticamente (invalidação total).",
                    },
                ]}
            >
                <QueryKeysDemo />
            </Example>

            <Example
                id="ex-query-mutation"
                title="useMutation + invalidação"
                note="Adiciona um item e invalida a lista (useQueryClient) para revalidar no background."
                code={MUTATION_CODE}
            >
                <MutationInvalidationDemo />
            </Example>

            <Example
                id="ex-query-presets"
                title="STALE_TIME / CACHE_TIME / REFETCH_TIME"
                note="Presets nomeados substituem números mágicos em staleTime/gcTime/refetchInterval."
                code={PRESETS_CODE}
            >
                <TimePresetsDemo />
            </Example>

            <Example
                id="ex-query-paginated"
                title="usePaginatedQuery"
                note="Hook controla o número da página e envia { page, size } ao pager offset mockado."
                code={PAGINATED_CODE}
                props={[
                    {
                        name: "queryKey",
                        type: "QueryKey",
                        description: "Chave base; página/sort são anexados para isolar o cache.",
                    },
                    {
                        name: "queryFn",
                        type: "(params: OffsetParams) => Promise<OffsetPage<T>> | OffsetPage<T>",
                        description: "Fetcher que recebe { page, size, ... } e devolve o envelope.",
                    },
                    {
                        name: "initialPage",
                        type: "number",
                        default: "1",
                        description: "Página 1-based inicial.",
                    },
                    {
                        name: "pageSize",
                        type: "number",
                        default: "20",
                        description: "Tamanho da página enviado ao fetcher.",
                    },
                    {
                        name: "sizeParam",
                        type: '"size" | "page_size"',
                        default: '"size"',
                        description: "Nome do query-param de tamanho (convenção do backend).",
                    },
                    {
                        name: "→ result",
                        type: "{ items, pageNumber, pageCount, hasNext, hasPrev, next, prev, … }",
                        description: "Estado e controles de paginação derivados do envelope.",
                    },
                ]}
            >
                <PaginatedQueryDemo />
            </Example>
        </section>
    );
}
