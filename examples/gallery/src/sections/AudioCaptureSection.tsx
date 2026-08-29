import { useState } from "react";
import {
    AudioPlayer,
    AudioRecorder,
    isAudioOutputSelectionSupported,
    useMediaDevices,
    useMediaPermission,
    type AudioRecording,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Demo of the audio capture surface.
 *
 * The recorder is live: it really opens the microphone, so the permission prompt, the
 * level meter and the clock are the real ones. Nothing here is faked — a mocked
 * recorder would hide exactly the states worth looking at (denied permission, a muted
 * input reading zero level, a device unplugged mid-take).
 */
export function AudioCaptureSection() {
    const [last, setLast] = useState<AudioRecording | null>(null);
    const [wav, setWav] = useState<AudioRecording | null>(null);
    const permission = useMediaPermission("microphone");
    const { audioInputs, audioOutputs, labelsAvailable } = useMediaDevices();
    const [sinkId, setSinkId] = useState("");
    const outputSupported = isAudioOutputSelectionSupported();

    return (
        <section className="gallery-section" id="audio-capture">
            <h3>Áudio (gravação)</h3>
            <Example
                id="audio-recorder"
                title="AudioRecorder — nota de voz completa"
                note="Grava de verdade. Toque em Gravar para ver o prompt real, o medidor de nível e o relógio; pause, pare e ouça a revisão. O microfone só é pedido no primeiro toque, nunca no mount."
                code={`import { AudioRecorder } from "tempest-react-sdk";

<AudioRecorder
  maxDurationMs={30_000}
  onRecorded={({ blob, mimeType, durationMs }) => upload(blob, mimeType, durationMs)}
  footer={<small>Máximo 30 s.</small>}
/>`}
                props={[
                    {
                        name: "onRecorded",
                        type: "(recording: AudioRecording) => void",
                        description:
                            "Recebe { blob, mimeType, durationMs }. Não dispara em cancel.",
                    },
                    {
                        name: "maxDurationMs",
                        type: "number",
                        description: "Para sozinho no limite. Sempre vale setar em tela pública.",
                    },
                    {
                        name: "format",
                        type: '"native" | "wav"',
                        default: '"native"',
                        description: "`wav` converte no stop, sem dependência. ~10× os bytes.",
                    },
                    {
                        name: "deviceId",
                        type: "string",
                        description: "Microfone específico, de useMediaDevices().audioInputs.",
                    },
                    {
                        name: "review",
                        type: "boolean",
                        default: "true",
                        description: "Player de revisão antes de entregar o áudio.",
                    },
                ]}
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <AudioRecorder
                        maxDurationMs={30_000}
                        onRecorded={setLast}
                        footer={<small>Máximo 30 s.</small>}
                    />
                    {last && (
                        <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-text-muted)" }}>
                            Último: <code>{last.mimeType}</code> ·{" "}
                            {(last.blob.size / 1024).toFixed(1)} KB ·{" "}
                            {(last.durationMs / 1000).toFixed(1)} s
                        </p>
                    )}
                </div>
            </Example>

            <Example
                id="audio-recorder-wav"
                title="O mesmo gravador entregando WAV"
                note="MediaRecorder não produz WAV em nenhum navegador. Com format=wav o SDK decodifica com o decoder do próprio browser e reencoda RIFF/PCM 16-bit — zero dependência. Compare o tamanho com o exemplo acima."
                code={`<AudioRecorder
  format="wav"
  wavOptions={{ mono: true, sampleRate: 16000 }}
  onRecorded={({ blob }) => upload(blob)}
/>`}
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <AudioRecorder
                        format="wav"
                        wavOptions={{ mono: true, sampleRate: 16000 }}
                        maxDurationMs={15_000}
                        onRecorded={setWav}
                        footer={<small>WAV mono 16 kHz — o que um speech-to-text quer.</small>}
                    />
                    {wav && (
                        <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-text-muted)" }}>
                            <code>{wav.mimeType}</code> · {(wav.blob.size / 1024).toFixed(1)} KB
                        </p>
                    )}
                </div>
            </Example>

            <Example
                id="audio-player"
                title="AudioPlayer — transporte pra um clipe"
                note="Aceita Blob direto. Sem durationMs uma gravação nova mostra --:-- até o contorno resolver, porque o WebM do MediaRecorder não traz duração no header."
                code={`<AudioPlayer src={recording.blob} durationMs={recording.durationMs} />`}
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <AudioPlayer
                        src={last?.blob ?? null}
                        durationMs={last?.durationMs}
                        sinkId={sinkId || undefined}
                        actions={
                            last && (
                                <a
                                    href={URL.createObjectURL(last.blob)}
                                    download="nota"
                                    style={{ fontSize: 12 }}
                                >
                                    Baixar
                                </a>
                            )
                        }
                    />
                    {!last && (
                        <p style={{ margin: 0, fontSize: 13, color: "var(--tempest-text-muted)" }}>
                            Grave algo acima para o player receber um blob.
                        </p>
                    )}
                </div>
            </Example>

            <Example
                id="audio-devices"
                title="Permissão e dispositivos"
                note="O estado da permissão é lido sem disparar o prompt. Os nomes dos dispositivos só aparecem depois que uma captura foi liberada — antes disso a lista é real mas anônima."
                code={`const { state } = useMediaPermission("microphone");
const { audioInputs, audioOutputs, labelsAvailable } = useMediaDevices();

if (!isAudioOutputSelectionSupported()) {
  // Safari e Firefox não implementam setSinkId — não ofereça o seletor.
}`}
            >
                <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <p style={{ margin: 0 }}>
                        Permissão do microfone: <strong>{permission.state}</strong>{" "}
                        {permission.supported ? "" : "(Permissions API não respondeu)"}
                    </p>
                    <p style={{ margin: 0 }}>
                        Nomes disponíveis: <strong>{labelsAvailable ? "sim" : "não"}</strong>
                    </p>
                    <p style={{ margin: 0 }}>
                        Microfones: {audioInputs.length} · Saídas: {audioOutputs.length}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {audioInputs.map((device) => (
                            <li key={device.deviceId}>
                                {device.label || <em>(sem nome até liberar o microfone)</em>}
                            </li>
                        ))}
                    </ul>

                    <label style={{ display: "grid", gap: 4, maxWidth: 320 }}>
                        <span>
                            Saída de som {outputSupported ? "" : "— não suportada neste navegador"}
                        </span>
                        <select
                            value={sinkId}
                            disabled={!outputSupported || audioOutputs.length === 0}
                            onChange={(event) => setSinkId(event.target.value)}
                        >
                            <option value="">Padrão do sistema</option>
                            {audioOutputs.map((device) => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || device.deviceId}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </Example>
        </section>
    );
}
