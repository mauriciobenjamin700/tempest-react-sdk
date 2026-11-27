import { decodeAudioToPcm } from "@/audio/decode-pcm";

import { assessSpeechDevice, type SpeechDeviceAssessment } from "./device";
import type { Transcription, WhisperModel } from "./whisper";

/**
 * Transcribe on the device when it can keep up, on the server when it cannot.
 */

/** Where a transcription ran. */
export type SpeechSource = "device" | "server";

/** Why the route was chosen. */
export type SpeechRouteReason =
    /** The device ran it within its deadline. */
    | "device"
    /** {@link assessSpeechDevice} ruled the device out (no SIMD, too little memory). */
    | "device-unsupported"
    /** The model was not loaded yet; the server answered while it loads in the background. */
    | "model-not-ready"
    /** The device missed the deadline on this call. It is remembered as slow. */
    | "device-slow"
    /** A previous call found the device slow; the server goes first until the memory expires. */
    | "device-remembered-slow"
    /** Loading or running the model failed. */
    | "device-error"
    /**
     * The device produced a repetition loop instead of a transcript
     * (`Transcription.degenerate`). The server gets a second chance.
     */
    | "device-degenerate"
    /** The server is down or not configured, so the device ran it whatever it costs. */
    | "server-unavailable"
    /** The server failed and the device took over. */
    | "server-error";

/** A finished transcription and the route it took. */
export interface SpeechResult {
    text: string;
    source: SpeechSource;
    reason: SpeechRouteReason;
    /** Details of the on-device run; `null` when the server answered. */
    transcription: Transcription | null;
}

/** Context handed to the server callback. */
export interface SpeechServerContext {
    signal: AbortSignal;
    /** Language asked for, if any. */
    language?: string;
}

/** Options for {@link createSpeechToText}. */
export interface SpeechToTextOptions {
    /** Loads the on-device model, once (usually `() => loadWhisper({ baseUrl })`). */
    loadModel: () => Promise<WhisperModel>;
    /**
     * Transcribe on the server — upload and wait for the text. Omit for
     * device-only. The SDK only calls it; the endpoint, auth and polling are
     * the app's.
     */
    server?: (audio: Blob, context: SpeechServerContext) => Promise<string>;
    /**
     * Whether the server can take a request right now (health check, feature
     * flag, `navigator.onLine`). Default: available whenever `server` is set.
     */
    isServerAvailable?: () => boolean | Promise<boolean>;
    /** Language for both routes. Omit to let Whisper detect it. */
    language?: string;
    /**
     * The device must finish within `audio duration × realtimeFactor`
     * (and never less than `minBudgetMs`) when a server can take over.
     * Default `1`: a 10 s recording gets 10 s. Past it, the run is cancelled,
     * the server answers, and the device is remembered as slow.
     */
    realtimeFactor?: number;
    /** Floor of the deadline. Default `4000` ms, so a 1 s clip is not judged on noise. */
    minBudgetMs?: number;
    /**
     * When the model is not loaded and the server is up: `"background"`
     * (default) answers from the server and starts loading so the next call
     * runs on the device; `"wait"` loads first and answers from the device.
     */
    whileLoading?: "background" | "wait";
    /**
     * Where the "device is slow" verdict is kept between sessions. Default
     * `localStorage`; `null` keeps it in memory only.
     */
    storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
    /** How long a slow verdict holds before the device is tried again. Default 7 days. */
    slowVerdictTtlMs?: number;
    /** Device check. Default {@link assessSpeechDevice}. */
    assessDevice?: () => SpeechDeviceAssessment;
}

/** Options for one {@link SpeechToText.transcribe} call. */
export interface SpeechTranscribeOptions {
    signal?: AbortSignal;
    /** Live text while the device decodes (not called on the server route). */
    onPartial?: (text: string) => void;
}

/** A transcriber that picks the device or the server per call. */
export interface SpeechToText {
    /**
     * Transcribe a recording.
     *
     * @param audio The recording, as the browser recorded it.
     * @param options Cancellation and live text.
     * @returns The text and the route it took.
     * @throws Error when neither route could produce text (the last cause attached).
     */
    transcribe(audio: Blob, options?: SpeechTranscribeOptions): Promise<SpeechResult>;
    /** Start loading the model now (e.g. on Wi-Fi, after the page is idle). */
    warmUp(): Promise<void>;
    /** Forget a remembered "slow" verdict. */
    resetSlowVerdict(): void;
    /** Free the model. */
    release(): Promise<void>;
}

const SLOW_KEY = "tempest-speech-slow-until";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Raised on the device route when its deadline passes. */
class DeadlineError extends Error {}

/** Raised on the device route when the model loops instead of transcribing. */
class DegenerateError extends Error {}

/**
 * Default verdict storage, tolerant of a browser that blocks it.
 *
 * @returns `localStorage`, or `null` when unavailable.
 */
function defaultStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

/**
 * Create a speech-to-text front door that runs Whisper on the user's device and
 * falls back to the app's server when the device cannot keep up.
 *
 * Per call, in order:
 *
 * 1. **Server down or not configured** → the device, whatever it costs, with
 *    no deadline (there is nothing to fall back to).
 * 2. **Device ruled out** ({@link assessSpeechDevice}: no WASM SIMD, too
 *    little memory) or **remembered slow** → the server.
 * 3. **Model not loaded yet** → the server, while the model loads in the
 *    background (`whileLoading: "background"`), so the first recording is not
 *    held behind a 41–77 MB download.
 * 4. Otherwise **the device**, under a deadline of the audio's duration ×
 *    `realtimeFactor`. Missing it cancels the run between decoder steps,
 *    sends the audio to the server and remembers the device as slow for
 *    `slowVerdictTtlMs` — "the device cannot keep up" is measured on this
 *    device, on this model, not guessed from `deviceMemory`.
 *
 * A failure on one route falls through to the other when it is available;
 * the error is thrown only when neither produced text. A device run that
 * "succeeds" with a repetition loop (`Transcription.degenerate`, Whisper's
 * compression-ratio test) counts as a failure when the server can answer.
 *
 * @param options Model loader, server callback and policy.
 * @returns The transcriber.
 *
 * @example
 * ```typescript
 * import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";
 *
 * const speech = createSpeechToText({
 *     loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
 *     server: async (audio, { signal }) => {
 *         const body = new FormData();
 *         body.append("audio", audio);
 *         const response = await fetch("/api/transcribe", { method: "POST", body, signal });
 *         return ((await response.json()) as { text: string }).text;
 *     },
 *     isServerAvailable: () => navigator.onLine,
 *     language: "pt",
 * });
 *
 * async function onRecorded(recording: Blob): Promise<string> {
 *     const result = await speech.transcribe(recording);
 *     console.log(result.source, result.reason);
 *     return result.text;
 * }
 * ```
 */
export function createSpeechToText(options: SpeechToTextOptions): SpeechToText {
    const {
        loadModel,
        server,
        isServerAvailable,
        language,
        realtimeFactor = 1,
        minBudgetMs = 4000,
        whileLoading = "background",
        slowVerdictTtlMs = WEEK_MS,
        assessDevice = assessSpeechDevice,
    } = options;
    const storage = options.storage === undefined ? defaultStorage() : options.storage;
    let slowUntilMemory = 0;
    let model: WhisperModel | null = null;
    let loading: Promise<WhisperModel> | null = null;

    const load = (): Promise<WhisperModel> => {
        loading ??= loadModel().then(
            (loaded) => {
                model = loaded;
                return loaded;
            },
            (error: unknown) => {
                loading = null;
                throw error;
            },
        );
        return loading;
    };

    const slowUntil = (): number => {
        try {
            return Math.max(slowUntilMemory, Number(storage?.getItem(SLOW_KEY) ?? 0) || 0);
        } catch {
            return slowUntilMemory;
        }
    };
    const markSlow = (): void => {
        slowUntilMemory = Date.now() + slowVerdictTtlMs;
        try {
            storage?.setItem(SLOW_KEY, String(slowUntilMemory));
        } catch {
            return;
        }
    };

    const serverUp = async (): Promise<boolean> => {
        if (!server) return false;
        if (!isServerAvailable) return true;
        try {
            return await isServerAvailable();
        } catch {
            return false;
        }
    };

    const runServer = async (
        audio: Blob,
        reason: SpeechRouteReason,
        signal: AbortSignal | undefined,
    ): Promise<SpeechResult> => {
        const controller = new AbortController();
        const forward = (): void => controller.abort(signal?.reason);
        signal?.addEventListener("abort", forward, { once: true });
        try {
            const text = await (server as NonNullable<typeof server>)(audio, {
                signal: controller.signal,
                language,
            });
            return { text, source: "server", reason, transcription: null };
        } finally {
            signal?.removeEventListener("abort", forward);
        }
    };

    const runDevice = async (
        audio: Blob,
        reason: SpeechRouteReason,
        withDeadline: boolean,
        call: SpeechTranscribeOptions,
    ): Promise<SpeechResult> => {
        const loaded = model ?? (await load());
        const pcm = await decodeAudioToPcm(audio, { sampleRate: 16_000, signal: call.signal });
        const controller = new AbortController();
        const forward = (): void => controller.abort(call.signal?.reason);
        call.signal?.addEventListener("abort", forward, { once: true });
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (withDeadline) {
            const audioMs = (pcm.samples.length / 16_000) * 1000;
            const budget = Math.max(minBudgetMs, audioMs * realtimeFactor);
            timer = setTimeout(() => controller.abort(new DeadlineError("deadline")), budget);
        }
        try {
            const transcription = await loaded.transcribe(pcm, {
                language,
                signal: controller.signal,
                onPartial: call.onPartial,
            });
            if (withDeadline && transcription.degenerate) {
                throw new DegenerateError(transcription.text);
            }
            return { text: transcription.text, source: "device", reason, transcription };
        } catch (error) {
            if (controller.signal.reason instanceof DeadlineError) throw controller.signal.reason;
            throw error;
        } finally {
            if (timer !== undefined) clearTimeout(timer);
            call.signal?.removeEventListener("abort", forward);
        }
    };

    return {
        async transcribe(audio, call = {}): Promise<SpeechResult> {
            call.signal?.throwIfAborted();
            const device = assessDevice();
            const up = await serverUp();

            if (!up) {
                if (!device.canRun) {
                    throw new Error(
                        `Speech cannot be transcribed: the server is unavailable and this device ` +
                            `cannot run the model (${device.blockers.join(", ")}).`,
                    );
                }
                return runDevice(audio, "server-unavailable", false, call);
            }

            const fallbackToDevice = async (cause: unknown): Promise<SpeechResult> => {
                if (!device.canRun || call.signal?.aborted) throw cause;
                try {
                    return await runDevice(audio, "server-error", false, call);
                } catch {
                    throw cause;
                }
            };
            const viaServer = async (reason: SpeechRouteReason): Promise<SpeechResult> => {
                try {
                    return await runServer(audio, reason, call.signal);
                } catch (error) {
                    return fallbackToDevice(error);
                }
            };

            if (!device.canRun) return viaServer("device-unsupported");
            if (slowUntil() > Date.now()) return viaServer("device-remembered-slow");
            if (!model && whileLoading === "background") {
                void load().catch(() => undefined);
                return viaServer("model-not-ready");
            }

            try {
                return await runDevice(audio, "device", true, call);
            } catch (error) {
                if (call.signal?.aborted) throw error;
                if (error instanceof DeadlineError) {
                    markSlow();
                    return runServer(audio, "device-slow", call.signal);
                }
                if (error instanceof DegenerateError) {
                    return runServer(audio, "device-degenerate", call.signal);
                }
                return runServer(audio, "device-error", call.signal);
            }
        },
        async warmUp(): Promise<void> {
            await load();
        },
        resetSlowVerdict(): void {
            slowUntilMemory = 0;
            try {
                storage?.removeItem(SLOW_KEY);
            } catch {
                return;
            }
        },
        async release(): Promise<void> {
            const current = model ?? (loading ? await loading.catch(() => null) : null);
            model = null;
            loading = null;
            await current?.release();
        },
    };
}
