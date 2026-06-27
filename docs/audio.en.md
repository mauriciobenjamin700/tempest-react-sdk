# Audio

Sound notifications (message chime, payment confirmation, etc.) on top of the browser's native `Audio`. Three entry points: `playAudio` (one-off on the shared player), `useAudio` (private per-component player), and `createAudioPlayer` (isolated imperative channel).

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

## Recap

- `playAudio(src, options)` — one-off sound on the shared player; returns `null` if autoplay was blocked. `stopAudio()` stops that player.
- `useAudio()` — private per-component player with `play`/`stop`/`unlocked` and unmount cleanup.
- `createAudioPlayer()` — isolated channel to play simultaneous sounds without one cutting off the other.
- The autoplay policy is handled by returning `null`; unlock audio on the first interaction.
- The SDK ships no audio files — you serve them and pass the URL.

## See also

- [SSE](./sse.md) / [Push](./push.md) — typical audio triggers
