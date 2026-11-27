# On-device transcription (Whisper)

The `tempest-react-sdk/speech` subpath transcribes speech **in the user's browser** with Whisper and, when the device cannot keep up, hands the recording to **your server**. The app calls one function; the SDK picks the route per recording and says which one it used and why. 🎙️

Transcribing on the device saves the upload over a mobile network, the backend queue and the round trip, and works offline after the first use. But an entry-level phone can take longer than the audio itself to transcribe, and waiting for that is worse than sending it to the server. `createSpeechToText` makes that choice.

```bash
npm install tempest-react-sdk onnxruntime-web
```

`onnxruntime-web` is an optional peer, the same one `/vision` and `/tabular` use. It is only imported when a model loads, so importing the subpath and calling `assessSpeechDevice()` does not require the package.

## 1. Serve the model

The SDK reads the Hugging Face ONNX export in the `onnx-community/whisper-*` layout. Download it once and serve it from your origin:

```bash
M=public/models/whisper-base && mkdir -p $M/onnx
for f in config.json generation_config.json tokenizer.json \
  onnx/encoder_model_int8.onnx onnx/decoder_model_merged_int8.onnx; do
  curl -sfL -o $M/$f "https://huggingface.co/onnx-community/whisper-base/resolve/main/$f"
done
```

| Model | Download (int8) | For |
| --- | --- | --- |
| `whisper-tiny` | 41 MB | weak devices, short phrases |
| `whisper-base` | 77 MB | Portuguese with better accuracy |
| `whisper-small` | 249 MB | too big for a phone |

Sizes of `encoder_model_int8.onnx` + `decoder_model_merged_int8.onnx` from the Hugging Face API, on 2026-11-26.

## 2. Transcribe with a server fallback

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

export const speech = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    server: async (audio, { signal }) => {
        const body = new FormData();
        body.append("audio", audio, "speech.webm");
        const response = await fetch("/api/transcribe", { method: "POST", body, signal });
        return ((await response.json()) as { text: string }).text;
    },
    isServerAvailable: () => navigator.onLine,
    language: "pt",
});

export async function onRecorded(recording: Blob): Promise<string> {
    const result = await speech.transcribe(recording);
    console.log(result.source, result.reason);
    return result.text;
}
```

`server` is yours: endpoint, auth, job polling. The SDK only calls it and forwards the `signal`.

## How the route is chosen

On every `transcribe`, in this order:

| Situation | Route | `reason` |
| --- | --- | --- |
| Server down or not configured | device, **no deadline** | `server-unavailable` |
| Device ruled out by `assessSpeechDevice` (no WASM SIMD, too little memory) | server | `device-unsupported` |
| Device was slow before (stored verdict) | server | `device-remembered-slow` |
| Model not loaded yet | server, while the model loads in the background | `model-not-ready` |
| Device finished within the deadline | device | `device` |
| Device missed the deadline | server; the device is marked slow | `device-slow` |
| Device returned a repetition loop | server | `device-degenerate` |
| Device failed (memory, WASM) | server | `device-error` |
| Server failed | device | `server-error` |

!!! info "\"The device cannot keep up\" is measured, not guessed"
    The deadline is the audio's duration × `realtimeFactor` (default `1`: a 10 s recording gets 10 s), never less than `minBudgetMs` (4 s). Missing it cancels the run between two decoder steps, the server answers, and the device is marked slow for `slowVerdictTtlMs` (7 days), in `localStorage`. The decision comes from a real run on **this** device with **this** model, not from `deviceMemory` or the core count.

!!! warning "A repetition loop counts as a failure"
    A model can "finish" with garbage instead of failing. On Chromium 159 with WebGPU in a headless environment, whisper-tiny fp16 returned `"Wars!!!!…"` for 224 tokens. The SDK applies the reference Whisper's test: the text's compression ratio (`compressionRatio`) above **2.4**, or a decoder that never ended, sets `Transcription.degenerate`. With a server available, the recording goes there. Measured: real speech compresses 1.0 to 1.34×; that loop, 14.9×.

### First recording, model still downloading

With `whileLoading: "background"` (the default), the first recording goes to the server while the model downloads, and later ones run on the device. To download earlier, at a good moment (Wi-Fi, idle app):

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

const speech = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    language: "pt",
});

export function warmUpWhenIdle(): void {
    const connection = (navigator as { connection?: { type?: string } }).connection;
    if (connection?.type === "cellular") return;
    requestIdleCallback(() => void speech.warmUp());
}
```

## Device only: `loadWhisper`

Without the orchestrator, for full control:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export async function transcribe(recording: Blob): Promise<string> {
    const whisper = await loadWhisper({
        baseUrl: "/models/whisper-base",
        onProgress: ({ file, loaded, total }) => console.log(file, loaded, total),
    });
    const result = await whisper.transcribe(recording, {
        language: "pt",
        onPartial: (text) => console.log(text),
    });
    console.log(result.timings, result.degenerate);
    await whisper.release();
    return result.text;
}
```

- **Input:** a `Blob` (what `MediaRecorder` recorded), a mono `Float32Array` at 16 kHz, or `MonoPcm` at any rate (see [Audio for models](audio.md#audio-for-models-pcm-at-the-right-rate)).
- **Longer than 30 s:** processed in consecutive 30 s windows.
- **`language` omitted:** detected from the first window, at the cost of one extra decoder step.
- **Cache:** files go to Cache Storage (`tempest-speech-models`); the second load works offline.

### What it costs

Chromium 159, desktop (24 cores, WASM with threads through COOP/COEP), whisper-tiny int8, 11 s of English speech (`jfk.flac` from the Whisper repository), warm run:

| Stage | ms |
| --- | --- |
| Decode the `.flac` and resample | 106 |
| Log-mel | 91 |
| Encoder | 283 |
| Decoder (24 tokens) | 297 |
| **Total** | **778** |

Load: 1,266 ms with a 43.3 MB download, 343 ms from the cache. Word-for-word transcript. Reproduce with `npm run build && WHISPER_MODEL_DIR=/tmp/whisper-tiny node scripts/bench-whisper.mjs` (the download command is in the header of `e2e/speech-whisper.spec.ts`). **Not yet measured on an entry-level Android**: that is exactly what the deadline is for.

!!! warning "WebGPU is not the default"
    `providers` takes `["webgpu", "wasm"]`, but the int8 export uses integer ops the WebGPU backend hands back to the CPU node by node, and fp16 on WebGPU produced garbage in the measured environment. Until it is measured on a real device, the default is `["wasm"]`.

### Why not `@huggingface/transformers`

| `@huggingface/transformers@4.3.2` | What it would cost the app |
| --- | --- |
| `onnxruntime-web` pinned to `1.31.0-dev.20260914` | a second ONNX runtime (duplicated wasm) in an app that already uses `/vision` or `/tabular` |
| `onnxruntime-node` and `sharp` as dependencies | native binaries downloaded in a browser app's `npm install` |

What transcription needs from it — greedy decoding with a KV cache and the BPE tokenizer's *decode* — lives in `/speech` on top of the `onnxruntime-web` peer.

## Before offering the button: `assessSpeechDevice`

```typescript
import { assessSpeechDevice } from "tempest-react-sdk/speech";

const device = assessSpeechDevice();
if (!device.canRun) console.log("goes to the server:", device.blockers);
console.log(device.wasmThreads, device.webgpu, device.deviceMemoryGb);
```

Synchronous and loads nothing. It only rules out the clearly impossible: no WebAssembly, no SIMD (ONNX Runtime Web only ships SIMD builds), or `deviceMemory` below `minMemoryGb` (2 GiB). Slow or not is the deadline's call.

!!! tip "Threads need cross-origin isolation"
    ONNX Runtime's WASM uses several threads only with `crossOriginIsolated` (headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`). Without them it runs on one thread, and the deadline will notice. `assessSpeechDevice().wasmThreads` tells whether isolation is on.

## Recap

- `createSpeechToText({ loadModel, server, isServerAvailable, language })` → `transcribe(blob)` → `{ text, source, reason }`. ✅
- The device gets audio × `realtimeFactor`; past it, the server answers and the device is marked slow for 7 days.
- A repetition loop (`compressionRatio` > 2.4) counts as a failure.
- Model not loaded yet: the server answers while the model downloads in the background.
- `loadWhisper` for direct use; whisper-tiny int8 transcribed 11 s in 778 ms on a desktop (`scripts/bench-whisper.mjs`).
- `onnxruntime-web` is an optional peer; WebGPU stays out of the default until measured on a real device.
