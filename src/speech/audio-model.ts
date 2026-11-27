import type * as ort from "onnxruntime-web";

import { decodeAudioToPcm, type MonoPcm } from "@/audio/decode-pcm";
import { logMelSpectrogram, type LogMelConfig } from "@/audio/log-mel";
import { resamplePcm } from "@/audio/resample";
import { configuredOrtAssetPath } from "@/tabular/assets";
import { fetchModelBytes } from "@/tabular/cache";

import { DEFAULT_SPEECH_MODEL_CACHE } from "./whisper";

/**
 * Run your own ONNX audio model in the browser: the input preparation every
 * audio model repeats, around one session.
 */

/** One output of a run. */
export interface AudioModelOutput {
    data: Float32Array;
    dims: readonly number[];
}

/** Options for {@link loadAudioModel}. */
export interface LoadAudioModelOptions {
    /** URL of the `.onnx`. Serve it from your origin. */
    modelUrl: string;
    /**
     * What the model takes: `"waveform"` for raw samples (YAMNet-style exports
     * that compute their own features), or a {@link LogMelConfig} — the exact
     * front end the model was trained with — for a spectrogram.
     */
    feature: "waveform" | LogMelConfig;
    /** Rate the model expects. Default `16000`; a log-mel config's own rate wins. */
    sampleRate?: number;
    /**
     * Tensor shape for the prepared input. Default: `[samples]` for a
     * waveform and `[1, nMels, frames]` for a log-mel — the shapes YAMNet and
     * Whisper-style encoders take. Pass your model's when it differs (e.g.
     * `(n) => [1, n]`).
     */
    inputDims?: (input: { samples?: number; nMels?: number; frames?: number }) => number[];
    /** Input name. Default: the model's first input. */
    inputName?: string;
    /** Cache Storage bucket. Default the speech models' bucket. */
    cacheName?: string;
    /** Folder of ONNX Runtime's `.wasm` (see `tempestOrtAssets`). */
    ortAssetsUrl?: string;
}

/** A loaded audio model. */
export interface AudioModel {
    /** The rate audio is converted to before the run. */
    readonly sampleRate: number;
    /** Output names, in the model's order. */
    readonly outputNames: readonly string[];
    /**
     * Prepare the audio as declared and run the model.
     *
     * @param audio A recording, or mono PCM (a bare `Float32Array` is taken as already at `sampleRate`).
     * @returns Every output, by name.
     */
    run(audio: Blob | MonoPcm | Float32Array): Promise<Record<string, AudioModelOutput>>;
    /** Free the session. */
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
            "Audio models need the optional peer dependency: npm install onnxruntime-web.",
            {
                cause: error,
            },
        );
    }
}

/**
 * Load an ONNX audio model of your own.
 *
 * The part every audio model repeats is done here — decode the recording,
 * downmix, resample to the model's rate with the SDK's band-limited filter,
 * and, for spectrogram models, compute the log-mel with the exact config the
 * model was trained on (see `logMelSpectrogram`, pinned against Whisper's
 * reference). Outputs come back untouched; interpreting them is the model's
 * business (`loadSoundClassifier` does it for classifiers).
 *
 * @param options The model and how to feed it.
 * @returns The model.
 *
 * @example
 * ```typescript
 * import { loadAudioModel } from "tempest-react-sdk/speech";
 *
 * async function embed(recording: Blob): Promise<Float32Array> {
 *     const model = await loadAudioModel({ modelUrl: "/models/yamnet.onnx", feature: "waveform" });
 *     const outputs = await model.run(recording);
 *     return outputs.output_1?.data ?? new Float32Array(0);
 * }
 * ```
 */
export async function loadAudioModel(options: LoadAudioModelOptions): Promise<AudioModel> {
    const runtime = await loadRuntime();
    const assets = options.ortAssetsUrl ?? configuredOrtAssetPath();
    if (assets !== undefined) {
        runtime.env.wasm.wasmPaths = assets.endsWith("/") ? assets : `${assets}/`;
    }
    const bytes = await fetchModelBytes(options.modelUrl, {
        cacheName: options.cacheName ?? DEFAULT_SPEECH_MODEL_CACHE,
    });
    const session = await runtime.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    return createAudioModel(runtime, session, options);
}

/**
 * Wrap a session. {@link loadAudioModel} is the public entry; this is the
 * seam the input preparation is tested through.
 *
 * @param runtime The ONNX Runtime module (for `Tensor`).
 * @param session The session.
 * @param options Feature, rate, shape and input name.
 * @returns The model.
 */
export function createAudioModel(
    runtime: Pick<typeof ort, "Tensor">,
    session: Pick<ort.InferenceSession, "run" | "release" | "inputNames" | "outputNames">,
    options: Pick<LoadAudioModelOptions, "feature" | "sampleRate" | "inputDims" | "inputName">,
): AudioModel {
    const { feature } = options;
    const sampleRate = feature === "waveform" ? (options.sampleRate ?? 16_000) : feature.sampleRate;
    const inputName = options.inputName ?? (session.inputNames[0] as string);

    const toSamples = async (audio: Blob | MonoPcm | Float32Array): Promise<Float32Array> => {
        if (audio instanceof Float32Array) return audio;
        if (typeof Blob !== "undefined" && audio instanceof Blob) {
            return (await decodeAudioToPcm(audio, { sampleRate })).samples;
        }
        const pcm = audio as MonoPcm;
        return pcm.sampleRate === sampleRate
            ? pcm.samples
            : resamplePcm(pcm.samples, pcm.sampleRate, sampleRate);
    };

    return {
        sampleRate,
        outputNames: session.outputNames,
        async run(audio): Promise<Record<string, AudioModelOutput>> {
            const samples = await toSamples(audio);
            let tensor: ort.Tensor;
            if (feature === "waveform") {
                const dims = options.inputDims?.({ samples: samples.length }) ?? [samples.length];
                tensor = new runtime.Tensor("float32", samples, dims);
            } else {
                const mel = logMelSpectrogram(samples, feature);
                const dims = options.inputDims?.({ nMels: mel.nMels, frames: mel.frames }) ?? [
                    1,
                    mel.nMels,
                    mel.frames,
                ];
                tensor = new runtime.Tensor("float32", mel.data, dims);
            }
            const result = await session.run({ [inputName]: tensor });
            const outputs: Record<string, AudioModelOutput> = {};
            for (const name of session.outputNames) {
                const output = result[name] as ort.Tensor;
                outputs[name] = { data: output.data as Float32Array, dims: [...output.dims] };
            }
            return outputs;
        },
        release: () => session.release(),
    };
}
