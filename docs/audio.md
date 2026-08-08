# Áudio

Áudio no navegador, nas duas direções.

**Reprodução** — notificação sonora (chime de mensagem, confirmação de pagamento) com `playAudio`, `useAudio` e `createAudioPlayer`, e o componente `AudioPlayer` quando você precisa de transporte (play/pause, barra, tempos).

**Captura** — `AudioRecorder` pra uma nota de voz em uma linha, e por baixo `useMediaPermission`, `useMediaDevices`, `useMicrophone`, `useAudioRecorder`, `createLevelMeter` e `blobToWav`. Nenhuma dependência nova: a fatia inteira mede **5,50 KB brotli**.

!!! tip "Se você só quer gravar uma nota de voz, pule para [Gravação](#gravacao-comece-pelo-componente)"
    O resto da página é a camada de baixo, pra quando o componente não serve.

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

## Gravação: comece pelo componente

Se você só quer uma nota de voz, é uma linha. O `AudioRecorder` cuida da permissão, do medidor de nível, do relógio e da revisão antes de você receber o áudio:

```tsx
import { AudioRecorder } from "tempest-react-sdk";

export function NotaDeVoz({ ticketId }: { ticketId: string }) {
  return (
    <AudioRecorder
      maxDurationMs={120_000}
      onRecorded={({ blob, mimeType, durationMs }) => {
        const form = new FormData();
        form.append("audio", blob, `nota.${mimeType.includes("mp4") ? "m4a" : "webm"}`);
        form.append("duracao", String(durationMs));
        void fetch(`/api/tickets/${ticketId}/audio`, { method: "POST", body: form });
      }}
      footer={<small>Máximo 2 minutos.</small>}
    />
  );
}
```

O que você ganha sem escrever nada:

| Você fez | O componente faz |
| --- | --- |
| nada | **Não** pede o microfone no mount — só no primeiro toque em Gravar |
| nada | Se a permissão já está `denied`, diz isso e como resolver, em vez de oferecer um botão que não funciona |
| nada | Medidor de nível ao vivo, relógio que **desconta pausa**, pausar/continuar |
| `maxDurationMs` | Para sozinho no limite, e mostra o limite ao lado do relógio |
| nada | Player de revisão com transporte, e "Gravar de novo" reaproveitando o mesmo stream |
| `format="wav"` | Converte antes de te entregar, então o `onRecorded` **sempre** dá o formato que você pediu |

!!! danger "O prompt de permissão não é disparado no mount, e isso é a decisão mais importante da página"
    Um prompt que o usuário não provocou é a forma mais confiável de ganhar um **Block permanente** — e depois disso o `getUserMedia` rejeita **sem nunca mais perguntar**. Por isso o microfone abre no primeiro toque em Gravar, e o toque sobrevive ao round-trip: o componente arma a gravação e começa quando o stream chega. Esperar um segundo clique faria o primeiro parecer quebrado.

### Props

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `onRecorded` | `(recording: AudioRecording) => void` | — | Recebe o áudio pronto. Não dispara em cancelamento. |
| `maxDurationMs` | `number` | — | Para sozinho. **Vale sempre setar** em tela pública. |
| `deviceId` | `string` | — | Microfone específico, de `useMediaDevices().audioInputs`. |
| `format` | `"native" \| "wav"` | `"native"` | `"wav"` converte no stop. Veja o custo abaixo. |
| `wavOptions` | `WavOptions` | — | `{ mono: true, sampleRate: 16000 }` serve pra fala. |
| `audioBitsPerSecond` | `number` | — | 32000–64000 basta pra voz em Opus. |
| `review` | `boolean` | `true` | Player de revisão antes de entregar. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Rótulos. |
| `footer` | `ReactNode` | — | Dica, contagem, aviso legal. |
| `onError` | `(error: unknown) => void` | — | Falha do gravador, ou conversão WAV que não deu. |

`AudioRecording = { blob, mimeType, durationMs }`.

## `AudioPlayer` — transporte pra um clipe

Aceita `Blob` direto, porque o que um app mais toca é a gravação que ele acabou de fazer:

```tsx
<AudioPlayer src={recording.blob} durationMs={recording.durationMs} />
<AudioPlayer src="/audio/briefing.mp3" sinkId={saidaEscolhida} />
```

!!! warning "Passe `durationMs` sempre que tiver — o `<audio>` mente sobre gravação nova"
    O `MediaRecorder` escreve WebM **sem duração no header**, então `<audio>.duration` de uma gravação fresca é `Infinity`. É por isso que o gravador mantém o próprio relógio e você deve repassá-lo. Sem ele o componente aplica o único contorno que existe — buscar além do fim pra forçar o browser a demuxar até o último frame — e a barra fica travada até isso resolver.

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `src` | `string \| Blob \| null` | — | URL ou blob. Blob vira object URL com revoke automático. |
| `durationMs` | `number` | — | Duração conhecida. Ganha do `<audio>`. |
| `sinkId` | `string` | — | Saída escolhida. Só Chromium. |
| `autoPlay` · `loop` | `boolean` | `false` | Como no elemento nativo. |
| `actions` | `ReactNode` | — | À direita dos tempos — baixar, apagar. |
| `onEnded` · `onError` | `() => void` | — | Fim e falha de decode/rede. |

## Permissão sem disparar o prompt

`useMediaPermission` lê o estado **sem** pedir o dispositivo. É o que torna um fluxo decente possível:

```tsx
import { useMediaPermission } from "tempest-react-sdk";

export function BotaoDeGravar({ onStart }: { onStart: () => void }) {
  const { state, supported } = useMediaPermission("microphone");

  if (state === "denied") {
    return <p>Microfone bloqueado. Libere nas configurações do site e recarregue.</p>;
  }
  return (
    <button onClick={onStart}>
      {state === "prompt" || !supported ? "Permitir microfone e gravar" : "Gravar"}
    </button>
  );
}
```

| Estado | Significa | O que a UI deve fazer |
| --- | --- | --- |
| `"prompt"` | nunca pediu | botão; pedir mostra o prompt |
| `"granted"` | liberado | botão normal |
| `"denied"` | **sticky** — pedir de novo rejeita na hora, sem prompt | instrução pras configurações do site, não botão |
| `"unknown"` | Permissions API não respondeu (Safari não expõe `microphone`) | trate como "vai ter que pedir pra descobrir" |

O estado é **ao vivo**: se o usuário mudar a permissão nas configurações do site, o hook atualiza.

## Dispositivos: microfone e saída

```tsx
import { useMediaDevices, isAudioOutputSelectionSupported } from "tempest-react-sdk";

const { audioInputs, audioOutputs, labelsAvailable } = useMediaDevices();
```

!!! warning "Os nomes só aparecem depois da permissão"
    Antes de o usuário liberar uma captura, **todo** `label` é `""` — os ids e a contagem são reais, os nomes não. Um seletor renderizado ali é uma coluna de vazios. Use `labelsAvailable` pra decidir quando mostrar. Peça o microfone primeiro, depois ofereça a escolha.

!!! info "A lista muda com a página aberta"
    Plugar um fone no meio da gravação é o caso normal, não borda. O hook assina `devicechange` em vez de enumerar uma vez no mount.

`audioOutputs` vem **vazio** onde o browser não tem roteamento de saída — Safari e Firefox não implementam `setSinkId`. Vazio ali significa "você não pode oferecer essa escolha", não "não há alto-falantes". Cheque com `isAudioOutputSelectionSupported()` antes de renderizar o seletor, ou o controle é uma mentira em dois dos três motores.

```tsx
import { setAudioOutput } from "tempest-react-sdk";

const ok = await setAudioOutput(audioRef.current, dispositivoEscolhido);
if (!ok) toast("Este navegador não permite escolher a saída de som.");
```

`playAudio` também aceita `sinkId`, útil pra um chime cair no fone enquanto o áudio da chamada fica no alto-falante.

## Montando você mesmo: os hooks

```tsx
import { useMicrophone, useAudioRecorder } from "tempest-react-sdk";

export function GravadorProprio() {
  const mic = useMicrophone({ deviceId: undefined, noiseSuppression: true });
  const rec = useAudioRecorder(mic.stream, { maxDurationMs: 60_000 });

  return (
    <>
      <button onClick={mic.start} disabled={mic.status === "ready"}>
        Liberar microfone
      </button>
      <button onClick={rec.start} disabled={!rec.ready}>
        Gravar
      </button>
      <button onClick={() => void rec.stop()}>Parar</button>
      <meter min={0} max={1} value={rec.level} />
      <span>{rec.durationMs} ms</span>
      {mic.error && <p role="alert">{mic.error.message}</p>}
    </>
  );
}
```

!!! danger "`stop()` no microfone não é opcional"
    Soltar a última referência de um `MediaStream` **não** desliga o microfone. Cada track tem que ser parada à mão — senão o browser continua mostrando o indicador de gravação, o SO mantém o dispositivo ocupado, e o **próximo** `getUserMedia` (em outra aba do mesmo app, tipicamente) falha com `NotReadableError`. O `useMicrophone` para as tracks no `stop()`, no unmount e antes de reabrir.

!!! info "O gravador **não** é dono do stream"
    `rec.stop()` deixa o microfone aberto de propósito, pra uma segunda gravação não precisar de outro round-trip de permissão. Fechar é do `mic.stop()`.

### Erros classificados

`useMicrophone().error` já vem traduzido de `DOMException` para algo em que dá pra ramificar:

| `kind` | Causa | Ação |
| --- | --- | --- |
| `insecure` | página em HTTP puro | a correção é uma **URL**, não uma configuração |
| `unsupported` | motor sem captura | outro navegador |
| `permission-denied` | negado | configurações do site |
| `not-found` | nenhum dispositivo, ou nenhum que casa com as constraints | relaxar `deviceId` |
| `in-use` | hardware ocupado | fechar o outro app/aba |
| `unknown` | o resto | mostra a mensagem original |

A ordem importa: um `mediaDevices` ausente é quase nunca "este navegador não faz áudio" — é uma página em HTTP, onde a API inteira simplesmente não existe. Reportar `unsupported` ali manda o dev procurar polyfill pra um problema que um `https://` resolve.

## Nível de gravação

`useAudioRecorder` já publica `level` (0–1) a 10 Hz. Pra uma barra por frame, use o `createLevelMeter` direto e escreva no DOM:

```tsx
const meter = createLevelMeter(stream);
const tick = () => {
  barra.style.transform = `scaleX(${meter.level()})`;
  raf = requestAnimationFrame(tick);
};
// ...e sempre meter.stop() no cleanup
```

!!! warning "Medidor não é enfeite"
    Uma entrada mutada no SO, ou um headset com o braço do mic dobrado pra cima, produz uma gravação **perfeitamente bem-sucedida de silêncio** — e sem nível visível o usuário só descobre depois de terminar de falar.

O valor é RMS, não pico: pico reage a uma amostra só e pisca, RMS acompanha volume percebido. O ataque é instantâneo e a queda é suavizada, que é como todo medidor de hardware se comporta — um que atrasa na subida parece "não está gravando".

!!! info "Feche o `AudioContext`"
    O medidor cria um `AudioContext` e o `stop()` fecha. Navegadores limitam contextos vivos (Chrome permite ~6), então um medidor esquecido em unmount quebra todos os próximos da página. Os hooks e os componentes já fecham; se você usar o `createLevelMeter` cru, o `stop()` é seu.

## Formato: o que dá e o que não dá

!!! danger "`MediaRecorder` não produz MP3 nem WAV — em nenhum navegador"
    Chromium e Firefox produzem **Opus** (em WebM ou Ogg); Safari produz **AAC** (em MP4). Nenhum motor implementa encoder MP3 ou WAV pra ele. O padrão do SDK negocia nessa ordem e devolve o que saiu de fato — `AudioRecording.mimeType` é o que o browser reportou, não o que você pediu.

Se o backend só aceita **WAV**, o `blobToWav` converte no cliente, com **zero dependência**: decodifica com o decoder do próprio browser (`decodeAudioData`) e reencoda RIFF/PCM 16-bit.

```tsx
import { blobToWav } from "tempest-react-sdk";

const wav = await blobToWav(recording.blob, { mono: true, sampleRate: 16000 });
```

!!! warning "WAV custa ~10× mais bytes"
    A mesma nota de voz que tem 40 KB em Opus fica em torno de 500 KB em WAV a 48 kHz estéreo. `{ mono: true, sampleRate: 16000 }` leva isso pra ~80 KB — e 16 kHz mono é o que um endpoint de speech-to-text quer de todo jeito. O reamostrador é o `OfflineAudioContext`, ou seja o do próprio browser, não um escrito à mão.

Se o backend só aceita **MP3**: transcodifique no servidor. Um encoder MP3 no cliente significa um build WASM da ordem de 150 KB no bundle de **todo** consumidor do SDK pra servir um formato — é a troca que este SDK não faz.

## Fora do React: os primitivos

`useAudioRecorder` é uma casca fina em cima de um gravador que não sabe nada de
React. Quando a gravação acontece longe de um componente — num store, num
worker, numa máquina de estados — use o primitivo direto:

```ts
import { createAudioRecorder, isAudioRecordingSupported } from "tempest-react-sdk";

if (!isAudioRecordingSupported()) throw new Error("Este navegador não grava áudio");

const rec = createAudioRecorder(stream, { audioBitsPerSecond: 48_000 });
rec.start();
// ...
const recording = await rec.stop(); // { blob, mimeType, durationMs }
```

O handle expõe `start`, `pause`, `resume`, `stop`, `cancel`, mais os leitores
`status()` e `durationMs()` (que descontam o tempo pausado) e o `mimeType`
negociado.

| Símbolo                              | O que é                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `createAudioRecorder(stream, opts)`  | O gravador por trás do hook. Não é dono do stream — pare o mic você mesmo. |
| `isAudioRecordingSupported()`        | `MediaRecorder` existe **e** algum container é produzível.                 |
| `pickAudioMimeType(preferred?)`      | Primeiro container da lista que o browser realmente produz, ou `null`.     |
| `AUDIO_MIME_CANDIDATES`              | A ordem que o SDK negocia: Opus (WebM/Ogg) → AAC (MP4).                    |
| `encodeWav({ channels, sampleRate })`| RIFF/PCM 16-bit a partir de canais Float32 — o motor do `blobToWav`.       |

!!! tip "`isAudioRecordingSupported()` responde a pergunta certa"
    Checar só `typeof MediaRecorder !== "undefined"` deixa passar o motor que
    tem a API e não produz nenhum dos containers — a falha aparece no
    `start()`, com o usuário já esperando. Esta função checa as duas coisas.

## Upload longo: chunks

```tsx
const rec = useAudioRecorder(mic.stream, {
  timesliceMs: 5_000,
  onChunk: (chunk) => void upload(chunk),
});
```

Sem `timesliceMs` a gravação inteira fica em memória até o `stop()` — ok pra nota de voz, não ok pra uma reunião de uma hora. **Os chunks não são tocáveis isoladamente**: só o conjunto forma um arquivo válido.

## Recap

- `playAudio(src, options)` — som one-off no player compartilhado; retorna `null` se o autoplay foi bloqueado. `stopAudio()` para esse player.
- `useAudio()` — player privado por componente com `play`/`stop`/`unlocked` e cleanup no unmount.
- `createAudioPlayer()` — canal isolado pra tocar sons simultâneos sem um cortar o outro.
- A autoplay policy é tratada devolvendo `null`; destrave o áudio na primeira interação.
- O SDK não traz arquivos de áudio — você serve e passa a URL.
- `AudioRecorder` — nota de voz completa: permissão, nível, relógio, revisão, retake.
- `AudioPlayer` — transporte pra um clipe; aceita `Blob` e **precisa** de `durationMs` pra gravação nova.
- `useMediaPermission` — estado da permissão **sem** disparar o prompt; separa "nunca pedi" de "negado" (que é sticky).
- `useMediaDevices` — mics e saídas, reage a `devicechange`; `labelsAvailable` diz quando o seletor vale a pena.
- `useMicrophone` — stream + erro classificado; `stop()` **precisa** ser chamado ou o indicador de gravação não apaga.
- `useAudioRecorder` — status, relógio que desconta pausa, nível, `maxDurationMs`, chunks.
- `blobToWav` — WAV sem dependência, ~10× os bytes; MP3 fica no servidor.
- `setAudioOutput` / `isAudioOutputSelectionSupported` — roteamento de saída, só Chromium.

## Veja também

- [SSE](./sse.md) / [Push](./push.md) — gatilhos típicos de áudio
