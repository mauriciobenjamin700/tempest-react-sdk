# Offline Sync com `tempest-fastapi-sdk`

Esta receita liga o **frontend** (`tempest-react-sdk`) ao **backend** (`tempest-fastapi-sdk`) num fluxo offline-first completo: o app continua usável sem rede, grava localmente, e sincroniza com o servidor quando a conexão volta — sem perder nada e sem duplicar.

Ela é o par desta receita do backend: **[Offline-First Sync — tempest-fastapi-sdk](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/)**. Leia as duas juntas: o contrato (endpoints, watermark, tombstones) vem do backend; aqui montamos o lado do navegador.

## As duas metades

```text
┌─────────────── navegador (tempest-react-sdk) ───────────────┐      ┌──────── servidor (tempest-fastapi-sdk) ────────┐
│  createOfflineStore (IndexedDB)   ← fonte de verdade local   │      │  GET /api/analyses/changes  → delta (since)     │
│  createApiClient                  → push (upsert por id)     │ ───► │  PUT /api/analyses/{id}     → upsert idempotente │
│  installBackgroundSync (SW)       → fila + replay offline    │      │  soft delete (is_deleted/deleted_at)            │
└──────────────────────────────────────────────────────────────┘      └─────────────────────────────────────────────┘
```

- **Pull** (servidor → local): busca só o que mudou desde o último `server_time` (watermark), pagina até esgotar, aplica upserts e tombstones no store local.
- **Push** (local → servidor): cada mutação usa um `id` gerado no cliente e faz **upsert** — então repetir a chamada não duplica. O service worker enfileira o que falhar offline e **reenvia sozinho** quando volta a rede.

!!! info "Por que isso funciona com replay automático"
    O contrato do backend é **upsert por `id` do cliente** (idempotente) + **last-write-wins por `updated_at`**. Isso é exatamente o que torna o `installBackgroundSync` seguro: reenviar a mesma mutação N vezes converge pro mesmo estado.

## O jeito rápido: `createOfflineSync`

O `createOfflineSync` empacota o motor inteiro — **outbox** durável (IndexedDB), **flush single-flight** (push → pull), **guarda de offline**, **loop de paginação** e **watermark** — atrás de três callbacks de transporte. Você diz *como* entregar uma mutação, *como* buscar uma página do delta e *como* aplicar um item; o SDK cuida do resto.

```ts
// src/sync/engine.ts
import { encodeIdSegment, createOfflineSync } from "tempest-react-sdk";
import { api } from "@/lib/api";
import { analyses } from "./store"; // createOfflineStore
import { fromDto, toPayload, type Analysis, type AnalysisDto } from "./types";

export const sync = createOfflineSync<Analysis, AnalysisDto>({
  databaseName: "AnalysesOutbox",
  watermark: { storageKey: "analyses.watermark" },

  // push: entregue uma mutação da fila
  deliver: async (entry) => {
    if (entry.op === "delete") {
      await api.delete(`/api/analyses/${encodeIdSegment(entry.recordId)}`);
      return;
    }
    await api.put(`/api/analyses/${encodeIdSegment(entry.recordId)}`, { body: toPayload(entry.payload!) });
  },

  // pull: uma página do delta desde o watermark
  pullPage: async (since, cursor) => {
    const page = await api.get<{ items: AnalysisDto[]; next_cursor: string | null; server_time: string }>(
      "/api/analyses/changes",
      { params: { since: since ?? undefined, cursor: cursor ?? undefined } },
    );
    return { items: page.items, nextCursor: page.next_cursor, serverTime: page.server_time };
  },

  // applyRemote: funda um item do servidor no store local (você é dono do conflito)
  applyRemote: async (dto) => {
    if (dto.is_deleted) {
      await analyses.delete(dto.id);
      return;
    }
    const local = await analyses.get(dto.id);
    // last-write-wins: preserva uma edição local pendente que seja mais nova
    if (local?.pending && local.updated_at > dto.updated_at) return;
    await analyses.put(fromDto(dto));
  },
});
```

Uso na UI:

```ts
// grava local, enfileira e dispara o flush
await analyses.put({ ...record, pending: true });
await sync.enqueue(record.createdOnServer ? "update" : "create", record.id, record);
await sync.flush("after-mutation");

sync.pendingCount(); // badge de pendências
sync.resetWatermark(); // no logout / troca de conta
sync.clearOutbox();
```

!!! tip "Quando sincronizar"
    Dispare `sync.flush("boot")` no boot, `sync.flush("online-event")` quando a rede voltar (veja `useOnline`), e no handler de web push. O flush é single-flight — gatilhos concorrentes colapsam num único run — e é **pulado sozinho** quando offline (`summary.skipped`).

!!! info "Entregas que falham ficam na fila"
    Se `deliver` lança, a entrada **permanece** na outbox com `attempts` incrementado e `lastError` gravado — o próximo flush tenta de novo. Combine com `installBackgroundSync` no service worker para reenviar mesmo com o app fechado.

!!! info "Logout encerra o flush que estiver em andamento"
    `resetWatermark()` e `clearOutbox()` encerram a sessão também para um flush que
    já começou. Daquele ponto em diante o run **não entrega** mais nenhuma entrada,
    **não pede** a próxima página, **não aplica** item puxado e **não grava** o
    watermark — nada do usuário que saiu atravessa para o próximo. O run resolve com
    `summary.interrupted: true`, e um `sync.flush()` chamado depois do logout
    começa um run novo em vez de esperar o abandonado.

    O que não dá para desfazer é o `deliver` que **já estava no ar** no instante do
    logout: ele foi emitido na sessão anterior. A linha dele sai da fila (ou ganha
    `attempts`), mas `onEntryDelivered`/`onEntryFailed` não disparam, porque agiriam
    sobre o estado local do próximo usuário.

    Escopo: a cerca é por aba. Com `crossTab`, uma entrada que outra aba apagou da
    outbox compartilhada não é entregue, mas o pull em andamento noutra aba só para
    quando aquela aba também chamar `resetWatermark()`/`clearOutbox()`.

!!! tip "Cada entrada tem dono: `getPrincipal`"
    `clearOutbox()` no logout esvazia a fila. Para o app que esquece — ou a sessão que acaba sem logout (token vencido, aba fechada) —, passe `getPrincipal`: cada entrada ganha a impressão de quem estava logado ao enfileirar (`entry.owner`, nunca o id), e o flush confere de novo antes de cada `deliver`:

    | Quem está logado agora | O que acontece com a entrada |
    | --- | --- |
    | o mesmo dono | entregue |
    | ninguém | fica na fila (`summary.held`) e sai quando o dono voltar |
    | outra pessoa | apagada sem envio (`summary.dropped`) — ou, com `foreignEntries: "hold"`, fica na fila (`summary.held`) |

    ```ts
    import { createOfflineSync } from "tempest-react-sdk";

    let currentUserId: string | null = "user-a";

    const sync = createOfflineSync<{ text: string }, { id: string }>({
        databaseName: "NotesOutbox",
        watermark: { storageKey: "notes.watermark" },
        deliver: async (entry) => {
            await fetch(`/api/notes/${entry.recordId}`, {
                method: "PUT",
                body: JSON.stringify(entry.payload),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
        getPrincipal: () => currentUserId,
    });

    await sync.enqueue("update", "n1", { text: "rascunho de A" });
    currentUserId = "user-b";
    const summary = await sync.flush();
    console.log(summary.dropped); // 1 — a edição de A não sai com a sessão de B
    ```

    Entrada enfileirada antes de você ligar a opção não tem carimbo e é entregue como antes: são edições do próprio usuário, e segurá-las travaria toda fila no upgrade.

!!! tip "Aparelho compartilhado: `foreignEntries: \"hold\"`"
    O padrão `"drop"` serve ao aparelho pessoal: a fila da conta anterior só acumularia. No **tablet compartilhado** ele apaga trabalho — o Carlos sai sem sinal com três vistorias na fila, a Ana entra, sincroniza, e as três somem sem envio (#724). Com `foreignEntries: "hold"`, a entrada de outra pessoa **fica na fila** e sai quando o dono entrar de novo, com a sessão dele:

    ```ts
    import { createOfflineSync } from "tempest-react-sdk";

    let technicianId: string | null = "carlos";

    const sync = createOfflineSync<{ text: string }, { id: string }>({
        databaseName: "VisitsOutbox",
        watermark: { storageKey: "visits.watermark" },
        deliver: async (entry) => {
            await fetch(`/api/visits/${entry.recordId}`, {
                method: "PUT",
                body: JSON.stringify(entry.payload),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
        getPrincipal: () => technicianId,
        foreignEntries: "hold",
    });

    await sync.enqueue("update", "v1", { text: "vistoria do Carlos" });
    technicianId = "ana";
    console.log((await sync.flush()).held); // 1 — fica na fila, não sai com a sessão da Ana
    technicianId = "carlos";
    console.log((await sync.flush()).succeeded); // 1 — sai quando o Carlos volta
    ```

    Em nenhuma das duas políticas a entrada sai com a sessão de outra pessoa. O que muda:

    - **A ordem por registro continua valendo.** Uma entrada segurada segura também as seguintes **do mesmo registro** (`summary.deferred`), como uma falha: se a edição mais nova da Ana saísse antes, a do Carlos, mais velha, a sobrescreveria quando ele voltasse. Vale também no padrão: uma edição feita deslogado não passa mais na frente da edição segurada do dono.
    - **`pendingCount()` e o `pending` do `useOfflineSync` contam as entradas seguradas** — o badge da Ana mostra que há trabalho do Carlos no aparelho. `clearOutbox()` continua sendo o que esvazia a fila.
    - Com `"hold"`, entrada enfileirada **deslogado** também fica segurada (no padrão, é apagada), e só sai de novo com ninguém logado.

!!! danger "A ordem por registro é preservada na falha — e antes não era"
    Quando uma entrada falha, as **demais entradas daquele mesmo registro** ficam
    sem ser tentadas nesta passada, e voltam na próxima na ordem original. Elas
    aparecem em `summary.deferred`, separadas de `summary.failed`, porque nunca
    foram enviadas.

    Isso importa porque `deliver` normalmente é um `PUT` upsert. Sem a regra, um
    `create` que falha seguido de um `update` do mesmo registro entregava o
    **update primeiro**: o servidor criava o registro pelo payload do update, e o
    `create` reenviado depois sobrescrevia com o snapshot **mais antigo**. A edição
    do usuário desaparecia sem erro em lugar nenhum.

    O bloqueio é **por registro, não por passada**: um registro que o servidor está
    recusando não segura as mutações de nenhum outro.

!!! tip "Dez edições, um request: `coalesce`"
    Sem rede, o técnico edita a mesma visita dez vezes. Por padrão isso vira **dez**
    `deliver` quando o sinal volta — nove deles mandando um snapshot que o décimo
    sobrescreve. Com `coalesce: true`, cada sequência de `create`/`update` do mesmo
    registro vira **um** `deliver`:

    | O que vai para o `deliver` | De onde vem |
    | --- | --- |
    | `op` | da entrada **mais antiga** — `create` seguido de `update`s continua `create` |
    | `payload` | da **mais nova** (`true`) ou o fold de todas, da mais antiga para a mais nova (função) |
    | `id`, `attempts`, `lastError` | da mais antiga — uma chave de idempotência tirada de `entry.id` não muda entre tentativas |

    ```ts
    import { createOfflineSync } from "tempest-react-sdk";

    interface Note {
        id: string;
        text?: string;
        pinned?: boolean;
    }

    const sync = createOfflineSync<Note, never>({
        databaseName: "NotesOutbox",
        watermark: { storageKey: "notes.watermark" },
        deliver: async (entry) => {
            await fetch(`/api/notes/${entry.recordId}`, {
                method: entry.op === "delete" ? "DELETE" : "PUT",
                body: JSON.stringify(entry.payload),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
        coalesce: true,
    });

    await sync.enqueue("create", "n1", { id: "n1", text: "a" });
    await sync.enqueue("update", "n1", { id: "n1", text: "b" });
    await sync.enqueue("update", "n1", { id: "n1", text: "c" });
    const summary = await sync.flush();
    console.log(summary.succeeded, summary.coalesced); // 1 2 — um PUT com o texto "c"
    ```

    Se a fila guarda **patch** em vez de snapshot, passe uma função de merge:
    `coalesce: (acumulado, proximo) => ({ ...acumulado, ...proximo })`.

    O que **não** se junta, de propósito:

    - **`delete` nunca entra no fold** e fecha a sequência: `create`, `update`,
      `delete` vira `create` (payload mais novo) e depois `delete`, dois requests em
      ordem. Descartar o par deixaria o registro órfão no servidor sempre que o
      `create` tivesse chegado e só a resposta tivesse se perdido.
    - **Entradas de donos diferentes** (`getPrincipal`) não se juntam.
    - **O que foi enfileirado durante o envio** fica para o próximo flush. O fold
      acontece quando o run entrega, não quando o `enqueue` grava — por isso
      `pendingCount()` ainda conta cada entrada até o flush. Reescrever a entrada no
      `enqueue` arriscaria apagar, junto com as outras, uma edição que chegou
      enquanto aquele registro estava no ar.

    Na falha, as entradas juntadas continuam na fila: só a mais antiga ganha
    `attempts`, e as outras contam em `summary.deferred`. No sucesso, todas saem e
    as absorvidas contam em `summary.coalesced`.

    O envio juntado sai **na posição da entrada mais antiga**, levando o estado mais
    novo. Se uma edição recente do registro A aponta para um registro B criado
    **depois** que A entrou na fila, A pode chegar ao servidor antes de B. Deixe a
    opção desligada quando o servidor valida esse tipo de referência na escrita.

!!! tip "Foto junto do registro: `attachments`"
    A vistoria tem fotos, e o `PUT` da visita leva as URLs delas. Enfileirar cada foto
    como **entrada própria** quebra a ordem: o motor só ordena entradas do **mesmo
    registro**, e um registro que falha não segura os outros — a visita chega ao
    servidor apontando para uma foto que ainda não subiu. Com `attachments`, o motor
    sobe os arquivos com o [`createResumableUpload`](./resumable-upload.md) **antes**
    do `deliver` da entrada, e entrega as URLs em `entry.attachments`:

    | Gancho | O que faz |
    | --- | --- |
    | `list(entry)` | lê do **store do app** os anexos da entrada: `{ id, blob, uploadedUrl }[]`. Quem já tem `uploadedUrl` não sobe de novo |
    | `upload(anexo)` | devolve as opções do `createResumableUpload` (`endpoint`, `getToken`, `chunkSize`…). O `file` é o blob; a `key` padrão é `outbox-attachment:<id>` |
    | `onUploaded(anexo, url)` | grava a URL no store do app — e é onde você libera o blob, ou guarda só uma miniatura |

    ```ts
    import { createOfflineSync, createOfflineStore } from "tempest-react-sdk";

    interface Visit {
        id: string;
        photoIds: string[];
    }

    interface Photo {
        id: string;
        blob: Blob | null;
        uploadUrl: string | null;
    }

    const photos = createOfflineStore<Photo, string>({
        databaseName: "Visits",
        version: 1,
        tableName: "photos",
        indexes: "&id",
        keyPath: "id",
    });

    const sync = createOfflineSync<Visit, never>({
        databaseName: "VisitsOutbox",
        watermark: { storageKey: "visits.watermark" },
        attachments: {
            list: async (entry) => {
                const ids = entry.payload?.photoIds ?? [];
                const rows = await Promise.all(ids.map((id) => photos.get(id)));
                return rows.flatMap((photo) =>
                    photo ? [{ id: photo.id, blob: photo.blob, uploadedUrl: photo.uploadUrl }] : [],
                );
            },
            upload: () => ({ endpoint: "/api/uploads", chunkSize: 256 * 1024 }),
            onUploaded: async (photo, url) => {
                await photos.update(photo.id, { uploadUrl: url, blob: null });
            },
        },
        deliver: async (entry) => {
            await fetch(`/api/visits/${entry.recordId}`, {
                method: "PUT",
                body: JSON.stringify({
                    ...entry.payload,
                    photos: entry.attachments?.map((ref) => ref.url) ?? [],
                }),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
    });

    sync.subscribe((state) => {
        console.log(state.uploadedBytes, state.totalBytes, state.pendingBytes);
    });
    ```

    O anexo herda tudo que a entrada já tem:

    - **Falha é falha da entrada.** Upload recusado, ou `start()` que resolve `null`
      (pausado ou abortado), conta como um `deliver` que lançou: `attempts` sobe, as
      próximas edições do registro esperam, o próximo flush tenta de novo — e o
      `deliver` **não** é chamado, porque a visita apontaria para nada.
    - **Queda retoma do offset.** A `key` por anexo é a mesma entre runs, então o
      próximo flush faz `HEAD` + `PATCH` de onde parou, não um `POST` novo.
    - **Dono e `coalesce` vêm antes.** Entrada segurada ou apagada pelo
      `getPrincipal`/`foreignEntries` não sobe nada; com `coalesce`, o `list` recebe a
      entrada juntada, com o payload mais novo.
    - **Troca de conta no meio do upload também para.** O dono é conferido de novo
      depois de cada passo dos anexos (`list`, `upload`, cada arquivo) e logo antes
      do `deliver`: se outra pessoa entrou — noutra aba, ou num login depois do token
      vencido sem `resetWatermark()` —, os arquivos que faltam não sobem e a entrada
      fica na fila (`summary.held`, segurando as próximas edições do registro) ou é
      apagada (`summary.dropped`), conforme o `foreignEntries`. O `getPrincipal` do
      motor vale também para o upload cujas opções não trazem `getPrincipal` (nem o
      `getToken` do preset): o arquivo em envio para antes do próximo chunk, em vez de
      terminar com o token da conta nova. O que já subiu fica no servidor, e o dono
      termina o resto quando voltar.
    - **Logout no meio do upload** (`clearOutbox()`/`resetWatermark()`) para o run
      antes do `deliver` e não chama o `onUploaded`, que escreveria no store do
      próximo usuário. O registro de retomada guarda o offset final, então o envio
      do dono, quando ele voltar, termina sem reenviar um byte.

    O **blob mora no store do app**, nunca na outbox: a fila guarda só o snapshot do
    registro, sem duplicar o arquivo. O progresso aparece no `SyncState`:

    | Campo | O que é |
    | --- | --- |
    | `uploadedBytes` / `totalBytes` | bytes do anexo **em envio agora** (`0`/`0` quando nenhum) |
    | `pendingBytes` | soma dos anexos que ainda não subiram, pelo `list()` de cada entrada da fila, cada arquivo uma vez |
    | `persisted` | `navigator.storage.persisted()`, ou `null` onde a API não existe |

    O motor **lê** `persisted`, mas não pede persistência: no Firefox o
    `requestPersistentStorage()` abre um pedido de permissão, e pedido que aparece do
    nada no meio de um sync em segundo plano é pedido negado. Chame no login ou na
    instalação. A receita [App de campo offline](./recipes/field-app-offline.md)
    monta isso inteiro: compressão antes de gravar, blob liberado no `onUploaded` e o
    aviso de armazenamento com `pendingBytes`.

As seções abaixo mostram **o que o motor faz por baixo** (e como montar à mão quando você precisa de controle fino — múltiplos stores, merge por campo, etc.).

## Pré-requisitos

1. Backend com a receita offline-sync do `tempest-fastapi-sdk` (endpoint `GET /api/analyses/changes` + rota de upsert).
2. `dexie` instalado (peer do `createOfflineStore`): `npm i dexie`.
3. Um app PWA — gere com `create-tempest-app --pwa` (já traz o service worker). Veja [Scaffold › PWA](./scaffold.md#modo-pwa-pwa).

## 1. O modelo

Espelhe a entidade do backend. O `id` é **gerado no cliente** (UUID) e `updated_at` é a chave de conflito:

```ts
// src/sync/types.ts
export interface Analysis {
  id: string; // UUID gerado no cliente (crypto.randomUUID)
  user_id: string;
  animal_id: string;
  notes: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601 — last-write-wins
  is_deleted: boolean;
  deleted_at: string | null;
}

/** Resposta de GET /api/analyses/changes (SyncPaginationSchema do backend). */
export interface ChangesResponse {
  items: Analysis[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  server_time: string; // watermark — guarde para o próximo `since`
}
```

## 2. O store local (IndexedDB)

```ts
// src/sync/store.ts
import { createOfflineStore } from "tempest-react-sdk";
import type { Analysis } from "./types";

/** Fonte de verdade offline, escopada por usuário. */
export const analyses = createOfflineStore<Analysis, string>({
  databaseName: "FamachaOffline",
  version: 1,
  tableName: "analyses",
  indexes: "&id, user_id, updated_at",
  ownerField: "user_id",
});
```

## 3. Pull — baixar o delta

Drena todas as páginas desde o watermark, aplica upserts e remove tombstones, e **só então** persiste o novo `server_time`. A regra de ouro do backend: o próximo `since` é o `server_time` da resposta, **nunca** o relógio do cliente.

```ts
// src/sync/pull.ts
import { analyses } from "./store";
import { api } from "@/lib/api";
import type { Analysis, ChangesResponse } from "./types";

const sinceKey = (userId: string) => `sync:analyses:since:${userId}`;

/** Sincroniza o servidor → local. Idempotente: pode rodar quantas vezes quiser. */
export async function pullAnalyses(userId: string): Promise<void> {
  const since = localStorage.getItem(sinceKey(userId)) ?? undefined;
  let cursor: string | undefined;
  let serverTime: string | undefined;

  do {
    const page = await api.get<ChangesResponse>("/api/analyses/changes", {
      params: { since, cursor, limit: 100, include_deleted: true },
    });

    const live = page.items.filter((a) => !a.is_deleted);
    const tombstones = page.items.filter((a) => a.is_deleted);

    if (live.length) await analyses.bulkPut(live, userId);
    for (const dead of tombstones) await analyses.delete(dead.id);

    serverTime ??= page.server_time; // snapshot da 1ª página
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  if (serverTime) localStorage.setItem(sinceKey(userId), serverTime);
}
```

!!! warning "Primeira sincronia drena tudo"
    Sem `since`, o backend devolve o estado completo paginado. O loop acima respeita `has_more` e `next_cursor` até esgotar — não pare na primeira página.

## 4. Push — mutações offline-first

Grave **primeiro no local** (UI responde na hora), depois faça o upsert no servidor. Como o `id` é do cliente e a rota é upsert, o reenvio é seguro:

```ts
// src/sync/push.ts
import { encodeIdSegment } from "tempest-react-sdk";
import { analyses } from "./store";
import { api } from "@/lib/api";
import type { Analysis } from "./types";

export async function saveAnalysis(
  userId: string,
  input: { animal_id: string; notes: string; id?: string },
): Promise<Analysis> {
  const now = new Date().toISOString();
  const existing = input.id ? await analyses.get(input.id) : undefined;

  const record: Analysis = {
    id: input.id ?? crypto.randomUUID(),
    user_id: userId,
    animal_id: input.animal_id,
    notes: input.notes,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    is_deleted: false,
    deleted_at: null,
  };

  // 1. Local primeiro — a UI nunca espera a rede.
  await analyses.put(record, userId);

  // 2. Upsert no servidor (idempotente por id). Se falhar offline, o
  //    service worker enfileira e reenvia sozinho (passo 5).
  await api.put(`/api/analyses/${encodeIdSegment(record.id)}`, { body: record });

  return record;
}

/** Soft delete: marca tombstone local + propaga. */
export async function deleteAnalysis(userId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await analyses.update(id, { is_deleted: true, deleted_at: now, updated_at: now });
  await api.put(`/api/analyses/${encodeIdSegment(id)}`, {
    body: { ...(await analyses.get(id)) },
  });
}
```

## 5. Background sync no service worker

No `src/sw.ts` (gerado pelo `--pwa`), enfileire as mutações de `/api/analyses` que falharem offline — elas são reenviadas quando a conexão voltar:

```ts
// src/sw.ts
import { installBackgroundSync } from "tempest-react-sdk/sw";

installBackgroundSync({
  match: (url) => url.pathname.startsWith("/api/analyses"),
});
```

Isso cobre **PUT/POST/PATCH/DELETE**. O `saveAnalysis` acima já gravou local, então a UI não trava: o `await api.put(...)` rejeita offline, o SW guarda a requisição numa fila IndexedDB e a replaya no evento `sync` (ou no próximo request, em navegadores sem Background Sync API). Como o upsert é idempotente, o replay converge. Detalhes em [Web Push & Service Worker](./push.md).

## 6. Quando sincronizar

Dispare um `pullAnalyses` no boot, ao voltar online e periodicamente:

```ts
// src/sync/index.ts
import { pullAnalyses } from "./pull";
import { useAuth } from "@/stores/auth";

export function startSync(): void {
  const userId = useAuth.getState().user?.id;
  if (!userId) return;

  const run = () => void pullAnalyses(userId).catch(console.warn);

  run(); // boot
  window.addEventListener("online", run); // reconectou
  setInterval(run, 60_000); // polling leve (ou troque por web push)
}
```

!!! tip "Push em vez de polling"
    Se o backend dispara um **web push** quando há mudança, troque o `setInterval` por um `pullAnalyses` no handler de notificação — sincronia quase em tempo real e sem polling. Veja [Web Push](./push.md) + `usePushSubscription`.

## UI reativa e flush automático

Não fie o estado de sincronização na mão: `useOfflineSync(sync, opts)` inscreve o componente no motor (via `subscribe`/`getState`) e expõe `{ phase, pending, syncing, lastSummary, lastError, uploadedBytes, totalBytes, pendingBytes, persisted, flush, enqueue }`, com flush opcional no mount, no evento `online` e num intervalo. `useSyncStatus(sync)` devolve um `{ tone, pending, syncing }` pronto pro `<SyncStatusBadge>`. Para a barra offline e o prompt de atualização do SW, veja **[PWA & Offline-First](./pwa.md)**.

```tsx
import { useOfflineSync, SyncStatusBadge, useSyncStatus } from "tempest-react-sdk";
import { sync } from "@/sync/engine";

function SyncBadge() {
  const { tone, pending } = useSyncStatus(sync);
  return <SyncStatusBadge tone={tone} pending={pending} />;
}
```

Para mutações otimistas ligadas ao TanStack Query, use `useOfflineMutation` — veja [Query](./query.md#useofflinemutation).

!!! tip "Coerência entre abas"
    Passe `crossTab: true` no `createOfflineSync` pra propagar o `SyncState` entre abas do mesmo origin via `BroadcastChannel` — uma aba que dá flush zera o badge de pendências em todas. O outbox já é um IndexedDB compartilhado; isto só espelha o estado em memória. `flush` continua single-flight **por aba** (entregas idempotentes por `id` cobrem o resto). Chame `sync.dispose()` no teardown pra fechar o canal.

    ```ts
    export const sync = createOfflineSync<Analysis, AnalysisDto>({
      databaseName: "AnalysesOutbox",
      crossTab: true,
      // ...
    });
    ```

## Conflitos: last-write-wins

O backend resolve por `updated_at` (a escrita mais recente vence). No cliente, o pull faz `bulkPut`, que **sobrescreve** o registro local pela versão do servidor — então uma edição local não confirmada pode ser substituída por uma versão mais nova do servidor. Se o seu domínio precisa de merge mais fino (campos independentes, CRDT), trate isso na camada de `saveAnalysis`/pull; o SDK te dá os blocos, não impõe a política.

Para os dois casos comuns, o SDK exporta resolvedores prontos pra usar dentro do `applyRemote` (empate → remoto vence):

```ts
import { createOfflineStore, higherVersionWins, lastWriteWins } from "tempest-react-sdk";

interface Analysis {
  id: string;
  user_id: string;
  updated_at: string;
  version: number;
}

// o mesmo store da seção 2
const analyses = createOfflineStore<Analysis, string>({
  databaseName: "FamachaOffline",
  version: 1,
  tableName: "analyses",
  indexes: "&id, user_id, updated_at",
  ownerField: "user_id",
});

// passe como `applyRemote` no `createOfflineSync`
export async function applyRemote(dto: Analysis): Promise<void> {
  const local = await analyses.get(dto.id);
  await analyses.put(lastWriteWins(local, dto, (r) => r.updated_at));
}

// ou, com contador de versão no registro
export async function applyRemoteByVersion(dto: Analysis): Promise<void> {
  const local = await analyses.get(dto.id);
  await analyses.put(higherVersionWins(local, dto, (r) => r.version));
}
```

## Recap

- **`createOfflineStore`** é a fonte de verdade local (IndexedDB, escopado por `user_id`).
- **Pull** drena `GET /api/analyses/changes` por `has_more`, aplica upserts/tombstones e guarda o `server_time` como próximo `since`.
- **Push** grava local primeiro e faz **upsert por `id`** — idempotente.
- **`installBackgroundSync`** reenfileira e replaya mutações offline; idempotência torna o replay seguro.
- Conflito = **last-write-wins por `updated_at`**, definido pelo backend.
- Casa 1:1 com a [receita offline-sync do `tempest-fastapi-sdk`](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/). 🚀
