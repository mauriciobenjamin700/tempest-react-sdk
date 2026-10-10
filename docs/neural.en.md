# Neural noise suppression (RNNoise)

The `tempest-react-sdk/neural` subpath hooks a recurrent neural network — RNNoise — onto a microphone opened by the browser and returns a denoised `MediaStreamTrack`, ready to publish. It is the *neural* answer to the same problem the `getUserMedia` `noiseSuppression` constraint attacks with a stationary-noise gate: separating your voice from keyboard, fans, traffic and a room full of people — without letting a transient through and without eating the voice with it.

The model runs in an `AudioWorklet`, inside an AudioContext at **48 kHz** (the rate it assumes). You are the one serving the three assets — the worklet module and the two `.wasm` — because a library cannot know where your bundler publishes files it never saw.

```bash
npm install tempest-react-sdk @sapphi-red/web-noise-suppressor
```

```ts
import {
  createNeuralSuppressor,
  isNeuralSuppressionSupported,
} from "tempest-react-sdk/neural";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";

async function startDenoisedCapture(): Promise<{ track: MediaStreamTrack; release?: () => void }> {
  if (!isNeuralSuppressionSupported()) {
    const plain = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { track: plain.getAudioTracks()[0] };
  }

  const context = new AudioContext({ sampleRate: 48_000 });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false },
  });
  const source = stream.getAudioTracks()[0];

  const suppressor = await createNeuralSuppressor(
    context,
    source,
    {
      workletUrl: rnnoiseWorkletUrl,
      simdWasmUrl: rnnoiseSimdWasmUrl,
      wasmUrl: rnnoiseWasmUrl,
    },
    { maxChannels: 1 },
  );

  if (suppressor === null) return { track: source };
  return { track: suppressor.track, release: suppressor.release };
}
```

## Why a separate subpath

RNNoise cannot live in the synchronous barrel — not even in `audio`. Two reasons:

- **The worklet is a file you must serve.** `context.audioWorklet.addModule` takes a URL, not a bundle; the consumer has to host `rnnoiseWorklet.js` and the model's `.wasm`. A module that depends on three URLs it does not control cannot be called by a synchronous function like `createVoiceChain`.
- **The load is asynchronous.** The model compiles to wasm; whoever opens the microphone must decide *beforehand* which path it will take (the fallback is a `getUserMedia` constraint, and a constraint cannot be added to an already-open capture).

Hence the subpath: the honest surface is a `Promise<NeuralSuppressor | null>`, and the package delivering the assets is an optional peer installed by whoever uses the subpath.

!!! info "Optional peer"
    `@sapphi-red/web-noise-suppressor` is an optional dependency: `npm install @sapphi-red/web-noise-suppressor` is only needed when your app imports `tempest-react-sdk/neural`.

## The package and the three assets

The peer publishes, alongside its code, the files the worklet needs:

| Asset | Import in Vite | Purpose |
| --- | --- | --- |
| Worklet module | `@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url` | The DSP that `addModule` registers on the context |
| SIMD model | `@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url` | Where the engine has SIMD |
| Baseline model | `@sapphi-red/web-noise-suppressor/rnnoise.wasm?url` | Fallback for engines without SIMD |

The `?url` suffix is a bundler feature: it resolves the module to its served address. That is what turns an asset `import` into the `string` that `addModule` and `loadRnnoise` know how to use.

!!! tip "Offline"
    The `.wasm` files are fetched once and compiled. For an offline-capable app, precache all three assets along with the app shell (`tempestPwaManifest` from the `tempest-react-sdk/vite` subpath accepts the same `?url` imports).

## Preparing before opening the microphone

`prepareNeuralSuppressor(context, assets)` registers the worklet module on the context and compiles the model — exactly once for each, no matter how many times you call it. It throws on failure, because it exists to run *before* the capture, while a different fallback is still reachable:

```ts
import { isNeuralSuppressionSupported, prepareNeuralSuppressor } from "tempest-react-sdk/neural";

const context = new AudioContext({ sampleRate: 48_000 });
const neuralAvailable = isNeuralSuppressionSupported()
  && (await prepareNeuralSuppressor(context, assets).then(() => true, () => false));

const stream = await navigator.mediaDevices.getUserMedia({
  audio: { noiseSuppression: !neuralAvailable, echoCancellation: true },
});
```

With the neural side ready, you ask `getUserMedia` for `noiseSuppression: false`. The two filters answer the same question; running both makes the voice arrive twice-filtered, and that is where the robotic timbre of stacked suppression comes from.

## Building the graph

`createNeuralSuppressor(context, source, assets, { maxChannels })` builds `source → worklet → MediaStreamDestination` inside your context and returns:

- `track` — the output track, which you publish in place of the captured one;
- `release()` — tears the graph down and stops the track; it does **not** stop the source, which belongs to the caller.

`maxChannels` is the channel count of the capture: the model is mono, and asking for the right count keeps a second channel of a stereo capture from being dropped.

## When it returns `null`

Silence is not an error. `createNeuralSuppressor` returns `null` when:

- the context is not running at **48 kHz** — feeding a model trained on 48 kHz with samples of another rate produces mush, not a voice (and nothing is fetched before this check);
- the `.wasm` did not load or the worklet node could not be built.

By then the caller has already committed to the neural path, so the honest outcome is a call without suppression — not a microphone that refuses to open. `prepareNeuralSuppressor`, which exists to run before the capture, still throws, because there the fallback is still within reach.

## API

| Symbol | What it is |
| --- | --- |
| `isNeuralSuppressionSupported()` | `true` when the browser has `AudioWorkletNode` and a secure context |
| `prepareNeuralSuppressor(context, assets)` | Registers the worklet module and compiles the model; idempotent, throws on failure |
| `createNeuralSuppressor(context, source, assets, { maxChannels })` | Builds the graph and returns a `NeuralSuppressor` — or `null` when the context is not 48 kHz or the graph failed |
| `NeuralSuppressor` | `{ track, release() }` — the denoised track and the graph teardown |
| `NeuralSuppressorAssets` | `{ workletUrl, simdWasmUrl, wasmUrl }` — the resolved URLs of the three assets |

## Recap

- The peer installs on demand: `@sapphi-red/web-noise-suppressor` only reaches your bundle if you import the subpath.
- The assets are `?url`: you serve them; the library handles the graph, load-once semantics and per-context registration.
- The context needs 48 kHz; any other rate returns `null` without even fetching the model.
- No stacked filters: with the neural side on, ask `getUserMedia` for `noiseSuppression: false`.
- Prepare the model before opening the microphone, or you have nowhere to fall back when it fails.