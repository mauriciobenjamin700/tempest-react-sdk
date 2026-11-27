import { decodeAudioToPcm, type MonoPcm } from "@/audio/decode-pcm";

import {
    loadWhisper,
    type LoadWhisperOptions,
    type TranscribeOptions,
    type Transcription,
    type WhisperDtype,
    type WhisperLoadProgress,
    type WhisperModel,
} from "./whisper";

/**
 * Run Whisper in a Web Worker, so the page keeps drawing while it transcribes.
 */

/** The serialisable part of {@link LoadWhisperOptions}, posted to the worker. */
export type WorkerLoadOptions = Omit<
    LoadWhisperOptions,
    "onProgress" | "worker" | "persistStorage"
>;

/** The serialisable part of {@link TranscribeOptions}. */
type WorkerTranscribeOptions = Omit<TranscribeOptions, "signal" | "onPartial">;

/** Messages the page sends to the worker. */
type WorkerRequest =
    | { id: number; type: "load"; options: WorkerLoadOptions }
    | {
          id: number;
          type: "transcribe";
          audio: MonoPcm;
          options: WorkerTranscribeOptions;
          partials: boolean;
      }
    | { id: number; type: "abort"; target: number }
    | { id: number; type: "release" };

/** Messages the worker sends back. */
type WorkerResponse =
    | { id: number; type: "loaded"; dtype: WhisperDtype; providers: readonly string[] }
    | { id: number; type: "progress"; progress: WhisperLoadProgress }
    | { id: number; type: "partial"; text: string }
    | { id: number; type: "result"; result: Transcription }
    | { id: number; type: "released" }
    | { id: number; type: "error"; error: { name: string; message: string } };

/** The worker global this module listens on: a `DedicatedWorkerGlobalScope`, narrowed. */
export interface WhisperWorkerScope {
    addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void;
    postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

/** The page's handle on the worker: a `Worker`, narrowed. */
export interface WhisperWorkerLike {
    addEventListener(
        type: "message",
        listener: (event: MessageEvent<WorkerResponse>) => void,
    ): void;
    postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
}

/**
 * Serve Whisper from inside a Web Worker. Call it once, at the top of the
 * worker file; the page talks to it through `loadWhisper({ worker })`.
 *
 * Why a worker at all: ONNX Runtime Web's WASM backend computes on the
 * calling thread. Measured on Chromium 159 (whisper-tiny int8, 11 s of
 * speech): during a 725 ms transcription the page drew **3** frames instead of
 * ~43, and 2 in 1452 ms on one thread — the spinner stops, and a tap waits for
 * the whole transcription. In a worker the page keeps its frames.
 *
 * ONNX Runtime's own `env.wasm.proxy` does not fit this decoder: it transfers
 * input buffers to its worker, and the decoding loop hands the same encoder
 * output to every step (measured: `DataCloneError: An ArrayBuffer is detached`
 * on the second step). Here the whole loop — features, encoder, decoder —
 * runs in the worker, and only PCM in and text out cross the boundary.
 *
 * @param scope The worker global. Default `self`.
 *
 * @example
 * ```typescript
 * import { exposeWhisperWorker } from "tempest-react-sdk/speech";
 *
 * exposeWhisperWorker();
 * ```
 */
export function exposeWhisperWorker(
    scope: WhisperWorkerScope = globalThis as unknown as WhisperWorkerScope,
): void {
    let model: WhisperModel | null = null;
    const running = new Map<number, AbortController>();

    scope.addEventListener("message", (event) => {
        const request = event.data;
        const fail = (error: unknown): void => {
            const failure = error instanceof Error ? error : new Error(String(error));
            scope.postMessage({
                id: request.id,
                type: "error",
                error: { name: failure.name, message: failure.message },
            });
        };
        if (request.type === "abort") {
            running.get(request.target)?.abort(new Error("aborted"));
            return;
        }
        if (request.type === "load") {
            loadWhisper({
                ...request.options,
                onProgress: (progress) =>
                    scope.postMessage({ id: request.id, type: "progress", progress }),
            }).then((loaded) => {
                model = loaded;
                scope.postMessage({
                    id: request.id,
                    type: "loaded",
                    dtype: loaded.dtype,
                    providers: loaded.providers,
                });
            }, fail);
            return;
        }
        if (request.type === "release") {
            const current = model;
            model = null;
            Promise.resolve(current?.release()).then(
                () => scope.postMessage({ id: request.id, type: "released" }),
                fail,
            );
            return;
        }
        if (!model) {
            fail(new Error("Whisper worker: transcribe before load."));
            return;
        }
        const controller = new AbortController();
        running.set(request.id, controller);
        model
            .transcribe(request.audio, {
                ...request.options,
                signal: controller.signal,
                onPartial: request.partials
                    ? (text) => scope.postMessage({ id: request.id, type: "partial", text })
                    : undefined,
            })
            .then((result) => scope.postMessage({ id: request.id, type: "result", result }), fail)
            .finally(() => running.delete(request.id));
    });
}

/** A request waiting for its answer. */
interface Pending {
    resolve: (message: WorkerResponse) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: WhisperLoadProgress) => void;
    onPartial?: (text: string) => void;
}

/**
 * Load Whisper in a worker that called {@link exposeWhisperWorker}, and drive
 * it with the same {@link WhisperModel} interface as `loadWhisper`.
 * `loadWhisper({ worker })` is the public entry.
 *
 * A recording (`Blob`) is decoded on the page — `OfflineAudioContext` does not
 * exist in workers, and decoding is native and asynchronous anyway — at
 * 48 kHz, and the samples are transferred to the worker, which resamples and
 * transcribes. Aborting rejects at once with the signal's reason and tells the
 * worker to stop at its next decoder step.
 *
 * @param worker The worker.
 * @param options Serialisable load options, plus progress.
 * @returns The model.
 */
export async function loadWhisperInWorker(
    worker: WhisperWorkerLike,
    options: WorkerLoadOptions & { onProgress?: (progress: WhisperLoadProgress) => void },
): Promise<WhisperModel> {
    const { onProgress, ...serialisable } = options;
    const pending = new Map<number, Pending>();
    let next = 0;

    worker.addEventListener("message", (event) => {
        const message = event.data;
        const waiting = pending.get(message.id);
        if (!waiting) return;
        if (message.type === "progress") {
            waiting.onProgress?.(message.progress);
            return;
        }
        if (message.type === "partial") {
            waiting.onPartial?.(message.text);
            return;
        }
        pending.delete(message.id);
        if (message.type === "error") {
            const error = new Error(message.error.message);
            error.name = message.error.name;
            waiting.reject(error);
            return;
        }
        waiting.resolve(message);
    });

    const call = (
        request: WorkerRequest,
        hooks: Omit<Pending, "resolve" | "reject"> = {},
        transfer: Transferable[] = [],
    ): Promise<WorkerResponse> =>
        new Promise((resolve, reject) => {
            pending.set(request.id, { resolve, reject, ...hooks });
            worker.postMessage(request, transfer);
        });

    const loaded = await call(
        { id: (next += 1), type: "load", options: serialisable },
        { onProgress },
    );
    const { dtype, providers } = loaded as Extract<WorkerResponse, { type: "loaded" }>;

    const toPcm = async (audio: Blob | MonoPcm | Float32Array): Promise<MonoPcm> => {
        if (audio instanceof Float32Array) return { samples: audio.slice(), sampleRate: 16_000 };
        if (typeof Blob !== "undefined" && audio instanceof Blob) {
            return decodeAudioToPcm(audio, { sampleRate: 48_000 });
        }
        const pcm = audio as MonoPcm;
        return { samples: pcm.samples.slice(), sampleRate: pcm.sampleRate };
    };

    return {
        dtype,
        providers,
        async transcribe(audio, transcribeOptions = {}): Promise<Transcription> {
            const { signal, onPartial, ...rest } = transcribeOptions;
            signal?.throwIfAborted();
            const pcm = await toPcm(audio);
            signal?.throwIfAborted();
            const id = (next += 1);
            const answer = call(
                { id, type: "transcribe", audio: pcm, options: rest, partials: Boolean(onPartial) },
                { onPartial },
                [pcm.samples.buffer],
            );
            if (!signal)
                return ((await answer) as Extract<WorkerResponse, { type: "result" }>).result;
            const aborted = new Promise<never>((_resolve, reject) => {
                signal.addEventListener(
                    "abort",
                    () => {
                        worker.postMessage({ id: (next += 1), type: "abort", target: id });
                        pending.delete(id);
                        reject(signal.reason);
                    },
                    { once: true },
                );
            });
            const message = await Promise.race([answer, aborted]);
            return (message as Extract<WorkerResponse, { type: "result" }>).result;
        },
        async release(): Promise<void> {
            await call({ id: (next += 1), type: "release" });
        },
    };
}
