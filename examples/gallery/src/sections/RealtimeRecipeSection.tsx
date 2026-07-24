import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
    Badge,
    Button,
    Input,
    createWebSocket,
    useWebSocket,
    type WebSocketController,
    type WebSocketStatus,
} from "tempest-react-sdk";
import { PlugZap, RotateCcw, Send, Unplug } from "lucide-react";
import { Example } from "../Example";

/** Public echo server that bounces back every frame it receives. */
const ECHO_URL = "wss://echo.websocket.events";

/** Map a WebSocket status to a Badge variant for quick visual feedback. */
function statusVariant(status: WebSocketStatus): "success" | "warning" | "danger" | "neutral" {
    if (status === "open") return "success";
    if (status === "connecting" || status === "closing") return "warning";
    if (status === "error") return "danger";
    return "neutral";
}

/** Live demo for {@link useWebSocket} against the public echo server. */
function UseWebSocketDemo(): ReactElement {
    const [draft, setDraft] = useState<string>("");
    const [log, setLog] = useState<string[]>([]);

    const ws = useWebSocket<string>(ECHO_URL, {
        onMessage: ({ data }) => {
            setLog((prev) => [...prev.slice(-7), String(data)]);
        },
    });

    const isOpen = ws.status === "open";

    const sendMessage = useCallback((): void => {
        const text = draft.trim();
        if (!text) return;
        const ok = ws.send(text);
        if (ok) setDraft("");
    }, [draft, ws]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                    Status:
                </span>
                <Badge variant={statusVariant(ws.status)}>{ws.status}</Badge>
                {(ws.status === "error" || ws.status === "closed") && (
                    <Button size="sm" variant="ghost" onClick={ws.reconnect}>
                        <RotateCcw size={14} /> Reconectar
                    </Button>
                )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Input
                    value={draft}
                    placeholder="Digite e envie pro echo…"
                    disabled={!isOpen}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") sendMessage();
                    }}
                    style={{ flex: "1 1 180px", minWidth: 0 }}
                />
                <Button size="sm" disabled={!isOpen || !draft.trim()} onClick={sendMessage}>
                    <Send size={14} /> Enviar
                </Button>
            </div>

            <div
                style={{
                    fontSize: 13,
                    minHeight: 48,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "var(--tempest-surface-2, #f5f5f5)",
                }}
            >
                {log.length === 0 ? (
                    <span style={{ color: "var(--tempest-text-muted, #888)" }}>
                        {isOpen
                            ? "Aguardando ecos… envie uma mensagem."
                            : "Sem conexão — servidor público pode estar offline."}
                    </span>
                ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 2 }}>
                        {log.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/** Live demo for the imperative {@link createWebSocket} controller. */
function CreateWebSocketDemo(): ReactElement {
    const controllerRef = useRef<WebSocketController | null>(null);
    const [status, setStatus] = useState<WebSocketStatus>("idle");
    const [received, setReceived] = useState<string[]>([]);

    // Tear down any open socket when the demo unmounts.
    useEffect(() => {
        return () => {
            controllerRef.current?.close();
            controllerRef.current = null;
        };
    }, []);

    const connect = useCallback((): void => {
        if (controllerRef.current) return;
        controllerRef.current = createWebSocket<string>(ECHO_URL, {
            onStatusChange: setStatus,
            onMessage: ({ data }) => {
                setReceived((prev) => [...prev.slice(-5), String(data)]);
            },
        });
    }, []);

    const disconnect = useCallback((): void => {
        controllerRef.current?.close();
        controllerRef.current = null;
        setStatus("closed");
    }, []);

    const ping = useCallback((): void => {
        controllerRef.current?.send(`ping @ ${new Date().toLocaleTimeString()}`);
    }, []);

    const isOpen = status === "open";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Badge variant={statusVariant(status)}>{status}</Badge>
                <Button size="sm" disabled={isOpen} onClick={connect}>
                    <PlugZap size={14} /> connect()
                </Button>
                <Button size="sm" variant="ghost" disabled={!isOpen} onClick={ping}>
                    <Send size={14} /> send()
                </Button>
                <Button size="sm" variant="ghost" onClick={disconnect}>
                    <Unplug size={14} /> close()
                </Button>
            </div>

            <div
                style={{
                    fontSize: 13,
                    minHeight: 32,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "var(--tempest-surface-2, #f5f5f5)",
                    color: "var(--tempest-text-muted, #888)",
                }}
            >
                {received.length === 0
                    ? "Conecte e clique em send() para ver o eco."
                    : received.map((line, i) => <div key={i}>{line}</div>)}
            </div>
        </div>
    );
}

/**
 * Recipe section for the realtime (WebSocket) module of the SDK: the
 * {@link useWebSocket} hook and the imperative {@link createWebSocket}
 * controller, both wired live against a public echo server.
 */
export function RealtimeRecipeSection(): ReactElement {
    return (
        <section className="gallery-section" id="recipe-realtime">
            <h3>Tempo real (WebSocket)</h3>
            <p className="description">
                Canal bidirecional com reconexão exponencial automática, heartbeat opcional e parse
                JSON tipado. Use o hook <code>useWebSocket</code> dentro de componentes ou o
                controller imperativo <code>createWebSocket</code> fora do React. Os demos abaixo se
                conectam ao servidor público de echo <code>wss://echo.websocket.events</code>, que
                devolve cada frame enviado.
            </p>

            <Example
                id="ex-use-websocket"
                title="useWebSocket — hook com envio + status"
                note={
                    <>
                        Demo ao vivo contra o servidor público{" "}
                        <code>wss://echo.websocket.events</code> — pode estar offline. Se o status
                        não chegar em <code>open</code>, o input fica desabilitado e o botão
                        Reconectar reseta o contador de tentativas.
                    </>
                }
                code={`import { useState } from "react";
import { useWebSocket } from "tempest-react-sdk";

function Chat() {
    const [draft, setDraft] = useState("");
    const [log, setLog] = useState<string[]>([]);

    const ws = useWebSocket<string>("wss://echo.websocket.events", {
        onMessage: ({ data }) => setLog((p) => [...p, data]),
    });

    function send() {
        if (ws.send(draft)) setDraft("");
    }

    return (
        <div>
            <span>Status: {ws.status}</span>
            <ul>{log.map((m, i) => <li key={i}>{m}</li>)}</ul>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button disabled={ws.status !== "open"} onClick={send}>Enviar</button>
            {ws.status === "error" && <button onClick={ws.reconnect}>Reconectar</button>}
        </div>
    );
}`}
                props={[
                    {
                        name: "url",
                        type: "string",
                        description: "URL ws:// ou wss:// (mudar reabre a conexão).",
                    },
                    {
                        name: "enabled",
                        type: "boolean",
                        default: "true",
                        description: "Quando false, o socket não é aberto.",
                    },
                    {
                        name: "onMessage",
                        type: "(m: WebSocketMessage<T>) => void",
                        description: "Callback por frame (via ref — mudar não reabre).",
                    },
                    {
                        name: "pingInterval",
                        type: "number",
                        default: "0",
                        description: "Heartbeat em ms; 0 desativa.",
                    },
                    {
                        name: "maxRetries",
                        type: "number",
                        default: "10",
                        description: "Tentativas de reconexão em fechamento não-limpo.",
                    },
                    {
                        name: "→ status",
                        type: '"idle" | "connecting" | "open" | "closing" | "closed" | "error"',
                        description: "Estado atual da conexão.",
                    },
                    {
                        name: "→ send",
                        type: "(payload) => boolean",
                        description: "Envia; retorna false (no-op) se não estiver open.",
                    },
                    {
                        name: "→ lastMessage",
                        type: "WebSocketMessage<T> | null",
                        description: "Último frame decodificado.",
                    },
                    {
                        name: "→ reconnect",
                        type: "() => void",
                        description: "Força reconexão e zera o contador de tentativas.",
                    },
                ]}
            >
                <UseWebSocketDemo />
            </Example>

            <Example
                id="ex-create-websocket"
                title="createWebSocket — controller imperativo"
                note={
                    <>
                        API fora do React: <code>connect/close/send</code> manuais contra o mesmo
                        echo público. Reconexão só dispara em fechamento <strong>não-limpo</strong>{" "}
                        — <code>close()</code> é limpo e não reabre.
                    </>
                }
                code={`import { createWebSocket } from "tempest-react-sdk";

const socket = createWebSocket<string>("wss://echo.websocket.events", {
    pingInterval: 30_000, // heartbeat opcional
    maxRetries: 10,
    onStatusChange: (status) => console.log("WS", status),
    onMessage: ({ data, raw }) => console.log(data, raw),
});

// send() retorna false (no-op) quando o socket não está aberto:
const sent = socket.send("oi");

// Frame binário:
socket.send(new Uint8Array([1, 2, 3]).buffer);

socket.reconnect(); // força reconexão, zera o contador
socket.close();     // fechamento limpo — NÃO tenta reabrir`}
                props={[
                    {
                        name: "send",
                        type: "(payload) => boolean",
                        description: "Envia frame; false quando não estiver open.",
                    },
                    {
                        name: "close",
                        type: "(code?, reason?) => void",
                        description: "Fecha e para de reconectar (fechamento limpo).",
                    },
                    {
                        name: "reconnect",
                        type: "() => void",
                        description: "Reconecta imediato e zera o contador.",
                    },
                    {
                        name: "status",
                        type: "WebSocketStatus (readonly)",
                        description: "Status atual lido do controller.",
                    },
                ]}
            >
                <CreateWebSocketDemo />
            </Example>

            <Example
                id="ex-websocket-reconnect"
                title="Reconexão & backoff exponencial"
                note={
                    <>
                        Em fechamento não-limpo, o cliente reabre com backoff{" "}
                        <code>1s → 2s → 4s …</code> (limitado em <code>maxBackoff</code>) até{" "}
                        <code>maxRetries</code>. Esgotadas as tentativas, o status vira{" "}
                        <code>error</code> e <code>reconnect()</code> retoma manualmente. Mostrado
                        apenas como código — não dá pra forçar de forma confiável uma queda do echo
                        público no demo ao vivo.
                    </>
                }
                code={`import { createWebSocket } from "tempest-react-sdk";

const socket = createWebSocket("wss://echo.websocket.events", {
    initialBackoff: 1000, // 1s, dobra a cada tentativa
    maxBackoff: 30_000,   // teto de 30s
    maxRetries: 10,       // depois disso → status "error"
    pingInterval: 30_000, // heartbeat mantém o socket vivo
    onStatusChange: (status) => {
        if (status === "error") {
            // esgotou as tentativas — ofereça reconexão manual
            console.warn("WS desistiu; chame socket.reconnect()");
        }
    },
});`}
            >
                <p
                    style={{
                        fontSize: 13,
                        color: "var(--tempest-text-muted, #888)",
                        margin: 0,
                    }}
                >
                    Backoff: 1s → 2s → 4s → … (cap 30s), até <code>maxRetries</code> (default 10).
                    Reconnect só dispara em fechamento não-limpo.
                </p>
            </Example>
        </section>
    );
}
