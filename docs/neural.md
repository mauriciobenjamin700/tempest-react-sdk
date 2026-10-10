# Supressão neural de ruído (RNNoise)

O subpath `tempest-react-sdk/neural` liga um modelo de rede neural recorrente — o RNNoise — sobre um microfone aberto pelo navegador e devolve um `MediaStreamTrack` sem ruído, pronto para publicar. É a resposta *neural* para o mesmo problema que a constraint `noiseSuppression` do `getUserMedia` ataca com um gate de ruído estacionário: separar a sua voz de teclado, ventoinha, trânsito e de uma sala cheia de gente — sem deixar o transiente passar e sem comer a voz com ele.

O modelo roda num `AudioWorklet`, em um contexto do AudioContext de **48 kHz** (a taxa que ele assume). Você é quem serve os três assets — o módulo do worklet e os dois `.wasm` — porque a biblioteca não tem como saber onde o seu bundler publica os arquivos que ela não descobriu sozinha.

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

## Por que um subpath à parte

O RNNoise não cabe no barrel do `@tempest` síncrono — nem no `audio`. Dois motivos:

- **O worklet é um arquivo que você tem que servir.** `context.audioWorklet.addModule` recebe uma URL, não um bundle; o consumidor precisa hospedar `rnnoiseWorklet.js` e os `.wasm` do modelo. Um módulo que depende de três URLs que ele não controla não pode ser chamado por uma função síncrona como `createVoiceChain`.
- **O load é assíncrono.** O modelo compila em wasm; quem abre o microfone precisa decidir *antes* qual caminho vai usar (o fallback é uma constraint do `getUserMedia`, e constraint não se adiciona a uma captura já aberta).

Por isso o subpath existe: a superfície honesta é um `Promise<NeuralSuppressor | null>`, e o pacote que entrega os assets é um peer opcional instalado por quem usa o subpath.

!!! info "Peer opcional"
    `@sapphi-red/web-noise-suppressor` é dependência opcional: `npm install @sapphi-red/web-noise-suppressor` só é necessário quando o seu app importa `tempest-react-sdk/neural`.

## O pacote e os três assets

O peer publica, além do código, os arquivos que o worklet precisa:

| Asset | Import no Vite | Para que serve |
| --- | --- | --- |
| Módulo do worklet | `@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url` | O DSP que `addModule` registra no contexto |
| Modelo SIMD | `@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url` | Onde o engine tem SIMD |
| Modelo base | `@sapphi-red/web-noise-suppressor/rnnoise.wasm?url` | Fallback para engine sem SIMD |

O sufixo `?url` é um recurso de bundler: ele resolve o módulo para a URL servida. É isso que transforma `import` de asset num `string` que o `addModule` e o `loadRnnoise` sabem usar.

!!! tip "Offline"
    Os `.wasm` são navegados uma vez e compilados. Para o app funcionar offline, precache os três assets junto com o app-shell (o `tempestPwaManifest` do subpath `tempest-react-sdk/vite` aceita os mesmos `?url`).

## Preparando antes de abrir o microfone

`prepareNeuralSuppressor(context, assets)` registra o módulo do worklet no contexto e compila o modelo — exatamente uma vez para cada um, por mais vezes que você chame. Ele dispara exceção em falha, porque existe para ser chamado *antes* da captura, enquanto ainda dá para escolher outro fallback:

```ts
import { isNeuralSuppressionSupported, prepareNeuralSuppressor } from "tempest-react-sdk/neural";

const context = new AudioContext({ sampleRate: 48_000 });
const neuralAvailable = isNeuralSuppressionSupported()
  && (await prepareNeuralSuppressor(context, assets).then(() => true, () => false));

const stream = await navigator.mediaDevices.getUserMedia({
  audio: { noiseSuppression: !neuralAvailable, echoCancellation: true },
});
```

Com o lado neural pronto, você pede `noiseSuppression: false` ao `getUserMedia`. Os dois filtros respondem a mesma pergunta; rodar os dois faz a voz chegar duas vezes filtrada, e é disso que vem o timbre robótico de supressão empilhada.

## Montando o grafo

`createNeuralSuppressor(context, source, assets, { maxChannels })` monta `fonte → worklet → MediaStreamDestination` dentro do seu contexto e devolve:

- `track` — o track de saída, que você publica no lugar do capturado;
- `release()` — fecha o grafo e para o track; **não** para a fonte, que é do chamador.

`maxChannels` é o número de canais da captura: o modelo é mono, e pedir o canal certo evita que o segundo canal de uma captura estéreo seja descartado.

## Quando devolve `null`

Silêncio não é erro. `createNeuralSuppressor` devolve `null` quando:

- o contexto não roda a **48 kHz** — alimentar um modelo treinado em 48 kHz com amostras de outra taxa produz borrão, não voz (e nada é buscado antes dessa checagem);
- o `.wasm` não carregou ou o nó do worklet não pôde ser construído.

Nesses casos o chamador já se comprometeu com o caminho neural, então o desfecho honesto é uma chamada sem supressão — não um microfone que não abre. `prepareNeuralSuppressor`, que existe para rodar antes da captura, ainda lança exceção, porque ali o fallback ainda está ao alcance.

## API

| Símbolo | O que é |
| --- | --- |
| `isNeuralSuppressionSupported()` | `true` quando o navegador tem `AudioWorkletNode` e contexto seguro |
| `prepareNeuralSuppressor(context, assets)` | Registra o módulo do worklet e compila o modelo; idempotente, lança exceção em falha |
| `createNeuralSuppressor(context, source, assets, { maxChannels })` | Monta o grafo e devolve `NeuralSuppressor` — ou `null` quando o contexto não roda a 48 kHz ou o grafo falhou |
| `NeuralSuppressor` | `{ track, release() }` — o track denoised e o teardown do grafo |
| `NeuralSuppressorAssets` | `{ workletUrl, simdWasmUrl, wasmUrl }` — as URLs resolvidas dos três assets |

## Recapitulando

- O peer instala sob demanda: `@sapphi-red/web-noise-suppressor` só entra no seu bundle se você importar o subpath.
- Os assets são `?url`: você os serve; a lib cuida do grafo, do load-once e do registro por contexto.
- O contexto precisa de 48 kHz; qualquer outra taxa devolve `null` sem nem buscar o modelo.
- Sem empilhar filtros: com o lado neural ligado, peça `noiseSuppression: false` ao `getUserMedia`.
- Prepare o modelo antes de abrir o microfone, senão você não tem para onde cair quando ele falhar.