import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SpeechDeviceAssessment } from "./device";
import { createSpeechToText, type SpeechToTextOptions } from "./speech-to-text";
import type { Transcription, WhisperModel } from "./whisper";

vi.mock("@/audio/decode-pcm", () => ({
    decodeAudioToPcm: vi.fn(async () => ({
        samples: new Float32Array(16_000 * 5),
        sampleRate: 16_000,
    })),
}));

const CAPABLE: SpeechDeviceAssessment = {
    canRun: true,
    blockers: [],
    wasmSimd: true,
    wasmThreads: false,
    webgpu: false,
    deviceMemoryGb: 8,
    hardwareConcurrency: 8,
};
const WEAK: SpeechDeviceAssessment = { ...CAPABLE, canRun: false, blockers: ["no-wasm-simd"] };

/**
 * A model whose transcription takes `delayMs` (fake timers) or fails.
 *
 * @param delayMs Time each run takes.
 * @param fail Throw instead of answering.
 * @returns The model and its spy.
 */
function fakeModel(delayMs = 100, fail = false, degenerate = false) {
    const transcribe = vi.fn(
        (_audio: unknown, options: { signal?: AbortSignal }) =>
            new Promise<Transcription>((resolve, reject) => {
                const timer = setTimeout(() => {
                    if (fail) reject(new Error("wasm out of memory"));
                    else
                        resolve({
                            text: "de picos pra sobral",
                            language: "pt",
                            tokens: [1],
                            audioMs: 5000,
                            timings: {
                                decodeMs: 0,
                                featuresMs: 0,
                                encoderMs: 0,
                                decoderMs: 0,
                                totalMs: delayMs,
                            },
                            compressionRatio: degenerate ? 40 : 1.1,
                            degenerate,
                        });
                }, delayMs);
                options.signal?.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(options.signal?.reason);
                });
            }),
    );
    const model = {
        transcribe,
        release: vi.fn(async () => undefined),
        dtype: "int8",
        providers: ["wasm"],
    } as unknown as WhisperModel;
    return { model, transcribe };
}

/** In-memory `Storage`. */
function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
    data: Map<string, string>;
} {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => void data.set(key, value),
        removeItem: (key) => void data.delete(key),
    };
}

const audio = new Blob([new Uint8Array(10)]);

/**
 * Build a transcriber with sensible fakes.
 *
 * @param overrides Options to change.
 * @returns The transcriber and the fakes.
 */
function setup(overrides: Partial<SpeechToTextOptions> = {}, model = fakeModel()) {
    const server = vi.fn(async () => "texto do servidor");
    const storage = memoryStorage();
    const speech = createSpeechToText({
        loadModel: vi.fn(async () => model.model),
        server,
        storage,
        assessDevice: () => CAPABLE,
        language: "pt",
        ...overrides,
    });
    return { speech, server, storage, model };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("createSpeechToText", () => {
    it("runs on the device once the model is loaded and keeps up", async () => {
        const { speech, server } = setup();
        await speech.warmUp();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(100);
        await expect(run).resolves.toMatchObject({
            text: "de picos pra sobral",
            source: "device",
            reason: "device",
        });
        expect(server).not.toHaveBeenCalled();
    });

    it("answers from the server while the model loads in the background, then uses the device", async () => {
        const { speech, server } = setup();
        await expect(speech.transcribe(audio)).resolves.toMatchObject({
            source: "server",
            reason: "model-not-ready",
            text: "texto do servidor",
        });
        await vi.advanceTimersByTimeAsync(0);
        const next = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(100);
        await expect(next).resolves.toMatchObject({ source: "device" });
        expect(server).toHaveBeenCalledTimes(1);
    });

    it("waits for the model when told to", async () => {
        const { speech, server } = setup({ whileLoading: "wait" });
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(100);
        await expect(run).resolves.toMatchObject({ source: "device" });
        expect(server).not.toHaveBeenCalled();
    });

    it("cancels a device run past the deadline, answers from the server and remembers the device as slow", async () => {
        const { speech, server, storage } = setup({}, fakeModel(60_000));
        await speech.warmUp();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(run).resolves.toMatchObject({ source: "server", reason: "device-slow" });
        expect(Number(storage.data.get("tempest-speech-slow-until"))).toBeGreaterThan(Date.now());

        await expect(speech.transcribe(audio)).resolves.toMatchObject({
            source: "server",
            reason: "device-remembered-slow",
        });
        expect(server).toHaveBeenCalledTimes(2);
    });

    it("gives the device audio duration × realtimeFactor, never less than minBudgetMs", async () => {
        const { speech } = setup({ realtimeFactor: 2 }, fakeModel(9000));
        await speech.warmUp();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(9000);
        await expect(run).resolves.toMatchObject({ source: "device" });
    });

    it("tries the device again once the slow verdict expires, or after a reset", async () => {
        const { speech, storage } = setup({ slowVerdictTtlMs: 1000 }, fakeModel(100));
        await speech.warmUp();
        storage.setItem("tempest-speech-slow-until", String(Date.now() + 1000));
        await expect(speech.transcribe(audio)).resolves.toMatchObject({
            reason: "device-remembered-slow",
        });
        speech.resetSlowVerdict();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(100);
        await expect(run).resolves.toMatchObject({ source: "device" });
    });

    it("sends a device ruled out up front to the server", async () => {
        const { speech } = setup({ assessDevice: () => WEAK });
        await expect(speech.transcribe(audio)).resolves.toMatchObject({
            source: "server",
            reason: "device-unsupported",
        });
    });

    it("sends a device run that loops instead of transcribing to the server", async () => {
        const { speech, storage } = setup({}, fakeModel(10, false, true));
        await speech.warmUp();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(10);
        await expect(run).resolves.toMatchObject({ source: "server", reason: "device-degenerate" });
        expect(storage.data.size).toBe(0);
    });

    it("keeps a looping device run when there is no server to ask", async () => {
        const { speech } = setup({ server: undefined }, fakeModel(10, false, true));
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(10);
        await expect(run).resolves.toMatchObject({
            source: "device",
            reason: "server-unavailable",
        });
    });

    it("falls back to the server when the device run fails", async () => {
        const { speech } = setup({}, fakeModel(10, true));
        await speech.warmUp();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(10);
        await expect(run).resolves.toMatchObject({ source: "server", reason: "device-error" });
    });

    it("runs on the device with no deadline when the server is down", async () => {
        const { speech, server } = setup(
            { isServerAvailable: async () => false },
            fakeModel(60_000),
        );
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(60_000);
        await expect(run).resolves.toMatchObject({
            source: "device",
            reason: "server-unavailable",
        });
        expect(server).not.toHaveBeenCalled();
    });

    it("treats a throwing health check as the server being down, and no server as device-only", async () => {
        const first = setup({ isServerAvailable: () => Promise.reject(new Error("dns")) });
        const run = first.speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(100);
        await expect(run).resolves.toMatchObject({ reason: "server-unavailable" });

        const second = setup({ server: undefined });
        const other = second.speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(100);
        await expect(other).resolves.toMatchObject({ source: "device" });
    });

    it("lets the device take over when the server fails", async () => {
        const { speech } = setup({ server: async () => Promise.reject(new Error("502")) });
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(100);
        await expect(run).resolves.toMatchObject({ source: "device", reason: "server-error" });
    });

    it("throws when neither route can produce text", async () => {
        const down = setup({ assessDevice: () => WEAK, isServerAvailable: () => false });
        await expect(down.speech.transcribe(audio)).rejects.toThrow(/no-wasm-simd/);

        const failing = setup({
            assessDevice: () => WEAK,
            server: async () => Promise.reject(new Error("502")),
        });
        await expect(failing.speech.transcribe(audio)).rejects.toThrow("502");
    });

    it("passes the language and a signal that follows the caller's to the server", async () => {
        const server = vi.fn(
            async (_audio: Blob, context: { signal: AbortSignal; language?: string }) => {
                expect(context.language).toBe("pt");
                return "ok";
            },
        );
        const { speech } = setup({ server, assessDevice: () => WEAK });
        await speech.transcribe(audio);
        expect(server).toHaveBeenCalledTimes(1);
    });

    it("rejects with the caller's abort without falling back", async () => {
        const { speech, server } = setup({}, fakeModel(60_000));
        await speech.warmUp();
        const controller = new AbortController();
        const run = speech.transcribe(audio, { signal: controller.signal });
        await vi.advanceTimersByTimeAsync(10);
        controller.abort(new Error("user cancelled"));
        await expect(run).rejects.toThrow("user cancelled");
        expect(server).not.toHaveBeenCalled();
    });

    it("keeps the verdict in memory when storage throws", async () => {
        const throwing = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
            removeItem: () => {
                throw new Error("blocked");
            },
        };
        const { speech } = setup({ storage: throwing }, fakeModel(60_000));
        await speech.warmUp();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(run).resolves.toMatchObject({ reason: "device-slow" });
        await expect(speech.transcribe(audio)).resolves.toMatchObject({
            reason: "device-remembered-slow",
        });
        speech.resetSlowVerdict();
    });

    it("loads the model once and releases it", async () => {
        const loadModel = vi.fn(async () => fakeModel().model);
        const { speech } = setup({ loadModel });
        await Promise.all([speech.warmUp(), speech.warmUp()]);
        expect(loadModel).toHaveBeenCalledTimes(1);
        await speech.release();
        await speech.release();
    });

    it("retries a model load that failed", async () => {
        const loadModel = vi
            .fn<() => Promise<WhisperModel>>()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValue(fakeModel().model);
        const { speech } = setup({ loadModel });
        await expect(speech.warmUp()).rejects.toThrow("offline");
        await expect(speech.warmUp()).resolves.toBeUndefined();
    });

    it("keeps the slow verdict in localStorage by default", async () => {
        localStorage.clear();
        const speech = createSpeechToText({
            loadModel: async () => fakeModel(60_000).model,
            server: async () => "ok",
            assessDevice: () => CAPABLE,
        });
        await speech.warmUp();
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(5000);
        await run;
        expect(Number(localStorage.getItem("tempest-speech-slow-until"))).toBeGreaterThan(
            Date.now(),
        );
        speech.resetSlowVerdict();
        expect(localStorage.getItem("tempest-speech-slow-until")).toBeNull();
    });

    it("cancels the server request when the caller aborts", async () => {
        let seen: AbortSignal | null = null;
        const server = (_audio: Blob, context: { signal: AbortSignal }) =>
            new Promise<string>((_resolve, reject) => {
                seen = context.signal;
                context.signal.addEventListener("abort", () => reject(context.signal.reason));
            });
        const { speech } = setup({ server, assessDevice: () => WEAK });
        const controller = new AbortController();
        const run = speech.transcribe(audio, { signal: controller.signal });
        await vi.advanceTimersByTimeAsync(0);
        controller.abort(new Error("user cancelled"));
        await expect(run).rejects.toThrow("user cancelled");
        expect((seen as AbortSignal | null)?.aborted).toBe(true);
    });

    it("reports the server's error when the device cannot take over either", async () => {
        const { speech } = setup(
            { server: async () => Promise.reject(new Error("502")) },
            fakeModel(10, true),
        );
        const run = speech.transcribe(audio);
        await vi.advanceTimersByTimeAsync(10);
        await expect(run).rejects.toThrow("502");
    });

    it("swallows a failed background load and serves from the server", async () => {
        const { speech } = setup({ loadModel: async () => Promise.reject(new Error("offline")) });
        await expect(speech.transcribe(audio)).resolves.toMatchObject({
            reason: "model-not-ready",
        });
        await vi.advanceTimersByTimeAsync(0);
        await expect(speech.transcribe(audio)).resolves.toMatchObject({
            reason: "model-not-ready",
        });
    });

    it("releases a model that is still loading", async () => {
        const model = fakeModel();
        const { speech } = setup({ loadModel: async () => model.model });
        const warming = speech.warmUp();
        await speech.release();
        await warming;
        expect(model.model.release).toHaveBeenCalled();
    });

    it("releases cleanly while a load that fails is in flight", async () => {
        const { speech } = setup({ loadModel: async () => Promise.reject(new Error("offline")) });
        const warming = speech.warmUp().catch(() => undefined);
        await expect(speech.release()).resolves.toBeUndefined();
        await warming;
    });

    it("keeps the verdict in memory when reading localStorage itself throws", async () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            get: () => {
                throw new DOMException("denied", "SecurityError");
            },
        });
        try {
            const speech = createSpeechToText({
                loadModel: async () => fakeModel(60_000).model,
                server: async () => "ok",
                assessDevice: () => CAPABLE,
            });
            await speech.warmUp();
            const run = speech.transcribe(audio);
            await vi.advanceTimersByTimeAsync(5000);
            await expect(run).resolves.toMatchObject({ reason: "device-slow" });
            await expect(speech.transcribe(audio)).resolves.toMatchObject({
                reason: "device-remembered-slow",
            });
        } finally {
            if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
        }
    });
});
