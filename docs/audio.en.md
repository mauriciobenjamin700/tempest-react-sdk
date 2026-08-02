# Audio

Audio in the browser, both directions.

**Playback** — sound notifications (message chime, payment confirmation) with `playAudio`, `useAudio` and `createAudioPlayer`, plus the `AudioPlayer` component when you need a transport (play/pause, bar, times).

**Capture** — `AudioRecorder` for a one-line voice note, and underneath it `useMediaPermission`, `useMediaDevices`, `useMicrophone`, `useAudioRecorder`, `createLevelMeter` and `blobToWav`. No new dependency: the whole slice measures **5.50 KB brotli**.

!!! tip "If you just want to record a voice note, skip to [Recording](#recording-start-with-the-component)"
    The rest of the page is the layer underneath, for when the component does not fit.

!!! info "Why a wrapper around `new Audio()`?"
    Playing sound in the browser runs into the _autoplay policy_ and leaking `Audio` elements. The SDK encapsulates it: it tracks the current clip (so you can `stop` it), normalizes volume, handles the autoplay block by returning `null` instead of throwing, and cleans up on unmount when you use the hook.

## `playAudio` — one-off on the shared player

Ideal for a sound fired by an event, with no UI state:

```tsx
import { playAudio, useEventStream } from "tempest-react-sdk";

interface StreamEvent {
  type: "NOTIFY" | "PAYMENT-SUCCESS";
}

export function PaymentSounds() {
  useEventStream<StreamEvent>(`${import.meta.env.VITE_API_URL}/notifications`, {
    onMessage: ({ data }) => {
      if (data.type === "PAYMENT-SUCCESS") {
        void playAudio("/audio/money.mp3", { volume: 0.5 });
      }
    },
  });

  return null;
}
```

`playAudio(src, options)` returns `Promise<HTMLAudioElement | null>` — `null` when the browser blocked autoplay. Options: `volume` (0–1, default 1), `loop`, `autoplay`, `stopPrevious`, `onEnded`, `onError`. To stop whatever the shared player is playing, use `stopAudio()`.

## `useAudio` — private per-component player

Each hook instance gets its own player, so unmounting stops audio automatically:

```tsx
import { useAudio } from "tempest-react-sdk";

export function NotificationBell() {
  const audio = useAudio();

  return (
    <button onClick={() => audio.play("/audio/plim.wav", { volume: 0.8 })}>
      🔔 {audio.unlocked ? "" : "(tap to enable sound)"}
    </button>
  );
}
```

- `audio.play(src, options)` — plays on the private player (same options as `playAudio`).
- `audio.stop()` — stops the current clip.
- `audio.unlocked` — becomes `true` after the first successful `play()`. Useful to hide UI asking for the initial interaction.
- Automatic cleanup on unmount.

!!! tip "Use `unlocked` to guide the user"
    Before the first click, the browser blocks audio. Show a hint ("tap to enable sound") while `unlocked === false` and hide it as soon as it flips to `true`.

## `createAudioPlayer` — isolated channels

`createAudioPlayer()` creates a tracker independent from the default. Use it when you need to play two sounds simultaneously without one cutting off the other (e.g. background music + a sound effect):

```ts
import { createAudioPlayer } from "tempest-react-sdk";

const music = createAudioPlayer();
const sfx = createAudioPlayer();

await music.play("/audio/loop.mp3", { loop: true, volume: 0.3 });
await sfx.play("/audio/coin.wav", { volume: 1 }); // does not cut the music

music.stop(); // stops only the music
console.log(sfx.current()); // HTMLAudioElement | null
```

Each player tracks **one** current clip. `stopPrevious: true` in `play()` stops that same player's previous clip before playing the new one.

## Autoplay policy

Browsers block playback before the user's first interaction. `playAudio` / `play()` return `null` when blocked (and call `onError` if provided) — instead of throwing.

!!! warning "Unlock audio on the first click"
    You can't play sound before any interaction. Design the app to fire a `play()` (even of a short silent clip) on the first click of any button; from then on the browser allows the rest.

## Assets

The SDK does **not** bundle audio files. Serve them at `/audio/*` (or a CDN) and pass the URL. Sound-palette inspiration (alofans):

```ts
export const AUDIOS = {
  plim: "/audio/plim.wav",
  money: "/audio/money.mp3",
  notification: "/audio/bell_sound.wav",
};
```

## Recording: start with the component

If all you want is a voice note, it is one line. `AudioRecorder` handles the permission, the level meter, the clock and the review before you ever see the audio:

```tsx
import { AudioRecorder } from "tempest-react-sdk";

export function VoiceNote({ ticketId }: { ticketId: string }) {
  return (
    <AudioRecorder
      maxDurationMs={120_000}
      onRecorded={({ blob, mimeType, durationMs }) => {
        const form = new FormData();
        form.append("audio", blob, `note.${mimeType.includes("mp4") ? "m4a" : "webm"}`);
        form.append("duration", String(durationMs));
        void fetch(`/api/tickets/${ticketId}/audio`, { method: "POST", body: form });
      }}
      footer={<small>Two minutes maximum.</small>}
    />
  );
}
```

What you get without writing any of it:

| You did | The component does |
| --- | --- |
| nothing | Does **not** ask for the microphone on mount — only on the first press of Record |
| nothing | When the permission is already `denied`, says so and how to fix it, instead of offering a button that cannot work |
| nothing | Live level meter, a clock that **subtracts paused time**, pause/resume |
| `maxDurationMs` | Stops itself at the cap, and shows the cap next to the clock |
| nothing | Review player with a transport, and "Record again" reusing the same stream |
| `format="wav"` | Converts before handing over, so `onRecorded` **always** gives you the format you asked for |

!!! danger "The permission prompt does not fire on mount, and that is the most important decision on this page"
    A prompt the user did not provoke is the most reliable way to earn a permanent **Block** — after which `getUserMedia` rejects **without ever prompting again**. So the microphone opens on the first press of Record, and the press survives the round-trip: the component arms the recording and starts when the stream lands. Waiting for a second click would make the first one look broken.

### Props

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `onRecorded` | `(recording: AudioRecording) => void` | — | Receives the finished audio. Never fires on cancel. |
| `maxDurationMs` | `number` | — | Stops itself. **Always worth setting** on a public screen. |
| `deviceId` | `string` | — | Specific microphone, from `useMediaDevices().audioInputs`. |
| `format` | `"native" \| "wav"` | `"native"` | `"wav"` converts on stop. See the cost below. |
| `wavOptions` | `WavOptions` | — | `{ mono: true, sampleRate: 16000 }` suits speech. |
| `audioBitsPerSecond` | `number` | — | 32000–64000 is plenty for voice in Opus. |
| `review` | `boolean` | `true` | Review player before handing over. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Labels. |
| `footer` | `ReactNode` | — | A hint, a count, a legal notice. |
| `onError` | `(error: unknown) => void` | — | Recorder failure, or a WAV conversion that did not work. |

`AudioRecording = { blob, mimeType, durationMs }`.

## `AudioPlayer` — a transport for one clip

Takes a `Blob` directly, because the thing an app most often plays is the recording it just made:

```tsx
<AudioPlayer src={recording.blob} durationMs={recording.durationMs} />
<AudioPlayer src="/audio/briefing.mp3" sinkId={chosenOutput} />
```

!!! warning "Pass `durationMs` whenever you have it — `<audio>` lies about a fresh recording"
    `MediaRecorder` writes WebM **with no duration in the header**, so `<audio>.duration` on a fresh recording is `Infinity`. That is why the recorder keeps its own clock and you should pass it along. Without it the component applies the only workaround there is — seeking past the end to force the browser to demux to the last frame — and the bar stays stuck until that resolves.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `src` | `string \| Blob \| null` | — | URL or blob. A blob becomes an object URL that is revoked for you. |
| `durationMs` | `number` | — | Known length. Wins over the element's. |
| `sinkId` | `string` | — | Chosen output. Chromium only. |
| `autoPlay` · `loop` | `boolean` | `false` | As on the native element. |
| `actions` | `ReactNode` | — | Right of the times — download, delete. |
| `onEnded` · `onError` | `() => void` | — | End, and decode/network failure. |

## Permission without firing the prompt

`useMediaPermission` reads the state **without** asking for the device. It is what makes a decent flow possible at all:

```tsx
import { useMediaPermission } from "tempest-react-sdk";

export function RecordButton({ onStart }: { onStart: () => void }) {
  const { state, supported } = useMediaPermission("microphone");

  if (state === "denied") {
    return <p>Microphone blocked. Allow it in site settings and reload.</p>;
  }
  return (
    <button onClick={onStart}>
      {state === "prompt" || !supported ? "Allow microphone and record" : "Record"}
    </button>
  );
}
```

| State | Means | What the UI should do |
| --- | --- | --- |
| `"prompt"` | never asked | a button; asking shows the prompt |
| `"granted"` | allowed | a normal button |
| `"denied"` | **sticky** — asking again rejects immediately, with no prompt | instructions for site settings, not a button |
| `"unknown"` | the Permissions API did not answer (Safari does not expose `microphone`) | treat as "you will have to ask to find out" |

The state is **live**: if the user changes the permission in site settings, the hook updates.

## Devices: microphone and output

```tsx
import { useMediaDevices, isAudioOutputSelectionSupported } from "tempest-react-sdk";

const { audioInputs, audioOutputs, labelsAvailable } = useMediaDevices();
```

!!! warning "The names only appear after permission"
    Before the user allows a capture, **every** `label` is `""` — the ids and the count are real, the names are not. A picker rendered there is a column of blanks. Use `labelsAvailable` to decide when to show it. Ask for the microphone first, then offer the choice.

!!! info "The list changes while the page is open"
    Plugging in a headset mid-recording is the normal case, not an edge case. The hook subscribes to `devicechange` instead of enumerating once on mount.

`audioOutputs` comes back **empty** where the browser has no output routing — Safari and Firefox do not implement `setSinkId`. Empty there means "you cannot offer this choice", not "there are no speakers". Check `isAudioOutputSelectionSupported()` before rendering the picker, or the control is a lie on two of three engines.

```tsx
import { setAudioOutput } from "tempest-react-sdk";

const ok = await setAudioOutput(audioRef.current, chosenDevice);
if (!ok) toast("This browser cannot choose the sound output.");
```

`playAudio` takes `sinkId` too, which is useful for a chime that must land on a headset while the call audio stays on the speakers.

## Building it yourself: the hooks

```tsx
import { useMicrophone, useAudioRecorder } from "tempest-react-sdk";

export function OwnRecorder() {
  const mic = useMicrophone({ noiseSuppression: true });
  const rec = useAudioRecorder(mic.stream, { maxDurationMs: 60_000 });

  return (
    <>
      <button onClick={mic.start} disabled={mic.status === "ready"}>
        Allow microphone
      </button>
      <button onClick={rec.start} disabled={!rec.ready}>
        Record
      </button>
      <button onClick={() => void rec.stop()}>Stop</button>
      <meter min={0} max={1} value={rec.level} />
      <span>{rec.durationMs} ms</span>
      {mic.error && <p role="alert">{mic.error.message}</p>}
    </>
  );
}
```

!!! danger "`stop()` on the microphone is not optional"
    Dropping the last reference to a `MediaStream` does **not** turn off the microphone. Every track has to be stopped by hand — otherwise the browser keeps showing its recording indicator, the OS keeps the device busy, and the **next** `getUserMedia` (in another tab of the same app, typically) fails with `NotReadableError`. `useMicrophone` stops tracks on `stop()`, on unmount, and before re-opening.

!!! info "The recorder does **not** own the stream"
    `rec.stop()` deliberately leaves the microphone open, so a second take does not need another permission round-trip. Closing belongs to `mic.stop()`.

### Classified errors

`useMicrophone().error` arrives already translated from `DOMException` into something you can branch on:

| `kind` | Cause | Action |
| --- | --- | --- |
| `insecure` | page on plain HTTP | the fix is a **URL**, not a setting |
| `unsupported` | engine with no capture | another browser |
| `permission-denied` | denied | site settings |
| `not-found` | no device, or none matching the constraints | relax `deviceId` |
| `in-use` | hardware busy | close the other app/tab |
| `unknown` | everything else | shows the original message |

The order matters: a missing `mediaDevices` is almost never "this browser cannot do audio" — it is a page on HTTP, where the whole API simply does not exist. Reporting `unsupported` there sends the developer looking for a polyfill for a problem an `https://` URL fixes.

## Recording level

`useAudioRecorder` already publishes `level` (0–1) at 10 Hz. For a per-frame bar, use `createLevelMeter` directly and write to the DOM:

```tsx
const meter = createLevelMeter(stream);
const tick = () => {
  bar.style.transform = `scaleX(${meter.level()})`;
  raf = requestAnimationFrame(tick);
};
// ...and always meter.stop() in cleanup
```

!!! warning "A meter is not decoration"
    A muted OS input, or a headset with its mic arm folded up, produces a **perfectly successful recording of silence** — and with no visible level the user only finds out after they finish talking.

The value is RMS, not peak: peak reacts to a single sample and flickers, RMS tracks perceived loudness. Attack is instant and release is eased, which is how every hardware meter behaves — one that lags on the way up reads as "not recording".

!!! info "Close the `AudioContext`"
    The meter creates an `AudioContext` and `stop()` closes it. Browsers cap live contexts (Chrome allows around six), so a meter left running on unmount breaks every later one on the page. The hooks and the components close it for you; with a raw `createLevelMeter`, `stop()` is yours.

## Format: what you can and cannot have

!!! danger "`MediaRecorder` produces neither MP3 nor WAV — in any browser"
    Chromium and Firefox produce **Opus** (in WebM or Ogg); Safari produces **AAC** (in MP4). No engine implements an MP3 or WAV encoder for it. The SDK default negotiates in that order and reports what actually came out — `AudioRecording.mimeType` is what the browser said, not what you asked for.

If the backend only takes **WAV**, `blobToWav` converts client-side with **zero dependency**: it decodes with the browser's own decoder (`decodeAudioData`) and re-encodes RIFF/PCM 16-bit.

```tsx
import { blobToWav } from "tempest-react-sdk";

const wav = await blobToWav(recording.blob, { mono: true, sampleRate: 16000 });
```

!!! warning "WAV costs about 10× the bytes"
    The same voice note that is 40 KB in Opus lands around 500 KB as WAV at 48 kHz stereo. `{ mono: true, sampleRate: 16000 }` takes that to roughly 80 KB — and 16 kHz mono is what a speech-to-text endpoint wants anyway. The resampler is `OfflineAudioContext`, i.e. the browser's own, not a hand-rolled one.

If the backend only takes **MP3**: transcode on the server. An MP3 encoder in the client means a WASM build of the order of 150 KB in **every** SDK consumer's bundle to serve one format — the trade this SDK does not make.

## Long uploads: chunks

```tsx
const rec = useAudioRecorder(mic.stream, {
  timesliceMs: 5_000,
  onChunk: (chunk) => void upload(chunk),
});
```

Without `timesliceMs` the whole recording sits in memory until `stop()` — fine for a voice note, not fine for an hour-long meeting. **Chunks are not independently playable**: only the set forms a valid file.

## Recap

- `playAudio(src, options)` — one-off sound on the shared player; returns `null` if autoplay was blocked. `stopAudio()` stops that player.
- `useAudio()` — private per-component player with `play`/`stop`/`unlocked` and unmount cleanup.
- `createAudioPlayer()` — isolated channel to play simultaneous sounds without one cutting off the other.
- The autoplay policy is handled by returning `null`; unlock audio on the first interaction.
- The SDK ships no audio files — you serve them and pass the URL.
- `AudioRecorder` — a complete voice note: permission, level, clock, review, retake.
- `AudioPlayer` — a transport for one clip; takes a `Blob` and **needs** `durationMs` for a fresh recording.
- `useMediaPermission` — permission state **without** firing the prompt; separates "never asked" from "denied" (which is sticky).
- `useMediaDevices` — mics and outputs, reacts to `devicechange`; `labelsAvailable` says when a picker is worth showing.
- `useMicrophone` — stream plus classified error; `stop()` **must** be called or the recording indicator never clears.
- `useAudioRecorder` — status, a clock that subtracts pauses, level, `maxDurationMs`, chunks.
- `blobToWav` — WAV with no dependency, about 10× the bytes; MP3 stays on the server.
- `setAudioOutput` / `isAudioOutputSelectionSupported` — output routing, Chromium only.

## See also

- [SSE](./sse.md) / [Push](./push.md) — typical audio triggers
