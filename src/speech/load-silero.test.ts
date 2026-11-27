import { afterEach, describe, expect, it, vi } from "vitest";

const env = { wasm: { wasmPaths: undefined as unknown } };
const create = vi.fn(async () => ({ run: vi.fn(), release: vi.fn(async () => undefined) }));

vi.mock("onnxruntime-web", () => ({
    InferenceSession: { create: (...args: unknown[]) => create(...(args as [])) },
    Tensor: class {},
    env,
}));

import { loadSileroVad } from "./vad";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadSileroVad", () => {
    it("fetches the model, points the runtime at the wasm and builds a wasm session", async () => {
        vi.stubGlobal("caches", undefined);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("onnx-bytes")),
        );
        const vad = await loadSileroVad({
            modelUrl: "/models/silero_vad.onnx",
            ortAssetsUrl: "/ort",
        });
        expect(fetch).toHaveBeenCalledWith("/models/silero_vad.onnx", undefined);
        expect(env.wasm.wasmPaths).toBe("/ort/");
        expect(create).toHaveBeenCalledWith(expect.any(Uint8Array), {
            executionProviders: ["wasm"],
        });
        await vad.release();
    });
});
