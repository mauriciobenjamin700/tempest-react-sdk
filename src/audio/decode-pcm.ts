import { resamplePcm } from "./resample";

/**
 * Decode recorded or uploaded audio into the mono PCM a model expects.
 */

/** One channel of samples at a known rate — the input every audio model takes. */
export interface MonoPcm {
    /** Samples in −1…1. */
    samples: Float32Array;
    /** Sample rate in Hz. */
    sampleRate: number;
}

/** Options for {@link decodeAudioToPcm}. */
export interface DecodeAudioOptions {
    /** Target sample rate in Hz. Default `16000`, what Whisper, Silero VAD and YAMNet take. */
    sampleRate?: number;
    /** Abandon the decode; the promise rejects with the signal's reason. */
    signal?: AbortSignal;
}

/**
 * Rate the browser decodes at before our own resampler takes over. 48 kHz is
 * what Opus always decodes to and what most AAC/MP4 recordings carry, so the
 * browser's own resampling step is a no-op for them and, at worst, an
 * up-sampling of a 44.1 kHz file — harmless, since its weak roll-off sits near
 * 24 kHz, far above the 8 kHz that a 16 kHz model can see.
 */
const DECODE_RATE = 48_000;

/** `OfflineAudioContext`, prefixed or not. */
type OfflineContextCtor = new (channels: number, length: number, rate: number) => BaseAudioContext;

/**
 * The offline context constructor this engine exposes.
 *
 * @returns The constructor, or `undefined` outside a browser.
 */
function offlineContext(): OfflineContextCtor | undefined {
    const scope = globalThis as {
        OfflineAudioContext?: OfflineContextCtor;
        webkitOfflineAudioContext?: OfflineContextCtor;
    };
    return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext;
}

/**
 * Average every channel into one.
 *
 * @param buffer The decoded audio.
 * @returns The mono signal.
 */
function downmix(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
    const out = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < out.length; i += 1) out[i] = (out[i] as number) + (data[i] as number);
    }
    for (let i = 0; i < out.length; i += 1) out[i] = (out[i] as number) / buffer.numberOfChannels;
    return out;
}

/**
 * Decode an audio file (webm/opus, mp4/aac, mp3, wav — whatever the browser
 * plays) into mono samples at the rate a model wants.
 *
 * The browser decodes at 48 kHz and the SDK's band-limited resampler
 * ({@link resamplePcm}'s filter) takes it the rest of the way. Letting the
 * browser decode straight into a 16 kHz context would skip a step, but its
 * resampler is weak near the new Nyquist — measured on Chromium 159, it lets
 * a 9 kHz tone through at −20 dB and cuts 7 kHz by −5 dB — and the live
 * microphone path (`createPcmStream`) cannot use it at all. One filter for
 * both paths means a model sees the same spectrum from a file and from the mic.
 *
 * Channels are averaged: `MediaRecorder` on Chromium writes stereo Opus even
 * from a mono microphone, and a speech model wants one channel.
 *
 * @param source The encoded audio.
 * @param options Target rate and cancellation.
 * @returns The decoded signal.
 * @throws When Web Audio is unavailable or the browser cannot decode the format.
 *
 * @example
 * ```typescript
 * import { decodeAudioToPcm } from "tempest-react-sdk";
 *
 * async function prepare(recording: Blob): Promise<Float32Array> {
 *     const pcm = await decodeAudioToPcm(recording, { sampleRate: 16_000 });
 *     console.log(pcm.samples.length / pcm.sampleRate, "seconds");
 *     return pcm.samples;
 * }
 * ```
 */
export async function decodeAudioToPcm(
    source: Blob | ArrayBuffer,
    options: DecodeAudioOptions = {},
): Promise<MonoPcm> {
    const { sampleRate = 16_000, signal } = options;
    signal?.throwIfAborted();
    const Ctor = offlineContext();
    if (!Ctor) throw new Error("Web Audio is not available in this environment.");

    const bytes = source instanceof ArrayBuffer ? source.slice(0) : await source.arrayBuffer();
    signal?.throwIfAborted();
    const decoded = await new Ctor(1, 1, DECODE_RATE).decodeAudioData(bytes);
    signal?.throwIfAborted();

    return {
        samples: resamplePcm(downmix(decoded), decoded.sampleRate, sampleRate),
        sampleRate,
    };
}

/**
 * Cut a signal into fixed-size frames, the file-mode twin of the live
 * `createPcmStream`.
 *
 * The last frame is zero-padded to `frameSize` so every frame has the shape a
 * model's input tensor expects; a signal shorter than one frame still yields
 * one (padded) frame, and an empty signal yields none.
 *
 * @param samples The signal.
 * @param frameSize Samples per frame.
 * @param hopSize Samples between frame starts. Default `frameSize`.
 * @returns The frames, each a new array.
 * @throws RangeError for sizes that are not positive integers.
 *
 * @example
 * ```typescript
 * import { framePcm } from "tempest-react-sdk";
 *
 * const frames = framePcm(new Float32Array(1600), 512);
 * console.log(frames.length); // 4 — the last one padded with zeros
 * ```
 */
export function framePcm(
    samples: Float32Array,
    frameSize: number,
    hopSize: number = frameSize,
): Float32Array[] {
    for (const [name, value] of [
        ["frameSize", frameSize],
        ["hopSize", hopSize],
    ] as const) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new RangeError(`${name} must be a positive integer, got ${value}.`);
        }
    }
    const frames: Float32Array[] = [];
    for (let start = 0; start < samples.length; start += hopSize) {
        const frame = new Float32Array(frameSize);
        frame.set(samples.subarray(start, start + frameSize));
        frames.push(frame);
        if (start + frameSize >= samples.length) break;
    }
    return frames;
}
