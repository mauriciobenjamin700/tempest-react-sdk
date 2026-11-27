---
description: "createSpeechToText: transcribes on the device and hands the recording to your server when the device is slow, fails or has not downloaded the model yet, saying which route it took and why."
---

# Device or server: `createSpeechToText`

Transcribing on the device saves the upload over a mobile network, the backend queue and the round trip, and works offline. But an entry-level phone may take longer than the audio itself to transcribe, and waiting for that is worse than sending to the server. `createSpeechToText` picks the route **for every recording** and says which one it took and why.

This page assumes an app that already [serves the model and the runtime](speech.md#1-serve-the-model) and has the [worker](speech.md#4-take-the-model-off-the-main-thread-worker).

## The complete example

A voice search: transcribes on the device, in a worker, with the city names as vocabulary, and sends to `/api/transcribe` when the device cannot keep up.

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

const CITIES = "Picos, Sobral, Teresina, Juazeiro do Norte, Fortaleza, Parnaíba";

export const speech = createSpeechToText({
    loadModel: () =>
        loadWhisper({
            baseUrl: "/models/whisper-base",
            worker: new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" }),
        }),
    server: async (audio, { signal, language, prompt }) => {
        const body = new FormData();
        body.append("audio", audio, audio.type.includes("mp4") ? "speech.m4a" : "speech.webm");
        if (language) body.append("language", language);
        if (prompt) body.append("prompt", prompt);
        const response = await fetch("/api/transcribe", { method: "POST", body, signal });
        if (!response.ok) throw new Error(`transcribe: HTTP ${response.status}`);
        return ((await response.json()) as { text: string }).text;
    },
    isServerAvailable: () => navigator.onLine,
    language: "pt",
    prompt: CITIES,
});

export async function searchByVoice(recording: Blob): Promise<string> {
    const result = await speech.transcribe(recording);
    console.log(result.source, result.reason);
    return result.text;
}
```

The console shows `device device` when the device transcribed within the deadline, or `server model-not-ready` on the first recording, while the model downloads.

- **`server` is yours:** endpoint, auth, format, job polling. The SDK only calls the function with the recorded `Blob` and a context: `signal` (cancels along with the deadline), `language` and `prompt`. If your server model takes a vocabulary, send the `prompt`: both routes then get the same names right.
- **Throwing inside `server`** is a server failure: the recording goes back to the device, with `reason: "server-error"`.
- **The file name:** Safari records AAC in MP4 and the other browsers record Opus in WebM, so the extension follows `audio.type`.
- **The runtime folder** comes from the `configureOrtAssets("/ort/")` called at boot, and the SDK passes it on to the worker.

## What `transcribe` returns

| Field | What it is |
| --- | --- |
| `text` | The text, from either route. |
| `source` | `"device"` or `"server"`. |
| `reason` | Why that route (table below). |
| `transcription` | Details of the on-device run (`timings`, `degenerate`…). `null` when the server answered. |
| `server` | `server`'s answer, untouched. `null` when the device answered. See [backend that interprets](#a-backend-that-transcribes-and-interprets). |

`transcribe(recording, { signal, onPartial })`: `signal` cancels, and `onPartial` gets the partial text when it runs on the device.

## How the route is chosen

On every `transcribe`, in this order:

| Situation | Route | `reason` |
| --- | --- | --- |
| No `server`, or `isServerAvailable()` answered `false` | device, **no deadline** | `server-unavailable` |
| Device ruled out by `assessSpeechDevice` (no WASM SIMD, little memory) | server | `device-unsupported` |
| Device was slow before (verdict kept) | server | `device-remembered-slow` |
| Model not loaded yet | server, and the model loads in the background | `model-not-ready` |
| Device finished within the deadline | device | `device` |
| Device ran past the deadline | server; the device is marked slow | `device-slow` |
| Device returned looping text | server | `device-degenerate` |
| Device failed (memory, WASM) | server | `device-error` |
| Server failed | device | `server-error` |

Without `isServerAvailable`, the server counts as available whenever `server` is set.

!!! info "\"The device cannot keep up\" is measured, not guessed"
    The deadline is the audio duration × `realtimeFactor` (default `1`: a 10 s recording gets 10 s), never less than `minBudgetMs` (4 s). Past it, the run is cancelled between two decoder steps, the server answers, and the device is marked slow for `slowVerdictTtlMs` (7 days), in `localStorage`. The decision comes from a real run on **this** device with **this** model, not from `deviceMemory` or the core count.

!!! warning "Looping text counts as a failure"
    A model can "finish" with garbage instead of an error. On Chromium 159 with WebGPU in a headless environment, whisper-tiny fp16 returned `"Wars!!!!…"` for 224 tokens. The SDK applies the reference Whisper test: the text's compression ratio (`compressionRatio`) above **2.4**, or a decoder that never ended, marks it `degenerate`, and the recording goes to the server. Measured: real speech compresses 1.0 to 1.34×; that loop, 14.9×.

## The first recording, with the model still downloading

With `whileLoading: "background"` (the default), the first recording goes to the server while the model downloads, and the next ones run on the device. With `"wait"`, `transcribe` waits for the download and answers from the device. With no server available, it always waits.

To download ahead, at a good moment (Wi-Fi, idle app), call `warmUp()`:

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

const speech = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    language: "pt",
});

export function warmUpWhenIdle(): void {
    const connection = (navigator as { connection?: { type?: string } }).connection;
    if (connection?.type === "cellular") return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1000));
    idle(() => void speech.warmUp());
}
```

## A backend that transcribes **and** interprets

If your server returns not just the text but the whole answer (an already-parsed search, a job result), let `server` return that answer and say in `serverText` where the text is. It comes back untouched in `result.server`. On the device route, the app sends `text` to the text endpoint:

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

interface RouteSearch {
    text: string;
    results: unknown[];
}

declare function searchByAudio(audio: Blob, signal: AbortSignal): Promise<RouteSearch>;
declare function searchByText(text: string): Promise<RouteSearch>;

const voice = createSpeechToText<RouteSearch>({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    server: (audio, { signal }) => searchByAudio(audio, signal),
    serverText: (answer) => answer.text,
    language: "pt",
});

export async function searchBySpeaking(recording: Blob): Promise<RouteSearch> {
    const result = await voice.transcribe(recording);
    return result.server ?? searchByText(result.text);
}
```

The server never interprets twice: when it answered, its answer is used; when the device transcribed, only the text travels.

## Before offering the button: `assessSpeechDevice`

```typescript
import { assessSpeechDevice } from "tempest-react-sdk/speech";

const device = assessSpeechDevice();
if (!device.canRun) console.log("goes to the server:", device.blockers);
console.log(device.wasmThreads, device.webgpu, device.deviceMemoryGb);
```

Synchronous, and loads nothing. It only rules out the clearly impossible: no WebAssembly, no SIMD (ONNX Runtime Web only ships SIMD builds), or `deviceMemory` under `minMemoryGb` (2 GiB). Whether the device is slow is the deadline's call. `wasmThreads: false` means the page is not [isolated](speech.md#threads-cross-origin-isolation): the model runs on one thread, 2.3× slower.

## `createSpeechToText` options

| Option | Default | What it does |
| --- | --- | --- |
| `loadModel` | — | Loads the model once: `() => loadWhisper({ … })`. |
| `server` | — | `(audio, { signal, language, prompt }) => Promise<text or answer>`. Without it, device only. |
| `serverText` | — | Where the text is in `server`'s answer, when it is not a string. |
| `isServerAvailable` | always `true` with `server` | Health check, feature flag, `navigator.onLine`. May be async. |
| `language` | detected | Language, for both routes. |
| `prompt` | — | Expected vocabulary, for both routes. |
| `realtimeFactor` | `1` | Device deadline = audio duration × this factor. |
| `minBudgetMs` | `4000` | Shortest deadline, so a 1 s clip is not judged on noise. |
| `whileLoading` | `"background"` | Model not loaded: `"background"` answers from the server, `"wait"` waits for the model. |
| `slowVerdictTtlMs` | 7 days | How long a slow device stays marked. |
| `storage` | `localStorage` | Where the verdict is kept. `null` keeps it in memory only. |
| `assessDevice` | `assessSpeechDevice` | Replaces the device check (useful in tests). |

## Recap

- `createSpeechToText({ loadModel, server, isServerAvailable, language, prompt })` → `transcribe(blob)` → `{ text, source, reason, transcription, server }`.
- `server` gets `{ signal, language, prompt }`. If it throws, the recording goes back to the device.
- The device has a deadline of duration × `realtimeFactor` (4 s minimum). Past it, the recording goes to the server and the device is marked slow for 7 days.
- Looping text (`compressionRatio` > 2.4) counts as a failure.
- Model not loaded yet: the server answers and the model downloads in the background. `warmUp()` downloads ahead.
- `serverText` keeps the backend's whole answer in `result.server`.
