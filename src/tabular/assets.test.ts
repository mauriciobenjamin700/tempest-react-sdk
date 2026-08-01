/**
 * Tests for the runtime-asset helpers.
 *
 * The list of WebAssembly binaries is not decoration: ONNX Runtime Web
 * fetches one of them at session creation, and an app that does not ship
 * them fails offline with an error that never names the missing file.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("onnxruntime-web", () => ({ env: { wasm: { wasmPaths: undefined } } }));

const ort = await import("onnxruntime-web");
const { ORT_WASM_ASSETS, configureOrtAssets, ortAssetUrls } = await import("./assets");

describe("tabular · runtime assets", () => {
    it("lists the binaries the runtime may request", () => {
        expect(ORT_WASM_ASSETS).toContain("ort-wasm-simd-threaded.jsep.wasm");
        expect(ORT_WASM_ASSETS.every((asset) => asset.startsWith("ort-wasm"))).toBe(true);
    });

    it("points the runtime at a local directory", () => {
        configureOrtAssets("/ort/");
        expect(ort.env.wasm.wasmPaths).toBe("/ort/");
    });

    it("tolerates a missing trailing slash", () => {
        configureOrtAssets("/assets/ort");
        expect(ort.env.wasm.wasmPaths).toBe("/assets/ort/");
    });

    it("builds precache URLs for every binary", () => {
        const urls = ortAssetUrls("/ort");
        expect(urls).toHaveLength(ORT_WASM_ASSETS.length);
        expect(urls[0]).toBe(`/ort/${ORT_WASM_ASSETS[0]}`);
        expect(urls.every((url) => url.startsWith("/ort/"))).toBe(true);
    });
});
