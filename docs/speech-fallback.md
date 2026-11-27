---
description: "createSpeechToText: transcreve no aparelho e passa a gravação ao seu servidor quando o aparelho é lento, falha ou ainda não baixou o modelo, dizendo qual rota usou e por quê."
---

# Aparelho ou servidor: `createSpeechToText`

Transcrever no aparelho economiza upload em rede móvel, fila no backend e a ida e volta, e funciona offline. Mas um celular de entrada pode levar mais que o próprio áudio para transcrever, e esperar por isso é pior que mandar ao servidor. O `createSpeechToText` decide a rota a **cada gravação** e diz qual usou e por quê.

Esta página parte de um app que já [serve o modelo e o runtime](speech.md#1-sirva-o-modelo) e tem o [worker](speech.md#4-tire-o-modelo-da-thread-principal-worker).

## O exemplo completo

Uma busca por voz: transcreve no aparelho, num worker, com os nomes de cidade como vocabulário, e manda ao `/api/transcribe` quando o aparelho não dá conta.

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

const CIDADES = "Picos, Sobral, Teresina, Juazeiro do Norte, Fortaleza, Parnaíba";

export const fala = createSpeechToText({
    loadModel: () =>
        loadWhisper({
            baseUrl: "/models/whisper-base",
            worker: new Worker(new URL("./fala.worker.ts", import.meta.url), { type: "module" }),
        }),
    server: async (audio, { signal, language, prompt }) => {
        const body = new FormData();
        body.append("audio", audio, audio.type.includes("mp4") ? "fala.m4a" : "fala.webm");
        if (language) body.append("language", language);
        if (prompt) body.append("prompt", prompt);
        const response = await fetch("/api/transcribe", { method: "POST", body, signal });
        if (!response.ok) throw new Error(`transcribe: HTTP ${response.status}`);
        return ((await response.json()) as { text: string }).text;
    },
    isServerAvailable: () => navigator.onLine,
    language: "pt",
    prompt: CIDADES,
});

export async function buscarPorVoz(gravacao: Blob): Promise<string> {
    const resultado = await fala.transcribe(gravacao);
    console.log(resultado.source, resultado.reason);
    return resultado.text;
}
```

O console mostra `device device` quando o aparelho transcreveu dentro do prazo, ou `server model-not-ready` na primeira gravação, enquanto o modelo baixa.

- **O `server` é seu:** endpoint, autenticação, formato, polling de job. O SDK só chama a função com o `Blob` gravado e um contexto: `signal` (cancela junto com o prazo), `language` e `prompt`. Se o seu modelo de servidor aceita vocabulário, mande o `prompt`: assim as duas rotas acertam os mesmos nomes.
- **Lançar dentro do `server`** é uma falha do servidor: a gravação volta para o aparelho, com `reason: "server-error"`.
- **O nome do arquivo:** o Safari grava AAC em MP4, e os outros navegadores gravam Opus em WebM. Por isso a extensão segue o `audio.type`.
- **A pasta do runtime** vem do `configureOrtAssets("/ort/")` chamado no boot, e o SDK a repassa ao worker.

## A busca por voz inteira

O botão de busca junta três peças: a gravação que para sozinha ([`gravarAteCalar`](speech-vad.md#gravar-ate-a-pessoa-parar-de-falar)), o `fala` acima, e a sua busca por texto:

```typescript
import type { SpeechToText } from "tempest-react-sdk/speech";

declare function gravarAteCalar(): Promise<Blob | null>;
declare const fala: SpeechToText;
declare function buscarRotas(texto: string): Promise<void>;

export async function aoTocarNoMicrofone(): Promise<void> {
    const gravacao = await gravarAteCalar();
    if (!gravacao) return;
    const { text } = await fala.transcribe(gravacao);
    if (text.trim()) await buscarRotas(text);
}
```

Gravação sem fala (`null`) não vai a lugar nenhum: nem ao modelo, nem ao servidor.

## O que o `transcribe` devolve

| Campo | O que é |
| --- | --- |
| `text` | O texto, de qualquer uma das rotas. |
| `source` | `"device"` ou `"server"`. |
| `reason` | Por que essa rota (tabela abaixo). |
| `transcription` | Detalhes da execução no aparelho (`timings`, `degenerate`…). `null` quando o servidor respondeu. |
| `server` | A resposta do `server`, intacta. `null` quando o aparelho respondeu. Veja [backend que interpreta](#backend-que-transcreve-e-interpreta). |

`transcribe(gravacao, { signal, onPartial })`: `signal` cancela, e `onPartial` recebe o texto parcial quando roda no aparelho.

## Como a rota é escolhida

A cada `transcribe`, nesta ordem:

| Situação | Rota | `reason` |
| --- | --- | --- |
| Sem `server`, ou `isServerAvailable()` respondeu `false` | aparelho, **sem prazo** | `server-unavailable` |
| Aparelho descartado por `assessSpeechDevice` (sem WASM SIMD, pouca memória) | servidor | `device-unsupported` |
| Aparelho já foi lento antes (veredito guardado) | servidor | `device-remembered-slow` |
| Modelo ainda não carregado | servidor, e o modelo carrega em segundo plano | `model-not-ready` |
| Aparelho terminou dentro do prazo | aparelho | `device` |
| Aparelho estourou o prazo | servidor; o aparelho fica marcado como lento | `device-slow` |
| Aparelho devolveu texto em loop | servidor | `device-degenerate` |
| Aparelho falhou (memória, WASM) | servidor | `device-error` |
| Servidor falhou | aparelho | `server-error` |

Sem `isServerAvailable`, o servidor conta como disponível sempre que `server` existe. Se as duas rotas falham, o `transcribe` rejeita com o erro.

!!! info "\"O aparelho não aguenta\" é medido, não chutado"
    O prazo é a duração do áudio × `realtimeFactor` (default `1`: 10 s de gravação têm 10 s), nunca menos que `minBudgetMs` (4 s). Se estourar, a execução é cancelada entre dois passos do decoder, o servidor responde, e o aparelho fica marcado como lento por `slowVerdictTtlMs` (7 dias), no `localStorage`. A decisão vem de uma execução real **neste** aparelho com **este** modelo, e não de `deviceMemory` ou do número de núcleos.

!!! warning "Texto em loop conta como falha"
    Um modelo pode "terminar" com lixo em vez de dar erro. No Chromium 159 com WebGPU num ambiente headless, o whisper-tiny fp16 devolveu `"Wars!!!!…"` por 224 tokens. O SDK aplica o teste do Whisper de referência: razão de compressão do texto (`compressionRatio`) acima de **2,4**, ou o decoder sem terminar, marca `degenerate`, e a gravação vai ao servidor. Medido: fala real comprime 1,0 a 1,34×; aquele loop, 14,9×.

## A primeira gravação, com o modelo ainda baixando

Com `whileLoading: "background"` (o default), a primeira gravação vai ao servidor enquanto o modelo baixa, e as seguintes rodam no aparelho. Com `"wait"`, o `transcribe` espera o download e responde do aparelho. Sem servidor disponível, ele sempre espera.

Para baixar antes, num momento bom (Wi-Fi, app ocioso), chame `warmUp()`:

```typescript
import { createSpeechToText, loadWhisper } from "tempest-react-sdk/speech";

const fala = createSpeechToText({
    loadModel: () => loadWhisper({ baseUrl: "/models/whisper-base" }),
    language: "pt",
});

export function aquecerQuandoOcioso(): void {
    const conexao = (navigator as { connection?: { type?: string } }).connection;
    if (conexao?.type === "cellular") return;
    const ocioso = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1000));
    ocioso(() => void fala.warmUp());
}
```

## Backend que transcreve **e** interpreta

Se o seu servidor não devolve só o texto, e sim a resposta inteira (uma busca já interpretada, o resultado de um job), deixe o `server` devolver essa resposta e diga em `serverText` onde está o texto. Ela volta intacta em `resultado.server`. Na rota do aparelho, o app manda o `text` para o endpoint de texto:

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

## Antes de oferecer o botão: `assessSpeechDevice`

```typescript
import { assessSpeechDevice } from "tempest-react-sdk/speech";

const aparelho = assessSpeechDevice();
if (!aparelho.canRun) console.log("vai para o servidor:", aparelho.blockers);
console.log(aparelho.wasmThreads, aparelho.webgpu, aparelho.deviceMemoryGb);
```

Síncrono e sem carregar nada. Só descarta o claramente impossível: sem WebAssembly, sem SIMD (o ONNX Runtime Web só tem builds SIMD), ou `deviceMemory` abaixo de `minMemoryGb` (2 GiB). Se o aparelho é lento, quem decide é o prazo. `wasmThreads: false` quer dizer que a página não está [isolada](speech.md#threads-isolamento-cross-origin): o modelo roda numa thread, 2,3× mais lento.

## Opções do `createSpeechToText`

| Opção | Default | O que faz |
| --- | --- | --- |
| `loadModel` | — | Carrega o modelo uma vez: `() => loadWhisper({ … })`. |
| `server` | — | `(audio, { signal, language, prompt }) => Promise<texto ou resposta>`. Sem ele, só aparelho. |
| `serverText` | — | Onde está o texto na resposta do `server`, quando ela não é uma string. |
| `isServerAvailable` | sempre `true` com `server` | Health check, feature flag, `navigator.onLine`. Pode ser assíncrono. |
| `language` | detectado | Idioma, para as duas rotas. |
| `prompt` | — | Vocabulário esperado, para as duas rotas. |
| `realtimeFactor` | `1` | Prazo do aparelho = duração do áudio × este fator. |
| `minBudgetMs` | `4000` | Prazo mínimo, para um clipe de 1 s não ser julgado pelo ruído. |
| `whileLoading` | `"background"` | Modelo não carregado: `"background"` responde do servidor, `"wait"` espera o modelo. |
| `slowVerdictTtlMs` | 7 dias | Quanto tempo o aparelho lento fica marcado. |
| `storage` | `localStorage` | Onde o veredito fica. `null` guarda só em memória. |
| `assessDevice` | `assessSpeechDevice` | Troca a checagem do aparelho (útil em teste). |

## Recap

- `createSpeechToText({ loadModel, server, isServerAvailable, language, prompt })` → `transcribe(blob)` → `{ text, source, reason, transcription, server }`.
- O `server` recebe `{ signal, language, prompt }`. Se ele lançar, a gravação volta para o aparelho.
- O aparelho tem prazo de duração × `realtimeFactor` (mínimo 4 s). Se estourar, a gravação vai ao servidor e o aparelho fica marcado como lento por 7 dias.
- Texto em loop (`compressionRatio` > 2,4) conta como falha.
- Modelo ainda não carregado: o servidor responde e o modelo baixa em segundo plano. `warmUp()` baixa antes.
- `serverText` mantém a resposta inteira do backend em `resultado.server`.
