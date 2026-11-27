import { afterEach, describe, expect, it, vi } from "vitest";

const env = { wasm: { wasmPaths: undefined as unknown } };
const release = vi.fn(async () => undefined);
const create = vi.fn(async () => ({
    inputNames: ["waveform"],
    outputNames: ["output_0"],
    run: vi.fn(),
    release,
}));

vi.mock("onnxruntime-web", () => ({
    InferenceSession: { create: (...args: unknown[]) => create(...(args as [])) },
    Tensor: class {},
    env,
}));

import { loadAudioModel } from "./audio-model";
import { loadSoundClassifier } from "./sound-classifier";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("loading audio models", () => {
    it("fetches the model, points the runtime at the wasm and builds a wasm session", async () => {
        vi.stubGlobal("caches", undefined);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("onnx")),
        );
        const model = await loadAudioModel({
            modelUrl: "/m.onnx",
            feature: "waveform",
            ortAssetsUrl: "/ort",
        });
        expect(env.wasm.wasmPaths).toBe("/ort/");
        expect(create).toHaveBeenCalledWith(expect.any(Uint8Array), {
            executionProviders: ["wasm"],
        });
        expect(model.sampleRate).toBe(16_000);
        expect(model.outputNames).toEqual(["output_0"]);
    });

    it("reads the class map from labelsUrl, and releases through the classifier", async () => {
        vi.stubGlobal("caches", undefined);
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) =>
                url.endsWith(".csv")
                    ? new Response('index,mid,display_name\n0,/m/1,Speech\n1,/m/2,"Beep, bleep"\n')
                    : new Response("onnx"),
            ),
        );
        const classifier = await loadSoundClassifier({ modelUrl: "/y.onnx", labelsUrl: "/y.csv" });
        expect(classifier.labels).toEqual(["Speech", "Beep, bleep"]);
        await classifier.release();
        expect(release).toHaveBeenCalled();
    });

    it("takes labels directly and refuses neither labels nor labelsUrl, or a missing class map", async () => {
        vi.stubGlobal("caches", undefined);
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) =>
                url.endsWith(".csv") ? new Response("", { status: 404 }) : new Response("onnx"),
            ),
        );
        const direct = await loadSoundClassifier({ modelUrl: "/y.onnx", labels: ["a"] });
        expect(direct.labels).toEqual(["a"]);
        await expect(loadSoundClassifier({ modelUrl: "/y.onnx" })).rejects.toThrow(
            /labels or labelsUrl/,
        );
        await expect(
            loadSoundClassifier({ modelUrl: "/y.onnx", labelsUrl: "/y.csv" }),
        ).rejects.toThrow(/404/);
    });
});
