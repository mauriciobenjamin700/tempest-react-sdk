import { windowRms } from "./voice-chain-stages";

/** How long the measurement listens by default, in milliseconds. */
const DEFAULT_DURATION_MS = 3000;

/** How often it samples the room, in milliseconds. */
const SAMPLE_MS = 50;

/**
 * Headroom over the measured floor, so ordinary speech clears the gate.
 *
 * A gate set exactly at the noise level chatters, opening and closing on the
 * room's own variation. Ported from `tempest-mirror-screen`'s `voiceChain.ts`,
 * where it was arrived at by listening.
 */
const GATE_MARGIN = 2.4;

/** The narrowest and widest thresholds worth suggesting. */
const GATE_MIN = 0.004;
const GATE_MAX = 0.12;

/** Options for {@link measureNoiseFloor}. */
export interface NoiseFloorOptions {
    /** Called with `0..1` so a dialog can show the wait. */
    onProgress?: (fraction: number) => void;
    /** How long to listen. Default `3000`. */
    durationMs?: number;
    /** Reuse an existing `AudioContext` rather than opening one. */
    context?: AudioContext;
}

/** The `AudioContext` constructor this engine exposes, prefixed or not. */
function audioContextConstructor(): typeof AudioContext | undefined {
    if (typeof AudioContext !== "undefined") return AudioContext;
    return (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/**
 * Listen to a room at rest and report how loud its silence is.
 *
 * The number a person cannot guess. Setting a gate by ear means switching it on
 * and hearing what disappeared, which only works if you already know what should
 * have disappeared — so the usual outcome is leaving it at a default that is
 * wrong for that room. Measuring replaces the guess.
 *
 * The result is the **peak** RMS window observed, not the average: a threshold
 * under the loudest thing the quiet room did will be opened by that thing.
 *
 * @param stream - A live capture of the room while nobody speaks.
 * @param options - See {@link NoiseFloorOptions}.
 * @returns The peak RMS observed, `0..1`. `0` when this engine has no Web Audio
 *   or the stream carries no audio track — which {@link suggestGateThreshold}
 *   turns into its own floor rather than into a gate that never opens.
 *
 * @example
 * const floor = await measureNoiseFloor(stream, { onProgress: setProgress });
 * setThreshold(suggestGateThreshold(floor));
 */
export async function measureNoiseFloor(
    stream: MediaStream,
    {
        onProgress,
        durationMs = DEFAULT_DURATION_MS,
        context: injectedContext,
    }: NoiseFloorOptions = {},
): Promise<number> {
    const Ctor = audioContextConstructor();
    const context = injectedContext ?? (Ctor ? new Ctor() : null);
    const track = stream.getAudioTracks()[0];
    if (!context || !track) return 0;

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let peak = 0;

    await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
            analyser.getFloatTimeDomainData(buffer);
            peak = Math.max(peak, windowRms(buffer));

            const elapsed = performance.now() - started;
            onProgress?.(Math.min(1, elapsed / durationMs));
            if (elapsed < durationMs) return;
            clearInterval(timer);
            resolve();
        }, SAMPLE_MS);
    });

    source.disconnect();
    analyser.disconnect();
    return peak;
}

/**
 * Turn a measured noise floor into a threshold worth using.
 *
 * Sits above the floor by a margin rather than on it, and is clamped at both
 * ends: a room measured as perfectly silent (or not measured at all) would
 * otherwise get a threshold of zero, which is a gate that never closes, and a
 * room measured while somebody talked would get one nothing opens.
 *
 * @param noiseFloor - Peak RMS measured while nobody spoke.
 * @returns A threshold for {@link VoiceChainSettings.gateThreshold}, `0.004..0.12`.
 */
export function suggestGateThreshold(noiseFloor: number): number {
    if (!Number.isFinite(noiseFloor)) return GATE_MIN;
    return Math.min(GATE_MAX, Math.max(GATE_MIN, noiseFloor * GATE_MARGIN));
}
