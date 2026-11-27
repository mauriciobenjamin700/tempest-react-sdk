---
description: "Sound classification in the browser with YAMNet (siren, horn, music, speech), live with createSoundMonitor, and any ONNX audio model of your own with loadAudioModel."
---

# Ambient sounds and your own model

To know **what** is heard (siren, horn, crying, music, applause, speech), `/speech` classifies with **YAMNet**: 521 AudioSet classes, ~16 MB, Apache-2.0. The ONNX export takes the raw 16 kHz waveform and computes its own log-mel inside, so the page computes no features. It runs on the same runtime as Whisper; see [how to serve the runtime](speech.md#2-serve-the-runtime).

```bash
M=public/models/yamnet && mkdir -p $M
for f in yamnet.onnx yamnet_class_map.csv; do
  curl -sfL -o $M/$f "https://huggingface.co/rostrumstudios/yamnet/resolve/main/$f"
done
```

## Classify a recording: `loadSoundClassifier`

```typescript
import { loadSoundClassifier } from "tempest-react-sdk/speech";

export async function whatIsHeard(recording: Blob): Promise<string> {
    const classifier = await loadSoundClassifier({
        modelUrl: "/models/yamnet/yamnet.onnx",
        labelsUrl: "/models/yamnet/yamnet_class_map.csv",
    });
    const { top } = await classifier.classify(recording);
    return top.map((s) => `${s.label} ${s.score.toFixed(2)}`).join(", ");
}
```

- `classify` takes a `Blob`, `MonoPcm` or a mono `Float32Array` at 16 kHz.
- The result has `frames` (every class's score in every 0.48 s window, with `startMs`) and `top` (the `topK` classes with the highest mean; default 5).
- The names are AudioSet's, in English: `"Siren"`, `"Vehicle horn, car horn, honking"`, `"Speech"`. The whole list is in `classifier.labels`.
- Checked on this export (Node 24, WASM): a 1 kHz tone → "Beep, bleep" 0.92; a FLEURS sentence in Portuguese → "Speech" 0.73; silence → "Silence" 1.00. 14 s cost 146 ms.
- `classifier.release()` frees the model.

## Live: `createSoundMonitor`

Watch the microphone and say when a siren starts:

```typescript
import pcmWorkletUrl from "tempest-react-sdk/pcm-worklet.js?url";
import {
    createSoundMonitor,
    loadSoundClassifier,
    type SoundClassifier,
    type SoundMonitor,
} from "tempest-react-sdk/speech";

export const loadYamnet = (): Promise<SoundClassifier> =>
    loadSoundClassifier({
        modelUrl: "/models/yamnet/yamnet.onnx",
        labelsUrl: "/models/yamnet/yamnet_class_map.csv",
    });

export function watchForSirens(
    mic: MediaStream,
    classifier: SoundClassifier,
    onSiren: () => void,
): Promise<SoundMonitor> {
    let sounding = false;
    return createSoundMonitor(
        mic,
        (active) => {
            const now = active.includes("Siren");
            if (now && !sounding) onSiren();
            sounding = now;
        },
        {
            classifier,
            classes: ["Siren"],
            stream: { workletUrl: pcmWorkletUrl },
        },
    );
}
```

- `onChange` gets the **list of active classes** whenever it changes, not on every window. An empty list means none of the watched classes is sounding.
- Each ~1 s window is classified every 0.5 s. The score is the mean of the last `smoothing` windows. A class turns on at `threshold` and only turns off under `releaseThreshold`, so a sound does not flicker every window.
- The classifier is loaded separately (`loadYamnet`) and handed to the monitor: one load serves many monitors, and whoever loaded it calls `release()` when it is no longer needed.
- The monitor returned has `active` (the current list) and `stop()`, which frees the audio graph. The microphone and the classifier stay yours.
- `stream: { workletUrl }` makes the monitor work under the [`tempestCsp()` CSP](csp.md), as with [`createPcmStream`](audio.md#from-the-microphone-createpcmstream).
- A class missing from the CSV throws `Unknown class "…"` at once, instead of never firing.

| Option | Default | What it does |
| --- | --- | --- |
| `classifier` | — | The classifier, from `loadSoundClassifier`. |
| `classes` | all | The watched classes, by their exact CSV name. |
| `threshold` | `0.3` | Mean score from which a class turns on. |
| `releaseThreshold` | `threshold × 0.6` | Mean score under which a class turns off. |
| `smoothing` | `3` | How many windows go into the mean (~1.5 s). |
| `windowSamples` | `15,600` | Window length, in samples at 16 kHz. |
| `hopSamples` | `8,000` | Distance between windows (0.5 s). |
| `stream` | — | `{ workletUrl, context }`, passed to `createPcmStream`. |

## Your own model: `loadAudioModel`

What every audio model repeats stays with the SDK: decoding, downmixing to mono, resampling with the SDK's filter and, when needed, computing the [log-mel](audio.md#log-mel-spectrogram-logmelspectrogram) **with the training config**. The outputs come back as the model returns them:

```typescript
import { WHISPER_LOG_MEL_80 } from "tempest-react-sdk";
import { loadAudioModel } from "tempest-react-sdk/speech";

export async function runMyModel(recording: Blob): Promise<number[]> {
    const model = await loadAudioModel({
        modelUrl: "/models/my-model.onnx",
        feature: { ...WHISPER_LOG_MEL_80, nMels: 64 },
        inputDims: ({ nMels, frames }) => [1, 1, nMels as number, frames as number],
    });
    const outputs = await model.run(recording);
    return Array.from(outputs[model.outputNames[0] as string]?.data ?? []);
}
```

| Option | Default | What it does |
| --- | --- | --- |
| `modelUrl` | — | The `.onnx`, served from your origin. |
| `feature` | — | `"waveform"` passes the raw waveform; a `LogMelConfig` computes the log-mel with it. |
| `sampleRate` | `16000` | Rate the model expects, with `"waveform"`. With a log-mel, the config's rate wins. |
| `inputDims` | `[samples]` or `[1, nMels, frames]` | Shape of the input tensor. |
| `inputName` | the model's first | Input name. |
| `ortAssetsUrl` | `configureOrtAssets`' folder | The runtime folder. |

A classifier of your own fits `loadSoundClassifier`, with `feature`, `labels` (or `labelsUrl`) and `scoresOutput`.

## Recap

- `loadSoundClassifier({ modelUrl, labelsUrl })` → `classify(blob)` → `{ frames, top }`, over the 521 AudioSet classes.
- `createSoundMonitor(mic, onChange, { classifier, classes })` calls `onChange(active)` when the list changes, with a 3-window mean and hysteresis (0.3 on, 0.18 off). Under a CSP, pass `stream: { workletUrl }`.
- `loadAudioModel({ modelUrl, feature, inputDims })` runs any ONNX audio model, with decoding, resampling and log-mel done by the SDK.
