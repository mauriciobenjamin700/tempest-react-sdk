# Áudio

Notificações sonoras (chime de mensagem, confirmação de pagamento, etc.) sobre o `Audio` nativo do navegador. Três entradas: `playAudio` (one-off no player compartilhado), `useAudio` (player privado por componente) e `createAudioPlayer` (canal isolado imperativo).

!!! info "Por que um wrapper em volta de `new Audio()`?"
Tocar som no navegador esbarra na _autoplay policy_ e em vazamento de elementos `Audio`. O SDK encapsula: rastreia o clipe atual (pra dar `stop`), normaliza volume, trata o bloqueio de autoplay devolvendo `null` em vez de estourar, e limpa no unmount quando você usa o hook.

## `playAudio` — one-off no player compartilhado

Ideal pra um som disparado por um evento, sem estado de UI:

```tsx
import { playAudio, useEventStream } from "tempest-react-sdk";

interface StreamEvent {
  type: "NOTIFY" | "PAYMENT-SUCCESS";
}

export function PaymentSounds() {
  useEventStream<StreamEvent>(`${import.meta.env.VITE_API_URL}/notifications`, {
    onMessage: ({ data }) => {
      if (data.type === "PAYMENT-SUCCESS") {
        void playAudio("/audio/dinheiro.mp3", { volume: 0.5 });
      }
    },
  });

  return null;
}
```

`playAudio(src, options)` retorna `Promise<HTMLAudioElement | null>` — `null` quando o navegador bloqueou o autoplay. Opções: `volume` (0–1, default 1), `loop`, `autoplay`, `stopPrevious`, `onEnded`, `onError`. Pra parar o que o player compartilhado está tocando, use `stopAudio()`.

## `useAudio` — player privado por componente

Cada instância do hook tem seu próprio player, então desmontar para o áudio automaticamente:

```tsx
import { useAudio } from "tempest-react-sdk";

export function NotificationBell() {
  const audio = useAudio();

  return (
    <button onClick={() => audio.play("/audio/plim.wav", { volume: 0.8 })}>
      🔔 {audio.unlocked ? "" : "(toque pra ativar som)"}
    </button>
  );
}
```

- `audio.play(src, options)` — toca no player privado (mesmas options do `playAudio`).
- `audio.stop()` — para o clipe atual.
- `audio.unlocked` — vira `true` após o primeiro `play()` bem-sucedido. Útil pra esconder UI que pede a interação inicial.
- Cleanup automático no unmount.

!!! tip "Use `unlocked` pra guiar o usuário"
Antes do primeiro clique, o navegador bloqueia áudio. Mostre uma dica ("toque pra ativar som") enquanto `unlocked === false` e esconda assim que ele virar `true`.

## `createAudioPlayer` — canais isolados

`createAudioPlayer()` cria um tracker independente do default. Use quando precisar tocar dois sons simultaneamente sem que um corte o outro (ex.: música de fundo + efeito sonoro):

```ts
import { createAudioPlayer } from "tempest-react-sdk";

const music = createAudioPlayer();
const sfx = createAudioPlayer();

await music.play("/audio/loop.mp3", { loop: true, volume: 0.3 });
await sfx.play("/audio/coin.wav", { volume: 1 }); // não corta a música

music.stop(); // para só a música
console.log(sfx.current()); // HTMLAudioElement | null
```

Cada player rastreia **um** clipe atual. `stopPrevious: true` no `play()` para o clipe anterior daquele mesmo player antes de tocar o novo.

## Autoplay policy

Navegadores bloqueiam playback antes da primeira interação do usuário. `playAudio` / `play()` retornam `null` quando bloqueado (e chamam `onError` se passado) — em vez de lançar.

!!! warning "Destrave o áudio no primeiro clique"
Não dá pra tocar som antes de qualquer interação. Desenhe o app pra disparar um `play()` (mesmo de um clipe silencioso curto) no primeiro clique de qualquer botão; a partir daí o navegador libera os próximos.

## Assets

O SDK **não** embute áudios. Sirva em `/audio/*` (ou CDN) e passe a URL. Inspiração de paleta sonora (alofans):

```ts
export const AUDIOS = {
  plim: "/audio/plim.wav",
  dinheiro: "/audio/dinheiro.mp3",
  notification: "/audio/bell_sound.wav",
};
```

## Recap

- `playAudio(src, options)` — som one-off no player compartilhado; retorna `null` se o autoplay foi bloqueado. `stopAudio()` para esse player.
- `useAudio()` — player privado por componente com `play`/`stop`/`unlocked` e cleanup no unmount.
- `createAudioPlayer()` — canal isolado pra tocar sons simultâneos sem um cortar o outro.
- A autoplay policy é tratada devolvendo `null`; destrave o áudio na primeira interação.
- O SDK não traz arquivos de áudio — você serve e passa a URL.

## Veja também

- [SSE](./sse.md) / [Push](./push.md) — gatilhos típicos de áudio
