# Transcrição no aparelho (Whisper)

O subpath `tempest-react-sdk/speech` transcreve fala **no navegador do usuário** com o Whisper e, quando o aparelho não dá conta, passa a gravação para o **seu servidor**. O app chama uma função só; o SDK decide a rota a cada gravação e diz qual usou e por quê. 🎙️

Transcrever no aparelho economiza upload em rede móvel, fila no backend e a ida e volta, e funciona offline depois do primeiro uso. Mas um celular de entrada pode levar mais que o próprio áudio para transcrever, e esperar por isso é pior que mandar ao servidor. O `createSpeechToText` cuida dessa escolha.

```bash
npm install tempest-react-sdk onnxruntime-web
```

`onnxruntime-web` é peer opcional, o mesmo do `/vision` e do `/tabular`. Ele só é importado quando um modelo carrega, então importar o subpath e chamar `assessSpeechDevice()` não exige o pacote.

## 1. Sirva o modelo

O SDK lê o export ONNX do Hugging Face no layout do `onnx-community/whisper-*`. Baixe uma vez e sirva da sua origem:

```bash
M=public/models/whisper-base && mkdir -p $M/onnx
for f in config.json generation_config.json tokenizer.json \
  onnx/encoder_model_int8.onnx onnx/decoder_model_merged_int8.onnx; do
  curl -sfL -o $M/$f "https://huggingface.co/onnx-community/whisper-base/resolve/main/$f"
done
```

| Modelo | Download (int8) | WER em português | Fator de tempo real |
| --- | --- | --- | --- |
| `whisper-tiny` | 41 MB | 34,0 % | 0,071 |
| `whisper-base` | 77 MB | **15,9 %** | 0,109 |
| `whisper-small` | 249 MB | — | grande demais para celular |

**Para português, use o `whisper-base`:** o tiny erra uma palavra em cada três.

- **Tamanhos:** arquivos `encoder_model_int8.onnx` + `decoder_model_merged_int8.onnx` na API do Hugging Face, em 26/11/2026.
- **WER:** 30 frases do FLEURS `pt_br` (conjunto `dev`, 363 s de fala lida), Chromium 159 num desktop, com `npm run build && WHISPER_MODEL_DIR=… DATASET_DIR=… LANGUAGE=pt node scripts/bench-whisper-wer.mjs`.
- **O que entra no WER:** a normalização tira pontuação e caixa, mas mantém acentos e não converte numerais. Por isso "dez" × "10" conta como erro.
- **Os erros que pesam numa busca são nomes próprios** ("polo" → "Paulo"). Meça com gravações do seu domínio: o mesmo script aceita qualquer pasta com `transcripts.tsv` (`arquivo<TAB>texto`).

## 2. Sirva o runtime

O ONNX Runtime Web **não embute** os `.wasm`, nem nos builds `.bundle`. Num app empacotado pelo Vite, a sessão falha com `Aborted(both async and sync fetching of the wasm failed)`, sem dizer qual arquivo faltou. Copie os binários de `node_modules/onnxruntime-web/dist/` para o diretório público e diga onde estão:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export const carregar = () => loadWhisper({ baseUrl: "/models/whisper-base", ortAssetsUrl: "/ort/" });
```

Ou uma vez no boot, com o `configureOrtAssets("/ort/")` que o `/speech` reexporta do `/tabular` (vale para os dois). Para precache offline, `ortAssetUrls("/ort/")` lista os arquivos.

## 3. Transcreva com fallback para o servidor

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

export const speech = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    server: async (audio, { signal }) => {
        const body = new FormData();
        body.append("audio", audio, "fala.webm");
        const response = await fetch("/api/transcribe", { method: "POST", body, signal });
        return ((await response.json()) as { text: string }).text;
    },
    isServerAvailable: () => navigator.onLine,
    language: "pt",
});

export async function aoGravar(gravacao: Blob): Promise<string> {
    const resultado = await speech.transcribe(gravacao);
    console.log(resultado.source, resultado.reason);
    return resultado.text;
}
```

O `server` é seu: endpoint, autenticação, polling de job. O SDK só chama a função e repassa o `signal`.

## Backend que transcreve **e** interpreta

Se o seu servidor não devolve só o texto, e sim a resposta inteira (uma busca já interpretada, o resultado de um job), deixe o `server` devolver essa resposta e diga em `serverText` onde está o texto. Ela volta intacta em `resultado.server`, e na rota do aparelho o app manda o `text` para o endpoint de texto:

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

interface BuscaDeRota {
    text: string;
    results: unknown[];
}

declare function buscarPorAudio(audio: Blob, signal: AbortSignal): Promise<BuscaDeRota>;
declare function buscarPorTexto(texto: string): Promise<BuscaDeRota>;

const voz = createSpeechToText<BuscaDeRota>({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    server: (audio, { signal }) => buscarPorAudio(audio, signal),
    serverText: (resposta) => resposta.text,
    language: "pt",
});

export async function buscarFalando(gravacao: Blob): Promise<BuscaDeRota> {
    const resultado = await voz.transcribe(gravacao);
    return resultado.server ?? buscarPorTexto(resultado.text);
}
```

O servidor nunca interpreta duas vezes: quando ele respondeu, a resposta dele é usada; quando o aparelho transcreveu, só o texto viaja.

## Como a rota é escolhida

A cada `transcribe`, nesta ordem:

| Situação | Rota | `reason` |
| --- | --- | --- |
| Servidor fora do ar ou não configurado | aparelho, **sem prazo** | `server-unavailable` |
| Aparelho descartado por `assessSpeechDevice` (sem WASM SIMD, pouca memória) | servidor | `device-unsupported` |
| Aparelho já foi lento antes (veredito guardado) | servidor | `device-remembered-slow` |
| Modelo ainda não carregado | servidor, e o modelo carrega em segundo plano | `model-not-ready` |
| Aparelho terminou dentro do prazo | aparelho | `device` |
| Aparelho estourou o prazo | servidor; o aparelho fica marcado como lento | `device-slow` |
| Aparelho devolveu texto em loop | servidor | `device-degenerate` |
| Aparelho falhou (memória, WASM) | servidor | `device-error` |
| Servidor falhou | aparelho | `server-error` |

!!! info "\"O aparelho não aguenta\" é medido, não chutado"
    O prazo é a duração do áudio × `realtimeFactor` (default `1`: 10 s de gravação têm 10 s), nunca menos que `minBudgetMs` (4 s). Estourou: a execução é cancelada entre dois passos do decoder, o servidor responde, e o aparelho fica marcado como lento por `slowVerdictTtlMs` (7 dias), no `localStorage`. Assim a decisão vem de uma execução real **neste** aparelho com **este** modelo, e não de `deviceMemory` ou do número de núcleos.

!!! warning "Texto em loop conta como falha"
    Um modelo pode "terminar" com lixo em vez de dar erro. No Chromium 159 com WebGPU num ambiente headless, o whisper-tiny fp16 devolveu `"Wars!!!!…"` por 224 tokens. O SDK aplica o teste do Whisper de referência: a razão de compressão do texto (`compressionRatio`) acima de **2,4**, ou o decoder sem terminar, marca `Transcription.degenerate`. Com servidor disponível, a gravação vai para ele. Medido: fala real comprime 1,0 a 1,34×; aquele loop, 14,9×.

### Primeira gravação, modelo ainda baixando

Com `whileLoading: "background"` (o default), a primeira gravação vai ao servidor enquanto o modelo baixa, e as seguintes rodam no aparelho. Para baixar antes, num momento bom (Wi-Fi, app ocioso):

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

const speech = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    language: "pt",
});

export function aquecerQuandoOcioso(): void {
    const conexao = (navigator as { connection?: { type?: string } }).connection;
    if (conexao?.type === "cellular") return;
    requestIdleCallback(() => void speech.warmUp());
}
```

## Nomes próprios: `prompt`

Na busca por voz, a informação central costuma ser um nome próprio, a cidade. É justamente o que o Whisper mais erra ("polo" → "Paulo"). Passe o vocabulário esperado como `prompt`:

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

export const busca = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    language: "pt",
    prompt: "Picos, Sobral, Teresina, Juazeiro do Norte, Fortaleza, Parnaíba",
});
```

O Whisper lê o prompt como texto que veio antes da gravação (`<|startofprev|>`, o `initial_prompt` do openai-whisper) e se inclina para aquelas grafias. No `createSpeechToText` ele vale para as duas rotas: o aparelho usa, e o callback `server` recebe em `context.prompt`.

whisper-base int8, mesmas 30 frases do FLEURS `pt_br`:

| Prompt | WER | Saídas degeneradas |
| --- | --- | --- |
| nenhum | 15,9 % | 0 |
| nomes próprios que aparecem nas frases | **11,2 %** | 0 |
| cidades do Nordeste que **não** aparecem | 14,3 % | 0 |

Comando: `PROMPT="…" WHISPER_MODEL_DIR=… DATASET_DIR=… node scripts/bench-whisper-wer.mjs`. O vocabulário certo corta quase um terço dos erros. Um prompt sem relação com o áudio não piorou o resultado, o que torna seguro deixar a lista de cidades fixa. O encode do prompt é idêntico ao do `tokenizers` do Hugging Face no vocabulário real do Whisper (`tokenizer.parity.test.ts`).

## Só no aparelho: `loadWhisper`

Sem orquestrador, para quem quer controlar tudo:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export async function transcrever(gravacao: Blob): Promise<string> {
    const whisper = await loadWhisper({
        baseUrl: "/models/whisper-base",
        onProgress: ({ file, loaded, total }) => console.log(file, loaded, total),
    });
    const resultado = await whisper.transcribe(gravacao, {
        language: "pt",
        onPartial: (texto) => console.log(texto),
    });
    console.log(resultado.timings, resultado.degenerate);
    await whisper.release();
    return resultado.text;
}
```

- **Entrada:** `Blob` (o que o `MediaRecorder` gravou), `Float32Array` mono a 16 kHz, ou `MonoPcm` em qualquer taxa (veja [Áudio para modelos](audio.md#audio-para-modelos-pcm-na-taxa-certa)).
- **Mais de 30 s:** processado em janelas de 30 s, uma depois da outra.
- **`language` omitido:** detectado na primeira janela, ao custo de um passo extra do decoder.
- **Cache:** os arquivos vão para o Cache Storage (`tempest-speech-models`); a segunda carga funciona offline.

### Quanto custa

Chromium 159, desktop (24 núcleos, WASM com threads por COOP/COEP), whisper-tiny int8, 11 s de fala em inglês (`jfk.flac` do repositório do Whisper), execução aquecida:

| Etapa | ms |
| --- | --- |
| Decodificar o `.flac` e reamostrar | 106 |
| Log-mel | 91 |
| Encoder | 283 |
| Decoder (24 tokens) | 297 |
| **Total** | **778** |

Carga: 1 266 ms com download de 43,3 MB, 343 ms do cache. Transcrição palavra por palavra. Reproduza com `npm run build && WHISPER_MODEL_DIR=/tmp/whisper-tiny node scripts/bench-whisper.mjs` (o comando de download está no cabeçalho de `e2e/speech-whisper.spec.ts`). **Ainda não medido num Android de entrada**: é exatamente para isso que o prazo existe.

!!! warning "WebGPU não é o default"
    `providers` aceita `["webgpu", "wasm"]`, mas o export int8 usa operações inteiras que o backend WebGPU devolve à CPU nó a nó, e o fp16 no WebGPU gerou lixo no ambiente medido. Até haver medição num aparelho real, o default é `["wasm"]`.

### Por que não `@huggingface/transformers`

| `@huggingface/transformers@4.3.2` | O que custaria ao app |
| --- | --- |
| `onnxruntime-web` fixado em `1.31.0-dev.20260914` | um segundo runtime ONNX (wasm duplicado) em app que já usa `/vision` ou `/tabular` |
| `onnxruntime-node` e `sharp` como dependências | binários nativos baixados no `npm install` de um app de navegador |

O que a transcrição precisa dele — decodificação gulosa com KV-cache e o *decode* do tokenizer BPE — está no `/speech` sobre o `onnxruntime-web` que já é peer.

## Antes de oferecer o botão: `assessSpeechDevice`

```typescript
import { assessSpeechDevice } from "tempest-react-sdk/speech";

const aparelho = assessSpeechDevice();
if (!aparelho.canRun) console.log("vai para o servidor:", aparelho.blockers);
console.log(aparelho.wasmThreads, aparelho.webgpu, aparelho.deviceMemoryGb);
```

Síncrono e sem carregar nada. Só descarta o claramente impossível: sem WebAssembly, sem SIMD (o ONNX Runtime Web só tem builds SIMD), ou `deviceMemory` abaixo de `minMemoryGb` (2 GiB). Lento ou não, quem decide é o prazo.

!!! tip "Threads precisam de isolamento cross-origin"
    O WASM do ONNX Runtime usa várias threads só com `crossOriginIsolated` (headers `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`). Sem eles, roda numa thread só, e o prazo vai notar: no mesmo desktop, o whisper-base nas 30 frases do FLEURS foi de fator de tempo real 0,109 para **0,248** (`ISOLATION=0 … node scripts/bench-whisper-wer.mjs`), com o mesmo WER. Num celular de entrada, a thread única é o que manda a gravação para o servidor. `assessSpeechDevice().wasmThreads` diz se o isolamento está ligado.

## Recap

- `createSpeechToText({ loadModel, server, isServerAvailable, language })` → `transcribe(blob)` → `{ text, source, reason }`. ✅
- O aparelho tem prazo de áudio × `realtimeFactor`; estourou, vai ao servidor e o aparelho fica marcado como lento por 7 dias.
- Texto em loop (`compressionRatio` > 2,4) conta como falha.
- `prompt` com o vocabulário esperado: 15,9 % → 11,2 % de WER no base, e um prompt sem relação não piora.
- Modelo ainda não carregado: o servidor responde e o modelo baixa em segundo plano.
- `loadWhisper` para uso direto; whisper-tiny int8 transcreveu 11 s em 778 ms num desktop (`scripts/bench-whisper.mjs`).
- `onnxruntime-web` é peer opcional; WebGPU fica fora do default até ser medido num aparelho real.
