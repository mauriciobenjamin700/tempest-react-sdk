/**
 * Types for browser inference over tabular models exported from scikit-learn.
 */

/** Anything `InferenceSession.create` accepts as a model. */
export type TabularModelSource = string | ArrayBufferLike | Uint8Array;

/** One row of feature values, in the column order the model was trained on. */
export type FeatureRow = readonly number[];

/**
 * A predicted class label.
 *
 * scikit-learn classifiers export an int64 label tensor, which ONNX Runtime
 * Web surfaces as `bigint`. Those are converted to `number` — a class index
 * never approaches `Number.MAX_SAFE_INTEGER`, and leaving `bigint` in the
 * result would break `JSON.stringify` and every `=== 1` comparison a caller
 * writes. A model trained on string labels keeps them as strings.
 */
export type PredictedLabel = number | string;

/** What a loaded predictor is, and how it is configured. */
export interface TabularPredictorInfo {
    /** Graph input name. Not a constant: exporters choose it. */
    readonly inputName: string;
    /** Features per row, or `null` when the graph does not declare it. */
    readonly numFeatures: number | null;
    /** Every graph output, in order. */
    readonly outputNames: readonly string[];
    /** The output holding predicted classes or regressed values. */
    readonly labelOutput: string;
    /** The output holding class scores, when the graph produces them. */
    readonly probabilityOutput: string | null;
    /** Whether a score output was found. */
    readonly isClassifier: boolean;
    /** Execution providers actually in use. */
    readonly providers: readonly string[];
}

/** One batch of predictions. */
export interface TabularPrediction {
    /** Predicted class or regressed value per row. */
    readonly labels: readonly PredictedLabel[];
    /** Class scores per row; empty for a regressor. */
    readonly probabilities: readonly (readonly number[])[];
    /** Rows predicted. */
    readonly numRows: number;
    /** Wall-clock inference duration in milliseconds. */
    readonly ms: number;
}

/** Options for {@link TabularPredictor.create}. */
export interface TabularPredictorOptions {
    /**
     * Execution providers in preference order.
     *
     * Defaults to `["wasm"]`, and that is not a placeholder: scikit-learn
     * graphs are built from `ai.onnx.ml` operators (`TreeEnsembleClassifier`,
     * `LinearClassifier`, `Scaler`), which only the WebAssembly backend
     * implements.
     */
    readonly providers?: readonly string[];
    /**
     * Run one throwaway inference at creation, so the first real prediction
     * does not pay for allocation and kernel selection.
     */
    readonly warmup?: boolean;
    /** Session options forwarded verbatim to ONNX Runtime Web. */
    readonly sessionOptions?: Record<string, unknown>;
}
