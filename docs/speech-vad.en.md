---
description: "Silero VAD in the browser: createSpeechDetector stops the recording on its own when the person stops talking, and detectSpeechSegments finds the speech in a recording."
---

# End of speech: Silero VAD

In a voice search, the person speaks and waits. If the app waits for the stop button or the time limit, the wait is long. Better to stop the recording on its own, ~1 s after they go quiet.

[`monitorVoiceActivity`](audio.md#who-is-talking-monitorvoiceactivity) decides by volume, so it fails exactly where the voice matters: a bus, the street, a TV on. `/speech` ships **Silero VAD** (v5, ~2 MB, MIT), a model that tells speech from noise every 32 ms. It runs on the same runtime as Whisper; see [how to serve the runtime](speech.md#2-serve-the-runtime).

```bash
curl -sfL -o public/models/silero_vad.onnx \
  https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
```

## Record until the person stops talking

The complete example: opens the microphone, records and stops 1 s after the speech ends. If nobody speaks within 15 s, it returns `null` instead of empty audio. It already works under the [`tempestCsp()` CSP](csp.md). Call it from the button's click: the user's gesture is what unlocks the microphone and audio.

```typescript
import { createAudioRecorder } from "tempest-react-sdk";
import pcmWorkletUrl from "tempest-react-sdk/pcm-worklet.js?url";
import { createSpeechDetector, loadSileroVad, type SileroVad } from "tempest-react-sdk/speech";

const NO_SPEECH_MS = 15_000;

let vadLoading: Promise<SileroVad> | undefined;

export function loadVad(): Promise<SileroVad> {
    return (vadLoading ??= loadSileroVad({ modelUrl: "/models/silero_vad.onnx" }));
}

export async function recordUntilQuiet(): Promise<Blob | null> {
    const vad = await loadVad();
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = createAudioRecorder(mic);
    let limit: ReturnType<typeof setTimeout> | undefined;
    try {
        recorder.start();
        let spoke = false;
        let finish = (): void => undefined;
        const done = new Promise<void>((resolve) => (finish = resolve));
        limit = setTimeout(finish, NO_SPEECH_MS);
        const detector = await createSpeechDetector(
            mic,
            (speaking) => {
                if (speaking) {
                    spoke = true;
                    clearTimeout(limit);
                } else if (spoke) finish();
            },
            { vad, minSilenceMs: 1000, stream: { workletUrl: pcmWorkletUrl } },
        );
        await done;
        detector.stop();
        const { blob } = await recorder.stop();
        return spoke ? blob : null;
    } finally {
        clearTimeout(limit);
        if (recorder.status() === "recording") recorder.cancel();
        mic.getTracks().forEach((track) => track.stop());
    }
}
```

- **The VAD loads once** (`loadVad`) and serves every recording. Call `loadVad()` early, when the screen mounts, so the first recording does not wait for the download.
- **No speech, no transcription.** Sending silence to Whisper asks for made-up text: with a `prompt`, the model may return the prompt itself. Hence the `null`.
- The 15 s limit only holds until speech starts. After that, silence is what stops it.
- The recorder starts **before** the detector. The detector needs a few frames to turn on: in the test below, speech started at 1.0 s and it turned on at 1.6 s. Since the recording was already running, the start is not lost.
- `onChange` gets `true` when speech starts and `false` when it ends. It is called only on the **change**, not on every frame.
- `stop()` frees the detector's audio graph. It does **not** stop the microphone (the stream is yours) or unload the VAD (`vad.release()` does that). One loaded VAD serves many recordings.
- `stream: { workletUrl }` is the same option as [`createPcmStream`](audio.md#from-the-microphone-createpcmstream)'s. Without it, the processor loads from a `blob:` URL, which `tempestCsp()`'s `script-src` refuses.

Measured on Chromium 159, with a fake microphone playing 1 s of silence, 5.5 s of a recorded sentence and silence after: the detector turned on at 1.6 s and off at 6.7 s. The recorded sentence already ends in a pause of its own, so the real end of speech is before 6.5 s. It processed 281 of 281 frames.

### `createSpeechDetector(source, onChange, options)` options

`source` is a `MediaStream`, a `MediaStreamTrack` or an `AudioNode` (the `track` of a `createVoiceChain`, say). The function returns `{ speaking, stop }`, the same shape as `monitorVoiceActivity`'s, so one swaps for the other.

| Option | Default | What it does |
| --- | --- | --- |
| `vad` | — | The model, from `loadSileroVad`. |
| `minSilenceMs` | `100` | Silence that ends speech. To stop a recording, use ~`1000`: 100 ms cuts in the middle of a pause. |
| `threshold` | `0.5` | Speech probability that turns it on. |
| `negThreshold` | `max(threshold − 0.15, 0.01)` | Probability under which it counts as silence. |
| `stream` | — | `{ workletUrl, context }`, passed to `createPcmStream`. |
| `onProbability` | — | Gets every frame's probability, for a meter or to tune the threshold. |

`minSpeechMs` exists in the type but does not apply live: a one-word answer must still turn the detector on.

## Find the speech in a recording: `detectSpeechSegments`

To trim the silence before uploading or transcribing:

```typescript
import { decodeAudioToPcm } from "tempest-react-sdk";
import { detectSpeechSegments, loadSileroVad } from "tempest-react-sdk/speech";

const vad = loadSileroVad({ modelUrl: "/models/silero_vad.onnx" });

export async function secondsOfSpeech(recording: Blob): Promise<number> {
    const segments = await detectSpeechSegments(await decodeAudioToPcm(recording), await vad);
    console.log(segments);
    return segments.reduce((total, s) => total + (s.endMs - s.startMs), 0) / 1000;
}
```

The console shows a list of `{ startMs, endMs }`, one item per stretch of speech.

The segmentation is silero-vad's `get_speech_timestamps`, with the same defaults (the `SILERO_DEFAULT_*` constants, with their source cited in the code):

| Option | Default | What it does |
| --- | --- | --- |
| `threshold` | `0.5` | Probability that starts speech. |
| `negThreshold` | `max(threshold − 0.15, 0.01)` | Probability under which it counts as silence. |
| `minSpeechMs` | `250` | Shortest stretch kept. |
| `minSilenceMs` | `100` | Silence that separates two stretches. |
| `padMs` | `30` | Margin added on each side of a stretch. |

## How accurate it is

Compared with the energy VAD, as per-frame accuracy over 32 ms frames on 10 FLEURS `pt_br` sentences. The label comes from the **clean** signal, and the measurement runs on the noisy one:

| Condition | Energy (default) | Energy (calibrated on the noise floor) | **Silero** |
| --- | --- | --- | --- |
| clean | 63.6 % | 86.1 % | **89.5 %** |
| white noise 0 / 5 / 10 dB | 60.9 / 64.4 / 61.4 % | 41.1 / 67.0 / 82.6 % | **87.9 / 89.1 / 89.3 %** |
| babble 0 / 5 / 10 dB | 59.2 / 60.1 / 62.6 % | 47.2 / 50.9 / 54.1 % | **74.2 / 70.7 / 77.3 %** |

- In babble (other people talking, as on a crowded bus), Silero drops to 71–77 %: the noise **is** speech. Even so, recall stays at 95–98 %, so it does not miss the person speaking.
- The energy VAD with its defaults misses half the speech even on the clean signal (50 % recall), because the fixed 0.045 threshold is high for this recording level.
- **Cost:** 0.16 ms per 32 ms frame (single-thread WASM, Node 24). It fits on the main thread, no worker.

??? info "How to reproduce"
    Generate the data with `scripts/gen-vad-fixtures.py` and run `DATASET_DIR=… SILERO_MODEL=… node --import ./loader/css-loader.mjs scripts/bench-vad.mjs`.

## Recap

- `loadSileroVad({ modelUrl })` loads the model (~2 MB). Load it once and reuse it for every recording.
- No speech before the limit: return `null`, do not send the silence to Whisper.
- To put it together with transcription, see [the whole voice search](speech-fallback.md#the-whole-voice-search).
- `createSpeechDetector(mic, onChange, { vad, minSilenceMs: 1000 })` says when speech starts and ends. Under a CSP, pass `stream: { workletUrl }`.
- `stop()` frees the audio graph; the microphone and the VAD stay yours.
- `detectSpeechSegments(pcm, vad)` → `[{ startMs, endMs }]`, with silero-vad's defaults.
- Per-frame accuracy of 87.9 to 89.3 % with white noise, against ~61 % for the energy VAD; 0.16 ms per frame.
