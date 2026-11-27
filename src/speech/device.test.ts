import { afterEach, describe, expect, it, vi } from "vitest";

import { assessSpeechDevice } from "./device";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("assessSpeechDevice", () => {
    it("clears a device with WebAssembly SIMD (Node and jsdom have it)", () => {
        const device = assessSpeechDevice();
        expect(device.wasmSimd).toBe(true);
        expect(device.canRun).toBe(true);
    });

    it("rules out an engine without SIMD", () => {
        vi.spyOn(WebAssembly, "validate").mockReturnValue(false);
        expect(assessSpeechDevice()).toMatchObject({ canRun: false, blockers: ["no-wasm-simd"] });
    });

    it("rules out an engine without WebAssembly at all", () => {
        vi.stubGlobal("WebAssembly", undefined);
        expect(assessSpeechDevice().blockers).toEqual(["no-webassembly"]);
    });

    it("rules out a device reporting less memory than the floor", () => {
        vi.stubGlobal("navigator", { ...navigator, deviceMemory: 1, hardwareConcurrency: 4 });
        expect(assessSpeechDevice().blockers).toContain("low-memory");
        expect(assessSpeechDevice({ minMemoryGb: 1 }).canRun).toBe(true);
    });

    it("reports threads and WebGPU", () => {
        vi.stubGlobal("crossOriginIsolated", true);
        vi.stubGlobal("navigator", { ...navigator, gpu: {} });
        expect(assessSpeechDevice()).toMatchObject({ wasmThreads: true, webgpu: true });
    });
});
