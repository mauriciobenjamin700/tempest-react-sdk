---
description: "Silero VAD no navegador: createSpeechDetector para a gravação sozinho quando a pessoa para de falar, e detectSpeechSegments acha os trechos com fala de uma gravação."
---

# Fim da fala: Silero VAD

Numa busca por voz, a pessoa fala e espera. Se o app espera o botão de parar ou o tempo máximo, a espera fica longa. Melhor é parar a gravação sozinho, ~1 s depois que ela se cala.

O [`monitorVoiceActivity`](audio.md#quem-esta-falando-monitorvoiceactivity) decide por volume, e por isso erra justo onde a voz importa: ônibus, rua, TV ligada. O `/speech` traz o **Silero VAD** (v5, ~2 MB, MIT), um modelo que separa fala de ruído a cada 32 ms. Ele roda no mesmo runtime do Whisper; veja [como servir o runtime](speech.md#2-sirva-o-runtime).

```bash
curl -sfL -o public/models/silero_vad.onnx \
  https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
```

## Gravar até a pessoa parar de falar

O exemplo completo: abre o microfone, grava e para 1 s depois do fim da fala. Se ninguém falar em 15 s, devolve `null` em vez de um áudio vazio. Ele já roda sob o [CSP do `tempestCsp()`](csp.md). Chame a partir do clique no botão: é o gesto do usuário que libera o microfone e o áudio.

```typescript
import { createAudioRecorder } from "tempest-react-sdk";
import pcmWorkletUrl from "tempest-react-sdk/pcm-worklet.js?url";
import { createSpeechDetector, loadSileroVad, type SileroVad } from "tempest-react-sdk/speech";

const SEM_FALA_MS = 15_000;

let vadCarregado: Promise<SileroVad> | undefined;

export function carregarVad(): Promise<SileroVad> {
    vadCarregado ??= loadSileroVad({ modelUrl: "/models/silero_vad.onnx" });
    return vadCarregado;
}

export async function gravarAteCalar(): Promise<Blob | null> {
    const vad = await carregarVad();
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    const gravador = createAudioRecorder(mic);
    let limite: ReturnType<typeof setTimeout> | undefined;
    try {
        gravador.start();
        let falou = false;
        let encerrar = (): void => undefined;
        const fim = new Promise<void>((resolve) => (encerrar = resolve));
        limite = setTimeout(encerrar, SEM_FALA_MS);
        const detector = await createSpeechDetector(
            mic,
            (falando) => {
                if (falando) {
                    falou = true;
                    clearTimeout(limite);
                } else if (falou) encerrar();
            },
            { vad, minSilenceMs: 1000, stream: { workletUrl: pcmWorkletUrl } },
        );
        await fim;
        detector.stop();
        const { blob } = await gravador.stop();
        return falou ? blob : null;
    } finally {
        clearTimeout(limite);
        if (gravador.status() === "recording") gravador.cancel();
        mic.getTracks().forEach((track) => track.stop());
    }
}
```

- **O VAD carrega uma vez** (`carregarVad`) e serve para todas as gravações. Chame `carregarVad()` cedo, ao montar a tela, para a primeira gravação não esperar o download.
- **Sem fala, sem transcrição.** Mandar silêncio ao Whisper é pedir texto inventado: com um `prompt`, o modelo pode devolver o próprio prompt. Por isso o `null`.
- O limite de 15 s vale só até a fala começar. Depois, quem para é o silêncio.
- O gravador começa **antes** do detector. O detector precisa de alguns quadros para ligar: no teste abaixo, a fala começou em 1,0 s e ele ligou em 1,6 s. Como a gravação já estava rodando, o começo não se perde.
- O `onChange` recebe `true` quando a fala começa e `false` quando ela termina. Só é chamado na **virada**, não a cada quadro.
- `stop()` libera o grafo de áudio do detector. Ele **não** para o microfone (o stream é seu) nem descarrega o VAD (`vad.release()` faz isso). Um VAD carregado serve para várias gravações.
- `stream: { workletUrl }` é a mesma opção do [`createPcmStream`](audio.md#do-microfone-createpcmstream). Sem ela, o processador carrega de uma URL `blob:`, que o `script-src` do `tempestCsp()` recusa.

Medido no Chromium 159, com microfone falso tocando 1 s de silêncio, 5,5 s de uma frase gravada e silêncio depois: o detector ligou aos 1,6 s e desligou aos 6,7 s. A frase gravada já termina com pausa própria, então o fim da fala real fica antes dos 6,5 s. Processou 281 de 281 quadros.

### Opções do `createSpeechDetector(fonte, onChange, opções)`

`fonte` é um `MediaStream`, um `MediaStreamTrack` ou um `AudioNode` (o `track` de um `createVoiceChain`, por exemplo). A função devolve `{ speaking, stop }`, o mesmo formato do `monitorVoiceActivity`. Dá para trocar um pelo outro.

| Opção | Default | O que faz |
| --- | --- | --- |
| `vad` | — | O modelo, de `loadSileroVad`. |
| `minSilenceMs` | `100` | Silêncio que encerra a fala. Para parar uma gravação, use ~`1000`: 100 ms cortam no meio de uma pausa. |
| `threshold` | `0,5` | Probabilidade de fala que liga. |
| `negThreshold` | `max(threshold − 0,15, 0,01)` | Probabilidade abaixo da qual conta como silêncio. |
| `stream` | — | `{ workletUrl, context }`, repassado ao `createPcmStream`. |
| `onProbability` | — | Recebe a probabilidade de cada quadro, para um medidor ou para calibrar o limiar. |

`minSpeechMs` existe no tipo, mas não vale ao vivo: uma resposta de uma palavra ainda precisa ligar o detector.

## Achar a fala numa gravação: `detectSpeechSegments`

Para cortar o silêncio antes de enviar ou de transcrever:

```typescript
import { decodeAudioToPcm } from "tempest-react-sdk";
import { detectSpeechSegments, loadSileroVad } from "tempest-react-sdk/speech";

const vad = loadSileroVad({ modelUrl: "/models/silero_vad.onnx" });

export async function segundosDeFala(gravacao: Blob): Promise<number> {
    const segmentos = await detectSpeechSegments(await decodeAudioToPcm(gravacao), await vad);
    console.log(segmentos);
    return segmentos.reduce((total, s) => total + (s.endMs - s.startMs), 0) / 1000;
}
```

O console mostra uma lista de `{ startMs, endMs }`, um item por trecho com fala.

A segmentação é a do `get_speech_timestamps` do silero-vad, com os mesmos defaults (constantes `SILERO_DEFAULT_*`, com a origem citada no código):

| Opção | Default | O que faz |
| --- | --- | --- |
| `threshold` | `0,5` | Probabilidade que começa a fala. |
| `negThreshold` | `max(threshold − 0,15, 0,01)` | Probabilidade abaixo da qual conta como silêncio. |
| `minSpeechMs` | `250` | Trecho mais curto que é mantido. |
| `minSilenceMs` | `100` | Silêncio que separa dois trechos. |
| `padMs` | `30` | Margem acrescentada a cada lado do trecho. |

## Quanto acerta

Comparado ao VAD por energia, em acurácia por quadro de 32 ms em 10 frases do FLEURS `pt_br`. O rótulo vem do sinal **limpo**, e a medição é feita sobre o sinal com ruído:

| Condição | Energia (default) | Energia (calibrada no piso de ruído) | **Silero** |
| --- | --- | --- | --- |
| limpa | 63,6 % | 86,1 % | **89,5 %** |
| ruído branco 0 / 5 / 10 dB | 60,9 / 64,4 / 61,4 % | 41,1 / 67,0 / 82,6 % | **87,9 / 89,1 / 89,3 %** |
| babble 0 / 5 / 10 dB | 59,2 / 60,1 / 62,6 % | 47,2 / 50,9 / 54,1 % | **74,2 / 70,7 / 77,3 %** |

- No babble (outras pessoas falando, como num ônibus cheio), o Silero cai para 71–77 %: o ruído **é** fala. Mesmo assim, o recall fica em 95–98 %, então ele não perde quem está falando.
- O VAD por energia com os defaults perde metade da fala até no sinal limpo (recall de 50 %), porque o limiar fixo de 0,045 é alto para esse nível de gravação.
- **Custo:** 0,16 ms por quadro de 32 ms (WASM numa thread, Node 24). Cabe na thread principal, sem worker.

??? info "Como reproduzir"
    Gere os dados com `scripts/gen-vad-fixtures.py` e rode `DATASET_DIR=… SILERO_MODEL=… node --import ./loader/css-loader.mjs scripts/bench-vad.mjs`.

## Recap

- `loadSileroVad({ modelUrl })` carrega o modelo (~2 MB). Carregue uma vez e reuse em todas as gravações.
- Sem fala até o limite: devolva `null`, não mande o silêncio ao Whisper.
- Para juntar com a transcrição, veja [a busca por voz completa](speech-fallback.md#a-busca-por-voz-inteira).
- `createSpeechDetector(mic, onChange, { vad, minSilenceMs: 1000 })` diz quando a fala começa e termina. Sob CSP, passe `stream: { workletUrl }`.
- `stop()` libera o grafo de áudio; o microfone e o VAD continuam seus.
- `detectSpeechSegments(pcm, vad)` → `[{ startMs, endMs }]`, com os defaults do silero-vad.
- Acurácia por quadro de 87,9 a 89,3 % com ruído branco, contra ~61 % do VAD por energia; 0,16 ms por quadro.
