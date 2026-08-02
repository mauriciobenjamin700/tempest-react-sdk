import { useRef, useState } from "react";
import {
    createResumableUpload,
    DEFAULT_CHUNK_SIZE,
    type ResumableUpload,
    type ResumableUploadState,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Resumable-upload demo.
 *
 * The gallery ships no tus server, and nothing here pretends otherwise: point
 * `endpoint` at a real one (`tusd -upload-dir=./data` is one command) and the panel
 * uploads for real. Left as-is, you watch the genuine failure path — creation refused,
 * backoff, `error` — which is the path most demos hide.
 */
export function ResumableUploadSection() {
    const handle = useRef<ResumableUpload | null>(null);
    const [endpoint, setEndpoint] = useState("/api/uploads");
    const [file, setFile] = useState<File | null>(null);
    const [state, setState] = useState<ResumableUploadState>("idle");
    const [percent, setPercent] = useState(0);
    const [message, setMessage] = useState<string | null>(null);

    function build(): ResumableUpload | null {
        if (!file) return null;
        handle.current ??= createResumableUpload({
            endpoint,
            file,
            chunkSize: 256 * 1024,
            metadata: { filename: file.name },
            retry: { retries: 2, initialDelay: 200 },
            onStateChange: setState,
            onProgress: ({ fraction }) => setPercent(Math.round(fraction * 100)),
        });
        return handle.current;
    }

    async function start(): Promise<void> {
        const upload = build();
        if (!upload) return;
        setMessage(null);
        try {
            const done = await upload.start();
            setMessage(done ? `pronto: ${done.url}` : "parado de propósito (pause/abort)");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        }
    }

    return (
        <section className="gallery-section" id="recipe-resumable-upload">
            <h3>Upload resumível (tus)</h3>
            <p className="description">
                <code>uploadWithProgress</code> faz uma request; um áudio de 40 minutos precisa de
                chunks e de retomada. O protocolo é <b>tus 1.0.0</b> (core + creation +
                termination), então dá pra apontar pra um <code>tusd</code> sem escrever servidor.
            </p>

            <Example
                id="resumable-upload-panel"
                title="createResumableUpload — start · pause · resume · abort"
                note="Sem servidor tus atrás do endpoint você vê o caminho de falha real: criação recusada, backoff do retry e estado error. Suba um tusd e troque o endpoint pra ver o caminho felizes."
                code={`const upload = createResumableUpload({
  endpoint: "/api/uploads",
  file,
  metadata: { filename: file.name },
  onProgress: ({ fraction }) => setPercent(Math.round(fraction * 100)),
  onStateChange: setState,
});

const done = await upload.start();   // null quando você pausou/cancelou
upload.pause();
await upload.resume();               // HEAD → continua do offset do servidor
await upload.abort({ discard: true }); // DELETE + esquece o registro`}
                props={[
                    {
                        name: "endpoint",
                        type: "string",
                        description: "Rota de criação tus. POST devolve 201 + Location.",
                    },
                    {
                        name: "chunkSize",
                        type: "number",
                        default: `${DEFAULT_CHUNK_SIZE}`,
                        description: "5 MiB por padrão. Menor = tick de progresso mais fino.",
                    },
                    {
                        name: "storage",
                        type: "ResumableUploadStorage | null",
                        default: "localStorage",
                        description:
                            "Onde mora o ponto de retomada. null desliga (não sobrevive a reload).",
                    },
                    {
                        name: "retry",
                        type: "RetryOptions",
                        description: "É o retry do SDK — não existe um segundo backoff aqui.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <label htmlFor="tus-endpoint">Endpoint tus</label>
                    <input
                        id="tus-endpoint"
                        value={endpoint}
                        onChange={(event) => {
                            handle.current = null;
                            setEndpoint(event.target.value);
                        }}
                    />
                    <input
                        type="file"
                        aria-label="Arquivo para enviar"
                        onChange={(event) => {
                            handle.current = null;
                            setFile(event.target.files?.[0] ?? null);
                        }}
                    />
                    <progress value={percent} max={100} />
                    <div className="tempest-cluster">
                        <button type="button" onClick={() => void start()} disabled={!file}>
                            Enviar
                        </button>
                        <button type="button" onClick={() => handle.current?.pause()}>
                            Pausar
                        </button>
                        <button type="button" onClick={() => void handle.current?.resume()}>
                            Continuar
                        </button>
                        <button
                            type="button"
                            onClick={() => void handle.current?.abort({ discard: true })}
                        >
                            Cancelar
                        </button>
                    </div>
                    <p>
                        estado: <code>{state}</code> — {percent}%
                    </p>
                    {message && <p role="status">{message}</p>}
                </div>
            </Example>
        </section>
    );
}
