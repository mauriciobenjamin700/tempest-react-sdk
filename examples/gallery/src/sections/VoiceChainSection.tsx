import { useEffect, useRef, useState } from "react";
import {
    createLevelMeter,
    createVoiceChain,
    DEFAULT_VOICE_CHAIN,
    isVoiceChainIdle,
    measureNoiseFloor,
    monitorVoiceChain,
    suggestGateThreshold,
    Slider,
    useMicrophone,
    type VoiceChain,
    type VoiceChainSettings,
    type VoiceMonitor,
} from "tempest-react-sdk";
import { Example } from "../Example";

/** The toggles, in the order the signal passes through them. */
const STAGES: { key: keyof VoiceChainSettings; label: string; removes: string }[] = [
    { key: "highPass", label: "High-pass 85 Hz", removes: "ventilador, trânsito, plosiva" },
    { key: "gate", label: "Gate", removes: "ruído de sala entre frases" },
    { key: "compressor", label: "Compressor 3:1", removes: "sussurro contra grito" },
    { key: "presence", label: "Presença +3 dB", removes: "palavra que não se entende" },
    { key: "hissCut", label: "Corte de hiss", removes: "chiado de mic barato" },
    { key: "deEsser", label: "De-esser", removes: "S e CH que doem" },
    { key: "limiter", label: "Limiter −1 dBFS", removes: "clipping digital" },
];

/**
 * Demo of the microphone processing chain.
 *
 * The microphone is real, so the level meter reads the processed track and the
 * calibration listens to the actual room. Faking it would hide the two things
 * worth seeing: what a gate set below your room's noise floor does to speech,
 * and how far the measured floor sits from the default threshold.
 */
export function VoiceChainSection() {
    const mic = useMicrophone();
    const [settings, setSettings] = useState<VoiceChainSettings>({ ...DEFAULT_VOICE_CHAIN });
    const [gain, setGain] = useState(1);
    const [floor, setFloor] = useState<number | null>(null);
    const [progress, setProgress] = useState(0);
    const [monitoring, setMonitoring] = useState(false);
    const [level, setLevel] = useState(0);

    const chainRef = useRef<VoiceChain | null>(null);
    const monitorRef = useRef<VoiceMonitor | null>(null);
    const barRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const track = mic.stream?.getAudioTracks()[0];
        if (!track) return;

        const chain = createVoiceChain(track, settings, { gain, ownsSource: false });
        chainRef.current = chain;
        const meter = createLevelMeter(new MediaStream([chain.track]));

        let frame = 0;
        const tick = (): void => {
            setLevel(meter.level());
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frame);
            meter.stop();
            chain.release();
            chainRef.current = null;
        };
    }, [mic.stream, settings, gain]);

    useEffect(() => {
        if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, level * 3)})`;
    }, [level]);

    useEffect(() => () => monitorRef.current?.stop(), []);

    async function calibrate(): Promise<void> {
        if (!mic.stream) return;
        setProgress(0);
        const measured = await measureNoiseFloor(mic.stream, { onProgress: setProgress });
        setFloor(measured);
        setSettings((current) => ({
            ...current,
            gate: true,
            gateThreshold: suggestGateThreshold(measured),
        }));
    }

    function toggleMonitor(): void {
        const track = mic.stream?.getAudioTracks()[0];
        if (!track) return;
        if (monitorRef.current) {
            monitorRef.current.stop();
            monitorRef.current = null;
            setMonitoring(false);
            return;
        }
        monitorRef.current = monitorVoiceChain(track, settings, { gain });
        setMonitoring(true);
    }

    return (
        <section className="gallery-section" id="voice-chain">
            <h3>Cadeia de voz (entrada do microfone)</h3>
            <p className="description">
                O que sai do seu microfone, estágio por estágio. Microfone real: o medidor lê o
                track <em>processado</em> e a calibração ouve a sua sala.
            </p>

            <Example
                title="createVoiceChain — estágios, calibração e monitor"
                note="Ligue o microfone, calibre com a sala em silêncio e alterne os estágios. O monitor devolve a sua voz processada — use fone, ou a caixa alimenta o mic."
                code={`const floor = await measureNoiseFloor(stream, { onProgress: setProgress });

const chain = createVoiceChain(
  micTrack,
  { ...DEFAULT_VOICE_CHAIN, gate: true, gateThreshold: suggestGateThreshold(floor) },
  { gain: 1.4 },
);

await peer.setLocalTrack(chain.track);
chain.release();`}
            >
                <div className="gallery-toolbar" style={{ marginBottom: 16 }}>
                    <button onClick={() => void mic.start()} disabled={Boolean(mic.stream)}>
                        {mic.stream ? "Microfone ligado" : "Ligar microfone"}
                    </button>
                    <button onClick={() => void calibrate()} disabled={!mic.stream}>
                        Calibrar sala (3 s)
                    </button>
                    <button onClick={toggleMonitor} disabled={!mic.stream}>
                        {monitoring ? "Parar monitor" : "Ouvir a si mesmo"}
                    </button>
                </div>

                <div
                    style={{
                        height: 8,
                        background: "var(--tempest-surface)",
                        borderRadius: 4,
                        overflow: "hidden",
                        marginBottom: 16,
                    }}
                >
                    <div
                        ref={barRef}
                        style={{
                            height: "100%",
                            background: "var(--tempest-primary)",
                            transformOrigin: "left",
                            transform: "scaleX(0)",
                        }}
                    />
                </div>

                <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                    {STAGES.map((stage) => (
                        <label key={stage.key} style={{ display: "flex", gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={Boolean(settings[stage.key])}
                                onChange={(event) =>
                                    setSettings((current) => ({
                                        ...current,
                                        [stage.key]: event.target.checked,
                                    }))
                                }
                            />
                            <span>
                                <strong>{stage.label}</strong> — some com {stage.removes}
                            </span>
                        </label>
                    ))}
                </div>

                <Slider
                    label={`Ganho de saída — ${gain.toFixed(2)}×`}
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={gain}
                    onChange={setGain}
                />
                <Slider
                    label={`Limiar do gate — ${settings.gateThreshold.toFixed(3)}`}
                    min={0.004}
                    max={0.12}
                    step={0.002}
                    value={settings.gateThreshold}
                    onChange={(value) =>
                        setSettings((current) => ({ ...current, gateThreshold: value }))
                    }
                />

                <p className="description" style={{ marginTop: 12 }}>
                    {floor === null
                        ? progress > 0
                            ? `Ouvindo a sala… ${Math.round(progress * 100)}%`
                            : "Piso de ruído ainda não medido."
                        : `Piso medido: ${floor.toFixed(4)} — limiar sugerido ${suggestGateThreshold(floor).toFixed(3)}.`}{" "}
                    {isVoiceChainIdle(settings, gain)
                        ? "Cadeia ociosa: nenhum nó é construído e o track sai como entrou."
                        : "Cadeia ativa."}
                </p>
            </Example>
        </section>
    );
}
