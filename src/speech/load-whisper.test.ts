import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async (_bytes: Uint8Array, _options: unknown) => ({
    run: vi.fn(),
    release: vi.fn(async () => undefined),
}));

vi.mock("onnxruntime-web", () => ({
    InferenceSession: { create: (bytes: Uint8Array, options: unknown) => create(bytes, options) },
    Tensor: class {},
}));

import { loadWhisper } from "./whisper";

const FILES: Record<string, unknown> = {
    "config.json": {
        decoder_layers: 4,
        decoder_attention_heads: 6,
        d_model: 384,
        num_mel_bins: 80,
    },
    "generation_config.json": {
        decoder_start_token_id: 50258,
        eos_token_id: 50257,
        no_timestamps_token_id: 50363,
        lang_to_id: { "<|pt|>": 50267 },
        task_to_id: { transcribe: 50359 },
        suppress_tokens: [],
        begin_suppress_tokens: [],
    },
    "tokenizer.json": { model: { vocab: {} } },
};

let requested: string[] = [];

beforeEach(() => {
    requested = [];
    create.mockClear();
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            requested.push(url);
            const name = url.replace("https://cdn.example/whisper-tiny/", "");
            const body = name in FILES ? JSON.stringify(FILES[name]) : "onnx-bytes";
            return new Response(body, { headers: { "content-length": String(body.length) } });
        }),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadWhisper", () => {
    it("fetches the int8 export by default and builds both sessions on wasm", async () => {
        const model = await loadWhisper({ baseUrl: "https://cdn.example/whisper-tiny/" });
        expect(requested).toEqual(
            expect.arrayContaining([
                "https://cdn.example/whisper-tiny/onnx/encoder_model_int8.onnx",
                "https://cdn.example/whisper-tiny/onnx/decoder_model_merged_int8.onnx",
                "https://cdn.example/whisper-tiny/tokenizer.json",
            ]),
        );
        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[0]?.[1]).toEqual({ executionProviders: ["wasm"] });
        expect(model).toMatchObject({ dtype: "int8", providers: ["wasm"] });
    });

    it("loads the fp32 files without a suffix, on the providers asked for", async () => {
        await loadWhisper({
            baseUrl: "https://cdn.example/whisper-tiny",
            dtype: "fp32",
            providers: ["webgpu", "wasm"],
        });
        expect(requested).toContain("https://cdn.example/whisper-tiny/onnx/encoder_model.onnx");
        expect(create.mock.calls[0]?.[1]).toEqual({ executionProviders: ["webgpu", "wasm"] });
    });

    it("reports download progress per file", async () => {
        const progress = vi.fn();
        await loadWhisper({ baseUrl: "https://cdn.example/whisper-tiny", onProgress: progress });
        expect(progress).toHaveBeenCalledWith({
            file: "onnx/encoder_model_int8.onnx",
            loaded: 10,
            total: 10,
        });
    });
});
