/**
 * Tests for the runtime-asset helpers.
 *
 * The list of WebAssembly binaries is not decoration: ONNX Runtime Web
 * fetches one of them at session creation, and an app that does not ship
 * them fails offline with an error that never names the missing file.
 */

import { describe, expect, it } from "vitest";

const { ORT_WASM_ASSETS, configureOrtAssets, configuredOrtAssetPath, ortAssetUrls } =
    await import("./assets");

describe("tabular · runtime assets", () => {
    it("lists the binaries the runtime may request", () => {
        expect(ORT_WASM_ASSETS).toContain("ort-wasm-simd-threaded.jsep.wasm");
        expect(ORT_WASM_ASSETS.every((asset) => asset.startsWith("ort-wasm"))).toBe(true);
    });

    it("remembers where the binaries live", () => {
        /**
         * Remembered rather than pushed into the runtime, because this
         * module must not import `onnxruntime-web`: an app on the compact
         * route has no runtime, and a static import here would force it to
         * install the peer anyway.
         */
        configureOrtAssets("/ort/");
        expect(configuredOrtAssetPath()).toBe("/ort/");
    });

    it("tolerates a missing trailing slash", () => {
        configureOrtAssets("/assets/ort");
        expect(configuredOrtAssetPath()).toBe("/assets/ort/");
    });

    it("builds precache URLs for every binary", () => {
        const urls = ortAssetUrls("/ort");
        expect(urls).toHaveLength(ORT_WASM_ASSETS.length);
        expect(urls[0]).toBe(`/ort/${ORT_WASM_ASSETS[0]}`);
        expect(urls.every((url) => url.startsWith("/ort/"))).toBe(true);
    });
});
