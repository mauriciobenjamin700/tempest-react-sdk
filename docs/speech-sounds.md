---
description: "Classificação de sons no navegador com o YAMNet (sirene, buzina, música, fala), ao vivo com createSoundMonitor, e qualquer modelo ONNX de áudio seu com loadAudioModel."
---

# Sons do ambiente e modelo próprio

Para saber **o que** se ouve (sirene, buzina, choro, música, aplausos, fala), o `/speech` classifica com o **YAMNet**: 521 classes do AudioSet, ~16 MB, Apache-2.0. A exportação ONNX recebe a onda crua a 16 kHz e calcula o próprio log-mel por dentro, então a página não calcula features. Ele roda no mesmo runtime do Whisper; veja [como servir o runtime](speech.md#2-sirva-o-runtime).

```bash
M=public/models/yamnet && mkdir -p $M
for f in yamnet.onnx yamnet_class_map.csv; do
  curl -sfL -o $M/$f "https://huggingface.co/rostrumstudios/yamnet/resolve/main/$f"
done
```

## Classificar uma gravação: `loadSoundClassifier`

```typescript
import { loadSoundClassifier } from "tempest-react-sdk/speech";

export async function oQueSeOuve(gravacao: Blob): Promise<string> {
    const classificador = await loadSoundClassifier({
        modelUrl: "/models/yamnet/yamnet.onnx",
        labelsUrl: "/models/yamnet/yamnet_class_map.csv",
    });
    const { top } = await classificador.classify(gravacao);
    return top.map((s) => `${s.label} ${s.score.toFixed(2)}`).join(", ");
}
```

- `classify` aceita `Blob`, `MonoPcm` ou `Float32Array` mono a 16 kHz.
- O resultado traz `frames` (o score de cada classe em cada janela de 0,48 s, com `startMs`) e `top` (as `topK` classes com maior média; default 5).
- Os nomes são os do AudioSet, em inglês: `"Siren"`, `"Vehicle horn, car horn, honking"`, `"Speech"`. A lista inteira fica em `classificador.labels`.
- Conferido nessa exportação (Node 24, WASM): tom de 1 kHz → "Beep, bleep" 0,92; uma frase do FLEURS em português → "Speech" 0,73; silêncio → "Silence" 1,00. 14 s custaram 146 ms.
- `classificador.release()` libera o modelo.

## Ao vivo: `createSoundMonitor`

Vigiar o microfone e avisar quando uma sirene começa:

```typescript
import pcmWorkletUrl from "tempest-react-sdk/pcm-worklet.js?url";
import { createSoundMonitor, loadSoundClassifier, type SoundMonitor } from "tempest-react-sdk/speech";

export async function vigiarSirene(mic: MediaStream, aoOuvir: () => void): Promise<SoundMonitor> {
    const classificador = await loadSoundClassifier({
        modelUrl: "/models/yamnet/yamnet.onnx",
        labelsUrl: "/models/yamnet/yamnet_class_map.csv",
    });
    let tocando = false;
    return createSoundMonitor(
        mic,
        (ativos) => {
            const agora = ativos.includes("Siren");
            if (agora && !tocando) aoOuvir();
            tocando = agora;
        },
        {
            classifier: classificador,
            classes: ["Siren", "Vehicle horn, car horn, honking"],
            stream: { workletUrl: pcmWorkletUrl },
        },
    );
}
```

- O `onChange` recebe a **lista de classes ativas** sempre que ela muda, não a cada janela. Uma lista vazia quer dizer que nenhuma das classes vigiadas está tocando.
- Cada janela de ~1 s é classificada a cada 0,5 s. O score é a média das últimas `smoothing` janelas. A classe liga em `threshold` e só desliga abaixo de `releaseThreshold`. Assim, um som não pisca a cada janela.
- O monitor devolvido tem `active` (a lista de agora) e `stop()`, que libera o grafo de áudio. O microfone e o classificador continuam seus.
- `stream: { workletUrl }` faz o monitor funcionar sob o [CSP do `tempestCsp()`](csp.md), como no [`createPcmStream`](audio.md#do-microfone-createpcmstream).
- Uma classe que não existe no CSV lança `Unknown class "…"` na hora, em vez de nunca disparar.

| Opção | Default | O que faz |
| --- | --- | --- |
| `classifier` | — | O classificador, de `loadSoundClassifier`. |
| `classes` | todas | As classes vigiadas, pelo nome exato do CSV. |
| `threshold` | `0,3` | Score médio a partir do qual a classe liga. |
| `releaseThreshold` | `threshold × 0,6` | Score médio abaixo do qual a classe desliga. |
| `smoothing` | `3` | Quantas janelas entram na média (~1,5 s). |
| `windowSamples` | `15 600` | Tamanho da janela, em amostras a 16 kHz. |
| `hopSamples` | `8 000` | Distância entre janelas (0,5 s). |
| `stream` | — | `{ workletUrl, context }`, repassado ao `createPcmStream`. |

## Seu próprio modelo: `loadAudioModel`

O que todo modelo de áudio repete fica com o SDK: decodificar, converter para mono, reamostrar com o filtro do SDK e, se for o caso, calcular o [log-mel](audio.md#espectrograma-log-mel-logmelspectrogram) **com a config do treino**. As saídas voltam como o modelo devolve:

```typescript
import { WHISPER_LOG_MEL_80 } from "tempest-react-sdk";
import { loadAudioModel } from "tempest-react-sdk/speech";

export async function rodarMeuModelo(gravacao: Blob): Promise<number[]> {
    const modelo = await loadAudioModel({
        modelUrl: "/models/meu-modelo.onnx",
        feature: { ...WHISPER_LOG_MEL_80, nMels: 64 },
        inputDims: ({ nMels, frames }) => [1, 1, nMels as number, frames as number],
    });
    const saidas = await modelo.run(gravacao);
    return Array.from(saidas[modelo.outputNames[0] as string]?.data ?? []);
}
```

| Opção | Default | O que faz |
| --- | --- | --- |
| `modelUrl` | — | O `.onnx`, servido da sua origem. |
| `feature` | — | `"waveform"` passa a onda crua; uma `LogMelConfig` calcula o log-mel com ela. |
| `sampleRate` | `16000` | Taxa que o modelo espera, com `"waveform"`. Com log-mel, vale a taxa da config. |
| `inputDims` | `[amostras]` ou `[1, nMels, quadros]` | Forma do tensor de entrada. |
| `inputName` | o primeiro do modelo | Nome da entrada. |
| `ortAssetsUrl` | o do `configureOrtAssets` | Pasta do runtime. |

Um classificador seu cabe no `loadSoundClassifier`, com `feature`, `labels` (ou `labelsUrl`) e `scoresOutput`.

## Recap

- `loadSoundClassifier({ modelUrl, labelsUrl })` → `classify(blob)` → `{ frames, top }`, com as 521 classes do AudioSet.
- `createSoundMonitor(mic, onChange, { classifier, classes })` chama `onChange(ativos)` quando a lista muda, com média de 3 janelas e histerese (0,3 liga, 0,18 desliga). Sob CSP, passe `stream: { workletUrl }`.
- `loadAudioModel({ modelUrl, feature, inputDims })` roda qualquer modelo de áudio ONNX, com decodificação, reamostragem e log-mel feitos pelo SDK.
