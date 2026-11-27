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

| Model | Download (int8) | Portuguese WER | Real-time factor |
| --- | --- | --- | --- |
| `whisper-tiny` | 41 MB | 34.0 % | 0.071 |
| `whisper-base` | 77 MB | **15.9 %** | 0.109 |
| `whisper-small` | 249 MB | — | too big for a phone |

**For Portuguese, use `whisper-base`:** tiny gets one word in three wrong.

- **Sizes:** `encoder_model_int8.onnx` + `decoder_model_merged_int8.onnx` from the Hugging Face API, on 2026-11-26.
- **WER:** 30 utterances of FLEURS `pt_br` (`dev` split, 363 s of read speech), Chromium 159 on a desktop, with `npm run build && WHISPER_MODEL_DIR=… DATASET_DIR=… LANGUAGE=pt node scripts/bench-whisper-wer.mjs`.
- **What the WER counts:** normalisation drops punctuation and case, but keeps accents and does not convert numerals, so "dez" vs "10" counts as an error.
- **The errors that matter in a search are proper nouns** ("polo" → "Paulo"). Measure with recordings from your own domain: the same script takes any folder with a `transcripts.tsv` (`file<TAB>text`).

## 2. Serve the runtime

ONNX Runtime Web does **not** embed its `.wasm` files, not even in the `.bundle` builds. In a Vite-bundled app the session fails with `Aborted(both async and sync fetching of the wasm failed)`, naming no file. The [`tempestOrtAssets()`](vite-config.md#onnx-models-in-the-browser-tempestortassets) plugin serves the binaries under `/ort/` in dev and in the build:

```ts
import { defineConfig } from "vite";
import { tempestOrtAssets } from "tempest-react-sdk/vite";

export default defineConfig({ plugins: [tempestOrtAssets()] });
```

And the model loads pointing there:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export const load = () => loadWhisper({ baseUrl: "/models/whisper-base", ortAssetsUrl: "/ort/" });
```

Or once at boot, with `configureOrtAssets("/ort/")`, which `/speech` re-exports from `/tabular` (it applies to both). For offline precache, `ortAssetUrls("/ort/")` lists the files.

## 3. Transcribe with a server fallback

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

## 4. Take the model off the main thread: `worker`

ONNX Runtime's WASM backend computes on the calling thread. On the page, that freezes the screen for the whole transcription: the spinner stops, and a tap waits for the end. Run the model in a Web Worker. The worker file is one line:

```typescript
import { exposeWhisperWorker } from "tempest-react-sdk/speech";

exposeWhisperWorker();
```

And `loadWhisper` takes the worker. The rest of the API is unchanged, `createSpeechToText` included:

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

export const speech = createSpeechToText({
    loadModel: () =>
        loadWhisper({
            baseUrl: "/models/whisper-base",
            ortAssetsUrl: "/ort/",
            worker: new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" }),
        }),
    language: "pt",
});
```

Measured on Chromium 159 (whisper-tiny int8, 11 s of speech, `WHISPER_MODEL_DIR=… node scripts/bench-whisper-worker.mjs`):

| Where it runs | Transcription | Frames drawn (expected at 60 fps) |
| --- | --- | --- |
| page, threads | 724 ms | **3** (43) |
| worker, threads | 715 ms | **45** (43) |
| page, 1 thread | 1,423 ms | **2** (85) |
| worker, 1 thread | 1,419 ms | **86** (85) |

Same time; only the screen stops freezing. The recording is decoded on the page (workers have no `OfflineAudioContext`), and only the samples cross into the worker, transferred without a copy. Cancelling (or `createSpeechToText`'s deadline) rejects at once and stops the worker at its next decoder step.

!!! info "Why not ONNX Runtime's `env.wasm.proxy`"
    The built-in proxy **transfers** input buffers to its worker, and Whisper's decoder reuses the encoder output at every step. Measured: `DataCloneError: An ArrayBuffer is detached` on the second step. It does not work with WebGPU either. Here the whole loop (features, encoder, decoder) runs in the worker.

### Keeping the model: `persistStorage`

`loadWhisper({ persistStorage: true })` asks `navigator.storage.persist()` before downloading, so the browser does not evict the model under disk pressure. The default is `false`, as everywhere in the SDK: Firefox answers that request with a permission prompt, and a prompt out of nowhere during a download gets denied. Chrome decides on its own, without a prompt.

## A backend that transcribes **and** interprets

If your server does not return just the text but the whole answer (an interpreted search, a job result), let `server` resolve to that answer and say in `serverText` where the text is. It comes back untouched in `result.server`, and on the device route the app sends `text` to its text endpoint:

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

export async function searchBySpeech(recording: Blob): Promise<RouteSearch> {
    const result = await voice.transcribe(recording);
    return result.server ?? searchByText(result.text);
}
```

The server never interprets twice: when it answered, its answer is used; when the device transcribed, only the text travels.

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

## Proper nouns: `prompt`

In a voice search the key information is often a proper noun, the city. That is exactly what Whisper gets wrong most ("polo" → "Paulo"). Pass the expected vocabulary as `prompt`:

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

export const search = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    language: "pt",
    prompt: "Picos, Sobral, Teresina, Juazeiro do Norte, Fortaleza, Parnaíba",
});
```

Whisper reads the prompt as text that came before the recording (`<|startofprev|>`, openai-whisper's `initial_prompt`) and leans towards those spellings. In `createSpeechToText` it applies to both routes: the device uses it, and the `server` callback receives it in `context.prompt`.

whisper-base int8, the same 30 FLEURS `pt_br` utterances:

| Prompt | WER | Degenerate outputs |
| --- | --- | --- |
| none | 15.9 % | 0 |
| proper nouns that occur in the utterances | **11.2 %** | 0 |
| Northeast Brazil cities that do **not** occur | 14.3 % | 0 |

Command: `PROMPT="…" WHISPER_MODEL_DIR=… DATASET_DIR=… node scripts/bench-whisper-wer.mjs`. The right vocabulary cuts almost a third of the errors. A prompt unrelated to the audio did not make it worse, which makes a fixed list of cities safe. The prompt's encoding is identical to Hugging Face's `tokenizers` on Whisper's real vocabulary (`tokenizer.parity.test.ts`).

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

## When the person stops talking: Silero VAD

The energy VAD (`monitorVoiceActivity`) decides by loudness, so it fails exactly where the voice matters: a bus, the street, a TV on. `/speech` ships **Silero VAD** (v5, ~2 MB, MIT), a model that tells speech from noise every 32 ms frame.

```bash
curl -sfL -o public/models/silero_vad.onnx \
  https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
```

### Stop recording on its own: `createSpeechDetector`

Same shape as `monitorVoiceActivity` (`{ speaking, stop }` and `onChange(speaking)`), so one swaps for the other:

```typescript
import { createSpeechDetector, loadSileroVad } from "tempest-react-sdk/speech";

export async function stopOnSilence(mic: MediaStream, stop: () => void): Promise<void> {
    const vad = await loadSileroVad({ modelUrl: "/models/silero_vad.onnx", ortAssetsUrl: "/ort/" });
    let spoke = false;
    const detector = await createSpeechDetector(
        mic,
        (speaking) => {
            if (speaking) spoke = true;
            else if (spoke) {
                detector.stop();
                stop();
            }
        },
        { vad, minSilenceMs: 1000 },
    );
}
```

On Chromium 159, with a fake microphone playing 1 s of silence, 5.5 s of speech and then silence, the detector turned on at 1.6 s and off at 6.7 s, after 1 s of quiet. It processed 281 of 281 frames.

### Trim the silence from a recording: `detectSpeechSegments`

```typescript
import { decodeAudioToPcm } from "tempest-react-sdk";
import { detectSpeechSegments, loadSileroVad } from "tempest-react-sdk/speech";

export async function speechParts(recording: Blob): Promise<string> {
    const vad = await loadSileroVad({ modelUrl: "/models/silero_vad.onnx" });
    const segments = await detectSpeechSegments(await decodeAudioToPcm(recording), vad);
    return segments.map((s) => `${s.startMs}–${s.endMs} ms`).join(", ");
}
```

Segmentation is silero-vad's `get_speech_timestamps`, with the same defaults (`SILERO_DEFAULT_*` constants, source cited): threshold 0.5, exit at `max(threshold − 0.15, 0.01)`, 250 ms minimum speech, 100 ms minimum silence, 30 ms padding.

### How accurate, compared to the energy VAD

Frame accuracy (32 ms frames) over 10 FLEURS `pt_br` utterances. Labels come from the **clean** signal; the measurement runs on the noisy one:

| Condition | Energy (default) | Energy (calibrated on the noise floor) | **Silero** |
| --- | --- | --- | --- |
| clean | 63.6 % | 86.1 % | **89.5 %** |
| white noise 0 / 5 / 10 dB | 60.9 / 64.4 / 61.4 % | 41.1 / 67.0 / 82.6 % | **87.9 / 89.1 / 89.3 %** |
| babble 0 / 5 / 10 dB | 59.2 / 60.1 / 62.6 % | 47.2 / 50.9 / 54.1 % | **74.2 / 70.7 / 77.3 %** |

- In babble (other people talking, like a full bus), Silero drops to 71–77 %: the noise **is** speech. Even so, recall stays at 95–98 %, so it does not lose whoever is talking.
- The energy VAD with its defaults misses half the speech even on the clean signal (50 % recall), because its fixed 0.045 threshold is high for this recording level.
- **Cost:** 0.16 ms per 32 ms frame (WASM, one thread, Node 24). It fits on the main thread, no worker needed.

Reproduce: generate the data with `scripts/gen-vad-fixtures.py` and run `DATASET_DIR=… SILERO_MODEL=… node --import ./loader/css-loader.mjs scripts/bench-vad.mjs`.

## Before offering the button: `assessSpeechDevice`

```typescript
import { assessSpeechDevice } from "tempest-react-sdk/speech";

const device = assessSpeechDevice();
if (!device.canRun) console.log("goes to the server:", device.blockers);
console.log(device.wasmThreads, device.webgpu, device.deviceMemoryGb);
```

Synchronous and loads nothing. It only rules out the clearly impossible: no WebAssembly, no SIMD (ONNX Runtime Web only ships SIMD builds), or `deviceMemory` below `minMemoryGb` (2 GiB). Slow or not is the deadline's call.

!!! tip "Threads need cross-origin isolation"
    ONNX Runtime's WASM uses several threads only with `crossOriginIsolated` (headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`). Without them it runs on one thread, and the deadline will notice: on the same desktop, whisper-base over the 30 FLEURS utterances went from a real-time factor of 0.109 to **0.248** (`ISOLATION=0 … node scripts/bench-whisper-wer.mjs`), same WER. On an entry-level phone, one thread is what sends the recording to the server. `assessSpeechDevice().wasmThreads` tells whether isolation is on.

## Recap

- `createSpeechToText({ loadModel, server, isServerAvailable, language })` → `transcribe(blob)` → `{ text, source, reason }`. ✅
- The device gets audio × `realtimeFactor`; past it, the server answers and the device is marked slow for 7 days.
- A repetition loop (`compressionRatio` > 2.4) counts as a failure.
- `prompt` with the expected vocabulary: 15.9 % → 11.2 % WER on base, and an unrelated prompt does not hurt.
- Model not loaded yet: the server answers while the model downloads in the background.
- `loadWhisper` for direct use; whisper-tiny int8 transcribed 11 s in 778 ms on a desktop (`scripts/bench-whisper.mjs`).
- `loadWhisper({ worker })` with an `exposeWhisperWorker()` file: the screen stays at 60 fps while transcribing (3 → 45 frames in 720 ms).
- Silero VAD (`createSpeechDetector`, `detectSpeechSegments`): 88–89 % frame accuracy in white noise, against ~61 % for the energy VAD; 0.16 ms per frame.
- `onnxruntime-web` is an optional peer; WebGPU stays out of the default until measured on a real device.
