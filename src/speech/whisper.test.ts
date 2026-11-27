import { describe, expect, it, vi } from "vitest";

import { createWhisperTokenizer } from "./tokenizer";
import { compressionRatio, createWhisperModel, type WhisperParts } from "./whisper";

/** Minimal stand-in for `ort.Tensor`. */
class FakeTensor {
    constructor(
        readonly type: string,
        readonly data: unknown,
        readonly dims: readonly number[],
    ) {}
}

const VOCAB = 51_865;
const SOT = 50258;
const EOT = 50257;
const EN = 50259;
const PT = 50267;
const TRANSCRIBE = 50359;
const TRANSLATE = 50358;
const NO_TIMESTAMPS = 50363;

/**
 * Logits that make `winner` the argmax, with `runnerUp` second.
 *
 * @param winner Highest id.
 * @param runnerUp Second-highest id.
 * @returns A logits row.
 */
function logitsFor(winner: number, runnerUp = 0): Float32Array {
    const row = new Float32Array(VOCAB).fill(-10);
    row[runnerUp] = 5;
    row[winner] = 9;
    return row;
}

/**
 * Model parts whose decoder emits `script` one id per step.
 *
 * @param script Ids the decoder produces, in order (each with a runner-up).
 * @returns Parts plus the recorded decoder feeds.
 */
function parts(script: [number, number?][]) {
    const feeds: Record<string, FakeTensor>[] = [];
    let call = 0;
    const encoder = {
        run: vi.fn(async (input: Record<string, FakeTensor>) => ({
            last_hidden_state: new FakeTensor("float32", new Float32Array(1), [1, 1500, 4]),
            _dims: input.input_features?.dims,
        })),
        release: vi.fn(async () => undefined),
    };
    const decoder = {
        run: vi.fn(async (input: Record<string, FakeTensor>) => {
            feeds.push(input);
            const [winner, runnerUp] = script[Math.min(call, script.length - 1)] as [
                number,
                number?,
            ];
            call += 1;
            const out: Record<string, FakeTensor> = {
                logits: new FakeTensor("float32", logitsFor(winner, runnerUp), [1, 1, VOCAB]),
            };
            for (const kind of ["decoder.key", "decoder.value", "encoder.key", "encoder.value"]) {
                out[`present.0.${kind}`] = new FakeTensor("float32", new Float32Array(call), [
                    1,
                    2,
                    call,
                    2,
                ]);
            }
            return out;
        }),
        release: vi.fn(async () => undefined),
    };
    const vocab: Record<string, number> = { Ġbom: 10, Ġdia: 11, Ġhello: 12 };
    const value: WhisperParts = {
        runtime: { Tensor: FakeTensor } as unknown as WhisperParts["runtime"],
        encoder: encoder as unknown as WhisperParts["encoder"],
        decoder: decoder as unknown as WhisperParts["decoder"],
        config: { decoder_layers: 1, decoder_attention_heads: 2, d_model: 4, num_mel_bins: 80 },
        generation: {
            decoder_start_token_id: SOT,
            eos_token_id: EOT,
            no_timestamps_token_id: NO_TIMESTAMPS,
            lang_to_id: { "<|en|>": EN, "<|pt|>": PT },
            task_to_id: { transcribe: TRANSCRIBE, translate: TRANSLATE },
            suppress_tokens: [13],
            begin_suppress_tokens: [220, EOT],
        },
        tokenizer: createWhisperTokenizer({
            model: { vocab },
            added_tokens: [SOT, EOT, EN, PT, TRANSCRIBE, TRANSLATE, NO_TIMESTAMPS].map((id) => ({
                id,
                content: `<|${id}|>`,
                special: true,
            })),
        }),
        dtype: "int8",
        providers: ["wasm"],
    };
    return { value, feeds, encoder, decoder };
}

const second = (): Float32Array => new Float32Array(16_000);

describe("createWhisperModel", () => {
    it("prompts with start, language, task and no-timestamps, then feeds one token per step", async () => {
        const { value, feeds } = parts([[10], [11], [EOT]]);
        const result = await createWhisperModel(value).transcribe(second(), { language: "pt" });
        expect(result.text).toBe("bom dia");
        expect(result.language).toBe("pt");
        expect(result.degenerate).toBe(false);
        const ids = (feed: Record<string, FakeTensor>) =>
            Array.from(feed.input_ids?.data as BigInt64Array, Number);
        expect(ids(feeds[0] as Record<string, FakeTensor>)).toEqual([
            SOT,
            PT,
            TRANSCRIBE,
            NO_TIMESTAMPS,
        ]);
        expect(ids(feeds[1] as Record<string, FakeTensor>)).toEqual([10]);
        expect(feeds[0]?.use_cache_branch?.data).toEqual([false]);
        expect(feeds[1]?.use_cache_branch?.data).toEqual([true]);
    });

    it("carries the decoder cache forward and keeps the first step's encoder cache", async () => {
        const { value, feeds } = parts([[10], [11], [EOT]]);
        await createWhisperModel(value).transcribe(second(), { language: "pt" });
        expect(feeds[0]?.["past_key_values.0.decoder.key"]?.dims).toEqual([1, 2, 0, 2]);
        expect(feeds[1]?.["past_key_values.0.decoder.key"]?.dims[2]).toBe(1);
        expect(feeds[2]?.["past_key_values.0.decoder.key"]?.dims[2]).toBe(2);
        expect(feeds[2]?.["past_key_values.0.encoder.key"]?.dims[2]).toBe(1);
    });

    it("never emits a suppressed token, nor end-of-text as the first token", async () => {
        const { value } = parts([[EOT, 10], [13, 11], [EOT]]);
        const result = await createWhisperModel(value).transcribe(second(), { language: "pt" });
        expect(result.tokens).toEqual([10, 11]);
    });

    it("detects the language from the first window when none is given", async () => {
        const { value, feeds } = parts([[EN], [12], [EOT]]);
        const result = await createWhisperModel(value).transcribe(second());
        expect(result.language).toBe("en");
        expect(Array.from(feeds[1]?.input_ids?.data as BigInt64Array, Number)).toEqual([
            SOT,
            EN,
            TRANSCRIBE,
            NO_TIMESTAMPS,
        ]);
        expect(result.text).toBe("hello");
    });

    it("splits audio longer than 30 s into windows and joins them", async () => {
        const { value, encoder } = parts([[10], [EOT], [11], [EOT]]);
        const result = await createWhisperModel(value).transcribe(new Float32Array(31 * 16_000), {
            language: "pt",
        });
        expect(encoder.run).toHaveBeenCalledTimes(2);
        expect(encoder.run.mock.calls[0]?.[0].input_features?.dims).toEqual([1, 80, 3000]);
        expect(result.text).toBe("bom dia");
        expect(result.audioMs).toBe(31_000);
    });

    it("stops at maxNewTokens and reports partial text", async () => {
        const { value } = parts([[10]]);
        const partials: string[] = [];
        const result = await createWhisperModel(value).transcribe(second(), {
            language: "pt",
            maxNewTokens: 3,
            onPartial: (text) => partials.push(text),
        });
        expect(result.tokens).toHaveLength(3);
        expect(partials).toEqual(["bom", "bom bom", "bom bom bom"]);
        expect(result.degenerate).toBe(true);
    });

    it("uses the translate task", async () => {
        const { value, feeds } = parts([[EOT, 12], [EOT]]);
        await createWhisperModel(value).transcribe(second(), { language: "pt", task: "translate" });
        expect(Array.from(feeds[0]?.input_ids?.data as BigInt64Array, Number)[2]).toBe(TRANSLATE);
    });

    it("resamples MonoPcm that is not at 16 kHz", async () => {
        const { value } = parts([[EOT, 10], [EOT]]);
        const result = await createWhisperModel(value).transcribe(
            { samples: new Float32Array(48_000), sampleRate: 48_000 },
            { language: "pt" },
        );
        expect(result.audioMs).toBe(1000);
    });

    it("stops between decoder steps when aborted", async () => {
        const { value } = parts([[10]]);
        const controller = new AbortController();
        const run = createWhisperModel(value).transcribe(second(), {
            language: "pt",
            signal: controller.signal,
            onPartial: () => controller.abort(new Error("stop")),
        });
        await expect(run).rejects.toThrow("stop");
    });

    it("refuses an unknown language or task", async () => {
        const model = createWhisperModel(parts([[EOT]]).value);
        await expect(model.transcribe(second(), { language: "xx" })).rejects.toThrow(
            /language "xx"/,
        );
        await expect(
            model.transcribe(second(), { language: "pt", task: "summarize" as "translate" }),
        ).rejects.toThrow(/task/);
    });

    it("reports where the time went and releases both sessions", async () => {
        const { value, encoder, decoder } = parts([[10], [EOT]]);
        const model = createWhisperModel(value);
        const result = await model.transcribe(second(), { language: "pt" });
        expect(result.timings.totalMs).toBeGreaterThanOrEqual(result.timings.encoderMs);
        expect(model.dtype).toBe("int8");
        await model.release();
        expect(encoder.release).toHaveBeenCalled();
        expect(decoder.release).toHaveBeenCalled();
    });

    describe("compressionRatio", () => {
        it("tells real speech from the loop measured on WebGPU", () => {
            const speech =
                "And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.";
            expect(compressionRatio(speech)).toBeLessThan(2.4);
            expect(compressionRatio(`Wars${"!".repeat(220)}`)).toBeGreaterThan(2.4);
            expect(compressionRatio("")).toBe(0);
        });
    });
});
