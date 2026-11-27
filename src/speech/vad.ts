import type * as ort from "onnxruntime-web";

import type { MonoPcm } from "@/audio/decode-pcm";
import { createPcmStream, type PcmStreamOptions } from "@/audio/pcm-stream";
import { resamplePcm } from "@/audio/resample";
import { configuredOrtAssetPath } from "@/tabular/assets";
import { fetchModelBytes } from "@/tabular/cache";

import { DEFAULT_SPEECH_MODEL_CACHE } from "./whisper";

/**
 * Speech detection with Silero VAD, a 2 MB model that tells speech from noise
 * where an energy threshold cannot.
 */

/** Samples per Silero step at 16 kHz. Ported from silero-vad's `OnnxWrapper.__call__` (`num_samples`). */
export const SILERO_FRAME_SAMPLES = 512;
/** Samples of the previous step prepended to each one at 16 kHz. Ported from `OnnxWrapper.__call__` (`context_size`). */
export const SILERO_CONTEXT_SAMPLES = 64;
/** Probability from which a frame is speech. Ported from silero-vad's `get_speech_timestamps(threshold=0.5)`. */
export const SILERO_DEFAULT_THRESHOLD = 0.5;
/** Shortest speech kept, ms. Ported from `get_speech_timestamps(min_speech_duration_ms=250)`. */
export const SILERO_DEFAULT_MIN_SPEECH_MS = 250;
/** Silence that ends a segment, ms. Ported from `get_speech_timestamps(min_silence_duration_ms=100)`. */
export const SILERO_DEFAULT_MIN_SILENCE_MS = 100;
/** Padding added to each side of a segment, ms. Ported from `get_speech_timestamps(speech_pad_ms=30)`. */
export const SILERO_DEFAULT_PAD_MS = 30;

const SAMPLE_RATE = 16_000;
const STATE_SIZE = 2 * 128;

/**
 * Exit threshold for a given entry threshold, silero-vad's hysteresis.
 * Ported from `get_speech_timestamps`: `neg_threshold = max(threshold - 0.15, 0.01)`.
 *
 * @param threshold Entry threshold.
 * @returns The exit threshold.
 */
export function sileroNegThreshold(threshold: number): number {
    return Math.max(threshold - 0.15, 0.01);
}

/** Options for {@link loadSileroVad}. */
export interface LoadSileroVadOptions {
    /** URL of `silero_vad.onnx` (v5, from `snakers4/silero-vad`). Serve it from your origin. */
    modelUrl: string;
    /** Cache Storage bucket. Default the speech models' bucket. */
    cacheName?: string;
    /** Folder of ONNX Runtime's `.wasm` (see `tempestOrtAssets`). */
    ortAssetsUrl?: string;
}

/** A loaded Silero VAD, stateful across frames like the reference wrapper. */
export interface SileroVad {
    /**
     * Speech probability of the next 32 ms frame. Consecutive calls are one
     * stream: the recurrent state and the 64-sample context carry over, so
     * call {@link SileroVad.reset} between unrelated recordings.
     *
     * @param frame {@link SILERO_FRAME_SAMPLES} samples at 16 kHz.
     * @returns Probability in `[0, 1]`.
     * @throws RangeError for a frame of another length.
     */
    probability(frame: Float32Array): Promise<number>;
    /** Forget the state and context, as for a new recording. */
    reset(): void;
    /** Free the ONNX session. */
    release(): Promise<void>;
}

/**
 * Import ONNX Runtime Web only when a model loads.
 *
 * @returns The runtime.
 * @throws Error naming the missing optional peer.
 */
async function loadRuntime(): Promise<typeof ort> {
    try {
        return (await import("onnxruntime-web")) as typeof ort;
    } catch (error) {
        throw new Error(
            "Silero VAD needs the optional peer dependency: npm install onnxruntime-web.",
            {
                cause: error,
            },
        );
    }
}

/**
 * Load Silero VAD v5.
 *
 * Inputs mirror silero-vad's `OnnxWrapper`: each step feeds the last 64
 * samples of the previous one plus 512 new samples, the `[2, 1, 128]`
 * recurrent state, and the sample rate; the model returns the probability and
 * the next state. Getting the context wrong does not fail — it shifts every
 * probability — which is why the sizes are constants ported from the source.
 *
 * @param options Model URL and caching.
 * @returns The VAD.
 *
 * @example
 * ```typescript
 * import { loadSileroVad } from "tempest-react-sdk/speech";
 *
 * async function isSpeech(frame: Float32Array): Promise<boolean> {
 *     const vad = await loadSileroVad({ modelUrl: "/models/silero_vad.onnx" });
 *     return (await vad.probability(frame)) >= 0.5;
 * }
 * ```
 */
export async function loadSileroVad(options: LoadSileroVadOptions): Promise<SileroVad> {
    const runtime = await loadRuntime();
    const assets = options.ortAssetsUrl ?? configuredOrtAssetPath();
    if (assets !== undefined) {
        runtime.env.wasm.wasmPaths = assets.endsWith("/") ? assets : `${assets}/`;
    }
    const bytes = await fetchModelBytes(options.modelUrl, {
        cacheName: options.cacheName ?? DEFAULT_SPEECH_MODEL_CACHE,
    });
    const session = await runtime.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    return createSileroVad(runtime, session);
}

/**
 * Wrap a Silero session. {@link loadSileroVad} is the public entry; this is
 * the seam the stepping logic is tested through.
 *
 * @param runtime The ONNX Runtime module (for `Tensor`).
 * @param session The session.
 * @returns The VAD.
 */
export function createSileroVad(
    runtime: Pick<typeof ort, "Tensor">,
    session: Pick<ort.InferenceSession, "run" | "release">,
): SileroVad {
    let state = new Float32Array(STATE_SIZE);
    let context = new Float32Array(SILERO_CONTEXT_SAMPLES);
    const rate = new runtime.Tensor("int64", BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);
    let queue: Promise<unknown> = Promise.resolve();

    return {
        probability(frame: Float32Array): Promise<number> {
            if (frame.length !== SILERO_FRAME_SAMPLES) {
                return Promise.reject(
                    new RangeError(
                        `Silero VAD takes ${SILERO_FRAME_SAMPLES} samples, got ${frame.length}.`,
                    ),
                );
            }
            const step = queue.then(async () => {
                const input = new Float32Array(SILERO_CONTEXT_SAMPLES + SILERO_FRAME_SAMPLES);
                input.set(context, 0);
                input.set(frame, SILERO_CONTEXT_SAMPLES);
                const result = await session.run({
                    input: new runtime.Tensor("float32", input, [1, input.length]),
                    state: new runtime.Tensor("float32", state, [2, 1, 128]),
                    sr: rate,
                });
                state = new Float32Array((result.stateN as ort.Tensor).data as Float32Array);
                context = input.slice(input.length - SILERO_CONTEXT_SAMPLES);
                return ((result.output as ort.Tensor).data as Float32Array)[0] as number;
            });
            queue = step.catch(() => undefined);
            return step;
        },
        reset(): void {
            state = new Float32Array(STATE_SIZE);
            context = new Float32Array(SILERO_CONTEXT_SAMPLES);
        },
        release: () => session.release(),
    };
}

/** A stretch of speech. */
export interface SpeechSegment {
    startMs: number;
    endMs: number;
}

/** Segmentation options shared by {@link detectSpeechSegments} and {@link createSpeechDetector}. */
export interface SpeechSegmentationOptions {
    /** Entry threshold. Default {@link SILERO_DEFAULT_THRESHOLD}. */
    threshold?: number;
    /** Exit threshold. Default {@link sileroNegThreshold} of `threshold`. */
    negThreshold?: number;
    /** Shortest speech kept. Default {@link SILERO_DEFAULT_MIN_SPEECH_MS}. */
    minSpeechMs?: number;
    /** Silence that ends speech. Default {@link SILERO_DEFAULT_MIN_SILENCE_MS}. */
    minSilenceMs?: number;
}

/**
 * Find the speech in a recording — to trim silence before uploading, or before
 * transcribing.
 *
 * The segmentation follows silero-vad's `get_speech_timestamps`: speech starts
 * when the probability reaches `threshold`, ends after `minSilenceMs` below
 * `negThreshold`, segments shorter than `minSpeechMs` are dropped, and each
 * kept one is padded by `padMs` on both sides (without overlapping its
 * neighbour). Long-speech splitting (`max_speech_duration_s`) is not ported:
 * its default is "never".
 *
 * @param audio Mono PCM — at 16 kHz as a bare `Float32Array`, at any rate as `MonoPcm`.
 * @param vad A loaded VAD; it is reset before and after.
 * @param options Thresholds, durations and padding.
 * @returns The segments, in order.
 *
 * @example
 * ```typescript
 * import { decodeAudioToPcm } from "tempest-react-sdk";
 * import { detectSpeechSegments, loadSileroVad } from "tempest-react-sdk/speech";
 *
 * async function speechOnly(recording: Blob): Promise<number> {
 *     const vad = await loadSileroVad({ modelUrl: "/models/silero_vad.onnx" });
 *     const pcm = await decodeAudioToPcm(recording);
 *     const segments = await detectSpeechSegments(pcm, vad);
 *     return segments.reduce((total, s) => total + s.endMs - s.startMs, 0);
 * }
 * ```
 */
export async function detectSpeechSegments(
    audio: Float32Array | MonoPcm,
    vad: SileroVad,
    options: SpeechSegmentationOptions & { padMs?: number } = {},
): Promise<SpeechSegment[]> {
    const samples =
        audio instanceof Float32Array
            ? audio
            : audio.sampleRate === SAMPLE_RATE
              ? audio.samples
              : resamplePcm(audio.samples, audio.sampleRate, SAMPLE_RATE);
    const threshold = options.threshold ?? SILERO_DEFAULT_THRESHOLD;
    const negThreshold = options.negThreshold ?? sileroNegThreshold(threshold);
    const minSpeech = ((options.minSpeechMs ?? SILERO_DEFAULT_MIN_SPEECH_MS) * SAMPLE_RATE) / 1000;
    const minSilence =
        ((options.minSilenceMs ?? SILERO_DEFAULT_MIN_SILENCE_MS) * SAMPLE_RATE) / 1000;
    const pad = ((options.padMs ?? SILERO_DEFAULT_PAD_MS) * SAMPLE_RATE) / 1000;

    vad.reset();
    const raw: { start: number; end: number }[] = [];
    let start = -1;
    let silenceFrom = -1;
    for (let at = 0; at < samples.length; at += SILERO_FRAME_SAMPLES) {
        const frame = new Float32Array(SILERO_FRAME_SAMPLES);
        frame.set(samples.subarray(at, at + SILERO_FRAME_SAMPLES));
        const probability = await vad.probability(frame);
        if (probability >= threshold) {
            silenceFrom = -1;
            if (start === -1) start = at;
            continue;
        }
        if (start === -1 || probability >= negThreshold) continue;
        if (silenceFrom === -1) silenceFrom = at;
        if (at - silenceFrom < minSilence) continue;
        if (silenceFrom - start > minSpeech) raw.push({ start, end: silenceFrom });
        start = -1;
        silenceFrom = -1;
    }
    if (start !== -1 && samples.length - start > minSpeech)
        raw.push({ start, end: samples.length });
    vad.reset();

    return raw.map((segment, index) => {
        const previous = raw[index - 1];
        const next = raw[index + 1];
        const from = Math.max(
            0,
            segment.start - pad,
            previous ? (previous.end + segment.start) / 2 : 0,
        );
        const to = Math.min(
            samples.length,
            segment.end + pad,
            next ? (segment.end + next.start) / 2 : samples.length,
        );
        return { startMs: (from / SAMPLE_RATE) * 1000, endMs: (to / SAMPLE_RATE) * 1000 };
    });
}

/** Options for {@link createSpeechDetector}. */
export interface SpeechDetectorOptions extends SpeechSegmentationOptions {
    /** A loaded VAD. */
    vad: SileroVad;
    /** Passed to `createPcmStream` (context, CSP-safe `workletUrl`). */
    stream?: Pick<PcmStreamOptions, "context" | "workletUrl">;
    /** Every frame's probability, for a meter or for tuning the threshold. */
    onProbability?: (probability: number) => void;
}

/** A running detector; the same shape as `monitorVoiceActivity`'s monitor. */
export interface SpeechDetector {
    /** Whether the input is carrying speech now. */
    readonly speaking: boolean;
    /** Stop listening and free the audio graph (not the VAD, which the caller owns). */
    stop(): void;
}

/**
 * Tell, live, when someone starts and stops speaking — with a model instead of
 * an energy threshold.
 *
 * The same `{ speaking, stop }` shape and `onChange(speaking)` callback as
 * `monitorVoiceActivity`, so a consumer swaps one for the other. Frames come
 * from `createPcmStream` (AudioWorklet, 16 kHz, 512 samples); `speaking` turns
 * on at `threshold` and off after `minSilenceMs` below `negThreshold`, with no
 * `minSpeechMs` filter on the live path — a one-word answer must still open it.
 *
 * Typical use: stop a voice search on its own ~1 s after the user stops talking
 * (`minSilenceMs: 1000`), instead of waiting for the button or the time limit.
 *
 * @param source The microphone (track, stream) or a node already in a graph.
 * @param onChange Called when speech starts (`true`) and ends (`false`).
 * @param options The VAD and the thresholds.
 * @returns The running detector.
 *
 * @example
 * ```typescript
 * import { createSpeechDetector, loadSileroVad } from "tempest-react-sdk/speech";
 *
 * async function waitUntilQuiet(mic: MediaStream): Promise<void> {
 *     const vad = await loadSileroVad({ modelUrl: "/models/silero_vad.onnx" });
 *     let quiet = (): void => undefined;
 *     const ended = new Promise<void>((resolve) => (quiet = resolve));
 *     let spoke = false;
 *     const detector = await createSpeechDetector(
 *         mic,
 *         (speaking) => {
 *             if (speaking) spoke = true;
 *             else if (spoke) quiet();
 *         },
 *         { vad, minSilenceMs: 1000 },
 *     );
 *     await ended;
 *     detector.stop();
 * }
 * ```
 */
export async function createSpeechDetector(
    source: MediaStreamTrack | MediaStream | AudioNode,
    onChange: (speaking: boolean) => void,
    options: SpeechDetectorOptions,
): Promise<SpeechDetector> {
    const { vad, onProbability } = options;
    const threshold = options.threshold ?? SILERO_DEFAULT_THRESHOLD;
    const negThreshold = options.negThreshold ?? sileroNegThreshold(threshold);
    const minSilenceMs = options.minSilenceMs ?? SILERO_DEFAULT_MIN_SILENCE_MS;
    let speaking = false;
    let silentMs = 0;
    let stopped = false;
    vad.reset();

    const stream = await createPcmStream(source, {
        ...options.stream,
        sampleRate: SAMPLE_RATE,
        frameSize: SILERO_FRAME_SAMPLES,
        onFrame: (frame) => {
            void vad.probability(frame).then(
                (probability) => {
                    if (stopped) return;
                    onProbability?.(probability);
                    if (probability >= threshold) {
                        silentMs = 0;
                        if (!speaking) {
                            speaking = true;
                            onChange(true);
                        }
                        return;
                    }
                    if (!speaking || probability >= negThreshold) return;
                    silentMs += (SILERO_FRAME_SAMPLES / SAMPLE_RATE) * 1000;
                    if (silentMs >= minSilenceMs) {
                        speaking = false;
                        silentMs = 0;
                        onChange(false);
                    }
                },
                () => undefined,
            );
        },
    });

    return {
        get speaking(): boolean {
            return speaking;
        },
        stop(): void {
            if (stopped) return;
            stopped = true;
            stream.release();
            vad.reset();
        },
    };
}
