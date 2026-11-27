---
description: "Speech and sound in the browser with ONNX models: transcription with Whisper (with a server fallback), end of speech with Silero VAD and ambient sounds with YAMNet."
---

# On-device transcription (Whisper)

The `tempest-react-sdk/speech` subpath runs audio models **in the user's browser**: it transcribes speech with Whisper, notices when the person stopped talking with Silero VAD, and recognises ambient sounds with YAMNet. No audio leaves the device unless you send it. 🎙️

This page goes from install to the first transcription. The other three cover the rest:

| You want to… | Page |
| --- | --- |
| transcribe on the device and send to the **server** when the device cannot keep up | [Device or server](speech-fallback.md) |
| stop the recording **on its own** when the person stops talking, or trim silence | [End of speech (Silero VAD)](speech-vad.md) |
| know **what** is heard (siren, horn, music) or run an audio model of your own | [Sounds and your own model](speech-sounds.md) |

## Terms used here

| Term | What it is |
| --- | --- |
| **ONNX** | A model file format. **ONNX Runtime Web** (`onnxruntime-web`) runs it in the browser. |
| **WASM** | WebAssembly: the runtime's compiled code. **SIMD** (batched arithmetic) is required; **threads** (several cores) are optional and need the [isolation](#threads-cross-origin-isolation) headers. |
| **int8** | Model weights stored in 8 bits: a file ~4× smaller than the original, with a small accuracy loss. |
| **WER** | Word error rate, the fraction of words wrong. 15 % = one word wrong in seven. |
| **RTF** | Real-time factor, processing time ÷ audio duration. 0.1 = 10 s of speech in 1 s. Not to be confused with `createSpeechToText`'s `realtimeFactor` option, which sets a **deadline**. |
| **VAD** | Voice activity detection: telling, frame by frame, whether there is speech. |
| **log-mel** | The audio representation Whisper reads, an "image" of frequencies over time. The SDK computes it for you. |

## Install

```bash
npm install tempest-react-sdk onnxruntime-web
```

`onnxruntime-web` is an optional peer, the same one `/vision` and `/tabular` use. It is only imported when a model loads, so importing the subpath and calling `assessSpeechDevice()` does not need the package.

The app serves three things from its own origin. None of them goes into the bundle:

| What | Size | Who serves it |
| --- | --- | --- |
| the model (`whisper-base` int8) | 77 MB | you, from `public/models/` (step 1) |
| the ONNX runtime (`.wasm` + `.mjs`) | ~25 MB | the `tempestOrtAssets()` plugin (step 2) |
| the worker that runs the model | one line | you (step 4) |

The browser downloads the first two only when the model loads, and keeps them: the second time works offline.

## 1. Serve the model

The SDK reads Hugging Face's ONNX export in the `onnx-community/whisper-*` layout. Download it once:

```bash
M=public/models/whisper-base && mkdir -p $M/onnx
for f in config.json generation_config.json tokenizer.json \
  onnx/encoder_model_int8.onnx onnx/decoder_model_merged_int8.onnx; do
  curl -sfL -o $M/$f "https://huggingface.co/onnx-community/whisper-base/resolve/main/$f"
done
```

| Model | Download (int8) | WER in Portuguese | RTF (desktop) |
| --- | --- | --- | --- |
| `whisper-tiny` | 41 MB | 34.0 % | 0.071 |
| `whisper-base` | 77 MB | **15.9 %** | 0.109 |
| `whisper-small` | 249 MB | — | too big for a phone |

**For Portuguese, use `whisper-base`:** tiny gets one word in three wrong.

??? info "How it was measured"
    - **Sizes:** the `encoder_model_int8.onnx` + `decoder_model_merged_int8.onnx` files in the Hugging Face API, on 26/11/2026.
    - **WER:** 30 FLEURS `pt_br` sentences (`dev` split, 363 s of read speech), Chromium 159 on a desktop, with `npm run build && WHISPER_MODEL_DIR=… DATASET_DIR=… LANGUAGE=pt node scripts/bench-whisper-wer.mjs`.
    - **What counts in the WER:** normalisation drops punctuation and case but keeps accents and does not convert numerals, so "dez" × "10" counts as an error.
    - **The errors that matter in a search are proper nouns** ("polo" → "Paulo"). Measure with recordings from your domain: the same script takes any folder with a `transcripts.tsv` (`file<TAB>text`).

## 2. Serve the runtime

ONNX Runtime Web does **not** embed its `.wasm` files, not even in the `.bundle` builds. In a Vite-bundled app the session fails with `Aborted(both async and sync fetching of the wasm failed)`, without naming the missing file. The [`tempestOrtAssets()`](vite-config.md#onnx-models-in-the-browser-tempestortassets) plugin serves the binaries at `/ort/`, in dev and in the build:

```ts
import { createViteConfig, tempestCsp, tempestOrtAssets } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [tempestOrtAssets({ crossOriginIsolation: true }), tempestCsp()],
});
```

- `crossOriginIsolation: true` turns the [threads](#threads-cross-origin-isolation) on in `vite dev` and `vite preview`. In production the headers come from your server.
- [`tempestCsp()`](csp.md) is optional and goes last. Its default already allows what `/speech` needs: `'wasm-unsafe-eval'` to compile the runtime and `worker-src 'self' blob:` for the workers. The AudioWorklet is the exception: the functions that listen to the microphone take `stream: { workletUrl }` ([end of speech](speech-vad.md)).
- The examples' `import url from "…?url"` is Vite syntax. In TypeScript it compiles with `"types": ["vite/client"]` in `tsconfig`, which the SDK's template already has.

Tell the SDK where the runtime is **once**, at app boot (`main.tsx`). It holds for every model in `/speech`, `/tabular` and `/vision`, including inside the worker of step 4:

```typescript
import { configureOrtAssets } from "tempest-react-sdk/speech";

configureOrtAssets("/ort/");
```

!!! warning "nginx: `.mjs` and the isolation headers"
    nginx's default `mime.types` does not know `.mjs`. The runtime goes out as `application/octet-stream` and the browser refuses the module. In the `server` block:

    ```nginx
    location ~* \.mjs$ {
        types { } default_type application/javascript;
    }
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    ```

    nginx does not inherit `add_header`: a `location` that declares headers of its own (cache, CSP) loses the `server` ones. Repeat both isolation headers there.

## 3. The first transcription

With the model and the runtime served, `loadWhisper` loads and `transcribe` transcribes:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export async function transcribeFile(recording: Blob): Promise<string> {
    const whisper = await loadWhisper({ baseUrl: "/models/whisper-base" });
    const result = await whisper.transcribe(recording, { language: "pt" });
    console.log(result);
    return result.text;
}
```

To record the `Blob`, use [`createAudioRecorder`](audio.md#outside-react-the-primitives) (or `useAudioRecorder`, in React). The console shows this:

```text
{
  text: "Você pode ver as pirâmides no escuro e no silêncio antes de o chão começar.",
  language: "pt",
  audioMs: 8160,
  timings: { decodeMs: 56, featuresMs: 83, encoderMs: 467, decoderMs: 430, totalMs: 1037 },
  compressionRatio: 0.99,
  degenerate: false,
  tokens: [ … 22 ids … ]
}
```

Measured on a FLEURS `pt_br` sentence ("Você pode ver as pirâmides no escuro e também no silêncio antes de o show começar."), whisper-base int8, Chromium 159 on a desktop, warm run, with `WHISPER_MODEL_DIR=… LANGUAGE=pt node scripts/bench-whisper.mjs`. The model heard "chão" for "show" and dropped "também": the kind of error [`prompt`](#proper-nouns-prompt) reduces.

What `transcribe` takes and what it does:

- **Input:** a `Blob` (what `MediaRecorder` recorded: webm/opus, mp4/aac, wav, mp3), a mono `Float32Array` at 16 kHz, or `MonoPcm` at any rate.
- **Over 30 s:** processed in 30 s windows, one after the other.
- **`language` omitted:** detected on the first window, at the cost of one extra decoder step.
- **`onPartial(text)`:** gets the partial text after every token, for a live caption. **`signal`** cancels.
- **`degenerate: true`:** the model got stuck in a loop ("Wars!!!!…"). Treat it as a failure. [`createSpeechToText`](speech-fallback.md) does that for you.
- **Cache:** the files go to Cache Storage (`tempest-speech-models`). The second load downloads nothing and works offline.
- **`whisper.release()`** frees the model's memory.

## 4. Take the model off the main thread: `worker`

ONNX Runtime's WASM backend computes on the thread that calls it. On the page, that **freezes the screen** for the whole transcription: the spinner stops, and a tap waits for the end. Run the model in a Web Worker. It takes two files:

```text
src/
├── speech.worker.ts   ← the worker: one line
└── speech.ts          ← what loads the model
```

`src/speech.worker.ts`:

```typescript
import { exposeWhisperWorker } from "tempest-react-sdk/speech";

exposeWhisperWorker();
```

`src/speech.ts`:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export const loadSpeechModel = () =>
    loadWhisper({
        baseUrl: "/models/whisper-base",
        worker: new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" }),
    });
```

The model returned has the same interface as in step 3. Three details the SDK already handles:

- `new URL("./…", import.meta.url)` is the form Vite recognises to bundle the worker. `tempestOrtAssets()` sets `worker.format: "es"`, which the worker needs.
- The runtime folder (`configureOrtAssets` or `ortAssetsUrl`) is sent to the worker along with the options.
- The recording is decoded on the page (a worker has no `OfflineAudioContext`), and only the samples cross to the worker, transferred without a copy. Cancelling rejects at once and stops the worker at the next decoder step.

??? info "Measured: the screen stops freezing"
    Chromium 159, whisper-tiny int8, 11 s of speech (`WHISPER_MODEL_DIR=… node scripts/bench-whisper-worker.mjs`):

    | Where it runs | Transcription | Frames drawn (expected at 60 fps) |
    | --- | --- | --- |
    | page, with threads | 724 ms | **3** (43) |
    | worker, with threads | 715 ms | **45** (43) |
    | page, 1 thread | 1,423 ms | **2** (85) |
    | worker, 1 thread | 1,419 ms | **86** (85) |

    The time is the same; only the screen stops freezing.

??? info "Why not ONNX Runtime's `env.wasm.proxy`"
    The built-in proxy **transfers** the input buffers to its worker, and Whisper's decoder reuses the encoder output at every step. Measured: `DataCloneError: An ArrayBuffer is detached` on the second step. It also does not work with WebGPU. Here the whole loop (features, encoder, decoder) runs in the worker.

## Proper nouns: `prompt`

In a voice search, the key information is often a proper noun, such as the city. That is exactly what Whisper gets wrong most ("polo" → "Paulo"). Pass the expected vocabulary as `prompt`:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export async function transcribeSearch(recording: Blob): Promise<string> {
    const whisper = await loadWhisper({ baseUrl: "/models/whisper-base" });
    const { text } = await whisper.transcribe(recording, {
        language: "pt",
        prompt: "Picos, Sobral, Teresina, Juazeiro do Norte, Fortaleza, Parnaíba",
    });
    return text;
}
```

Whisper reads the prompt as text that came before the recording and leans towards those spellings. On the same 30 sentences, base's WER went from 15.9 % to **11.2 %**. A list unrelated to the audio did not make it worse (14.3 %), so a fixed list is safe. Keep the list short: on silence or noise the model may echo the prompt.

??? info "How it was measured"
    whisper-base int8, 30 FLEURS `pt_br` sentences, with `PROMPT="…" WHISPER_MODEL_DIR=… DATASET_DIR=… node scripts/bench-whisper-wer.mjs`:

    | Prompt | WER | Degenerate outputs |
    | --- | --- | --- |
    | none | 15.9 % | 0 |
    | proper nouns that occur in the sentences | **11.2 %** | 0 |
    | Northeast cities that do **not** occur | 14.3 % | 0 |

    The prompt encoding is identical to Hugging Face `tokenizers` on Whisper's real vocabulary (`tokenizer.parity.test.ts`).

## `loadWhisper` options

| Option | Default | What it does |
| --- | --- | --- |
| `baseUrl` | — | Folder of the export (`config.json`, `tokenizer.json`, `onnx/…`). |
| `dtype` | `"int8"` | Which weights to download: `"int8"`, `"fp32"`, `"fp16"` or `"q4"`. |
| `worker` | — | Runs the model in this Web Worker (step 4). |
| `ortAssetsUrl` | `configureOrtAssets`' folder | The runtime folder, if you did not call `configureOrtAssets`. |
| `onProgress` | — | `({ file, loaded, total })` during the download, per file. |
| `persistStorage` | `false` | Asks for `navigator.storage.persist()` before downloading, so the browser does not evict the model when disk runs low. Off by default because, in Firefox, the request opens a permission prompt. |
| `providers` | `["wasm"]` | ONNX Runtime backends, in order of preference. |
| `cacheName` | `"tempest-speech-models"` | Cache Storage bucket name. |

!!! warning "WebGPU is not the default"
    `providers` accepts `["webgpu", "wasm"]`, but the int8 export uses integer ops the WebGPU backend hands back to the CPU node by node, and fp16 on WebGPU produced garbage in the measured environment. Until it is measured on a real device, the default is `["wasm"]`.

## Threads: cross-origin isolation

ONNX Runtime's WASM uses several cores only on a `crossOriginIsolated` page, with the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` headers. Without them it runs on one thread and is **2.3× slower**: whisper-base went from RTF 0.109 to 0.248 on the same desktop, with the same WER (`ISOLATION=0 … node scripts/bench-whisper-wer.mjs`). On an entry-level phone, that is the difference between transcribing on the device and sending to the server.

- **Dev and preview:** `tempestOrtAssets({ crossOriginIsolation: true })`.
- **Production:** the two nginx `add_header` lines from step 2.
- **Why `credentialless` and not `require-corp`:** with `require-corp`, every cross-origin image, font or script without a `Cross-Origin-Resource-Policy` header stops loading. With `credentialless` they load without cookies. In a browser that does not know `credentialless`, the page is not isolated: the model runs on one thread, but it runs.
- **To check:** `crossOriginIsolated` in the console, or `assessSpeechDevice().wasmThreads`.

## What it costs

Chromium 159, desktop (24 cores, WASM with threads), whisper-tiny int8, 11 s of English speech (`jfk.flac` from the Whisper repository), warm run:

| Stage | ms |
| --- | --- |
| Decode the `.flac` and resample | 106 |
| Log-mel | 91 |
| Encoder | 283 |
| Decoder (24 tokens) | 297 |
| **Total** | **778** |

Load: 1,266 ms downloading 43.3 MB, 343 ms from cache. Reproduce with `npm run build && WHISPER_MODEL_DIR=/tmp/whisper-tiny node scripts/bench-whisper.mjs` (the download command is in the header of `e2e/speech-whisper.spec.ts`). **Not yet measured on an entry-level Android**: that is what [`createSpeechToText`'s deadline](speech-fallback.md#how-the-route-is-chosen) is for.

??? info "Why not `@huggingface/transformers`"
    | `@huggingface/transformers@4.3.2` | What it would cost the app |
    | --- | --- |
    | `onnxruntime-web` pinned to `1.31.0-dev.20260914` | a second ONNX runtime (duplicated wasm) in an app that already uses `/vision` or `/tabular` |
    | `onnxruntime-node` and `sharp` as dependencies | native binaries downloaded on `npm install` for a browser app |

    What transcription needs from it (greedy decoding with a KV cache and the BPE tokenizer) is in `/speech`, on top of the `onnxruntime-web` that is already a peer.

## Recap

- Serve the model from `public/models/` (`whisper-base` int8: 77 MB, 15.9 % WER in Portuguese) and the runtime with `tempestOrtAssets()` (~25 MB). On nginx, `.mjs` needs a JavaScript MIME type.
- `configureOrtAssets("/ort/")` once at boot. It holds for every model, including in the worker.
- `loadWhisper({ baseUrl })` → `transcribe(blob, { language: "pt" })` → `{ text, degenerate, timings, … }`.
- `loadWhisper({ worker })` with a one-line `exposeWhisperWorker()` file: the screen keeps drawing during the transcription (3 → 45 frames in ~720 ms).
- `prompt` with the expected proper nouns: WER 15.9 % → 11.2 %.
- Threads: COOP `same-origin` + COEP `credentialless` (RTF 0.248 → 0.109). `tempestOrtAssets({ crossOriginIsolation: true })` turns it on in dev.
- Next: [device or server](speech-fallback.md), [end of speech](speech-vad.md), [sounds and your own model](speech-sounds.md).
