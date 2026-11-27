---
description: "Fala e som no navegador com modelos ONNX: transcrição com o Whisper (com fallback para o servidor), fim da fala com o Silero VAD e sons do ambiente com o YAMNet."
---

# Transcrição no aparelho (Whisper)

O subpath `tempest-react-sdk/speech` roda modelos de áudio **no navegador do usuário**: transcreve fala com o Whisper, percebe quando a pessoa parou de falar com o Silero VAD e reconhece sons do ambiente com o YAMNet. Nada de áudio sai do aparelho, a não ser que você mande. 🎙️

Esta página leva da instalação até a primeira transcrição. As outras três cobrem o resto:

| Você quer… | Página |
| --- | --- |
| transcrever no aparelho e mandar ao **servidor** quando o aparelho não der conta | [Aparelho ou servidor](speech-fallback.md) |
| parar a gravação **sozinho** quando a pessoa para de falar, ou cortar silêncio | [Fim da fala (Silero VAD)](speech-vad.md) |
| saber **o que** se ouve (sirene, buzina, música) ou rodar um modelo de áudio seu | [Sons e modelo próprio](speech-sounds.md) |

## Termos que aparecem aqui

| Termo | O que é |
| --- | --- |
| **ONNX** | Formato de arquivo de modelo. O **ONNX Runtime Web** (`onnxruntime-web`) é quem o executa no navegador. |
| **WASM** | WebAssembly: o código do runtime, compilado. **SIMD** (contas em lote) é obrigatório; **threads** (vários núcleos) são opcionais e exigem os headers de [isolamento](#threads-isolamento-cross-origin). |
| **int8** | Pesos do modelo guardados em 8 bits: arquivo ~4× menor que o original, com perda pequena de acerto. |
| **WER** | *Word error rate*, a fração de palavras erradas. 15 % = uma palavra errada em cada sete. |
| **RTF** | *Real-time factor*, o tempo de processamento ÷ a duração do áudio. 0,1 = 10 s de fala em 1 s. Não confunda com a opção `realtimeFactor` do `createSpeechToText`, que define um **prazo**. |
| **VAD** | *Voice activity detection*: dizer, quadro a quadro, se tem fala. |
| **log-mel** | A representação do áudio que o Whisper lê, uma "imagem" de frequências por tempo. O SDK calcula por você. |

## Instalação

```bash
npm install tempest-react-sdk onnxruntime-web
```

`onnxruntime-web` é peer opcional, o mesmo do `/vision` e do `/tabular`. Ele só é importado quando um modelo carrega, então importar o subpath e chamar `assessSpeechDevice()` não exige o pacote.

O app serve três coisas da própria origem. Nenhuma delas vai no bundle:

| O quê | Tamanho | Quem serve |
| --- | --- | --- |
| o modelo (`whisper-base` int8) | 77 MB | você, de `public/models/` (passo 1) |
| o runtime do ONNX (`.wasm` + `.mjs`) | ~25 MB | o plugin `tempestOrtAssets()` (passo 2) |
| o worker que roda o modelo | uma linha | você (passo 4) |

O navegador baixa os dois primeiros só quando o modelo carrega, e os guarda: a segunda vez funciona offline.

## 1. Sirva o modelo

O SDK lê o export ONNX do Hugging Face no layout do `onnx-community/whisper-*`. Baixe uma vez:

```bash
M=public/models/whisper-base && mkdir -p $M/onnx
for f in config.json generation_config.json tokenizer.json \
  onnx/encoder_model_int8.onnx onnx/decoder_model_merged_int8.onnx; do
  curl -sfL -o $M/$f "https://huggingface.co/onnx-community/whisper-base/resolve/main/$f"
done
```

| Modelo | Download (int8) | WER em português | RTF (desktop) |
| --- | --- | --- | --- |
| `whisper-tiny` | 41 MB | 34,0 % | 0,071 |
| `whisper-base` | 77 MB | **15,9 %** | 0,109 |
| `whisper-small` | 249 MB | — | grande demais para celular |

**Para português, use o `whisper-base`:** o tiny erra uma palavra em cada três.

??? info "Como foi medido"
    - **Tamanhos:** arquivos `encoder_model_int8.onnx` + `decoder_model_merged_int8.onnx` na API do Hugging Face, em 26/11/2026.
    - **WER:** 30 frases do FLEURS `pt_br` (conjunto `dev`, 363 s de fala lida), Chromium 159 num desktop, com `npm run build && WHISPER_MODEL_DIR=… DATASET_DIR=… LANGUAGE=pt node scripts/bench-whisper-wer.mjs`.
    - **O que entra no WER:** a normalização tira pontuação e caixa, mas mantém acentos e não converte numerais. Por isso "dez" × "10" conta como erro.
    - **Os erros que pesam numa busca são nomes próprios** ("polo" → "Paulo"). Meça com gravações do seu domínio: o mesmo script aceita qualquer pasta com `transcripts.tsv` (`arquivo<TAB>texto`).

## 2. Sirva o runtime

O ONNX Runtime Web **não embute** os `.wasm`, nem nos builds `.bundle`. Num app empacotado pelo Vite, a sessão falha com `Aborted(both async and sync fetching of the wasm failed)`, sem dizer qual arquivo faltou. O plugin [`tempestOrtAssets()`](vite-config.md#modelos-onnx-no-navegador-tempestortassets) serve os binários em `/ort/`, no dev e no build:

```ts
import { createViteConfig, tempestOrtAssets } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [tempestOrtAssets({ crossOriginIsolation: true })],
});
```

`crossOriginIsolation: true` liga as [threads](#threads-isolamento-cross-origin) no `vite dev` e no `vite preview`. Em produção, os headers vêm do seu servidor.

Diga ao SDK onde o runtime está **uma vez**, no boot do app (o `main.tsx`). Vale para todo modelo do `/speech`, do `/tabular` e do `/vision`, inclusive dentro do worker do passo 4:

```typescript
import { configureOrtAssets } from "tempest-react-sdk/speech";

configureOrtAssets("/ort/");
```

!!! warning "nginx: `.mjs` e os headers de isolamento"
    O `mime.types` padrão do nginx não conhece `.mjs`. O runtime sai como `application/octet-stream` e o navegador recusa o módulo. No bloco `server`:

    ```nginx
    location ~* \.mjs$ {
        types { } default_type application/javascript;
    }
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    ```

    O nginx não herda `add_header`: uma `location` que declara os próprios headers (cache, CSP) perde os do `server`. Repita os dois de isolamento nela.

## 3. A primeira transcrição

Com o modelo e o runtime servidos, `loadWhisper` carrega e `transcribe` transcreve:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export async function transcreverArquivo(gravacao: Blob): Promise<string> {
    const whisper = await loadWhisper({ baseUrl: "/models/whisper-base" });
    const resultado = await whisper.transcribe(gravacao, { language: "pt" });
    console.log(resultado);
    return resultado.text;
}
```

Para gravar o `Blob`, use o [`createAudioRecorder`](audio.md#fora-do-react-os-primitivos) (ou o `useAudioRecorder`, no React). O console mostra isto:

```text
{
  text: "Você pode ver as pirâmides no escuro e no silêncio antes de o chão começar.",
  language: "pt",
  audioMs: 8160,
  timings: { decodeMs: 56, featuresMs: 83, encoderMs: 467, decoderMs: 430, totalMs: 1037 },
  compressionRatio: 0.99,
  degenerate: false,
  tokens: [ … 22 ids … ]
}
```

Medido numa frase do FLEURS `pt_br` ("Você pode ver as pirâmides no escuro e também no silêncio antes de o show começar."), whisper-base int8, Chromium 159 num desktop, execução aquecida, com `WHISPER_MODEL_DIR=… LANGUAGE=pt node scripts/bench-whisper.mjs`. O modelo trocou "show" por "chão" e omitiu "também": é o tipo de erro que o [`prompt`](#nomes-proprios-prompt) reduz.

O que o `transcribe` aceita e o que ele faz:

- **Entrada:** `Blob` (o que o `MediaRecorder` gravou: webm/opus, mp4/aac, wav, mp3), `Float32Array` mono a 16 kHz, ou `MonoPcm` em qualquer taxa.
- **Mais de 30 s:** processado em janelas de 30 s, uma depois da outra.
- **`language` omitido:** detectado na primeira janela, ao custo de um passo extra do decoder.
- **`onPartial(texto)`:** recebe o texto parcial a cada token, para legenda ao vivo. **`signal`** cancela.
- **`degenerate: true`:** o modelo entrou em loop ("Wars!!!!…"). Trate como falha. O [`createSpeechToText`](speech-fallback.md) faz isso por você.
- **Cache:** os arquivos vão para o Cache Storage (`tempest-speech-models`). A segunda carga não baixa nada e funciona offline.
- **`whisper.release()`** libera a memória do modelo.

## 4. Tire o modelo da thread principal: `worker`

O backend WASM do ONNX Runtime calcula na thread que o chama. Na página, isso **congela a tela** durante a transcrição inteira: o spinner para, e um toque espera o fim. Rode o modelo num Web Worker. São dois arquivos:

```text
src/
├── fala.worker.ts   ← o worker: uma linha
└── fala.ts          ← quem carrega o modelo
```

`src/fala.worker.ts`:

```typescript
import { exposeWhisperWorker } from "tempest-react-sdk/speech";

exposeWhisperWorker();
```

`src/fala.ts`:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export const carregarWhisper = () =>
    loadWhisper({
        baseUrl: "/models/whisper-base",
        worker: new Worker(new URL("./fala.worker.ts", import.meta.url), { type: "module" }),
    });
```

O modelo devolvido tem a mesma interface do passo 3. Três detalhes que o SDK já resolve:

- O `new URL("./…", import.meta.url)` é o formato que o Vite reconhece para empacotar o worker. O `tempestOrtAssets()` configura `worker.format: "es"`, que o worker precisa.
- A pasta do runtime (`configureOrtAssets` ou `ortAssetsUrl`) é enviada ao worker junto com as opções.
- A gravação é decodificada na página (worker não tem `OfflineAudioContext`), e só as amostras vão para o worker, transferidas sem cópia. Cancelar rejeita na hora e para o worker no próximo passo do decoder.

??? info "Medido: a tela deixa de congelar"
    Chromium 159, whisper-tiny int8, 11 s de fala (`WHISPER_MODEL_DIR=… node scripts/bench-whisper-worker.mjs`):

    | Onde roda | Transcrição | Frames desenhados (esperado a 60 fps) |
    | --- | --- | --- |
    | página, com threads | 724 ms | **3** (43) |
    | worker, com threads | 715 ms | **45** (43) |
    | página, 1 thread | 1 423 ms | **2** (85) |
    | worker, 1 thread | 1 419 ms | **86** (85) |

    O tempo é o mesmo; só a tela deixa de congelar.

??? info "Por que não o `env.wasm.proxy` do ONNX Runtime"
    O proxy embutido **transfere** os buffers de entrada para o worker dele, e o decoder do Whisper reusa a saída do encoder a cada passo. Medido: `DataCloneError: An ArrayBuffer is detached` no segundo passo. Ele também não funciona com WebGPU. Aqui o laço inteiro (features, encoder, decoder) roda no worker.

## Nomes próprios: `prompt`

Numa busca por voz, a informação central costuma ser um nome próprio, como a cidade. É justamente o que o Whisper mais erra ("polo" → "Paulo"). Passe o vocabulário esperado como `prompt`:

```typescript
import { loadWhisper } from "tempest-react-sdk/speech";

export async function transcreverBusca(gravacao: Blob): Promise<string> {
    const whisper = await loadWhisper({ baseUrl: "/models/whisper-base" });
    const { text } = await whisper.transcribe(gravacao, {
        language: "pt",
        prompt: "Picos, Sobral, Teresina, Juazeiro do Norte, Fortaleza, Parnaíba",
    });
    return text;
}
```

O Whisper lê o prompt como texto que veio antes da gravação e se inclina para aquelas grafias. Nas mesmas 30 frases, o WER do base foi de 15,9 % para **11,2 %**. Uma lista sem relação com o áudio não piorou o resultado (14,3 %), então é seguro deixar a lista fixa. Mantenha a lista curta: em silêncio ou ruído, o modelo pode repetir o prompt.

??? info "Como foi medido"
    whisper-base int8, 30 frases do FLEURS `pt_br`, com `PROMPT="…" WHISPER_MODEL_DIR=… DATASET_DIR=… node scripts/bench-whisper-wer.mjs`:

    | Prompt | WER | Saídas degeneradas |
    | --- | --- | --- |
    | nenhum | 15,9 % | 0 |
    | nomes próprios que aparecem nas frases | **11,2 %** | 0 |
    | cidades do Nordeste que **não** aparecem | 14,3 % | 0 |

    O encode do prompt é idêntico ao do `tokenizers` do Hugging Face no vocabulário real do Whisper (`tokenizer.parity.test.ts`).

## Opções do `loadWhisper`

| Opção | Default | O que faz |
| --- | --- | --- |
| `baseUrl` | — | Pasta do export (`config.json`, `tokenizer.json`, `onnx/…`). |
| `dtype` | `"int8"` | Quais pesos baixar: `"int8"`, `"fp32"`, `"fp16"` ou `"q4"`. |
| `worker` | — | Roda o modelo neste Web Worker (passo 4). |
| `ortAssetsUrl` | o do `configureOrtAssets` | Pasta do runtime, se você não chamou `configureOrtAssets`. |
| `onProgress` | — | `({ file, loaded, total })` durante o download, por arquivo. |
| `persistStorage` | `false` | Pede `navigator.storage.persist()` antes de baixar, para o navegador não apagar o modelo quando falta disco. Fica desligado por default porque, no Firefox, o pedido abre um prompt de permissão. |
| `providers` | `["wasm"]` | Backends do ONNX Runtime, em ordem de preferência. |
| `cacheName` | `"tempest-speech-models"` | Nome do bucket no Cache Storage. |

!!! warning "WebGPU não é o default"
    `providers` aceita `["webgpu", "wasm"]`, mas o export int8 usa operações inteiras que o backend WebGPU devolve à CPU nó a nó, e o fp16 no WebGPU gerou lixo no ambiente medido. Até haver medição num aparelho real, o default é `["wasm"]`.

## Threads: isolamento cross-origin

O WASM do ONNX Runtime usa vários núcleos só numa página `crossOriginIsolated`, com os headers `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: credentialless`. Sem eles, roda numa thread só e fica **2,3× mais lento**: o whisper-base foi de RTF 0,109 para 0,248 no mesmo desktop, com o mesmo WER (`ISOLATION=0 … node scripts/bench-whisper-wer.mjs`). Num celular de entrada, é a diferença entre transcrever no aparelho e mandar ao servidor.

- **Dev e preview:** `tempestOrtAssets({ crossOriginIsolation: true })`.
- **Produção:** os dois `add_header` do nginx do passo 2.
- **Por que `credentialless`, e não `require-corp`:** com `require-corp`, toda imagem, fonte ou script de outra origem sem o header `Cross-Origin-Resource-Policy` deixa de carregar. Com `credentialless`, eles carregam sem cookies. Num navegador que não conhece `credentialless`, a página não fica isolada: o modelo roda numa thread, mas roda.
- **Para conferir:** `crossOriginIsolated` no console, ou `assessSpeechDevice().wasmThreads`.

## Quanto custa

Chromium 159, desktop (24 núcleos, WASM com threads), whisper-tiny int8, 11 s de fala em inglês (`jfk.flac` do repositório do Whisper), execução aquecida:

| Etapa | ms |
| --- | --- |
| Decodificar o `.flac` e reamostrar | 106 |
| Log-mel | 91 |
| Encoder | 283 |
| Decoder (24 tokens) | 297 |
| **Total** | **778** |

Carga: 1 266 ms com download de 43,3 MB, 343 ms do cache. Reproduza com `npm run build && WHISPER_MODEL_DIR=/tmp/whisper-tiny node scripts/bench-whisper.mjs` (o comando de download está no cabeçalho de `e2e/speech-whisper.spec.ts`). **Ainda não medido num Android de entrada**: é para isso que o [prazo do `createSpeechToText`](speech-fallback.md#como-a-rota-e-escolhida) existe.

??? info "Por que não `@huggingface/transformers`"
    | `@huggingface/transformers@4.3.2` | O que custaria ao app |
    | --- | --- |
    | `onnxruntime-web` fixado em `1.31.0-dev.20260914` | um segundo runtime ONNX (wasm duplicado) em app que já usa `/vision` ou `/tabular` |
    | `onnxruntime-node` e `sharp` como dependências | binários nativos baixados no `npm install` de um app de navegador |

    O que a transcrição precisa dele (decodificação gulosa com KV-cache e o tokenizer BPE) está no `/speech`, sobre o `onnxruntime-web` que já é peer.

## Recap

- Sirva o modelo em `public/models/` (o `whisper-base` int8: 77 MB, 15,9 % de WER em português) e o runtime com `tempestOrtAssets()` (~25 MB). No nginx, `.mjs` precisa de MIME de JavaScript.
- `configureOrtAssets("/ort/")` uma vez no boot. Vale para todo modelo, inclusive no worker.
- `loadWhisper({ baseUrl })` → `transcribe(blob, { language: "pt" })` → `{ text, degenerate, timings, … }`.
- `loadWhisper({ worker })` com um arquivo `exposeWhisperWorker()`: a tela segue desenhando durante a transcrição (3 → 45 frames em ~720 ms).
- `prompt` com os nomes próprios esperados: WER de 15,9 % → 11,2 %.
- Threads: COOP `same-origin` + COEP `credentialless` (RTF 0,248 → 0,109). `tempestOrtAssets({ crossOriginIsolation: true })` liga no dev.
- Próximo: [aparelho ou servidor](speech-fallback.md), [fim da fala](speech-vad.md), [sons e modelo próprio](speech-sounds.md).
