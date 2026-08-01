/**
 * The runtime's own assets, which are the other half of working offline.
 *
 * ONNX Runtime Web does **not** embed its WebAssembly binary, not even in
 * the `.bundle` builds. Measured in Chromium: the default entry fetches
 * `ort-wasm-simd-threaded.jsep.wasm` at session creation, and serving the
 * app without that file fails with `Aborted(both async and sync fetching of
 * the wasm failed)` — an error that says nothing about the missing file.
 *
 * So an offline app has to ship those binaries and precache them. This
 * module names them and points the runtime at a local directory.
 */

import * as ort from "onnxruntime-web";

/**
 * The WebAssembly binaries ONNX Runtime Web may request.
 *
 * Which one is fetched depends on the browser's threading and SIMD support,
 * so an app that must work everywhere ships all of them. Chromium with the
 * default entry point fetched the `jsep` build.
 */
export const ORT_WASM_ASSETS: readonly string[] = [
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.jsep.wasm",
    "ort-wasm-simd-threaded.jsep.mjs",
];

/**
 * Point ONNX Runtime Web at locally served WebAssembly binaries.
 *
 * Call once, before creating any predictor.
 *
 * @example
 * ```ts
 * configureOrtAssets("/ort/");
 * const predictor = await TabularPredictor.create("/models/classifier.onnx");
 * ```
 *
 * @param basePath Directory the binaries are served from, with a trailing
 *   slash. Copy them there at build time — for Vite, from
 *   `node_modules/onnxruntime-web/dist/`.
 */
export function configureOrtAssets(basePath: string): void {
    ort.env.wasm.wasmPaths = basePath.endsWith("/") ? basePath : `${basePath}/`;
}

/**
 * The URLs a service worker should precache for offline inference.
 *
 * The model file is not included: it is cached by
 * {@link fetchModelBytes} on first use, under its own bucket.
 *
 * @example
 * ```ts
 * installPrecache([...ortAssetUrls("/ort/"), "/index.html"]);
 * ```
 *
 * @param basePath Directory the binaries are served from.
 * @returns Absolute-from-root URLs for every runtime asset.
 */
export function ortAssetUrls(basePath: string): string[] {
    const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
    return ORT_WASM_ASSETS.map((asset) => `${prefix}${asset}`);
}
