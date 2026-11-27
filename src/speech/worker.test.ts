import { afterEach, describe, expect, it, vi } from "vitest";

import type * as WhisperModule from "./whisper";
import type { Transcription, WhisperModel } from "./whisper";

const fakeModel = {
    dtype: "int8" as const,
    providers: ["wasm"],
    transcribe: vi.fn(),
    release: vi.fn(async () => undefined),
};
const fakeLoad = vi.fn(async (options: { onProgress?: (p: unknown) => void }) => {
    options.onProgress?.({ file: "onnx/encoder_model_int8.onnx", loaded: 5, total: 10 });
    return fakeModel as unknown as WhisperModel;
});

vi.mock("./whisper", async (original) => ({
    ...(await original<typeof WhisperModule>()),
    loadWhisper: (options: { onProgress?: (p: unknown) => void }) => fakeLoad(options),
}));

vi.mock("@/audio/decode-pcm", () => ({
    decodeAudioToPcm: vi.fn(async (_blob: Blob, options: { sampleRate: number }) => ({
        samples: new Float32Array(options.sampleRate),
        sampleRate: options.sampleRate,
    })),
}));

import { decodeAudioToPcm } from "@/audio/decode-pcm";

import { exposeWhisperWorker, loadWhisperInWorker } from "./worker";

/**
 * A worker and its global scope joined by structured cloning, as the browser does.
 *
 * @returns Both ends and the requests the page sent.
 */
function channel() {
    const toScope: ((event: MessageEvent) => void)[] = [];
    const toPage: ((event: MessageEvent) => void)[] = [];
    const sent: { type: string }[] = [];
    const deliver = (listeners: ((event: MessageEvent) => void)[], message: unknown): void => {
        const data = structuredClone(message);
        queueMicrotask(() => listeners.forEach((listener) => listener({ data } as MessageEvent)));
    };
    const scope = {
        addEventListener: (_type: "message", listener: (event: MessageEvent) => void) =>
            toScope.push(listener),
        postMessage: (message: unknown) => deliver(toPage, message),
    };
    const worker = {
        addEventListener: (_type: "message", listener: (event: MessageEvent) => void) =>
            toPage.push(listener),
        postMessage: (message: { type: string }) => {
            sent.push(message);
            deliver(toScope, message);
        },
    };
    exposeWhisperWorker(scope as never);
    return { worker: worker as never, sent };
}

const transcription = (text: string): Transcription => ({
    text,
    language: "pt",
    tokens: [1],
    audioMs: 1000,
    timings: { decodeMs: 0, featuresMs: 0, encoderMs: 0, decoderMs: 0, totalMs: 0 },
    compressionRatio: 1,
    degenerate: false,
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("Whisper in a worker", () => {
    it("loads with the serialisable options and relays download progress", async () => {
        const { worker } = channel();
        const progress = vi.fn();
        const model = await loadWhisperInWorker(worker, {
            baseUrl: "/models/whisper-base",
            onProgress: progress,
        });
        expect(fakeLoad.mock.calls[0]?.[0]).toMatchObject({ baseUrl: "/models/whisper-base" });
        expect(progress).toHaveBeenCalledWith({
            file: "onnx/encoder_model_int8.onnx",
            loaded: 5,
            total: 10,
        });
        expect(model).toMatchObject({ dtype: "int8", providers: ["wasm"] });
    });

    it("transcribes PCM in the worker and relays partial text only when asked", async () => {
        fakeModel.transcribe.mockImplementation(
            async (_audio, options: { onPartial?: (t: string) => void }) => {
                options.onPartial?.("de picos");
                return transcription("de picos pra sobral");
            },
        );
        const { worker, sent } = channel();
        const model = await loadWhisperInWorker(worker, { baseUrl: "/m" });
        const partials: string[] = [];
        const caller = new Float32Array(16_000);
        const result = await model.transcribe(caller, {
            language: "pt",
            onPartial: (t) => partials.push(t),
        });
        expect(result.text).toBe("de picos pra sobral");
        expect(partials).toEqual(["de picos"]);
        expect(caller.length).toBe(16_000);
        expect(fakeModel.transcribe.mock.calls[0]?.[1]).toMatchObject({ language: "pt" });

        await model.transcribe(new Float32Array(10), { language: "pt" });
        expect(
            sent
                .filter((m) => m.type === "transcribe")
                .map((m) => (m as unknown as { partials: boolean }).partials),
        ).toEqual([true, false]);
    });

    it("decodes a recording on the page at 48 kHz and lets the worker resample", async () => {
        fakeModel.transcribe.mockResolvedValue(transcription("ok"));
        const { worker } = channel();
        const model = await loadWhisperInWorker(worker, { baseUrl: "/m" });
        await model.transcribe(new Blob([new Uint8Array(4)]));
        expect(decodeAudioToPcm).toHaveBeenCalledWith(expect.any(Blob), { sampleRate: 48_000 });
        expect(fakeModel.transcribe.mock.calls[0]?.[0]).toMatchObject({ sampleRate: 48_000 });
    });

    it("passes MonoPcm through at its own rate", async () => {
        fakeModel.transcribe.mockResolvedValue(transcription("ok"));
        const { worker } = channel();
        const model = await loadWhisperInWorker(worker, { baseUrl: "/m" });
        await model.transcribe({ samples: new Float32Array(441), sampleRate: 44_100 });
        expect(fakeModel.transcribe.mock.calls[0]?.[0]).toMatchObject({ sampleRate: 44_100 });
    });

    it("rejects at once on abort and stops the worker's run", async () => {
        let workerSignal: AbortSignal | undefined;
        fakeModel.transcribe.mockImplementation(
            (_audio, options: { signal: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    workerSignal = options.signal;
                    options.signal.addEventListener("abort", () => reject(options.signal.reason));
                }),
        );
        const { worker } = channel();
        const model = await loadWhisperInWorker(worker, { baseUrl: "/m" });
        const controller = new AbortController();
        const run = model.transcribe(new Float32Array(10), { signal: controller.signal });
        await vi.waitFor(() => expect(workerSignal).toBeDefined());
        controller.abort(new Error("deadline"));
        await expect(run).rejects.toThrow("deadline");
        await vi.waitFor(() => expect(workerSignal?.aborted).toBe(true));
    });

    it("refuses a call already aborted without posting", async () => {
        const { worker, sent } = channel();
        const model = await loadWhisperInWorker(worker, { baseUrl: "/m" });
        const controller = new AbortController();
        controller.abort(new Error("gone"));
        await expect(
            model.transcribe(new Float32Array(1), { signal: controller.signal }),
        ).rejects.toThrow("gone");
        expect(sent.filter((m) => m.type === "transcribe")).toHaveLength(0);
    });

    it("rebuilds the worker's error with its name and message", async () => {
        fakeModel.transcribe.mockRejectedValue(
            Object.assign(new Error("wasm OOM"), { name: "RangeError" }),
        );
        const { worker } = channel();
        const model = await loadWhisperInWorker(worker, { baseUrl: "/m" });
        const failure = model.transcribe(new Float32Array(1));
        await expect(failure).rejects.toThrow("wasm OOM");
        await expect(failure).rejects.toHaveProperty("name", "RangeError");
    });

    it("reports a failed load, a non-Error throw, and a transcription before load", async () => {
        fakeLoad.mockRejectedValueOnce("offline");
        const first = channel();
        await expect(loadWhisperInWorker(first.worker, { baseUrl: "/m" })).rejects.toThrow(
            "offline",
        );

        const second = channel();
        (second.worker as { postMessage: (m: unknown) => void }).postMessage({
            id: 99,
            type: "transcribe",
            audio: { samples: new Float32Array(1), sampleRate: 16_000 },
            options: {},
            partials: false,
        });
        await vi.waitFor(() => expect(fakeModel.transcribe).not.toHaveBeenCalled());
    });

    it("releases the model in the worker", async () => {
        const { worker } = channel();
        const model = await loadWhisperInWorker(worker, { baseUrl: "/m" });
        await model.release();
        expect(fakeModel.release).toHaveBeenCalled();
    });
});
