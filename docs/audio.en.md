# Audio

Sound notifications (message chime, payment confirmation, etc.). Uses the native
`Audio`.

## Common use case

```tsx
import { playAudio, useEventStream } from "tempest-react-sdk";

useEventStream<StreamEvent>(`${API}/notifications`, {
  onMessage: ({ data }) => {
    if (data.type === "PAYMENT-SUCCESS") {
      void playAudio("/audio/money.mp3", { volume: 0.5 });
    }
  },
});
```

## Hook

```tsx
import { useAudio } from "tempest-react-sdk";

const audio = useAudio();
<button onClick={() => audio.play("/audio/plim.wav")}>🔔</button>;
```

Automatic cleanup on unmount. `audio.unlocked` becomes `true` after the first
successful `play()` — useful to hide UI that asks for an initial interaction.

## Isolated channels

`createAudioPlayer()` creates a tracker independent from the default. Use it when
you need to play two sounds simultaneously without one cutting off the other.

## Autoplay policy

Browsers block playback before the user's first interaction. `playAudio` returns
`null` when blocked — design the app to "unlock" audio on the first click of any
button.

## Assets

The SDK does not bundle audio files. Serve them at `/audio/*` (or a CDN) and pass
the URL. Sound-palette inspiration (alofans):

```ts
export const AUDIOS = {
  plim: "/audio/plim.wav",
  money: "/audio/money.mp3",
  notification: "/audio/bell_sound.wav",
};
```

## See also

- [SSE](./sse.md) / [Push](./push.md) — typical audio triggers
