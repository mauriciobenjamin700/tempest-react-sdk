import type { MonoPcm } from "@/audio/decode-pcm";
import { createPcmStream, type PcmStreamOptions } from "@/audio/pcm-stream";

import { loadAudioModel, type AudioModel, type LoadAudioModelOptions } from "./audio-model";

/**
 * Name the sounds in a recording or a live microphone: sirens, horns, a baby
 * crying, music, speech — YAMNet's 521 AudioSet classes, or your own model's.
 */

/** YAMNet's hop between score frames: 0.48 s. Ported from the YAMNet `params.py` (`patch_hop_seconds = 0.48`). */
export const YAMNET_HOP_MS = 480;
/**
 * Samples YAMNet needs for one score frame at 16 kHz: a 96-frame patch is
 * 95 × `stft_hop_seconds` (0.010) + `stft_window_seconds` (0.025) = 0.975 s.
 * Derived from YAMNet's `params.py`.
 */
export const YAMNET_WINDOW_SAMPLES = 15_600;

/** A class and its score. */
export interface SoundScore {
    label: string;
    score: number;
}

/** Scores of one frame of the recording. */
export interface SoundFrame {
    startMs: number;
    /** One score per label, in label order. */
    scores: Float32Array;
}

/** What a recording contains. */
export interface SoundClassification {
    frames: readonly SoundFrame[];
    /** Classes by mean score over every frame, highest first. */
    top: readonly SoundScore[];
}

/** Options for {@link loadSoundClassifier}. */
export interface LoadSoundClassifierOptions extends Omit<LoadAudioModelOptions, "feature"> {
    /** Feature the model takes. Default `"waveform"` (YAMNet). */
    feature?: LoadAudioModelOptions["feature"];
    /** Class names in output order — or `labelsUrl` to a class-map CSV. */
    labels?: readonly string[];
    /**
     * A class-map CSV (YAMNet's `yamnet_class_map.csv`: `index,mid,display_name`).
     * The last column is the name; quoted names with commas ("Beep, bleep") are
     * parsed as CSV, not split on every comma.
     */
    labelsUrl?: string;
    /** Output holding the `[frames, classes]` scores. Default: the model's first output. */
    scoresOutput?: string;
    /** Time between score frames. Default {@link YAMNET_HOP_MS}. */
    hopMs?: number;
    /** How many classes `top` keeps. Default `5`. */
    topK?: number;
}

/** A loaded classifier. */
export interface SoundClassifier {
    readonly labels: readonly string[];
    /**
     * Classify a recording.
     *
     * @param audio A recording or mono PCM (a bare `Float32Array` at 16 kHz).
     * @returns Per-frame scores and the overall top classes.
     */
    classify(audio: Blob | MonoPcm | Float32Array): Promise<SoundClassification>;
    /** Free the model. */
    release(): Promise<void>;
}

/**
 * Split one CSV line into fields (RFC 4180: quotes, commas inside quotes, `""`).
 *
 * @param line The line.
 * @returns The fields.
 */
export function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i] as string;
        if (quoted) {
            if (char === '"' && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                current += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ",") {
            fields.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    fields.push(current);
    return fields;
}

/**
 * Class names from a class-map CSV with a header row; the last column is the name.
 *
 * @param csv The file's text.
 * @returns The names, in row order.
 */
export function parseClassMap(csv: string): string[] {
    return csv
        .split(/\r?\n/)
        .slice(1)
        .filter((line) => line.trim() !== "")
        .map((line) => {
            const fields = parseCsvLine(line);
            return fields[fields.length - 1] as string;
        });
}

/**
 * Wrap a loaded model as a classifier. {@link loadSoundClassifier} is the
 * public entry; this is the seam the scoring is tested through.
 *
 * @param model The model.
 * @param labels Class names in output order.
 * @param options Output name, hop and top-k.
 * @returns The classifier.
 */
export function createSoundClassifier(
    model: AudioModel,
    labels: readonly string[],
    options: Pick<LoadSoundClassifierOptions, "scoresOutput" | "hopMs" | "topK"> = {},
): SoundClassifier {
    const scoresOutput = options.scoresOutput ?? (model.outputNames[0] as string);
    const hopMs = options.hopMs ?? YAMNET_HOP_MS;
    const topK = options.topK ?? 5;
    return {
        labels,
        async classify(audio): Promise<SoundClassification> {
            const output = (await model.run(audio))[scoresOutput];
            if (!output) throw new Error(`The model has no output "${scoresOutput}".`);
            const classes = output.dims[output.dims.length - 1] as number;
            if (classes !== labels.length) {
                throw new Error(
                    `The model scores ${classes} classes but ${labels.length} labels were given.`,
                );
            }
            const count = output.data.length / classes;
            const frames: SoundFrame[] = [];
            const mean = new Float64Array(classes);
            for (let f = 0; f < count; f += 1) {
                const scores = output.data.slice(f * classes, (f + 1) * classes);
                frames.push({ startMs: f * hopMs, scores });
                for (let c = 0; c < classes; c += 1)
                    mean[c] = (mean[c] as number) + (scores[c] as number) / count;
            }
            const top = Array.from(mean, (score, index) => ({
                label: labels[index] as string,
                score,
            }))
                .sort((a, b) => b.score - a.score)
                .slice(0, topK);
            return { frames, top };
        },
        release: () => model.release(),
    };
}

/**
 * Load a sound classifier — YAMNet by default (521 AudioSet classes, ~16 MB).
 *
 * YAMNet exported with tf2onnx takes the raw 16 kHz waveform and computes its
 * own log-mel inside the graph, so no feature step runs on the page. Checked on
 * that export (Node 24, WASM): a 1 kHz tone scores "Beep, bleep" 0.92, a FLEURS
 * Portuguese utterance "Speech" 0.73, silence "Silence" 1.00; 14 s cost 146 ms.
 *
 * @param options Model, labels and scoring.
 * @returns The classifier.
 * @throws Error when neither `labels` nor `labelsUrl` is given.
 *
 * @example
 * ```typescript
 * import { loadSoundClassifier } from "tempest-react-sdk/speech";
 *
 * async function whatIsHeard(recording: Blob): Promise<string> {
 *     const classifier = await loadSoundClassifier({
 *         modelUrl: "/models/yamnet/yamnet.onnx",
 *         labelsUrl: "/models/yamnet/yamnet_class_map.csv",
 *     });
 *     const { top } = await classifier.classify(recording);
 *     return top.map((s) => `${s.label} ${s.score.toFixed(2)}`).join(", ");
 * }
 * ```
 */
export async function loadSoundClassifier(
    options: LoadSoundClassifierOptions,
): Promise<SoundClassifier> {
    const {
        labels,
        labelsUrl,
        scoresOutput,
        hopMs,
        topK,
        feature = "waveform",
        ...modelOptions
    } = options;
    let names = labels;
    if (!names) {
        if (!labelsUrl) throw new Error("loadSoundClassifier needs labels or labelsUrl.");
        const response = await fetch(labelsUrl);
        if (!response.ok)
            throw new Error(`Could not load the class map: ${response.status} ${labelsUrl}`);
        names = parseClassMap(await response.text());
    }
    const model = await loadAudioModel({ ...modelOptions, feature });
    return createSoundClassifier(model, names, { scoresOutput, hopMs, topK });
}

/** Options for {@link createSoundMonitor}. */
export interface SoundMonitorOptions {
    classifier: SoundClassifier;
    /** Classes to watch; default every class. */
    classes?: readonly string[];
    /** Smoothed score from which a class turns on. Default `0.3`. */
    threshold?: number;
    /** Smoothed score under which an active class turns off. Default `threshold × 0.6`. */
    releaseThreshold?: number;
    /** Windows averaged per decision. Default `3` (~1.5 s with the default hop). */
    smoothing?: number;
    /** Window length in samples at 16 kHz. Default {@link YAMNET_WINDOW_SAMPLES}. */
    windowSamples?: number;
    /** Samples between windows. Default `8000` (0.5 s). */
    hopSamples?: number;
    /** Passed to `createPcmStream`. */
    stream?: Pick<PcmStreamOptions, "context" | "workletUrl">;
}

/** A running monitor. */
export interface SoundMonitor {
    /** Classes active now. */
    readonly active: readonly string[];
    stop(): void;
}

/**
 * Watch a live input for sounds, with smoothing so a class does not flicker
 * on and off every window.
 *
 * Each ~1 s window (hop 0.5 s) is classified; scores are averaged over the
 * last `smoothing` windows; a class turns on at `threshold` and off under
 * `releaseThreshold` (hysteresis). `onChange` gets the active set when it
 * changes.
 *
 * @param source The microphone or a node.
 * @param onChange Called with the active classes when the set changes.
 * @param options Classifier, classes and thresholds.
 * @returns The running monitor.
 *
 * @example
 * ```typescript
 * import { createSoundMonitor, loadSoundClassifier } from "tempest-react-sdk/speech";
 *
 * async function watchForSirens(mic: MediaStream): Promise<void> {
 *     const classifier = await loadSoundClassifier({
 *         modelUrl: "/models/yamnet/yamnet.onnx",
 *         labelsUrl: "/models/yamnet/yamnet_class_map.csv",
 *     });
 *     await createSoundMonitor(mic, (active) => console.log(active), {
 *         classifier,
 *         classes: ["Siren", "Vehicle horn, car horn, honking"],
 *     });
 * }
 * ```
 */
export async function createSoundMonitor(
    source: MediaStreamTrack | MediaStream | AudioNode,
    onChange: (active: readonly string[]) => void,
    options: SoundMonitorOptions,
): Promise<SoundMonitor> {
    const { classifier } = options;
    const threshold = options.threshold ?? 0.3;
    const release = options.releaseThreshold ?? threshold * 0.6;
    const smoothing = options.smoothing ?? 3;
    const watched = (options.classes ?? classifier.labels).map((label) => {
        const index = classifier.labels.indexOf(label);
        if (index === -1) throw new Error(`Unknown class "${label}".`);
        return { label, index };
    });
    const history: Float32Array[] = [];
    let active: string[] = [];
    let stopped = false;
    let queue: Promise<unknown> = Promise.resolve();

    const decide = (scores: Float32Array): void => {
        history.push(scores);
        if (history.length > smoothing) history.shift();
        const next = watched
            .filter(({ label, index }) => {
                let sum = 0;
                for (const frame of history) sum += frame[index] as number;
                const mean = sum / history.length;
                return active.includes(label) ? mean >= release : mean >= threshold;
            })
            .map(({ label }) => label);
        if (next.length === active.length && next.every((label, i) => label === active[i])) return;
        active = next;
        onChange(active);
    };

    const stream = await createPcmStream(source, {
        ...options.stream,
        sampleRate: 16_000,
        frameSize: options.windowSamples ?? YAMNET_WINDOW_SAMPLES,
        hopSize: options.hopSamples ?? 8_000,
        onFrame: (window) => {
            queue = queue
                .then(() => classifier.classify(window))
                .then((result) => {
                    if (stopped) return;
                    const frame = result.frames[result.frames.length - 1];
                    if (frame) decide(frame.scores);
                })
                .catch(() => undefined);
        },
    });

    return {
        get active(): readonly string[] {
            return active;
        },
        stop(): void {
            stopped = true;
            stream.release();
        },
    };
}
