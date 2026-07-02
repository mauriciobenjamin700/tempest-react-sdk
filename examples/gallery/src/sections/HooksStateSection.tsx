import { useState, type ReactElement } from "react";
import {
    Badge,
    Button,
    Input,
    Switch,
    useAsync,
    useCounter,
    useDisclosure,
    useIsFirstRender,
    useListState,
    useLocalStorage,
    useMap,
    usePrevious,
    useQueue,
    useSet,
    useToggle,
} from "tempest-react-sdk";
import { Check, Minus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Example } from "../Example";

/** Live demo for {@link useToggle}. */
function ToggleDemo(): ReactElement {
    const [on, { toggle, setTrue, setFalse }] = useToggle(false);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Badge variant={on ? "success" : "neutral"}>{on ? "ON" : "OFF"}</Badge>
            <Button size="sm" onClick={toggle}>
                toggle
            </Button>
            <Button size="sm" variant="ghost" onClick={setTrue}>
                setTrue
            </Button>
            <Button size="sm" variant="ghost" onClick={setFalse}>
                setFalse
            </Button>
        </div>
    );
}

/** Live demo for {@link useCounter}. */
function CounterDemo(): ReactElement {
    const [count, { increment, decrement, reset }] = useCounter(0, { min: 0, max: 10 });
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" onClick={decrement} aria-label="decrement">
                <Minus size={16} />
            </Button>
            <Badge variant="info" style={{ minWidth: 32, justifyContent: "center" }}>
                {count}
            </Badge>
            <Button size="sm" variant="ghost" onClick={increment} aria-label="increment">
                <Plus size={16} />
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
                <RotateCcw size={16} /> reset
            </Button>
            <span style={{ fontSize: 13, color: "var(--tempest-color-text-muted, #888)" }}>
                clamp [0, 10]
            </span>
        </div>
    );
}

/** Live demo for {@link useLocalStorage}. */
function LocalStorageDemo(): ReactElement {
    const [name, setName, remove] = useLocalStorage<string>("gallery:demo-name", "");
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Digite e recarregue a página"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Badge variant="neutral">stored: {name || "(vazio)"}</Badge>
                <Button size="sm" variant="ghost" onClick={remove}>
                    <Trash2 size={16} /> limpar
                </Button>
            </div>
        </div>
    );
}

/** Live demo for {@link useDisclosure}. */
function DisclosureDemo(): ReactElement {
    const [opened, { open, close, toggle }] = useDisclosure(false);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Badge variant={opened ? "success" : "neutral"}>
                    {opened ? "opened" : "closed"}
                </Badge>
                <Button size="sm" onClick={open}>
                    open
                </Button>
                <Button size="sm" variant="ghost" onClick={close}>
                    close
                </Button>
                <Button size="sm" variant="ghost" onClick={toggle}>
                    toggle
                </Button>
            </div>
            {opened && (
                <div
                    style={{
                        padding: 12,
                        borderRadius: 8,
                        background: "var(--tempest-color-surface-2, #f3f3f3)",
                    }}
                >
                    Painel revelado pelo handler <code>open()</code>.
                </div>
            )}
        </div>
    );
}

/** Live demo for {@link useListState}. */
function ListStateDemo(): ReactElement {
    const [list, handlers] = useListState<string>(["Alpha", "Beta"]);
    const [draft, setDraft] = useState<string>("");
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
                <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Novo item"
                />
                <Button
                    size="sm"
                    onClick={() => {
                        if (draft.trim()) {
                            handlers.append(draft.trim());
                            setDraft("");
                        }
                    }}
                >
                    append
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handlers.clear()}>
                    clear
                </Button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {list.length === 0 && (
                    <span style={{ fontSize: 13, color: "var(--tempest-color-text-muted, #888)" }}>
                        (lista vazia)
                    </span>
                )}
                {list.map((item, index) => (
                    <Badge key={`${item}-${index}`} variant="info">
                        {item}
                        <button
                            type="button"
                            onClick={() => handlers.remove(index)}
                            style={{
                                marginLeft: 6,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                lineHeight: 0,
                            }}
                            aria-label={`remover ${item}`}
                        >
                            <X size={12} />
                        </button>
                    </Badge>
                ))}
            </div>
        </div>
    );
}

/** Live demo for {@link useMap}. */
function MapDemo(): ReactElement {
    const flags = useMap<string, boolean>([
        ["dark", false],
        ["beta", true],
    ]);
    const keys = ["dark", "beta", "verbose"];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {keys.map((key) => (
                <Switch
                    key={key}
                    label={`${key} = ${String(flags.get(key) ?? false)}`}
                    checked={flags.get(key) ?? false}
                    onChange={(event) => flags.set(key, event.target.checked)}
                />
            ))}
            <Badge variant="neutral">size: {flags.size}</Badge>
        </div>
    );
}

/** Live demo for {@link useSet}. */
function SetDemo(): ReactElement {
    const tags = useSet<string>(["react"]);
    const all = ["react", "vite", "zustand", "zod"];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {all.map((tag) => {
                    const active = tags.has(tag);
                    return (
                        <Button
                            key={tag}
                            size="sm"
                            variant={active ? "primary" : "ghost"}
                            onClick={() => tags.toggle(tag)}
                        >
                            {active && <Check size={14} />} {tag}
                        </Button>
                    );
                })}
            </div>
            <Badge variant="info">selecionados: {tags.size}</Badge>
        </div>
    );
}

/** Live demo for {@link useQueue}. */
function QueueDemo(): ReactElement {
    const { queue, add, cleanQueue, size } = useQueue<number>({ limit: 3 });
    const [next, setNext] = useState<number>(1);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Button
                    size="sm"
                    onClick={() => {
                        add(next);
                        setNext((value) => value + 1);
                    }}
                >
                    add({next})
                </Button>
                <Button size="sm" variant="ghost" onClick={cleanQueue}>
                    cleanQueue
                </Button>
                <span style={{ fontSize: 13, color: "var(--tempest-color-text-muted, #888)" }}>
                    limit 3 — excedente fica no overflow
                </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {queue.length === 0 && (
                    <span style={{ fontSize: 13, color: "var(--tempest-color-text-muted, #888)" }}>
                        (vazio)
                    </span>
                )}
                {queue.map((value, index) => (
                    <Badge key={`${value}-${index}`} variant="info">
                        {value}
                    </Badge>
                ))}
            </div>
            <Badge variant="neutral">size: {size}</Badge>
        </div>
    );
}

/** Live demo for {@link usePrevious}. */
function PreviousDemo(): ReactElement {
    const [count, setCount] = useState<number>(0);
    const previous = usePrevious(count);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => setCount((value) => value + 1)}>
                <Plus size={16} /> incrementar
            </Button>
            <Badge variant="info">atual: {count}</Badge>
            <Badge variant="neutral">anterior: {previous ?? "—"}</Badge>
        </div>
    );
}

/** Live demo for {@link useAsync}. */
function AsyncDemo(): ReactElement {
    const fetchUser = (): Promise<string> =>
        new Promise<string>((resolve) =>
            setTimeout(() => resolve(`user-${Math.floor(Math.random() * 1000)}`), 900),
        );
    const { data, isPending, isSuccess, status, run } = useAsync<string>(fetchUser);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => void run()} disabled={isPending}>
                {isPending ? "carregando…" : "run()"}
            </Button>
            <Badge
                variant={
                    status === "success" ? "success" : status === "pending" ? "warning" : "neutral"
                }
            >
                status: {status}
            </Badge>
            {isSuccess && <Badge variant="info">data: {data}</Badge>}
        </div>
    );
}

/** Live demo for {@link useIsFirstRender}. */
function IsFirstRenderDemo(): ReactElement {
    const isFirst = useIsFirstRender();
    const [, setTick] = useState<number>(0);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Badge variant={isFirst ? "success" : "neutral"}>
                {isFirst ? "primeira render" : "re-render"}
            </Badge>
            <Button size="sm" onClick={() => setTick((value) => value + 1)}>
                forçar re-render
            </Button>
            <span style={{ fontSize: 13, color: "var(--tempest-color-text-muted, #888)" }}>
                após o primeiro paint sempre retorna <code>false</code>
            </span>
        </div>
    );
}

/**
 * Gallery section showcasing the SDK's state-management hooks, each with an
 * interactive live demo that exercises the hook's real return shape.
 */
export function HooksStateSection(): ReactElement {
    return (
        <section className="gallery-section" id="hooks-state">
            <h3>Hooks — estado</h3>
            <p className="description">
                Primitivos de estado prontos para uso: booleanos, contadores, coleções (lista, map,
                set, fila), persistência em <code>localStorage</code>, valor anterior e estado
                assíncrono. Cada exemplo abaixo é interativo e mostra o estado vivo do hook.
            </p>

            <Example
                title="useToggle"
                id="ex-use-toggle"
                note="Estado booleano com helpers estáveis."
                code={`import { useToggle } from "tempest-react-sdk";

function Demo() {
    const [on, { toggle, setTrue, setFalse }] = useToggle(false);
    return (
        <>
            <span>{on ? "ON" : "OFF"}</span>
            <button onClick={toggle}>toggle</button>
            <button onClick={setTrue}>setTrue</button>
            <button onClick={setFalse}>setFalse</button>
        </>
    );
}`}
                props={[
                    { name: "[0] value", type: "boolean", description: "Valor booleano atual." },
                    {
                        name: "[1].toggle",
                        type: "() => void",
                        description: "Inverte o valor atual.",
                    },
                    {
                        name: "[1].setTrue",
                        type: "() => void",
                        description: "Define como true.",
                    },
                    {
                        name: "[1].setFalse",
                        type: "() => void",
                        description: "Define como false.",
                    },
                    {
                        name: "[1].set",
                        type: "(next: boolean) => void",
                        description: "Define um valor explícito.",
                    },
                ]}
            >
                <ToggleDemo />
            </Example>

            <Example
                title="useCounter"
                id="ex-use-counter"
                note="Contador numérico com clamp opcional [min, max]."
                code={`import { useCounter } from "tempest-react-sdk";

function Demo() {
    const [count, { increment, decrement, reset }] = useCounter(0, {
        min: 0,
        max: 10,
    });
    return (
        <>
            <button onClick={decrement}>-</button>
            <span>{count}</span>
            <button onClick={increment}>+</button>
            <button onClick={reset}>reset</button>
        </>
    );
}`}
                props={[
                    { name: "[0] count", type: "number", description: "Valor atual, já clampado." },
                    {
                        name: "[1].increment",
                        type: "() => void",
                        description: "Soma 1 (respeitando max).",
                    },
                    {
                        name: "[1].decrement",
                        type: "() => void",
                        description: "Subtrai 1 (respeitando min).",
                    },
                    {
                        name: "[1].set",
                        type: "(value: number) => void",
                        description: "Define valor clampado.",
                    },
                    {
                        name: "[1].reset",
                        type: "() => void",
                        description: "Volta ao valor inicial.",
                    },
                ]}
            >
                <CounterDemo />
            </Example>

            <Example
                title="useLocalStorage"
                id="ex-use-local-storage"
                note="Estado sincronizado com localStorage (SSR-safe, multi-aba)."
                code={`import { useLocalStorage } from "tempest-react-sdk";

function Demo() {
    const [name, setName, remove] = useLocalStorage<string>(
        "demo:name",
        "",
    );
    return (
        <>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <span>stored: {name}</span>
            <button onClick={remove}>limpar</button>
        </>
    );
}`}
                props={[
                    {
                        name: "[0] value",
                        type: "T",
                        description: "Valor persistido (default no SSR/primeiro render).",
                    },
                    {
                        name: "[1] setValue",
                        type: "(v: T | (prev: T) => T) => void",
                        description: "Atualiza estado e localStorage.",
                    },
                    {
                        name: "[2] remove",
                        type: "() => void",
                        description: "Remove a chave e volta ao default.",
                    },
                ]}
            >
                <LocalStorageDemo />
            </Example>

            <Example
                title="useDisclosure"
                id="ex-use-disclosure"
                note="Estado open/close com handlers referencialmente estáveis (modais, drawers)."
                code={`import { useDisclosure } from "tempest-react-sdk";

function Demo() {
    const [opened, { open, close, toggle }] = useDisclosure(false);
    return (
        <>
            <span>{opened ? "opened" : "closed"}</span>
            <button onClick={open}>open</button>
            <button onClick={close}>close</button>
            <button onClick={toggle}>toggle</button>
            {opened && <div>Painel</div>}
        </>
    );
}`}
                props={[
                    { name: "[0] opened", type: "boolean", description: "Se está aberto." },
                    { name: "[1].open", type: "() => void", description: "Abre." },
                    { name: "[1].close", type: "() => void", description: "Fecha." },
                    {
                        name: "[1].toggle",
                        type: "() => void",
                        description: "Alterna aberto/fechado.",
                    },
                ]}
            >
                <DisclosureDemo />
            </Example>

            <Example
                title="useListState"
                id="ex-use-list-state"
                note="Array como estado com handlers imutáveis (append, remove, reorder…)."
                code={`import { useListState } from "tempest-react-sdk";
import { useState } from "react";

function Demo() {
    const [list, handlers] = useListState<string>(["Alpha", "Beta"]);
    const [draft, setDraft] = useState("");
    return (
        <>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button onClick={() => { handlers.append(draft); setDraft(""); }}>
                append
            </button>
            <button onClick={() => handlers.clear()}>clear</button>
            {list.map((item, i) => (
                <span key={i}>
                    {item}
                    <button onClick={() => handlers.remove(i)}>x</button>
                </span>
            ))}
        </>
    );
}`}
                props={[
                    { name: "[0] list", type: "T[]", description: "Lista atual." },
                    {
                        name: "[1].append",
                        type: "(...items: T[]) => void",
                        description: "Adiciona ao fim.",
                    },
                    {
                        name: "[1].prepend / insert",
                        type: "(…) => void",
                        description: "Adiciona ao início / em um índice.",
                    },
                    {
                        name: "[1].remove",
                        type: "(...indices: number[]) => void",
                        description: "Remove por índice(s).",
                    },
                    {
                        name: "[1].reorder",
                        type: "({ from, to }) => void",
                        description: "Move um item.",
                    },
                    { name: "[1].clear", type: "() => void", description: "Esvazia a lista." },
                ]}
            >
                <ListStateDemo />
            </Example>

            <Example
                title="useMap"
                id="ex-use-map"
                note="Wrapper reativo de Map — set/delete/clear disparam re-render."
                code={`import { useMap } from "tempest-react-sdk";

function Demo() {
    const flags = useMap<string, boolean>([
        ["dark", false],
        ["beta", true],
    ]);
    return (
        <>
            {["dark", "beta", "verbose"].map((key) => (
                <label key={key}>
                    {key}
                    <input
                        type="checkbox"
                        checked={flags.get(key) ?? false}
                        onChange={(e) => flags.set(key, e.target.checked)}
                    />
                </label>
            ))}
            <span>size: {flags.size}</span>
        </>
    );
}`}
                props={[
                    {
                        name: "map",
                        type: "ReadonlyMap<K, V>",
                        description: "Snapshot imutável atual.",
                    },
                    {
                        name: "set / delete",
                        type: "(k, v?) => void",
                        description: "Define/remove uma entrada.",
                    },
                    {
                        name: "get / has",
                        type: "(k) => V | boolean",
                        description: "Leitura por chave.",
                    },
                    { name: "clear", type: "() => void", description: "Esvazia o map." },
                    { name: "size", type: "number", description: "Quantidade de entradas." },
                ]}
            >
                <MapDemo />
            </Example>

            <Example
                title="useSet"
                id="ex-use-set"
                note="Wrapper reativo de Set — add/delete/toggle/clear disparam re-render."
                code={`import { useSet } from "tempest-react-sdk";

function Demo() {
    const tags = useSet<string>(["react"]);
    return (
        <>
            {["react", "vite", "zustand", "zod"].map((tag) => (
                <button
                    key={tag}
                    onClick={() => tags.toggle(tag)}
                    aria-pressed={tags.has(tag)}
                >
                    {tag}
                </button>
            ))}
            <span>selecionados: {tags.size}</span>
        </>
    );
}`}
                props={[
                    {
                        name: "set",
                        type: "ReadonlySet<T>",
                        description: "Snapshot imutável atual.",
                    },
                    {
                        name: "add / delete",
                        type: "(value: T) => void",
                        description: "Adiciona/remove um valor.",
                    },
                    {
                        name: "toggle",
                        type: "(value: T) => void",
                        description: "Adiciona se ausente, remove se presente.",
                    },
                    {
                        name: "has",
                        type: "(value: T) => boolean",
                        description: "Verifica pertencimento.",
                    },
                    { name: "clear", type: "() => void", description: "Esvazia o set." },
                    { name: "size", type: "number", description: "Quantidade de itens." },
                ]}
            >
                <SetDemo />
            </Example>

            <Example
                title="useQueue"
                id="ex-use-queue"
                note="Fila FIFO com limit — excedente fica em buffer de overflow."
                code={`import { useQueue } from "tempest-react-sdk";
import { useState } from "react";

function Demo() {
    const { queue, add, cleanQueue, size } = useQueue<number>({ limit: 3 });
    const [next, setNext] = useState(1);
    return (
        <>
            <button onClick={() => { add(next); setNext((n) => n + 1); }}>
                add({next})
            </button>
            <button onClick={cleanQueue}>cleanQueue</button>
            {queue.map((v, i) => <span key={i}>{v}</span>)}
            <span>size: {size}</span>
        </>
    );
}`}
                props={[
                    { name: "queue", type: "T[]", description: "Itens visíveis (até o limit)." },
                    {
                        name: "add",
                        type: "(...items: T[]) => void",
                        description: "Enfileira; excedente vai pro overflow.",
                    },
                    {
                        name: "update",
                        type: "(fn: (state: T[]) => T[]) => void",
                        description: "Remapeia os itens visíveis.",
                    },
                    {
                        name: "cleanQueue",
                        type: "() => void",
                        description: "Descarta os visíveis, mantém overflow.",
                    },
                    { name: "size", type: "number", description: "Itens visíveis na fila." },
                ]}
            >
                <QueueDemo />
            </Example>

            <Example
                title="usePrevious"
                id="ex-use-previous"
                note="Retorna o valor do render anterior (undefined no primeiro)."
                code={`import { usePrevious } from "tempest-react-sdk";
import { useState } from "react";

function Demo() {
    const [count, setCount] = useState(0);
    const previous = usePrevious(count);
    return (
        <>
            <button onClick={() => setCount((c) => c + 1)}>+1</button>
            <span>atual: {count}</span>
            <span>anterior: {previous ?? "—"}</span>
        </>
    );
}`}
                props={[
                    {
                        name: "(return)",
                        type: "T | undefined",
                        description: "Valor do render anterior; undefined no primeiro render.",
                    },
                    {
                        name: "value (arg)",
                        type: "T",
                        description: "Valor atual a ser rastreado.",
                    },
                ]}
            >
                <PreviousDemo />
            </Example>

            <Example
                title="useAsync"
                id="ex-use-async"
                note="Roda uma função async e rastreia idle/pending/success/error."
                code={`import { useAsync } from "tempest-react-sdk";

function Demo() {
    const fetchUser = () =>
        new Promise<string>((resolve) =>
            setTimeout(() => resolve("user-42"), 900),
        );
    const { data, isPending, status, run } = useAsync<string>(fetchUser);
    return (
        <>
            <button onClick={() => void run()} disabled={isPending}>
                {isPending ? "carregando…" : "run()"}
            </button>
            <span>status: {status}</span>
            {data && <span>data: {data}</span>}
        </>
    );
}`}
                props={[
                    {
                        name: "status",
                        type: '"idle" | "pending" | "success" | "error"',
                        description: "Estado atual da execução.",
                    },
                    { name: "data", type: "T | undefined", description: "Resultado em sucesso." },
                    { name: "error", type: "unknown", description: "Erro capturado, se houver." },
                    {
                        name: "isPending / isSuccess / isError",
                        type: "boolean",
                        description: "Flags derivadas de status.",
                    },
                    {
                        name: "run",
                        type: "() => Promise<T>",
                        description: "Dispara a função async.",
                    },
                    {
                        name: "reset",
                        type: "() => void",
                        description: "Volta o estado para idle.",
                    },
                ]}
            >
                <AsyncDemo />
            </Example>

            <Example
                title="useIsFirstRender"
                id="ex-use-is-first-render"
                note="Retorna true apenas no primeiro render e false depois."
                code={`import { useIsFirstRender } from "tempest-react-sdk";
import { useState } from "react";

function Demo() {
    const isFirst = useIsFirstRender();
    const [, setTick] = useState(0);
    return (
        <>
            <span>{isFirst ? "primeira render" : "re-render"}</span>
            <button onClick={() => setTick((t) => t + 1)}>
                forçar re-render
            </button>
        </>
    );
}`}
                props={[
                    {
                        name: "(return)",
                        type: "boolean",
                        description: "true no primeiro render do componente, false nos demais.",
                    },
                ]}
            >
                <IsFirstRenderDemo />
            </Example>
        </section>
    );
}
