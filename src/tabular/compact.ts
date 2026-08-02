/**
 * Running a model with no inference runtime at all.
 *
 * ONNX in the browser costs a **25.6 MB WebAssembly runtime** (6.0 MB
 * gzipped) before the first prediction, while the model itself is a few
 * hundred kilobytes. For an app whose only model is tabular, that runtime
 * *is* the download — so this reader replaces it with 1.49 KB of
 * arithmetic (measured, brotli).
 *
 * A linear model is a dot product. A tree is a chain of comparisons. That
 * is the whole implementation; there is nothing here that a WebAssembly
 * kernel would do better at this size.
 *
 * The file it reads (`.tmc`, magic `TMC1`) is written by
 * `tempest-fastapi-sdk`'s `export_sklearn_to_compact`, which verifies the
 * bytes against scikit-learn's own predictions and refuses to write a file
 * that disagrees. **It is data, not code**: no `eval`, no generated
 * JavaScript, nothing a strict CSP forbids.
 *
 * The trade against {@link TabularPredictor}: ONNX covers every estimator,
 * this covers linear models and tree ensembles. Pick by what your app
 * already ships — a page that loads ONNX for vision pays nothing extra for
 * tabular ONNX.
 */

import { CompactFormatError, FeatureShapeError, ModelFetchError } from "./exceptions";
import type { FeatureRow, PredictedLabel, TabularPrediction } from "./types";

/** Magic bytes opening every compact file. */
const MAGIC = "TMC1";

/** Layout version this reader understands. */
export const SUPPORTED_COMPACT_SCHEMA = 1;

/** What the file holds. */
export type CompactKind = "linear" | "tree_ensemble";

/** How raw scores become probabilities. */
type CompactLink = "softmax" | "sigmoid" | "normalize" | "identity";

/** One array stored after the header. */
interface CompactSection {
    readonly name: string;
    readonly dtype: "float32" | "int32";
    readonly length: number;
}

/** The parsed header. */
interface CompactHeader {
    readonly schema_version: number;
    readonly kind: CompactKind;
    readonly task: "classification" | "regression";
    readonly link: CompactLink;
    readonly classes: readonly string[];
    /** How scikit-learn typed those labels: ``int``, ``float`` or ``str``. */
    readonly class_type?: "int" | "float" | "str";
    readonly n_features: number;
    readonly n_outputs: number;
    readonly n_trees?: number;
    readonly estimator: string;
    readonly feature_names: readonly string[];
    readonly preprocess: { readonly offset: number[]; readonly scale: number[] } | null;
    readonly sections: readonly CompactSection[];
}

/** What a loaded compact model is. */
export interface CompactPredictorInfo {
    /** Which reader path the file uses. */
    readonly kind: CompactKind;
    /** Class labels in score-column order; empty for a regressor. */
    readonly classes: readonly string[];
    /** Values expected per row. */
    readonly numFeatures: number;
    /** Column order recorded at training time, when the export had one. */
    readonly featureNames: readonly string[];
    /** Trees in the ensemble; `0` for a linear model. */
    readonly numTrees: number;
    /** Whether the model produces class scores. */
    readonly isClassifier: boolean;
    /** Class name of the exported estimator. */
    readonly estimator: string;
}

/**
 * A compact model, loaded and ready to answer.
 *
 * @example
 * ```ts
 * const predictor = await CompactPredictor.create("/models/risk.tmc");
 * const { labels, probabilities } = await predictor.predict([[5.1, 3.5, 1.4, 0.2]]);
 * ```
 */
export class CompactPredictor {
    private constructor(
        private readonly header: CompactHeader,
        private readonly arrays: Record<string, Float32Array | Int32Array>,
        /** What is loaded. */
        public readonly info: CompactPredictorInfo,
    ) {}

    /**
     * Load a `.tmc` file.
     *
     * @param source A URL, or the bytes when the app already has them.
     * @param requestInit `fetch` options, when `source` is a URL.
     * @returns The loaded predictor.
     * @throws {@link ModelFetchError} when a URL cannot be read.
     * @throws {@link CompactFormatError} when the bytes are not a compact
     *   model, or use a layout newer than this reader.
     */
    static async create(
        source: string | ArrayBuffer | Uint8Array,
        requestInit?: RequestInit,
    ): Promise<CompactPredictor> {
        const buffer = await toBuffer(source, requestInit);
        const bytes = new Uint8Array(buffer);

        if (String.fromCharCode(...bytes.subarray(0, 4)) !== MAGIC) {
            throw new CompactFormatError(
                "This is not a compact model file: it does not start with " +
                    `"${MAGIC}". A .onnx file goes through TabularPredictor instead.`,
            );
        }

        const view = new DataView(buffer);
        const headerLength = view.getUint32(4, true);
        const header = JSON.parse(
            new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)),
        ) as CompactHeader;

        if (header.schema_version > SUPPORTED_COMPACT_SCHEMA) {
            throw new CompactFormatError(
                `This file uses compact layout ${header.schema_version}, and this ` +
                    `SDK understands ${SUPPORTED_COMPACT_SCHEMA}. Upgrade ` +
                    "tempest-react-sdk before serving it.",
            );
        }

        const arrays: Record<string, Float32Array | Int32Array> = {};
        let cursor = 8 + headerLength;
        for (const section of header.sections) {
            arrays[section.name] =
                section.dtype === "float32"
                    ? new Float32Array(buffer, cursor, section.length)
                    : new Int32Array(buffer, cursor, section.length);
            cursor += section.length * 4;
        }

        return new CompactPredictor(header, arrays, {
            kind: header.kind,
            classes: header.classes,
            numFeatures: header.n_features,
            featureNames: header.feature_names,
            numTrees: header.n_trees ?? 0,
            isClassifier: header.task === "classification",
            estimator: header.estimator,
        });
    }

    /**
     * Predict for a batch of rows.
     *
     * @param rows One array of feature values per row, in training column
     *   order. A single row is still wrapped: `[[...]]`.
     * @returns Labels, class scores when the model is a classifier, and the
     *   call's duration.
     * @throws {@link FeatureShapeError} when the batch is empty, ragged, or
     *   the wrong width.
     */
    async predict(rows: readonly FeatureRow[]): Promise<TabularPrediction> {
        const width = validateRows(rows, this.header.n_features);
        const started = performance.now();

        const scores: number[][] = [];
        for (const row of rows) {
            const prepared = this.preprocess(row, width);
            scores.push(
                this.header.kind === "linear"
                    ? this.linearScores(prepared)
                    : this.treeScores(prepared),
            );
        }

        const { labels, probabilities } = this.finish(scores);
        return {
            labels,
            probabilities,
            numRows: rows.length,
            ms: performance.now() - started,
        };
    }

    /** Releasing nothing, so callers can swap predictors without branching. */
    async dispose(): Promise<void> {
        /* no runtime, nothing to release */
    }

    /**
     * Apply the folded scaler, when the export had one.
     *
     * @param row The raw feature values.
     * @param width How many there are.
     * @returns The values the model was trained on.
     */
    private preprocess(row: FeatureRow, width: number): number[] {
        const preprocess = this.header.preprocess;
        if (preprocess === null) return row as number[];
        const scaled = new Array<number>(width);
        for (let index = 0; index < width; index += 1) {
            scaled[index] =
                ((row[index] as number) - (preprocess.offset[index] as number)) /
                (preprocess.scale[index] as number);
        }
        return scaled;
    }

    /**
     * Score one row against the coefficient matrix.
     *
     * @param row The prepared feature values.
     * @returns One raw score per output.
     */
    private linearScores(row: readonly number[]): number[] {
        const coef = this.arrays.coef as Float32Array;
        const intercept = this.arrays.intercept as Float32Array;
        const features = this.header.n_features;
        const outputs = this.header.n_outputs;

        const scores = new Array<number>(outputs);
        for (let output = 0; output < outputs; output += 1) {
            let total = intercept[output] as number;
            const base = output * features;
            for (let index = 0; index < features; index += 1) {
                total += (coef[base + index] as number) * (row[index] as number);
            }
            scores[output] = total;
        }
        return scores;
    }

    /**
     * Walk every tree and average what the leaves hold.
     *
     * A leaf is marked by a negative `feature` entry, which also carries
     * its slot in the value array — so the walk needs no second lookup and
     * the file stores values only for leaves.
     *
     * @param row The prepared feature values.
     * @returns One averaged score per output.
     */
    private treeScores(row: readonly number[]): number[] {
        const feature = this.arrays.node_feature as Int32Array;
        const threshold = this.arrays.node_threshold as Float32Array;
        const left = this.arrays.node_left as Int32Array;
        const right = this.arrays.node_right as Int32Array;
        const leaf = this.arrays.leaf_value as Float32Array;
        const offsets = this.arrays.tree_offset as Int32Array;
        const outputs = this.header.n_outputs;
        const trees = offsets.length - 1;

        const totals = new Array<number>(outputs).fill(0);
        for (let tree = 0; tree < trees; tree += 1) {
            let node = offsets[tree] as number;
            let column = feature[node] as number;
            while (column >= 0) {
                node =
                    (row[column] as number) <= (threshold[node] as number)
                        ? (left[node] as number)
                        : (right[node] as number);
                column = feature[node] as number;
            }
            const slot = (-1 - column) * outputs;
            for (let output = 0; output < outputs; output += 1) {
                totals[output] += leaf[slot + output] as number;
            }
        }
        for (let output = 0; output < outputs; output += 1) {
            totals[output] = (totals[output] as number) / trees;
        }
        return totals;
    }

    /**
     * Turn raw scores into labels and probabilities.
     *
     * @param scores One score array per row.
     * @returns Labels and probabilities in the shape the ONNX route uses,
     *   so an app can swap runtimes without touching its own code. That
     *   includes the label's **type**: an integer class comes back as a
     *   number here exactly as ONNX returns it, because two routes over one
     *   model that disagree on `0` versus `"0"` break the day someone
     *   switches.
     */
    private finish(scores: readonly number[][]): {
        labels: PredictedLabel[];
        probabilities: number[][];
    } {
        const link = this.header.link;
        const classes = this.header.classes;

        if (link === "identity") {
            return { labels: scores.map((row) => row[0] as number), probabilities: [] };
        }

        const probabilities = scores.map((row) => {
            if (link === "sigmoid") {
                const positive = 1 / (1 + Math.exp(-(row[0] as number)));
                return [1 - positive, positive];
            }
            if (link === "softmax") {
                const highest = Math.max(...row);
                const exponentiated = row.map((value) => Math.exp(value - highest));
                const total = exponentiated.reduce((sum, value) => sum + value, 0);
                return exponentiated.map((value) => value / total);
            }
            const total = row.reduce((sum, value) => sum + value, 0);
            return total === 0 ? [...row] : row.map((value) => value / total);
        });

        const numeric = this.header.class_type !== "str";
        const labels = probabilities.map((row) => {
            let best = 0;
            for (let index = 1; index < row.length; index += 1) {
                if ((row[index] as number) > (row[best] as number)) best = index;
            }
            const label = classes[best];
            if (label === undefined) return best;
            return numeric ? Number(label) : label;
        });

        return { labels, probabilities };
    }
}

/**
 * Read a source into an `ArrayBuffer`.
 *
 * @param source A URL or the bytes.
 * @param requestInit `fetch` options.
 * @returns The bytes.
 * @throws {@link ModelFetchError} when the URL cannot be read.
 */
async function toBuffer(
    source: string | ArrayBuffer | Uint8Array,
    requestInit?: RequestInit,
): Promise<ArrayBuffer> {
    if (typeof source === "string") {
        let response: Response;
        try {
            response = await fetch(source, requestInit);
        } catch (error) {
            throw new ModelFetchError(`Could not download the model: ${source}`, {
                cause: error,
            });
        }
        if (!response.ok) {
            throw new ModelFetchError(
                `Could not download the model: ${response.status} ${response.statusText}`,
            );
        }
        return await response.arrayBuffer();
    }
    if (source instanceof Uint8Array) {
        return source.buffer.slice(
            source.byteOffset,
            source.byteOffset + source.byteLength,
        ) as ArrayBuffer;
    }
    return source;
}

/**
 * Check a batch before predicting on it.
 *
 * @param rows The batch.
 * @param expected Features the model wants per row.
 * @returns The batch width.
 * @throws {@link FeatureShapeError} when the batch cannot be predicted on.
 */
function validateRows(rows: readonly FeatureRow[], expected: number): number {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new FeatureShapeError("predict() needs at least one row, shaped [[f1, f2, ...]].");
    }
    const width = rows[0]?.length ?? 0;
    const ragged = rows.findIndex((row) => row.length !== width);
    if (ragged !== -1) {
        throw new FeatureShapeError(
            `All rows must have the same width; row ${ragged} has ` +
                `${rows[ragged]?.length} values, expected ${width}.`,
        );
    }
    if (width !== expected) {
        throw new FeatureShapeError(
            `The model expects ${expected} features per row, got ${width}.`,
        );
    }
    return width;
}
