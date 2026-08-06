/**
 * Running a scikit-learn model in the browser, offline.
 *
 * The model file is produced by `tempest-fastapi-sdk`'s
 * `export_sklearn_to_onnx`. This is everything between that file and an
 * answer — the same glue the Python `OnnxPredictor` provides on a device,
 * with the browser's own traps handled:
 *
 * - **int64 labels arrive as `bigint`.** ONNX Runtime Web surfaces the
 *   label tensor as a `BigInt64Array`, so a caller comparing `label === 1`
 *   silently gets `false` and `JSON.stringify` throws. Labels are converted.
 * - **`ai.onnx.ml` needs the right build.** Measured: importing
 *   `onnxruntime-web/webgpu` loads a WebAssembly binary without those
 *   operators, and session creation fails with `No Op registered for
 *   TreeEnsembleClassifier`. That failure is translated into an error that
 *   names the import.
 * - **Which output is which.** A classifier returns `label` and
 *   `probabilities`; a regressor returns a single `variable`. Indexing by
 *   position works until the day you deploy the other kind.
 */

import type * as ort from "onnxruntime-web";

import { configuredOrtAssetPath } from "./assets";
import {
    FeatureShapeError,
    InferenceError,
    ModelLoadError,
    UnsupportedGraphError,
} from "./exceptions";
import type {
    FeatureRow,
    PredictedLabel,
    TabularModelSource,
    TabularPrediction,
    TabularPredictorInfo,
    TabularPredictorOptions,
} from "./types";

/**
 * Import ONNX Runtime Web, only when a model is actually being loaded.
 *
 * Static import would make every consumer of this subpath install the peer,
 * including apps that only ever touch `CompactPredictor` — whose whole
 * point is not needing a runtime. Found by installing the published
 * package into an empty project, which is the only place the difference
 * shows.
 *
 * @returns The runtime module.
 * @throws {@link ModelLoadError} when the peer is not installed, naming it.
 */
async function loadRuntime(): Promise<typeof ort> {
    try {
        return (await import("onnxruntime-web")) as typeof ort;
    } catch (error) {
        throw new ModelLoadError(
            "The ONNX route needs the optional peer dependency: " +
                "npm install onnxruntime-web. For a model with no runtime at " +
                "all, export it with edge_pipeline(compact=True) and load it " +
                "through CompactPredictor.",
            { cause: error },
        );
    }
}

/**
 * Execution providers used when the caller does not choose.
 *
 * WebAssembly only, and deliberately: scikit-learn graphs are `ai.onnx.ml`
 * operators, which the WebGPU backend does not implement. There is no
 * speed left on the table here — a 10-tree forest predicts a row in about
 * 0.05 ms in Chromium.
 */
export const DEFAULT_TABULAR_PROVIDERS: readonly string[] = ["wasm"];

/** Output names that indicate predicted classes rather than scores. */
const LABEL_HINTS = ["label", "class", "variable", "output"] as const;

/** Output names that indicate class scores. */
const PROBABILITY_HINTS = ["probabilit", "score"] as const;

/** Largest plausible feature count; anything above is a dynamic-dim sentinel. */
const MAX_DECLARED_FEATURES = 1_000_000;

/**
 * Pick the first output whose name contains one of `hints`.
 *
 * @param names Graph output names.
 * @param hints Lowercase substrings to look for.
 * @returns The matching name, or `null`.
 */
function matchOutput(names: readonly string[], hints: readonly string[]): string | null {
    for (const hint of hints) {
        const found = names.find((name) => name.toLowerCase().includes(hint));
        if (found !== undefined) return found;
    }
    return null;
}

/**
 * Read the declared feature count from the input metadata.
 *
 * A dynamic batch dimension is reported as a symbolic string or as an
 * out-of-range number (`4294967295` — an unsigned `-1`), so only a sane
 * positive integer in the second position is trusted.
 *
 * @param session The loaded session.
 * @returns The feature count, or `null` when the graph does not declare one.
 */
function declaredFeatures(session: ort.InferenceSession): number | null {
    const metadata = session.inputMetadata?.[0];
    if (metadata === undefined || metadata.isTensor !== true) return null;
    const dimension = metadata.shape[1];
    if (typeof dimension !== "number") return null;
    if (!Number.isInteger(dimension) || dimension <= 0) return null;
    return dimension > MAX_DECLARED_FEATURES ? null : dimension;
}

/**
 * Convert one raw label value into a JS-friendly label.
 *
 * @param value A tensor element: `bigint` for int64, `number` for float,
 *   `string` for a string-labelled classifier.
 * @returns The label as a number or string.
 */
function toLabel(value: unknown): PredictedLabel {
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number") return value;
    return String(value);
}

/**
 * Translate a session-creation failure into an error naming its cause.
 *
 * @param error Whatever ONNX Runtime threw.
 * @returns The error to surface.
 */
function asLoadError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No Op registered")) {
        return new UnsupportedGraphError(
            "This runtime build has no kernels for the model's operators. " +
                "scikit-learn exports use the ai.onnx.ml domain, which is missing " +
                'from the WebGPU build: import "onnxruntime-web", not ' +
                '"onnxruntime-web/webgpu". Original error: ' +
                message,
            { cause: error },
        );
    }
    return new ModelLoadError(`Failed to load the model: ${message}`, { cause: error });
}

/**
 * Translate a run failure into an error naming its cause.
 *
 * Measured: an export made with skl2onnx's default (ZipMap enabled) has a
 * probability output that is a sequence of maps, and ONNX Runtime Web
 * refuses to read non-tensor values — `Reading data from non-tensor typed
 * value is not supported`. That message describes the runtime's limitation,
 * not the fix, so it is replaced by one that names the export flag.
 *
 * @param error Whatever ONNX Runtime threw.
 * @returns The error to surface.
 */
function asRunError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (
        message.includes("non-tensor typed value") ||
        message.includes("Can't access output tensor data")
    ) {
        return new InferenceError(
            "The model has a non-tensor output, which ONNX Runtime Web cannot " +
                "read. A scikit-learn export made with ZipMap enabled returns a " +
                "sequence of maps per row — re-export with export_sklearn_to_onnx, " +
                `which disables it. Original error: ${message}`,
            { cause: error },
        );
    }
    return new InferenceError(`Inference failed: ${message}`, { cause: error });
}

/**
 * A loaded tabular model, ready to answer.
 *
 * @example
 * ```ts
 * const predictor = await TabularPredictor.create("/models/classifier.onnx");
 * const { labels, probabilities } = await predictor.predict([[5.1, 3.5, 1.4, 0.2]]);
 * ```
 */
export class TabularPredictor {
    private constructor(
        private readonly runtime: typeof ort,
        private readonly session: ort.InferenceSession,
        /** What is loaded and how it is configured. */
        public readonly info: TabularPredictorInfo,
    ) {}

    /**
     * Load a model and describe its graph.
     *
     * @param source A URL string, or the model bytes (which is what an
     *   offline app passes, having read them from the cache).
     * @param options Providers, warm-up and pass-through session options.
     * @throws {@link UnsupportedGraphError} when the runtime build lacks the
     *   `ai.onnx.ml` operators — the WebGPU entry point does.
     * @throws {@link ModelLoadError} for any other load failure.
     */
    static async create(
        source: TabularModelSource,
        options: TabularPredictorOptions = {},
    ): Promise<TabularPredictor> {
        const providers = options.providers ?? DEFAULT_TABULAR_PROVIDERS;
        const runtime = await loadRuntime();
        const assets = configuredOrtAssetPath();
        if (assets !== undefined) runtime.env.wasm.wasmPaths = assets;

        let session: ort.InferenceSession;
        try {
            session = await runtime.InferenceSession.create(source as never, {
                ...(options.sessionOptions ?? {}),
                executionProviders:
                    providers as ort.InferenceSession.SessionOptions["executionProviders"],
            });
        } catch (error) {
            throw asLoadError(error);
        }

        const outputNames = [...session.outputNames];
        const probabilityOutput = matchOutput(outputNames, PROBABILITY_HINTS);
        const labelOutput =
            outputNames.find((name) => name !== probabilityOutput && isLabelName(name)) ??
            outputNames.find((name) => name !== probabilityOutput) ??
            (outputNames[0] as string);

        const predictor = new TabularPredictor(runtime, session, {
            inputName: session.inputNames[0] as string,
            numFeatures: declaredFeatures(session),
            outputNames,
            labelOutput,
            probabilityOutput,
            isClassifier: probabilityOutput !== null,
            providers,
        });

        if (options.warmup !== false) await predictor.warmUp();
        return predictor;
    }

    /**
     * Run one throwaway inference so the first real call is not the slow one.
     *
     * Skipped when the graph does not declare a feature count, since there
     * is no shape to synthesise.
     *
     * @tempest-limits empty-catch — a warm-up that cannot run is not a reason to
     * refuse to serve. The synthetic all-zero row can be rejected by a graph that
     * expects a different dtype or a categorical encoding, and that says nothing
     * about the real rows the caller will send; the only cost of the failure is
     * that the first real inference pays the lazy-init it would have paid anyway.
     */
    async warmUp(): Promise<void> {
        const features = this.info.numFeatures;
        if (features === null) return;
        try {
            await this.predict([new Array<number>(features).fill(0)]);
        } catch {
            /* empty */
        }
    }

    /**
     * Predict for a batch of rows.
     *
     * @param rows One array of feature values per row, in training column
     *   order. A single row is still wrapped: `[[...]]`.
     * @returns Labels, class scores when the model produces them, and the
     *   call's duration.
     * @throws {@link FeatureShapeError} when the batch is empty, ragged, or
     *   the wrong width — checked here so the failure names the mismatch
     *   instead of surfacing as an opaque runtime error.
     * @throws {@link InferenceError} when the session runs but its outputs
     *   cannot be read.
     */
    async predict(rows: readonly FeatureRow[]): Promise<TabularPrediction> {
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new FeatureShapeError(
                "predict() needs at least one row, shaped [[f1, f2, ...]].",
            );
        }
        const width = rows[0]?.length ?? 0;
        if (width === 0) {
            throw new FeatureShapeError("The first row has no feature values.");
        }
        const ragged = rows.findIndex((row) => row.length !== width);
        if (ragged !== -1) {
            throw new FeatureShapeError(
                `All rows must have the same width; row ${ragged} has ` +
                    `${rows[ragged]?.length} values, expected ${width}.`,
            );
        }
        const expected = this.info.numFeatures;
        if (expected !== null && width !== expected) {
            throw new FeatureShapeError(
                `The model expects ${expected} features per row, got ${width}.`,
            );
        }

        const flat = new Float32Array(rows.length * width);
        for (let index = 0; index < rows.length; index += 1) {
            flat.set(rows[index] as number[], index * width);
        }
        const tensor = new this.runtime.Tensor("float32", flat, [rows.length, width]);

        const started = performance.now();
        let outputs: ort.InferenceSession.OnnxValueMapType;
        try {
            outputs = await this.session.run({ [this.info.inputName]: tensor });
        } catch (error) {
            throw asRunError(error);
        }
        const ms = performance.now() - started;

        const labelTensor = outputs[this.info.labelOutput];
        if (labelTensor?.data === undefined) {
            throw new InferenceError(
                `The model produced no readable "${this.info.labelOutput}" output.`,
            );
        }

        const labels: PredictedLabel[] = Array.from(
            labelTensor.data as ArrayLike<unknown>,
            toLabel,
        );

        const probabilities: number[][] = [];
        if (this.info.probabilityOutput !== null) {
            const scores = outputs[this.info.probabilityOutput];
            if (scores?.data !== undefined) {
                const values = Array.from(scores.data as ArrayLike<number>, Number);
                const classes = values.length / rows.length;
                for (let index = 0; index < rows.length; index += 1) {
                    probabilities.push(values.slice(index * classes, (index + 1) * classes));
                }
            }
        }

        return { labels, probabilities, numRows: rows.length, ms };
    }

    /**
     * Release the session's memory.
     *
     * Worth calling on a route that swaps models: the WebAssembly heap does
     * not shrink on garbage collection alone.
     */
    async dispose(): Promise<void> {
        await this.session.release?.();
    }
}

/**
 * Whether an output name looks like a label rather than a score.
 *
 * @param name The graph output name.
 * @returns `true` when the name matches a known label convention.
 */
function isLabelName(name: string): boolean {
    const lowered = name.toLowerCase();
    return LABEL_HINTS.some((hint) => lowered.includes(hint));
}
