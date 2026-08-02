# Upload resumível (tus)

`uploadWithProgress` faz **uma** request. Isso funciona até o arquivo ficar grande: um áudio de 40 minutos gravado com `useAudioRecorder`, um vídeo, um dump. Aí um 4G que oscila por três segundos joga fora 300 MB já enviados, e recarregar a página joga fora tudo de novo.

`createResumableUpload` divide o arquivo em chunks, guarda onde parou e continua — depois de uma queda de rede **ou** de um reload.

!!! info "Protocolo: tus 1.0.0, não um esquema nosso"
    O cliente fala [tus](https://tus.io) (core + as extensões *creation* e *termination*). Isso é deliberado: um cliente resumível de formato próprio obriga o backend a ser sempre nosso. Com tus você pode apontar para `tusd`, `tus-node-server` ou `py-tus` sem escrever servidor nenhum — e a seção [O que o backend precisa implementar](#o-que-o-backend-precisa-implementar) cabe numa tabela.

## O exemplo mínimo

```tsx
import { createResumableUpload, type ResumableUpload } from "tempest-react-sdk";
import { useRef, useState } from "react";

export function EnviarGravacao({ file }: { file: File }) {
  const upload = useRef<ResumableUpload | null>(null);
  const [percent, setPercent] = useState(0);
  const [state, setState] = useState("idle");

  async function start() {
    upload.current ??= createResumableUpload({
      endpoint: "/api/uploads",
      file,
      metadata: { filename: file.name },
      onProgress: ({ fraction }) => setPercent(Math.round(fraction * 100)),
      onStateChange: setState,
    });

    const done = await upload.current.start();
    if (done) await fetch(`/api/gravacoes?url=${encodeURIComponent(done.url)}`, { method: "POST" });
  }

  return (
    <>
      <progress value={percent} max={100} />
      <button type="button" onClick={() => void start()}>Enviar</button>
      <button type="button" onClick={() => upload.current?.pause()}>Pausar</button>
      <button type="button" onClick={() => void upload.current?.resume()}>Continuar</button>
      <button type="button" onClick={() => void upload.current?.abort({ discard: true })}>
        Cancelar
      </button>
      <p>{state}</p>
    </>
  );
}
```

O que acontece: um `POST` cria o upload, uma sequência de `PATCH` empurra 5 MiB por vez, `onProgress` recebe cada tick de bytes, e no fim `start()` resolve com `{ url, size }` — a URL tus, que você grava junto do registro.

!!! tip "`start()` resolve `null` quando você pausou ou cancelou"
    Só uma **falha** rejeita. `pause()` e `abort()` não são falhas, então a promessa resolve `null` e você não precisa de `try/catch` em volta de um botão de pausar.

## Estados

`upload.state` (e o `onStateChange`) passa por:

| Estado | Significado |
| --- | --- |
| `idle` | Nada começou |
| `creating` | O `POST` de criação está em voo |
| `uploading` | Chunks indo |
| `paused` | `pause()` — o ponto de retomada **fica** guardado |
| `done` | Terminou; o registro persistido foi apagado |
| `error` | As tentativas acabaram; `start()` rejeitou |
| `aborted` | `abort()` — com `discard: true`, o registro foi apagado |

## Retomar depois de um reload

É o motivo de existir. O cliente guarda `{ url, offset, size, idempotencyKey }` sob uma **chave de retomada** e, no próximo `start()`, reencontra o upload:

```ts
const upload = createResumableUpload({ endpoint: "/api/uploads", file });
// Recarregou a página, o usuário escolheu o mesmo arquivo, chamou start() de novo:
// → HEAD no upload antigo, offset volta em 312 MB, os PATCH continuam de lá.
```

A chave padrão é uma impressão digital de `endpoint + nome + tamanho + tipo + lastModified` — o mesmo critério dos clientes tus de referência. Barato (não hasheia 400 MB) e muda sempre que o arquivo muda, que é a propriedade importante: retomar dentro do arquivo errado corromperia os dois.

!!! warning "Um `Blob` sem nome tem impressão digital fraca"
    `Blob` não tem `name` nem `lastModified`, então dois blobs do mesmo tamanho e tipo colidem. Passe `key` explícito quando o que você envia não é um `File`.

### Onde o estado mora

Por padrão, `localStorage`, via `createLocalUploadStorage()`. **Não** IndexedDB, e isso é escolha: o registro tem quatro campos e uma URL, o requisito é só sobreviver a um reload, e puxar Dexie pra isso colocaria IndexedDB no bundle de todo app que envia um arquivo.

Se o seu app já tem um banco Dexie aberto, plugue o seu:

```ts
import { createOfflineStore, createResumableUpload } from "tempest-react-sdk";

const store = createOfflineStore<{ id: string; record: unknown }, string>({
  databaseName: "Uploads",
  version: 1,
  tableName: "resume",
  indexes: "&id",
});

createResumableUpload({
  endpoint: "/api/uploads",
  file,
  storage: {
    get: async (key) => ((await store.get(key))?.record ?? null) as never,
    set: (key, record) => store.put({ id: key, record }),
    delete: (key) => store.delete(key),
  },
});
```

`storage: null` desliga a persistência: aí a retomada sobrevive a uma queda de rede, mas não a um reload.

## A falha que realmente acontece

Não é o chunk que se perde. É o chunk que o **servidor gravou e cuja resposta não voltou**. O cliente não distingue isso de um chunk perdido, e reenviar às cegas duplicaria bytes.

Duas coisas impedem:

**1. Escritas são endereçadas, não anexadas.** Todo `PATCH` declara o offset em que escreve (`Upload-Offset`). Se a resposta se perdeu e o cliente repetir, ele está pedindo pra escrever bytes que o servidor já tem — e leva `409`. Em **qualquer** retentativa, o cliente relê a verdade com `HEAD` antes de escrever e continua de onde o servidor realmente está.

**2. A criação leva `Idempotency-Key`.** O tus não tem criação idempotente; sem isso, um `201` perdido deixaria um upload órfão no servidor e o cliente criaria um segundo. A chave (de `generateIdempotencyKey`) é gravada **antes** da primeira tentativa e reusada na retentativa. Backend que honra o header devolve o mesmo `Location`; backend que ignora funciona igual, só fica com o órfão.

!!! tip "O backoff é o `retry` do SDK"
    Não existe um segundo backoff aqui: cada chunk roda dentro do [`retry`](./http.md#retry-backoff-exponencial) — exponencial, com `Retry-After` respeitado. Ajuste por `retry: { retries, initialDelay, shouldRetry }`.

## O que o backend precisa implementar

Toda request leva `Tus-Resumable: 1.0.0`.

| Passo | Request | Resposta esperada |
| --- | --- | --- |
| Criar | `POST {endpoint}` + `Upload-Length`, `Upload-Metadata`, `Idempotency-Key` | `201` + `Location` (URL do upload, absoluta ou relativa) |
| Sondar | `HEAD {uploadUrl}` | `200`/`204` + `Upload-Offset` |
| Escrever | `PATCH {uploadUrl}` + `Upload-Offset`, `Content-Type: application/offset+octet-stream`, corpo = chunk | `204` + o novo `Upload-Offset`; `409` quando o offset não bate |
| Descartar | `DELETE {uploadUrl}` | `204` |

Detalhes que costumam morder:

- **`Location` pode ser relativo.** O cliente resolve contra a página, então `/api/uploads/abc` serve.
- **`Upload-Metadata`** é `chave base64(valor)` separado por vírgula, com o valor em **UTF-8 antes** do base64 — é assim que `nota-ação.webm` sobrevive a um header HTTP.
- **`HEAD` respondendo `404`/`410`** é lido como "o servidor esqueceu esse upload": o cliente recria do zero em vez de travar.
- **`Upload-Offset` ausente num `PATCH` bem-sucedido** é tolerado — o cliente assume o fim do chunk —, mas mandar é melhor.
- Reflita o `Idempotency-Key` numa tabela de chaves se quiser evitar órfãos.

!!! info "Servidor pronto"
    `tusd` (Go), `tus-node-server` (Node) e `tuspy`/`py-tus` (Python) já implementam a tabela. Num FastAPI próprio são quatro rotas.

## Progresso e pausa, com precisão

```ts
const upload = createResumableUpload({
  endpoint: "/api/uploads",
  file,
  chunkSize: 1024 * 1024, // 1 MiB: tick mais fino, mais round-trips
  getToken: () => auth.getToken(),
  withCredentials: true,
  retry: { retries: 8, initialDelay: 500 },
  onProgress: ({ loaded, total, fraction, resumedFrom }) => {
    console.log(`${loaded}/${total} (${Math.round(fraction * 100)}%), retomou em ${resumedFrom}`);
  },
});
```

- `onProgress` recebe **bytes do arquivo inteiro**, não do chunk. `resumedFrom` diz quantos já estavam no servidor quando esta execução começou — útil pra não anunciar "0%" num upload que retomou em 80%.
- `pause()` derruba o chunk em voo; o offset persistido continua o do último chunk **confirmado**. O `resume()` faz `HEAD` primeiro, então bytes parciais que o servidor aceitou não se perdem.
- `abort({ discard: true })` manda `DELETE` e apaga o registro; sem `discard`, o ponto de retomada fica.

!!! warning "`XMLHttpRequest`, não `fetch`"
    Como em `uploadWithProgress`: `fetch` ainda não reporta progresso de **upload** em navegador nenhum. Aqui há um segundo motivo — o tus devolve o novo offset num **header de resposta**, e `uploadWithProgress` só entrega corpo parseado, então não dava pra reaproveitar.

## Resumo

- **`createResumableUpload({ endpoint, file })`** — chunks de 5 MiB, retomada por rede e por reload, protocolo tus 1.0.0.
- **`start()` / `pause()` / `resume()` / `abort({ discard })`**; `start()` resolve `null` quando você parou de propósito.
- O ponto de retomada mora em `localStorage` por padrão; troque por `storage`, desligue com `null`.
- Resposta perdida é resolvida por **offset endereçado + `HEAD` antes de cada retentativa**, e a criação por **`Idempotency-Key`**.
- Backoff é o `retry` do SDK — não existe um segundo.

### Veja também

- [HTTP](./http.md) — `uploadWithProgress` (uma request), `retry`, `generateIdempotencyKey`
- [Áudio](./audio.md) — `useAudioRecorder`, que produz os arquivos longos que motivaram isso
- [Offline](./offline.md) — `createOfflineStore`, se você preferir IndexedDB pro estado de retomada
