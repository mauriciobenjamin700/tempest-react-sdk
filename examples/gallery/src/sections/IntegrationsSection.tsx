import { useState } from "react";
import {
    Badge,
    Button,
    Card,
    isPushSupported,
    playAudio,
    useEventStream,
    useToast,
} from "tempest-react-sdk";

import { Example } from "../Example";

export function IntegrationsSection() {
    const toast = useToast();
    const [streamEnabled, setStreamEnabled] = useState(false);
    const pushSupported = isPushSupported();

    const stream = useEventStream<{ message: string }>("https://sse.dev/test?interval=2", {
        enabled: streamEnabled,
        onMessage: ({ data }) => toast.info(String(data?.message ?? data)),
    });

    return (
        <section className="gallery-section" id="integrations">
            <h3>Integrações (SSE, Push, Audio)</h3>
            <p className="description">
                Demos vivos de SSE (público <code>sse.dev</code>), checagem de suporte a Push, e
                playback de áudio.
            </p>

            <Example
                title="SSE — Server-Sent Events"
                note="Conexão viva com sse.dev; mensagens viram toasts."
                code={`const stream = useEventStream<{ message: string }>(
    "https://sse.dev/test?interval=2",
    {
        enabled: streamEnabled,
        onMessage: ({ data }) => toast.info(String(data?.message ?? data)),
    },
);

<Badge variant={statusVariant(stream.status)}>{stream.status}</Badge>
<Button
    variant={streamEnabled ? "danger" : "primary"}
    onClick={() => setStreamEnabled((v) => !v)}
>
    {streamEnabled ? "Desconectar" : "Conectar"}
</Button>`}
            >
                <Card title="SSE — Server-Sent Events">
                    <p style={{ marginTop: 0, fontSize: 13 }}>
                        Status:{" "}
                        <Badge variant={statusVariant(stream.status)}>{stream.status}</Badge>
                    </p>
                    <Button
                        variant={streamEnabled ? "danger" : "primary"}
                        onClick={() => setStreamEnabled((v) => !v)}
                    >
                        {streamEnabled ? "Desconectar" : "Conectar"}
                    </Button>
                    <p style={{ fontSize: 12, color: "var(--tempest-text-muted)", marginTop: 8 }}>
                        Última mensagem aparece como toast.
                    </p>
                </Card>
            </Example>

            <Example
                title="Web Push"
                note="Checagem de suporte do navegador a notificações push."
                code={`const pushSupported = isPushSupported();

<Badge variant={pushSupported ? "success" : "danger"}>
    {pushSupported ? "sim" : "não"}
</Badge>`}
            >
                <Card title="Web Push">
                    <p style={{ marginTop: 0, fontSize: 13 }}>
                        Suportado:{" "}
                        <Badge variant={pushSupported ? "success" : "danger"}>
                            {pushSupported ? "sim" : "não"}
                        </Badge>
                    </p>
                    <p style={{ fontSize: 12, color: "var(--tempest-text-muted)" }}>
                        Inscrição real requer service worker registrado + VAPID key. Veja{" "}
                        <code>docs/push.md</code>.
                    </p>
                </Card>
            </Example>

            <Example
                title="Áudio"
                note="Playback local via playAudio(); autoplay exige interação."
                code={`<Button
    onClick={() => {
        const audio = new Audio();
        audio.src =
            "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
        void playAudio(audio.src, { volume: 0.4 }).catch(() =>
            toast.warning("Autoplay bloqueado"),
        );
    }}
>
    Tocar bipe
</Button>`}
            >
                <Card title="Áudio">
                    <p style={{ marginTop: 0, fontSize: 13 }}>
                        Playback de notificação local. Política de autoplay exige clique do usuário.
                    </p>
                    <Button
                        onClick={() => {
                            const audio = new Audio();
                            audio.src =
                                "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
                            void playAudio(audio.src, { volume: 0.4 }).catch(() =>
                                toast.warning("Autoplay bloqueado"),
                            );
                        }}
                    >
                        Tocar bipe
                    </Button>
                </Card>
            </Example>
        </section>
    );
}

function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
    if (status === "open") return "success";
    if (status === "connecting") return "warning";
    if (status === "error") return "danger";
    return "neutral";
}
