import { useEffect, useRef, useState } from "react";
import {
    AIChat,
    BarcodeScanner,
    Button,
    getSupportedBarcodeFormats,
    isBarcodeDetectionSupported,
    isSpeechRecognitionSupported,
    isVideoRecordingSupported,
    pickVideoMimeType,
    useScreenCapture,
    useSpeechRecognition,
    useVideoRecorder,
    type AIChatComposerHandle,
    type AIChatMessage,
    type BarcodeFormat,
    type BarcodeScanResult,
} from "tempest-react-sdk";
import { Example } from "../Example";

/** Muted preview of a live stream, so the share is visible while it records. */
function Preview({ stream }: { stream: MediaStream | null }) {
    const video = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const node = video.current;
        if (!node) return;
        node.srcObject = stream;
        if (stream) void node.play().catch(() => undefined);
    }, [stream]);

    return (
        <video
            ref={video}
            muted
            playsInline
            style={{
                width: "100%",
                maxHeight: 240,
                background: "var(--tempest-surface-3)",
                borderRadius: "var(--tempest-radius-lg)",
            }}
        />
    );
}

/**
 * Demo of the device-capture surface.
 *
 * Everything here is live: the scanner really opens the camera, the screen picker is the
 * browser's own, and the recorder is a real `MediaRecorder`. Nothing is faked, because
 * the states worth looking at are exactly the ones a mock hides — a browser with no
 * `BarcodeDetector`, a dismissed picker, a share stopped from the browser bar.
 */
export function DeviceCaptureSection() {
    const [scanning, setScanning] = useState(false);
    const [reads, setReads] = useState<BarcodeScanResult[]>([]);
    const [formats, setFormats] = useState<readonly BarcodeFormat[]>([]);

    const screen = useScreenCapture({
        preferCurrentTab: true,
        onCancelled: () => setNote("Você fechou o seletor — nada foi compartilhado."),
        onEnded: () => setNote("Compartilhamento encerrado pela barra do navegador."),
    });
    const [note, setNote] = useState("");
    const recorder = useVideoRecorder(screen.stream, {
        maxDurationMs: 60_000,
        videoBitsPerSecond: 2_500_000,
    });

    const composer = useRef<AIChatComposerHandle>(null);
    const draft = useRef("");
    const [turns, setTurns] = useState<AIChatMessage[]>([
        { id: "a0", role: "assistant", content: "Dite um pedido usando o botão do microfone." },
    ]);
    const speech = useSpeechRecognition({
        lang: "pt-BR",
        continuous: true,
        onFinal: (text) => {
            draft.current = `${draft.current} ${text}`.trim();
            composer.current?.setValue(draft.current);
        },
    });

    useEffect(() => {
        if (!speech.listening) return;
        composer.current?.setValue(`${draft.current} ${speech.interim}`.trim());
    }, [speech.interim, speech.listening]);

    useEffect(() => {
        void getSupportedBarcodeFormats().then(setFormats);
    }, []);

    return (
        <>
            <Example
                id="barcode-scanner"
                title="BarcodeScanner — fecha o ciclo do QRCode"
                note="Abre a câmera de verdade. Precisa de BarcodeDetector: existe no Chromium de Android, ChromeOS e macOS, e não existe no Firefox, no Safari nem no Chromium de Windows/Linux — nesses o componente mostra o fallback, e é por isso que ele é uma prop."
                code={`import { BarcodeScanner } from "tempest-react-sdk";

<BarcodeScanner
  formats={["ean_13", "qr_code", "code_128"]}
  onScan={({ rawValue, format }) => addToCart(rawValue, format)}
  unsupported={<ManualCodeInput />}
/>`}
                props={[
                    {
                        name: "onScan",
                        type: "(result: BarcodeScanResult) => void",
                        description:
                            "Recebe { rawValue, format, boundingBox, cornerPoints }. Repetição do mesmo valor é suprimida.",
                    },
                    {
                        name: "formats",
                        type: "BarcodeFormat[]",
                        default: '["qr_code","ean_13","code_128"]',
                        description: "Cada símbolo extra é trabalho por frame. Peça só o que usa.",
                    },
                    {
                        name: "repeatDelayMs",
                        type: "number",
                        default: "2500",
                        description: "Janela em que o mesmo valor não dispara de novo.",
                    },
                    {
                        name: "detector",
                        type: "BarcodeDetectorLike",
                        description:
                            "Polyfill injetado — como suportar Safari e Firefox sem o SDK ganhar dependência.",
                    },
                    {
                        name: "torch",
                        type: "boolean",
                        default: "true",
                        description: "Oferece a lanterna quando a câmera tem uma.",
                    },
                ]}
            >
                <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-text-muted)" }}>
                        BarcodeDetector: <strong>{String(isBarcodeDetectionSupported())}</strong>
                        {formats.length > 0 && ` · formatos do motor: ${formats.join(", ")}`}
                    </p>
                    {scanning ? (
                        <BarcodeScanner
                            formats={["ean_13", "qr_code", "code_128"]}
                            onScan={(result) => setReads((prev) => [result, ...prev].slice(0, 5))}
                            footer={<small>Aponte para um QR ou um código de barras.</small>}
                            unsupported={
                                <p style={{ fontSize: 13, margin: 0 }}>
                                    Sem decodificador nativo aqui. Em produção, este espaço é um
                                    campo para digitar o código — ou um polyfill em{" "}
                                    <code>detector</code>.
                                </p>
                            }
                        />
                    ) : (
                        <Button onClick={() => setScanning(true)}>Abrir o leitor</Button>
                    )}
                    {scanning && (
                        <Button variant="ghost" onClick={() => setScanning(false)}>
                            Fechar (libera a câmera)
                        </Button>
                    )}
                    {reads.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                            {reads.map((read, index) => (
                                <li key={`${read.rawValue}-${index}`}>
                                    <code>{read.format}</code> · {read.rawValue}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Example>

            <Example
                id="screen-capture"
                title="useScreenCapture + useVideoRecorder — gravar a tela"
                note="Três estados importam: você fechar o seletor (rejeição que não é erro), você parar pela barra do navegador (só o evento ended conta isso) e o que foi escolhido de fato. O gravador não é dono do stream: parar a gravação deixa o compartilhamento vivo para a próxima tomada."
                code={`const screen = useScreenCapture({ preferCurrentTab: true, onEnded: () => save() });
const rec = useVideoRecorder(screen.stream, { videoBitsPerSecond: 2_500_000 });

<button onClick={screen.start}>Compartilhar tela</button>
<button disabled={!rec.ready} onClick={rec.start}>Gravar</button>`}
            >
                <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-text-muted)" }}>
                        getDisplayMedia: <strong>{String(screen.supported)}</strong> · container:{" "}
                        <code>{pickVideoMimeType() ?? "nenhum"}</code> · MediaRecorder de vídeo:{" "}
                        <strong>{String(isVideoRecordingSupported())}</strong>
                    </p>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button onClick={screen.start} disabled={screen.status === "sharing"}>
                            Compartilhar tela
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={screen.stop}
                            disabled={screen.status !== "sharing"}
                        >
                            Parar de compartilhar
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={!recorder.ready || recorder.status === "recording"}
                            onClick={recorder.start}
                        >
                            Gravar
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={recorder.status !== "recording"}
                            onClick={() => void recorder.stop()}
                        >
                            Parar a gravação
                        </Button>
                    </div>

                    <p style={{ margin: 0, fontSize: 13 }}>
                        Estado: <strong>{screen.status}</strong>
                        {screen.surface && ` · superfície: ${screen.surface}`}
                        {screen.status === "sharing" &&
                            ` · áudio: ${screen.hasAudio ? "sim" : "não"}`}
                        {recorder.status !== "idle" &&
                            ` · gravação: ${recorder.status} (${(recorder.durationMs / 1000).toFixed(1)} s)`}
                    </p>
                    {note && (
                        <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-text-muted)" }}>
                            {note}
                        </p>
                    )}
                    {screen.error && (
                        <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-danger-fg)" }}>
                            {screen.error.kind}: {screen.error.message}
                        </p>
                    )}

                    <Preview stream={screen.stream} />

                    {recorder.recording && (
                        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                            <span>
                                <code>{recorder.recording.mimeType}</code> ·{" "}
                                {(recorder.recording.blob.size / 1024).toFixed(0)} KB ·{" "}
                                {(recorder.recording.durationMs / 1000).toFixed(1)} s
                            </span>
                            <a
                                href={URL.createObjectURL(recorder.recording.blob)}
                                download="captura"
                            >
                                Baixar a gravação
                            </a>
                        </div>
                    )}
                </div>
            </Example>

            <Example
                id="speech-recognition"
                title="useSpeechRecognition ditando no AIChat"
                note="O Chromium manda o áudio para um servidor do Google para transcrever. Nada na API diz isso e não existe configuração que mude — conte ao usuário antes de embarcar. O AIChat não conhece o hook: o botão dentro do composer escreve no campo via composerRef."
                code={`const composer = useRef<AIChatComposerHandle>(null);
const speech = useSpeechRecognition({
  onFinal: (text) => composer.current?.setValue(\`\${composer.current.getValue()} \${text}\`.trim()),
});

<AIChat
  messages={turns}
  onSend={ask}
  composerRef={composer}
  composerActions={
    <Button
      variant={speech.listening ? "primary" : "soft"}
      onClick={speech.listening ? speech.stop : speech.start}
    >
      {speech.listening ? "Parar" : "Ditar"}
    </Button>
  }
/>`}
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-text-muted)" }}>
                        SpeechRecognition: <strong>{String(isSpeechRecognitionSupported())}</strong>
                        {speech.error && ` · ${speech.error.kind}: ${speech.error.message}`}
                    </p>
                    <div style={{ height: 320 }}>
                        <AIChat
                            messages={turns}
                            composerRef={composer}
                            onSend={(text) => {
                                draft.current = "";
                                speech.reset();
                                setTurns((prev) => [
                                    ...prev,
                                    { id: `u${prev.length}`, role: "user", content: text },
                                    {
                                        id: `a${prev.length}`,
                                        role: "assistant",
                                        content: `Recebi: **${text}**`,
                                    },
                                ]);
                            }}
                            composerActions={
                                <Button
                                    size="sm"
                                    variant={speech.listening ? "primary" : "soft"}
                                    disabled={!speech.supported}
                                    onClick={speech.listening ? speech.stop : speech.start}
                                >
                                    {speech.listening ? "Ouvindo… parar" : "Ditar"}
                                </Button>
                            }
                            composerFooter={
                                <small>
                                    {speech.supported
                                        ? "O áudio ditado sai do dispositivo (servidor do Google)."
                                        : "Este navegador não faz reconhecimento de fala."}
                                </small>
                            }
                        />
                    </div>
                </div>
            </Example>
        </>
    );
}
