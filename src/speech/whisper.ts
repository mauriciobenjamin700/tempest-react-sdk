import { zlibSync } from "fflate";
import type * as ort from "onnxruntime-web";

import { decodeAudioToPcm, type MonoPcm } from "@/audio/decode-pcm";
import { WHISPER_LOG_MEL_80, logMelSpectrogram } from "@/audio/log-mel";
import { resamplePcm } from "@/audio/resample";
import { fetchModelBytes } from "@/tabular/cache";

import {
    createWhisperTokenizer,
    type WhisperTokenizer,
    type WhisperTokenizerJson,
} from "./tokenizer";

/**
 * Whisper speech-to-text on the user's device, on ONNX Runtime Web.
 */

/** Weight precision of the exported model files. */
export type WhisperDtype = "fp32" | "fp16" | "int8" | "q4";

/** Cache Storage bucket for speech models unless the caller names one. */
export const DEFAULT_SPEECH_MODEL_CACHE = "tempest-speech-models";

const SAMPLE_RATE = 16_000;

/** Prompt tokens kept: half of the decoder's 448-token context, minus `<|startofprev|>`. */
const PROMPT_TOKENS = 223;

/**
 * Above this gzip compression ratio the text is a repetition loop, not speech.
 * Ported from openai-whisper's `transcribe(compression_ratio_threshold=2.4)`.
 */
export const WHISPER_COMPRESSION_RATIO_THRESHOLD = 2.4;

/**
 * Compression ratio of a transcript, Whisper's hallucination detector:
 * `len(utf8) / len(zlib(utf8))`. Real speech compresses about 1.2–1.8×; a
 * decoder stuck repeating one token compresses far more.
 *
 * @param text The transcript.
 * @returns The ratio (`0` for empty text).
 */
export function compressionRatio(text: string): number {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length === 0) return 0;
    return bytes.length / zlibSync(bytes).length;
}
const WINDOW_SAMPLES = 30 * SAMPLE_RATE;

/** Download progress across every file of a model. */
export interface WhisperLoadProgress {
    /** File being downloaded, e.g. `"onnx/encoder_model_int8.onnx"`. */
    file: string;
    loaded: number;
    /** `null` when the server sends no `Content-Length`. */
    total: number | null;
}

/** Options for {@link loadWhisper}. */
export interface LoadWhisperOptions {
    /**
     * Folder with a Hugging Face ONNX export of Whisper (the
     * `onnx-community/whisper-*` layout): `config.json`,
     * `generation_config.json`, `tokenizer.json` and
     * `onnx/{encoder_model,decoder_model_merged}[_dtype].onnx`. Serve it from
     * your own origin in production.
     */
    baseUrl: string;
    /** Which weight files to load. Default `"int8"` (whisper-tiny: 41 MB, whisper-base: 77 MB). */
    dtype?: WhisperDtype;
    /**
     * ONNX Runtime execution providers, in preference order. Default
     * `["wasm"]`: the int8 export is built from integer ops the WebGPU
     * backend hands back to the CPU one node at a time.
     */
    providers?: readonly string[];
    /** Cache Storage bucket. Default {@link DEFAULT_SPEECH_MODEL_CACHE}. */
    cacheName?: string;
    /** Download progress, per file. */
    onProgress?: (progress: WhisperLoadProgress) => void;
}

/** Options for one {@link WhisperModel.transcribe} call. */
export interface TranscribeOptions {
    /**
     * ISO code of the spoken language (`"pt"`, `"en"` …). Omitted: detected
     * from the first 30 s, at the cost of one extra decoder step.
     */
    language?: string;
    /** `"translate"` outputs English. Default `"transcribe"`. */
    task?: "transcribe" | "translate";
    /**
     * Words the audio is likely to contain — place names, product names,
     * jargon — written the way they should come out: `"Picos, Sobral,
     * Teresina"`. Whisper reads it as text that came before the recording
     * (`<|startofprev|>`, openai-whisper's `initial_prompt`) and leans towards
     * those spellings. Keep it short and relevant: on silence or noise the
     * model may echo it. Truncated to the last 223 tokens, half the decoder's
     * context, as Whisper does.
     */
    prompt?: string;
    /**
     * Tokens per 30 s window before giving up. Default `224` — half the
     * decoder's context, Whisper's own default, and what stops a model stuck
     * repeating itself.
     */
    maxNewTokens?: number;
    /** Stops between decoder steps; the promise rejects with the reason. */
    signal?: AbortSignal;
    /** Called with the text so far after every token, for a live caption. */
    onPartial?: (text: string) => void;
}

/** Where the time of a transcription went, in milliseconds. */
export interface TranscriptionTimings {
    /** Decoding the input file and resampling (0 for PCM already at 16 kHz). */
    decodeMs: number;
    /** Log-mel spectrogram. */
    featuresMs: number;
    /** Encoder forward passes. */
    encoderMs: number;
    /** All decoder steps. */
    decoderMs: number;
    totalMs: number;
}

/** A finished transcription. */
export interface Transcription {
    text: string;
    /** Language code used (given or detected). */
    language: string;
    /** Generated token ids, specials excluded. */
    tokens: readonly number[];
    /** Duration of the input audio. */
    audioMs: number;
    timings: TranscriptionTimings;
    /** {@link compressionRatio} of `text`. */
    compressionRatio: number;
    /**
     * The text looks like a repetition loop (ratio above
     * {@link WHISPER_COMPRESSION_RATIO_THRESHOLD}) or the decoder hit
     * `maxNewTokens` without ending. Measured on Chromium 159 with WebGPU in
     * a headless environment: whisper-tiny fp16 "finished" with "Wars!!!!…"
     * for 224 tokens. A run like that is a failure, not a transcript;
     * `createSpeechToText` sends it to the server.
     */
    degenerate: boolean;
}

/** A loaded Whisper model. */
export interface WhisperModel {
    /**
     * Transcribe audio. Longer than 30 s is processed in consecutive 30 s
     * windows and joined.
     *
     * @param audio A recording (`Blob`), or mono PCM — at 16 kHz as a bare
     *   `Float32Array`, at any rate as `MonoPcm`.
     * @param options Language, task, limits, cancellation.
     * @returns The text and where the time went.
     */
    transcribe(
        audio: Blob | MonoPcm | Float32Array,
        options?: TranscribeOptions,
    ): Promise<Transcription>;
    /** Free both ONNX sessions. */
    release(): Promise<void>;
    readonly dtype: WhisperDtype;
    readonly providers: readonly string[];
}

/** The `config.json` fields read here. */
interface WhisperConfig {
    decoder_layers: number;
    decoder_attention_heads: number;
    d_model: number;
    num_mel_bins: number;
}

/** The `generation_config.json` fields read here. */
interface WhisperGenerationConfig {
    decoder_start_token_id: number;
    eos_token_id: number;
    no_timestamps_token_id: number;
    lang_to_id: Record<string, number>;
    task_to_id: Record<string, number>;
    suppress_tokens: number[];
    begin_suppress_tokens: number[];
}

/**
 * Import ONNX Runtime Web only when a model is loaded, so the subpath can be
 * imported (and `assessSpeechDevice` called) without the peer installed.
 *
 * @returns The runtime.
 * @throws Error naming the missing optional peer.
 */
async function loadRuntime(): Promise<typeof ort> {
    try {
        return (await import("onnxruntime-web")) as typeof ort;
    } catch (error) {
        throw new Error(
            "Whisper needs the optional peer dependency: npm install onnxruntime-web.",
            { cause: error },
        );
    }
}

/**
 * Elapsed milliseconds since `start`.
 *
 * @param start A `performance.now()` value.
 * @returns The difference.
 */
function since(start: number): number {
    return performance.now() - start;
}

/**
 * Load a Whisper model for on-device transcription.
 *
 * Built on `onnxruntime-web` directly rather than `@huggingface/transformers`:
 * that package pins its own pre-release `onnxruntime-web`
 * (`1.31.0-dev.20260914` in 4.3.2), which would put a second ONNX runtime in an
 * app that already uses `/vision` or `/tabular`, and lists `onnxruntime-node`
 * and `sharp` as dependencies, native binaries downloaded into a browser app.
 * What transcription needs from it — greedy decoding with a KV cache and the
 * BPE *decode* — is the code below.
 *
 * Files go through Cache Storage, so the second load works offline.
 * Measured on a desktop (Node 24, WASM, 4 threads, whisper-tiny int8, 11 s
 * of English): load 473 ms, features 105 ms, encoder 377 ms, 24 tokens
 * decoded in 318 ms, transcript word-for-word.
 *
 * @param options Where the model is and how to run it.
 * @returns The model.
 * @throws Error when `onnxruntime-web` is missing; `ModelFetchError` when a file
 *   is neither cached nor reachable.
 *
 * @example
 * ```typescript
 * import { loadWhisper } from "tempest-react-sdk/speech";
 *
 * async function transcribe(recording: Blob): Promise<string> {
 *     const whisper = await loadWhisper({
 *         baseUrl: "/models/whisper-base",
 *         onProgress: ({ file, loaded, total }) => console.log(file, loaded, total),
 *     });
 *     const result = await whisper.transcribe(recording, { language: "pt" });
 *     return result.text;
 * }
 * ```
 */
export async function loadWhisper(options: LoadWhisperOptions): Promise<WhisperModel> {
    const dtype = options.dtype ?? "int8";
    const providers = options.providers ?? ["wasm"];
    const cacheName = options.cacheName ?? DEFAULT_SPEECH_MODEL_CACHE;
    const base = options.baseUrl.replace(/\/+$/, "");
    const runtime = await loadRuntime();

    const fetchFile = (file: string): Promise<Uint8Array> =>
        fetchModelBytes(`${base}/${file}`, {
            cacheName,
            onProgress: options.onProgress
                ? (loaded, total) => options.onProgress?.({ file, loaded, total })
                : undefined,
        });
    const fetchJson = async <T>(file: string): Promise<T> =>
        JSON.parse(new TextDecoder().decode(await fetchFile(file))) as T;

    const suffix = dtype === "fp32" ? "" : `_${dtype}`;
    const [config, generation, tokenizerJson, encoderBytes, decoderBytes] = await Promise.all([
        fetchJson<WhisperConfig>("config.json"),
        fetchJson<WhisperGenerationConfig>("generation_config.json"),
        fetchJson<WhisperTokenizerJson>("tokenizer.json"),
        fetchFile(`onnx/encoder_model${suffix}.onnx`),
        fetchFile(`onnx/decoder_model_merged${suffix}.onnx`),
    ]);
    const sessionOptions = {
        executionProviders: [...providers],
    } as ort.InferenceSession.SessionOptions;
    const encoder = await runtime.InferenceSession.create(encoderBytes, sessionOptions);
    const decoder = await runtime.InferenceSession.create(decoderBytes, sessionOptions);
    return createWhisperModel({
        runtime,
        encoder,
        decoder,
        config,
        generation,
        tokenizer: createWhisperTokenizer(tokenizerJson),
        dtype,
        providers,
    });
}

/** Everything {@link createWhisperModel} runs on; split out so tests can pass fakes. */
export interface WhisperParts {
    runtime: Pick<typeof ort, "Tensor">;
    encoder: Pick<ort.InferenceSession, "run" | "release">;
    decoder: Pick<ort.InferenceSession, "run" | "release">;
    config: WhisperConfig;
    generation: WhisperGenerationConfig;
    tokenizer: WhisperTokenizer;
    dtype: WhisperDtype;
    providers: readonly string[];
}

/**
 * Assemble a model from loaded sessions. {@link loadWhisper} is the public
 * entry; this is the seam the decoding logic is tested through.
 *
 * @param parts Runtime, sessions, configs and tokenizer.
 * @returns The model.
 */
export function createWhisperModel(parts: WhisperParts): WhisperModel {
    const { runtime, encoder, decoder, config, generation, tokenizer } = parts;
    const layers = config.decoder_layers;
    const heads = config.decoder_attention_heads;
    const headDim = config.d_model / heads;
    const melConfig = { ...WHISPER_LOG_MEL_80, nMels: config.num_mel_bins };
    const suppress = new Set(generation.suppress_tokens);
    const beginSuppress = new Set(generation.begin_suppress_tokens);
    const languageIds = new Map(
        Object.entries(generation.lang_to_id).map(([token, id]) => [id, token.slice(2, -2)]),
    );

    const emptyPast = (): Record<string, ort.Tensor> => {
        const past: Record<string, ort.Tensor> = {};
        for (let layer = 0; layer < layers; layer += 1) {
            for (const kind of ["decoder.key", "decoder.value", "encoder.key", "encoder.value"]) {
                past[`past_key_values.${layer}.${kind}`] = new runtime.Tensor(
                    "float32",
                    new Float32Array(0),
                    [1, heads, 0, headDim],
                );
            }
        }
        return past;
    };

    const step = async (
        ids: readonly number[],
        hidden: ort.Tensor,
        past: Record<string, ort.Tensor>,
        cached: boolean,
    ): Promise<{ logits: Float32Array; present: Record<string, ort.Tensor> }> => {
        const result = await decoder.run({
            input_ids: new runtime.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [
                1,
                ids.length,
            ]),
            encoder_hidden_states: hidden,
            use_cache_branch: new runtime.Tensor("bool", [cached], [1]),
            ...past,
        });
        const logits = result.logits as ort.Tensor;
        const vocab = logits.dims[2] as number;
        const length = logits.dims[1] as number;
        const data = logits.data as Float32Array;
        const present: Record<string, ort.Tensor> = {};
        for (let layer = 0; layer < layers; layer += 1) {
            for (const kind of ["decoder.key", "decoder.value", "encoder.key", "encoder.value"]) {
                const key = `past_key_values.${layer}.${kind}`;
                present[key] =
                    cached && kind.startsWith("encoder")
                        ? (past[key] as ort.Tensor)
                        : (result[`present.${layer}.${kind}`] as ort.Tensor);
            }
        }
        return { logits: data.subarray((length - 1) * vocab, length * vocab), present };
    };

    const argmax = (logits: Float32Array, allow: (id: number) => boolean): number => {
        let best = -1;
        let bestValue = -Infinity;
        for (let id = 0; id < logits.length; id += 1) {
            const value = logits[id] as number;
            if (value > bestValue && allow(id)) {
                best = id;
                bestValue = value;
            }
        }
        return best;
    };

    const toPcm = async (audio: Blob | MonoPcm | Float32Array): Promise<Float32Array> => {
        if (audio instanceof Float32Array) return audio;
        if (typeof Blob !== "undefined" && audio instanceof Blob) {
            return (await decodeAudioToPcm(audio, { sampleRate: SAMPLE_RATE })).samples;
        }
        const pcm = audio as MonoPcm;
        return pcm.sampleRate === SAMPLE_RATE
            ? pcm.samples
            : resamplePcm(pcm.samples, pcm.sampleRate, SAMPLE_RATE);
    };

    return {
        dtype: parts.dtype,
        providers: parts.providers,
        async transcribe(audio, options = {}): Promise<Transcription> {
            const { signal, onPartial, task = "transcribe", maxNewTokens = 224, prompt } = options;
            const started = performance.now();
            const timings: TranscriptionTimings = {
                decodeMs: 0,
                featuresMs: 0,
                encoderMs: 0,
                decoderMs: 0,
                totalMs: 0,
            };
            signal?.throwIfAborted();
            let mark = performance.now();
            const samples = await toPcm(audio);
            timings.decodeMs = since(mark);

            const taskId = generation.task_to_id[task];
            if (taskId === undefined) throw new Error(`This model has no "${task}" task.`);
            let language = options.language;
            let languageId =
                language === undefined ? undefined : generation.lang_to_id[`<|${language}|>`];
            if (language !== undefined && languageId === undefined) {
                throw new Error(`This model does not know the language "${language}".`);
            }

            const promptPrefix: number[] = [];
            if (prompt?.trim()) {
                const previous = tokenizer.special("<|startofprev|>");
                if (previous === undefined)
                    throw new Error("This model has no <|startofprev|> token.");
                promptPrefix.push(
                    previous,
                    ...tokenizer.encode(` ${prompt.trim()}`).slice(-PROMPT_TOKENS),
                );
            }

            const tokens: number[] = [];
            let exhausted = false;
            const windows = Math.max(1, Math.ceil(samples.length / WINDOW_SAMPLES));
            for (let window = 0; window < windows; window += 1) {
                signal?.throwIfAborted();
                const chunk = new Float32Array(WINDOW_SAMPLES);
                chunk.set(samples.subarray(window * WINDOW_SAMPLES, (window + 1) * WINDOW_SAMPLES));

                mark = performance.now();
                const mel = logMelSpectrogram(chunk, melConfig);
                timings.featuresMs += since(mark);

                mark = performance.now();
                const encoded = await encoder.run({
                    input_features: new runtime.Tensor("float32", mel.data, [
                        1,
                        mel.nMels,
                        mel.frames,
                    ]),
                });
                const hidden = encoded.last_hidden_state as ort.Tensor;
                timings.encoderMs += since(mark);

                mark = performance.now();
                if (languageId === undefined) {
                    signal?.throwIfAborted();
                    const probe = await step(
                        [generation.decoder_start_token_id],
                        hidden,
                        emptyPast(),
                        false,
                    );
                    languageId = argmax(probe.logits, (id) => languageIds.has(id));
                    language = languageIds.get(languageId) as string;
                }
                let ids = [
                    ...promptPrefix,
                    generation.decoder_start_token_id,
                    languageId,
                    taskId,
                    generation.no_timestamps_token_id,
                ];
                let past = emptyPast();
                let ended = false;
                for (let generated = 0; generated < maxNewTokens; generated += 1) {
                    signal?.throwIfAborted();
                    const next = await step(ids, hidden, past, generated > 0);
                    past = next.present;
                    const id = argmax(
                        next.logits,
                        (candidate) =>
                            !suppress.has(candidate) &&
                            !(generated === 0 && beginSuppress.has(candidate)),
                    );
                    if (id === generation.eos_token_id) {
                        ended = true;
                        break;
                    }
                    tokens.push(id);
                    onPartial?.(tokenizer.decode(tokens).trim());
                    ids = [id];
                }
                if (!ended) exhausted = true;
                timings.decoderMs += since(mark);
            }

            timings.totalMs = since(started);
            const text = tokenizer.decode(tokens).trim();
            const ratio = compressionRatio(text);
            return {
                text,
                compressionRatio: ratio,
                degenerate: exhausted || ratio > WHISPER_COMPRESSION_RATIO_THRESHOLD,
                language: language as string,
                tokens: tokens.filter((id) => !tokenizer.specialIds.has(id)),
                audioMs: (samples.length / SAMPLE_RATE) * 1000,
                timings,
            };
        },
        async release(): Promise<void> {
            await Promise.all([encoder.release(), decoder.release()]);
        },
    };
}
