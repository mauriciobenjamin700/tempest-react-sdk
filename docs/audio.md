# Áudio

Notificações sonoras (chime de mensagem, confirmação de pagamento, etc.). Usa `Audio` nativo.

## Caso de uso comum

```tsx
import { playAudio, useEventStream } from "tempest-react-sdk";

useEventStream<StreamEvent>(`${API}/notifications`, {
  onMessage: ({ data }) => {
    if (data.type === "PAYMENT-SUCCESS") {
      void playAudio("/audio/dinheiro.mp3", { volume: 0.5 });
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

Cleanup automático no unmount. `audio.unlocked` vira `true` após o primeiro `play()` bem-sucedido — útil pra esconder UI que pede interação inicial.

## Canais isolados

`createAudioPlayer()` cria um tracker independente do default. Use quando precisar tocar dois sons simultaneamente sem que um corte o outro.

## Autoplay policy

Navegadores bloqueiam playback antes da primeira interação do usuário. `playAudio` retorna `null` quando bloqueado — design o app pra "destravar" o áudio no primeiro clique de qualquer botão.

## Assets

O SDK não embute áudios. Sirva em `/audio/*` (ou CDN) e passe a URL. Inspiração de paleta sonora (alofans):

```ts
export const AUDIOS = {
  plim: "/audio/plim.wav",
  dinheiro: "/audio/dinheiro.mp3",
  notification: "/audio/bell_sound.wav",
};
```

## Veja também

- [SSE](./sse.md) / [Push](./push.md) — gatilhos típicos de áudio
