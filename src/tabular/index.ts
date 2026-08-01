/**
 * `tempest-react-sdk/tabular` — scikit-learn models running in the browser,
 * offline.
 *
 * The counterpart to `tempest-fastapi-sdk`'s edge serving layer: the same
 * model file, the same contract, on the client instead of a device. Export
 * with `export_sklearn_to_onnx`, serve the `.onnx` as a static asset, and
 * predict without a round trip.
 *
 * `onnxruntime-web` is an optional peer dependency — install it, and copy
 * its WebAssembly binaries into your public directory, only when you use
 * this subpath. Import the package's **default** entry: the WebGPU build
 * has no `ai.onnx.ml` kernels and cannot load these models at all.
 */

export { ORT_WASM_ASSETS, configureOrtAssets, ortAssetUrls } from "./assets";
export {
    DEFAULT_MODEL_CACHE,
    type ModelCacheOptions,
    cacheModelBytes,
    clearModelCache,
    fetchModelBytes,
    isModelCached,
} from "./cache";
export {
    FeatureShapeError,
    InferenceError,
    ModelFetchError,
    ModelLoadError,
    TabularError,
    UnsupportedGraphError,
} from "./exceptions";
export { DEFAULT_TABULAR_PROVIDERS, TabularPredictor } from "./predictor";
export type {
    FeatureRow,
    PredictedLabel,
    TabularModelSource,
    TabularPrediction,
    TabularPredictorInfo,
    TabularPredictorOptions,
} from "./types";
export {
    type TabularPredictorStatus,
    type UseTabularPredictorOptions,
    type UseTabularPredictorResult,
    useTabularPredictor,
} from "./use-tabular-predictor";
