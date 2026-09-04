import { useEffect, useRef, useState } from "react";
import { VideoPlayer } from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Demo of `VideoPlayer`.
 *
 * The clip is recorded in the page, from a canvas, rather than shipped as a fixture:
 * a committed sample would be a binary in the repo and would not exercise the case
 * the component was written for, which is playing back a `MediaRecorder` blob — the
 * one that may carry no duration in its header. A still is drawn synchronously and
 * used as the poster, so the frame is never an empty black box while the recording
 * is being made.
 */
function drawStill(): string {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) return "";
    const gradient = context.createLinearGradient(0, 0, 640, 360);
    gradient.addColorStop(0, "#1e293b");
    gradient.addColorStop(1, "#0f172a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = "#38bdf8";
    context.font = "600 28px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("clipe de exemplo", 320, 180);
    return canvas.toDataURL("image/png");
}

/**
 * Record a couple of seconds of a moving canvas.
 *
 * The canvas is repainted on every animation frame because `captureStream(30)` does
 * not synthesize frames at 30 fps — it emits one when the canvas changes, so painting
 * once a second would produce a ~1 fps clip.
 *
 * @param signal Aborts the recording when the section unmounts.
 * @returns An object URL for the clip, or `null` where MediaRecorder is missing.
 */
async function recordClip(signal: AbortSignal): Promise<string | null> {
    if (typeof MediaRecorder === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
    });

    recorder.start();
    const started = performance.now();
    while (performance.now() - started < 2400 && !signal.aborted) {
        const progress = (performance.now() - started) / 2400;
        context.fillStyle = "#0f172a";
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = "#38bdf8";
        context.beginPath();
        context.arc(80 + progress * 480, 180, 42, 0, Math.PI * 2);
        context.fill();
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
    recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    if (signal.aborted) return null;
    return URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
}

export function VideoPlayerSection() {
    const [poster] = useState(drawStill);
    const [clip, setClip] = useState<string | null>(null);
    const [rate, setRate] = useState(1);
    const made = useRef<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        void recordClip(controller.signal).then((url) => {
            if (url === null) return;
            made.current = url;
            setClip(url);
        });
        return () => {
            controller.abort();
            if (made.current) URL.revokeObjectURL(made.current);
        };
    }, []);

    return (
        <section className="gallery-section" id="video-player">
            <h3>VideoPlayer</h3>
            <Example
                id="video-player-transport"
                title="VideoPlayer — transporte completo"
                note="O clipe é gravado aqui na página, de um canvas, então é um blob de MediaRecorder de verdade. Toque em Tocar, arraste a posição, mude a velocidade e abra em tela cheia. Os controles ficam embaixo do quadro de propósito: controle sobre vídeo teria de garantir contraste contra pixel arbitrário, e nenhum token consegue prometer isso."
                code={`import { useVideoRecorder, VideoPlayer } from "tempest-react-sdk";

const rec = useVideoRecorder(stream);

{rec.recording && (
  <VideoPlayer
    src={rec.recording.blob}
    durationMs={rec.recording.durationMs}
    poster={capa}
    actions={<button onClick={baixar}>Baixar</button>}
  />
)}`}
                props={[
                    {
                        name: "src",
                        type: "string | Blob | null",
                        description:
                            "URL ou Blob direto do gravador. O object URL é revogado na troca e no unmount.",
                    },
                    {
                        name: "durationMs",
                        type: "number",
                        description:
                            "Duração que você já conhece. Sem ela, um WebM de MediaRecorder pode reportar Infinity até ser sondado.",
                    },
                    {
                        name: "rate / rates / onRateChange",
                        type: "number | readonly number[] | (rate: number) => void",
                        default: "[0.5, 1, 1.5, 2]",
                        description:
                            "Velocidade e presets. rates={[]} esconde o controle. Escreve playbackRate E defaultPlaybackRate, senão a escolha se perde ao trocar de src.",
                    },
                    {
                        name: "poster",
                        type: "string",
                        description: "Capa antes do play. Combina com captureFrame de /imaging.",
                    },
                    {
                        name: "tracks",
                        type: "readonly VideoTextTrack[]",
                        description: "Legendas, viram <track>. kind default é captions.",
                    },
                    {
                        name: "fullscreen",
                        type: "boolean",
                        default: "true",
                        description:
                            "Botão de tela cheia onde o navegador suporta, sobre o useFullscreen.",
                    },
                ]}
            >
                <VideoPlayer
                    src={clip}
                    poster={poster}
                    rate={rate}
                    onRateChange={setRate}
                    actions={<small style={{ color: "var(--tempest-text-muted)" }}>{rate}×</small>}
                />
            </Example>

            <Example
                id="video-player-bare"
                title="Sem velocidade e sem tela cheia"
                note="rates={[]} esconde o seletor e fullscreen={false} esconde o botão — para um preview embutido onde a barra tem de caber em pouca largura."
                code={`<VideoPlayer src={clipe} rates={[]} fullscreen={false} aspectRatio={4 / 3} />`}
            >
                <VideoPlayer src={clip} poster={poster} rates={[]} fullscreen={false} />
            </Example>
        </section>
    );
}
