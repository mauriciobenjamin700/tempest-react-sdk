import { useRef, useState, type ReactElement } from "react";
import {
    Badge,
    Button,
    createApiClient,
    generateIdempotencyKey,
    isApiError,
    retry,
    TempestApiError,
    usePoll,
    type ApiError,
} from "tempest-react-sdk";
import { KeyRound, Play, RefreshCw, Send, Square, Upload } from "lucide-react";
import { Example } from "../Example";

/**
 * Build a `fetch`-shaped stub so demos run with no network. The returned
 * function honors the subset of `Response` the SDK reads: `ok`, `status`,
 * `headers.get`, `json`, `text`, and `clone`.
 *
 * @param status - HTTP status the fake response reports.
 * @param payload - Body returned from `json()` / `text()`.
 * @returns A function compatible with the `fetch` signature.
 */
function makeFakeFetch(status: number, payload: unknown): typeof fetch {
    const fake = async (): Promise<Response> => {
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        const headers = new Headers({ "content-type": "application/json" });
        const response = {
            ok: status >= 200 && status < 300,
            status,
            headers,
            json: async (): Promise<unknown> => payload,
            text: async (): Promise<string> => JSON.stringify(payload),
            clone(): unknown {
                return response;
            },
        };
        return response as unknown as Response;
    };
    return fake as unknown as typeof fetch;
}

interface DemoUser {
    id: string;
    name: string;
}

/** Live demo for {@link createApiClient} with a mocked `fetcher`. */
function ApiClientDemo(): ReactElement {
    const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
    const [user, setUser] = useState<DemoUser | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>("");

    async function run(fail: boolean): Promise<void> {
        setState("loading");
        setUser(null);
        setErrorMsg("");
        const api = createApiClient({
            baseURL: "https://demo.tempest.dev",
            getToken: () => "fake-jwt",
            fetcher: fail
                ? makeFakeFetch(403, { detail: "Sem permissão", code: "FORBIDDEN" })
                : makeFakeFetch(200, { id: "u_1", name: "Ana" }),
        });
        try {
            const result = await api.get<DemoUser>("/users/me");
            setUser(result);
            setState("ok");
        } catch (err) {
            if (isApiError(err)) {
                const apiError = err as ApiError;
                setErrorMsg(`${apiError.status} · ${apiError.code ?? "—"} · ${apiError.detail}`);
            } else {
                setErrorMsg(String(err));
            }
            setState("error");
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" onClick={() => void run(false)} disabled={state === "loading"}>
                    <Send size={16} /> GET 200
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void run(true)}
                    disabled={state === "loading"}
                >
                    <Send size={16} /> GET 403
                </Button>
            </div>
            {state === "loading" && <Badge variant="info">carregando…</Badge>}
            {state === "ok" && user && (
                <Badge variant="success">
                    id={user.id} · name={user.name}
                </Badge>
            )}
            {state === "error" && <Badge variant="danger">{errorMsg}</Badge>}
        </div>
    );
}

/** Live demo for {@link retry} against a counter that fails N times. */
function RetryDemo(): ReactElement {
    const [log, setLog] = useState<string[]>([]);
    const [result, setResult] = useState<string>("");
    const [running, setRunning] = useState<boolean>(false);

    async function run(): Promise<void> {
        setLog([]);
        setResult("");
        setRunning(true);
        let calls = 0;
        const failUntil = 2; // first 2 attempts throw, 3rd succeeds

        async function flaky(): Promise<string> {
            calls += 1;
            if (calls <= failUntil) {
                throw new TempestApiError({ status: 503, detail: `falha #${calls}` });
            }
            return `ok na tentativa ${calls}`;
        }

        try {
            const value = await retry(flaky, {
                retries: 5,
                initialDelay: 200,
                shouldRetry: (error) => (error as ApiError).status >= 500,
                onRetry: ({ attempt, delay }) =>
                    setLog((prev) => [...prev, `retry ${attempt} em ${delay}ms`]),
            });
            setResult(value);
        } catch (err) {
            setResult(`desistiu: ${String(err)}`);
        } finally {
            setRunning(false);
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Button size="sm" onClick={() => void run()} disabled={running}>
                <RefreshCw size={16} /> rodar flaky
            </Button>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {log.map((line, i) => (
                    <Badge key={i} variant="warning">
                        {line}
                    </Badge>
                ))}
                {result && (
                    <Badge variant={result.startsWith("ok") ? "success" : "danger"}>{result}</Badge>
                )}
            </div>
        </div>
    );
}

/** Live demo for {@link usePoll} over an in-memory counter. */
function PollDemo(): ReactElement {
    const tickRef = useRef<number>(0);
    const [enabled, setEnabled] = useState<boolean>(false);

    const { data, loading } = usePoll<number>(
        async () => {
            tickRef.current += 1;
            return tickRef.current;
        },
        { interval: 1000, disabled: !enabled },
    );

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => setEnabled((v) => !v)}>
                {enabled ? <Square size={16} /> : <Play size={16} />}
                {enabled ? "parar" : "iniciar"}
            </Button>
            <Badge variant="info">tick: {data ?? 0}</Badge>
            {enabled && loading && <Badge variant="neutral">…</Badge>}
        </div>
    );
}

/**
 * Live demo for {@link uploadWithProgress}. The real helper needs an
 * `XMLHttpRequest` and a server, so this drives a simulated progress bar with
 * `setInterval` while showing the real call shape in the code panel.
 */
function UploadDemo(): ReactElement {
    const [progress, setProgress] = useState<number>(0);
    const [running, setRunning] = useState<boolean>(false);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    function start(): void {
        if (timer.current) clearInterval(timer.current);
        setProgress(0);
        setRunning(true);
        timer.current = setInterval(() => {
            setProgress((prev) => {
                const next = Math.min(100, prev + 8);
                if (next >= 100 && timer.current) {
                    clearInterval(timer.current);
                    timer.current = null;
                    setRunning(false);
                }
                return next;
            });
        }, 150);
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}>
            <Button size="sm" onClick={start} disabled={running}>
                <Upload size={16} /> simular upload
            </Button>
            <div
                style={{
                    height: 10,
                    borderRadius: 6,
                    background: "var(--tempest-surface-2, #e5e5e5)",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "var(--tempest-primary, #4f46e5)",
                        transition: "width 120ms linear",
                    }}
                />
            </div>
            <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                {progress}% (simulado — sem backend real)
            </span>
        </div>
    );
}

/** Live demo for {@link generateIdempotencyKey}. */
function IdempotencyDemo(): ReactElement {
    const [key, setKey] = useState<string>(() => generateIdempotencyKey());
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <code
                style={{
                    fontSize: 13,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "var(--tempest-surface-2, #f0f0f0)",
                }}
            >
                {key}
            </code>
            <Button size="sm" variant="ghost" onClick={() => setKey(generateIdempotencyKey())}>
                <KeyRound size={16} /> regenerar
            </Button>
        </div>
    );
}

/**
 * Gallery section for the `tempest-react-sdk` HTTP module. Every demo is
 * self-contained: the API client is fed a mocked `fetcher`, `retry` wraps an
 * in-memory counter, `usePoll` ticks a ref, the upload progress is simulated,
 * and the idempotency key is generated client-side. No network is touched.
 */
export function HttpRecipeSection(): ReactElement {
    return (
        <section className="gallery-section" id="recipe-http">
            <h3>HTTP client (receita)</h3>
            <p className="description">
                Camada de fetch tipada do SDK: cliente injetável, retry com backoff, polling com
                guarda de overlap, upload com progresso e chaves de idempotência. Todos os demos
                rodam sem backend — o <code>fetcher</code> é mockado e o restante é simulado em
                memória.
            </p>

            <Example
                title="createApiClient"
                id="ex-api-client"
                note="Cliente tipado com fetcher mockado: GET 200 retorna JSON parseado; GET 403 lança TempestApiError (capturado via isApiError)."
                code={`import { createApiClient, isApiError, type ApiError } from "tempest-react-sdk";

const api = createApiClient({
    baseURL: "https://demo.tempest.dev",
    getToken: () => "fake-jwt",
    fetcher, // injete uma impl de fetch (default globalThis.fetch)
});

try {
    const user = await api.get<{ id: string; name: string }>("/users/me");
} catch (err) {
    if (isApiError(err)) {
        const e = err as ApiError;
        console.error(e.status, e.code, e.detail);
    }
}`}
                props={[
                    {
                        name: "baseURL",
                        type: "string",
                        description: "Prefixo de toda requisição. Obrigatório.",
                    },
                    {
                        name: "getToken",
                        type: "() => string | null | undefined",
                        description: "Injeta Authorization: Bearer <token> por request.",
                    },
                    {
                        name: "fetcher",
                        type: "typeof fetch",
                        default: "globalThis.fetch",
                        description: "Impl de fetch alternativa — usada aqui pra mockar.",
                    },
                    {
                        name: "onUnauthorized",
                        type: "(res: Response) => void | Promise<void>",
                        description: "Disparado em 401 (logout / trigger de refresh).",
                    },
                    {
                        name: "refresh",
                        type: "() => Promise<void>",
                        description: "Em 401, renova e repete o request 1x.",
                    },
                ]}
            >
                <ApiClientDemo />
            </Example>

            <Example
                title="retry"
                id="ex-retry"
                note="Reexecuta uma factory async com backoff exponencial. Aqui a fn falha 2x (503) e sucede na 3ª; shouldRetry filtra por status >= 500."
                code={`import { retry, TempestApiError, type ApiError } from "tempest-react-sdk";

let calls = 0;
const value = await retry(
    async () => {
        calls += 1;
        if (calls <= 2) throw new TempestApiError({ status: 503, detail: "falha" });
        return "ok";
    },
    {
        retries: 5,
        initialDelay: 200,
        shouldRetry: (error) => (error as ApiError).status >= 500,
        onRetry: ({ attempt, delay }) => console.log(attempt, delay),
    },
);`}
                props={[
                    {
                        name: "retries",
                        type: "number",
                        default: "3",
                        description: "Máx de tentativas (inclui a 1ª).",
                    },
                    {
                        name: "initialDelay",
                        type: "number",
                        default: "300",
                        description: "Backoff inicial (ms); dobra a cada tentativa.",
                    },
                    {
                        name: "maxDelay",
                        type: "number",
                        default: "10_000",
                        description: "Teto do delay (ms).",
                    },
                    {
                        name: "shouldRetry",
                        type: "(error, attempt) => boolean",
                        default: "() => true",
                        description: "Retorne false pra parar de retentar.",
                    },
                    {
                        name: "onRetry",
                        type: "(info: { attempt; delay; error }) => void",
                        description: "Chamado antes de cada retry.",
                    },
                ]}
            >
                <RetryDemo />
            </Example>

            <Example
                title="usePoll"
                id="ex-use-poll"
                note="Chama uma factory async num intervalo fixo, pulando ticks enquanto a chamada anterior não terminou. Aqui incrementa um contador em memória a cada 1s."
                code={`import { usePoll } from "tempest-react-sdk";

const { data, loading, stop, start } = usePoll<number>(
    async () => fetchCounter(),
    { interval: 1000, disabled: !enabled, stopWhen: (n) => n >= 10 },
);`}
                props={[
                    {
                        name: "interval",
                        type: "number",
                        description: "Intervalo de polling (ms). Obrigatório.",
                    },
                    {
                        name: "disabled",
                        type: "boolean",
                        default: "false",
                        description: "Pausa o polling sem desmontar.",
                    },
                    {
                        name: "stopWhen",
                        type: "(data: T) => boolean",
                        description: "Para o polling quando o predicado for true.",
                    },
                    {
                        name: "onError",
                        type: "(error: unknown) => void",
                        description: "Chamado a cada erro.",
                    },
                ]}
            >
                <PollDemo />
            </Example>

            <Example
                title="uploadWithProgress"
                id="ex-upload-progress"
                note="O helper real usa XMLHttpRequest + servidor pra reportar progresso byte a byte. Sem backend na galeria, a barra abaixo é simulada via setInterval — o código mostra a chamada real."
                code={`import { uploadWithProgress } from "tempest-react-sdk";

const formData = new FormData();
formData.append("file", file);

const result = await uploadWithProgress<{ url: string }>({
    url: "https://demo.tempest.dev/uploads",
    method: "POST",
    body: formData,
    getToken: () => token,
    onProgress: ({ fraction }) =>
        fraction !== null && setProgress(Math.round(fraction * 100)),
});`}
                props={[
                    {
                        name: "url",
                        type: "string",
                        description: "Endpoint de upload. Obrigatório.",
                    },
                    {
                        name: "body",
                        type: "FormData | Blob | File",
                        description: "Payload enviado. Obrigatório.",
                    },
                    {
                        name: "method",
                        type: '"POST" | "PUT" | "PATCH"',
                        default: '"POST"',
                        description: "Verbo HTTP.",
                    },
                    {
                        name: "onProgress",
                        type: "(e: UploadProgressEvent) => void",
                        description: "{ loaded, total, fraction, lengthComputable } por evento.",
                    },
                    {
                        name: "signal",
                        type: "AbortSignal",
                        description: "Aborta o upload (rejeita com AbortError).",
                    },
                ]}
            >
                <UploadDemo />
            </Example>

            <Example
                title="generateIdempotencyKey"
                id="ex-idempotency-key"
                note="Gera um UUID v4 pro header Idempotency-Key. Gere uma vez por operação e reutilize nos retries."
                code={`import { generateIdempotencyKey } from "tempest-react-sdk";

const key = generateIdempotencyKey();

await api.post("/orders", {
    body: { items },
    headers: { "Idempotency-Key": key },
});`}
                props={[
                    {
                        name: "(retorno)",
                        type: "string",
                        description: "UUID v4 (crypto.randomUUID com fallback).",
                    },
                ]}
            >
                <IdempotencyDemo />
            </Example>
        </section>
    );
}
