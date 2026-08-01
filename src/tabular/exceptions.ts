/**
 * Errors thrown by the tabular inference module.
 *
 * Each one exists because the underlying failure is unreadable on its own:
 * ONNX Runtime reports a missing operator registration, and the actual cause
 * is an import path chosen three files away.
 *
 * Every subclass sets `name` to a **literal** string rather than to
 * `new.target.name`. Measured in a real build: the minifier renames the
 * class, so the derived form ships as `error.name === "t"` — useless in a
 * log and in any consumer that branches on the name.
 */

/** Base class for every error this module throws. */
export class TabularError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "TabularError";
    }
}

/** The model bytes could not be loaded into a session. */
export class ModelLoadError extends TabularError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ModelLoadError";
    }
}

/**
 * The runtime has no kernels for this graph's operators.
 *
 * Measured, and the reason this class exists: importing
 * `onnxruntime-web/webgpu` loads a WebAssembly build without the
 * `ai.onnx.ml` domain, so creating a session over any scikit-learn export
 * fails with `No Op registered for TreeEnsembleClassifier`. The message
 * names the fix, because the raw error points at the model instead of at
 * the import.
 */
export class UnsupportedGraphError extends TabularError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "UnsupportedGraphError";
    }
}

/** The rows do not match what the model expects. */
export class FeatureShapeError extends TabularError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "FeatureShapeError";
    }
}

/** The session ran but its outputs could not be read. */
export class InferenceError extends TabularError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "InferenceError";
    }
}

/**
 * The model bytes could not be fetched or read from the cache.
 *
 * Distinct from {@link ModelLoadError}: this one means the app is offline
 * and nothing was cached, which is a deployment problem, not a model
 * problem.
 */
export class ModelFetchError extends TabularError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ModelFetchError";
    }
}
