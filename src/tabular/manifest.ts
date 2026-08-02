/**
 * Reading an edge package published by `tempest-fastapi-sdk`.
 *
 * `edge_pipeline` writes a directory — the graph, a gzipped copy, a drift
 * baseline and a `manifest.json` — and the browser is one of its two
 * intended consumers. The manifest is what turns a `.onnx` URL into
 * something a UI can use: the **column order** the model was trained on,
 * the class names behind `probabilities[2]`, and a version to compare
 * against what is already cached.
 *
 * That column order is the field worth loading a manifest for. A model fed
 * the right features in the wrong order answers confidently and wrongly,
 * and no runtime check catches it.
 *
 * The contract is pinned by `schema_version`. Unknown fields are ignored
 * rather than rejected, so a package written by a newer SDK still loads.
 */

import { fetchModelBytes, type ModelCacheOptions } from "./cache";
import { CompactPredictor } from "./compact";
import { ModelFetchError } from "./exceptions";
import { TabularPredictor } from "./predictor";
import type { FeatureRow, TabularPrediction, TabularPredictorOptions } from "./types";

/** Manifest schema version this reader was written against. */
export const SUPPORTED_MANIFEST_SCHEMA = 1;

/** Fixed filename inside a package directory. */
export const MANIFEST_FILENAME = "manifest.json";

/** The graph file and how to check you got it whole. */
export interface ManifestModelFile {
    readonly file: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly gzip_file: string | null;
    readonly gzip_bytes: number | null;
    readonly opset: number;
    readonly dtype: string;
}

/** What the graph expects per row. */
export interface ManifestInput {
    readonly name: string;
    readonly features: number;
    /** Column order used at training time. */
    readonly feature_names: readonly string[];
}

/** What the graph answers. */
export interface ManifestOutput {
    readonly is_classifier: boolean;
    readonly label_output: string;
    readonly probability_output: string | null;
    /** Class labels in score-column order. */
    readonly classes: readonly string[];
}

/**
 * Where the packaged model came from, when it came from an existing
 * artifact.
 *
 * Present when the package was built with `edge_pipeline_from_pickle`: the
 * `.pkl` never reaches the browser (a pickle is a Python program, not
 * data), but its name and digest travel in the manifest, so a model
 * answering in a tab can be traced back to the file that produced it.
 */
export interface ManifestSource {
    readonly file: string;
    readonly kind: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly sklearn_version: string;
    readonly warnings: readonly string[];
}

/**
 * One file in the package a runtime can load.
 *
 * A package may carry the same model twice — as ONNX, which any runtime
 * reads at the cost of a 25.6 MB WebAssembly download, and as the compact
 * format, which needs no runtime. The list is what lets the browser pick
 * by what it already ships.
 */
export interface ManifestRuntime {
    readonly kind: "onnx" | "compact" | string;
    readonly file: string;
    readonly bytes: number;
    readonly gzip_file: string | null;
    readonly gzip_bytes: number | null;
    readonly sha256: string;
}

/** The package manifest, as written by `edge_pipeline`. */
export interface EdgeManifest {
    readonly schema_version: number;
    readonly name: string;
    readonly version: string;
    readonly created_at: string;
    readonly sdk_version: string;
    readonly estimator: string;
    readonly model: ManifestModelFile;
    readonly input: ManifestInput;
    readonly output: ManifestOutput;
    readonly verified: boolean | null;
    /** Every file a runtime can load. Absent on packages written before v0.194. */
    readonly runtimes?: readonly ManifestRuntime[];
    /** Absent on packages built straight from a fitted estimator. */
    readonly source?: ManifestSource;
    readonly baseline_file: string | null;
    readonly baseline_samples: number;
}

/** Which reader served the package. */
export type TabularRuntime = "onnx" | "compact";

/** A package loaded and ready to answer. */
export interface LoadedEdgePackage {
    /** What was published. */
    readonly manifest: EdgeManifest;
    /** The running model, whichever runtime read it. */
    readonly predictor: PredictorLike;
    /** Which reader was used. */
    readonly runtime: TabularRuntime;
    /** Column order the rows must follow. */
    readonly featureNames: readonly string[];
    /** Class names behind each probability column. */
    readonly classes: readonly string[];
    /**
     * Map a prediction's scores onto class names.
     *
     * @param probabilities One row of scores.
     * @returns Name/score pairs, highest first.
     */
    readonly explain: (probabilities: readonly number[]) => { name: string; score: number }[];
}

/**
 * The shape both readers share.
 *
 * `TabularPredictor` (ONNX) and `CompactPredictor` (runtime-free) answer
 * with the same object, so an app can switch routes without touching a
 * line of its own code.
 */
export interface PredictorLike {
    predict(rows: readonly FeatureRow[]): Promise<TabularPrediction>;
    dispose(): Promise<void>;
}

/** Options for {@link loadEdgePackage}. */
export interface LoadEdgePackageOptions extends TabularPredictorOptions {
    /** Cache the model bytes for offline use. `true` by default. */
    readonly cache?: boolean | ModelCacheOptions;
    /**
     * Which reader to use.
     *
     * `"auto"` (the default) takes the compact form when the package has
     * one, because it answers without downloading a WebAssembly runtime.
     * Force `"onnx"` when the app already ships ONNX for something else —
     * then the runtime is already paid for and ONNX covers more estimators.
     */
    readonly runtime?: TabularRuntime | "auto";
}

/**
 * Read a package's manifest.
 *
 * Cheap: it is a few hundred bytes, so an app can check for a new version
 * without downloading a model it may already have.
 *
 * @example
 * ```ts
 * const manifest = await fetchEdgeManifest("/models/risk/");
 * if (manifest.version !== localStorage.getItem("risk-version")) {
 *     // a new model was published
 * }
 * ```
 *
 * @param directoryUrl URL of the package directory, with or without a
 *   trailing slash. A full URL to the manifest file also works.
 * @param requestInit `fetch` options.
 * @returns The parsed manifest.
 * @throws {@link ModelFetchError} when the manifest cannot be read, or when
 *   its `schema_version` is newer than this reader understands — loading it
 *   anyway would risk misreading the field that defines column order.
 */
export async function fetchEdgeManifest(
    directoryUrl: string,
    requestInit?: RequestInit,
): Promise<EdgeManifest> {
    const url = manifestUrl(directoryUrl);
    let response: Response;
    try {
        response = await fetch(url, requestInit);
    } catch (error) {
        throw new ModelFetchError(`Could not read the manifest at ${url}`, {
            cause: error,
        });
    }
    if (!response.ok) {
        throw new ModelFetchError(
            `Could not read the manifest at ${url}: ${response.status} ${response.statusText}`,
        );
    }

    const manifest = (await response.json()) as EdgeManifest;
    if (typeof manifest?.schema_version !== "number") {
        throw new ModelFetchError(`${url} is not an edge package manifest (no schema_version).`);
    }
    if (manifest.schema_version > SUPPORTED_MANIFEST_SCHEMA) {
        throw new ModelFetchError(
            `The manifest at ${url} uses schema_version ${manifest.schema_version}, ` +
                `and this SDK understands ${SUPPORTED_MANIFEST_SCHEMA}. Upgrade ` +
                "tempest-react-sdk before serving this package.",
        );
    }
    return manifest;
}

/**
 * Load a whole edge package: manifest, model, and the names to read it by.
 *
 * @example
 * ```ts
 * const pkg = await loadEdgePackage("/models/risk/");
 *
 * console.log(pkg.featureNames); // ["age", "income", "tenure", "score", "visits"]
 *
 * const { probabilities } = await pkg.predictor.predict([[41, 5200, 3, 0.82, 12]]);
 * console.log(pkg.explain(probabilities[0]!)); // [{ name: "approved", score: 0.91 }, ...]
 * ```
 *
 * @param directoryUrl URL of the package directory.
 * @param options Predictor options plus caching.
 * @returns The loaded package.
 * @throws {@link ModelFetchError} when the manifest or model cannot be read.
 */
export async function loadEdgePackage(
    directoryUrl: string,
    options: LoadEdgePackageOptions = {},
): Promise<LoadedEdgePackage> {
    const manifest = await fetchEdgeManifest(directoryUrl);
    const base = directoryUrl.endsWith("/") ? directoryUrl : `${directoryUrl}/`;
    const runtime = chooseRuntime(manifest, options.runtime ?? "auto");
    const file = fileFor(manifest, runtime);
    const modelUrl = `${base}${file}`;

    const cache = options.cache ?? true;
    const source =
        cache === false
            ? modelUrl
            : await fetchModelBytes(modelUrl, typeof cache === "object" ? cache : {});

    const predictor: PredictorLike =
        runtime === "compact"
            ? await CompactPredictor.create(source)
            : await TabularPredictor.create(source, {
                  providers: options.providers,
                  warmup: options.warmup,
                  sessionOptions: options.sessionOptions,
              });

    const classes = manifest.output.classes;
    return {
        manifest,
        predictor,
        runtime,
        featureNames: manifest.input.feature_names,
        classes,
        explain: (probabilities: readonly number[]) =>
            probabilities
                .map((score, index) => ({
                    name: classes[index] ?? String(index),
                    score,
                }))
                .sort((a, b) => b.score - a.score),
    };
}

/**
 * Decide which reader serves this package.
 *
 * @param manifest The package manifest.
 * @param requested What the caller asked for.
 * @returns The runtime to use.
 * @throws {@link ModelFetchError} when the package does not carry the
 *   requested form — asking for a compact model that was never written
 *   should say so, not silently download 25 MB of WebAssembly instead.
 */
function chooseRuntime(manifest: EdgeManifest, requested: TabularRuntime | "auto"): TabularRuntime {
    const available = manifest.runtimes ?? [];
    const hasCompact = available.some((entry) => entry.kind === "compact");

    if (requested === "auto") return hasCompact ? "compact" : "onnx";
    if (requested === "compact" && !hasCompact) {
        throw new ModelFetchError(
            `This package carries no compact model (${manifest.name} lists ` +
                `${available.map((entry) => entry.kind).join(", ") || "onnx"}). ` +
                "Re-export it with edge_pipeline(compact=True), or load it as ONNX.",
        );
    }
    return requested;
}

/**
 * Find the file a runtime reads.
 *
 * @param manifest The package manifest.
 * @param runtime The chosen runtime.
 * @returns The filename inside the package directory.
 */
function fileFor(manifest: EdgeManifest, runtime: TabularRuntime): string {
    const entry = (manifest.runtimes ?? []).find((item) => item.kind === runtime);
    return entry?.file ?? manifest.model.file;
}

/**
 * Resolve a directory URL to its manifest file.
 *
 * @param directoryUrl The package directory, or the manifest itself.
 * @returns The manifest URL.
 */
function manifestUrl(directoryUrl: string): string {
    if (directoryUrl.endsWith(".json")) return directoryUrl;
    return directoryUrl.endsWith("/")
        ? `${directoryUrl}${MANIFEST_FILENAME}`
        : `${directoryUrl}/${MANIFEST_FILENAME}`;
}
