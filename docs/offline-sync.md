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
import { createOfflineSync } from "tempest-react-sdk";
import { api } from "@/lib/api";
import { analyses } from "./store"; // createOfflineStore
import { fromDto, toPayload, type Analysis, type AnalysisDto } from "./types";

export const sync = createOfflineSync<Analysis, AnalysisDto>({
  databaseName: "AnalysesOutbox",
  watermark: { storageKey: "analyses.watermark" },

  // push: entregue uma mutação da fila
  deliver: async (entry) => {
    if (entry.op === "delete") {
      await api.delete(`/api/analyses/${entry.recordId}`);
      return;
    }
    await api.put(`/api/analyses/${entry.recordId}`, { body: toPayload(entry.payload!) });
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
  await api.put(`/api/analyses/${record.id}`, { body: record });

  return record;
}

/** Soft delete: marca tombstone local + propaga. */
export async function deleteAnalysis(userId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await analyses.update(id, { is_deleted: true, deleted_at: now, updated_at: now });
  await api.put(`/api/analyses/${id}`, {
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

Não fie o estado de sincronização na mão: `useOfflineSync(sync, opts)` inscreve o componente no motor (via `subscribe`/`getState`) e expõe `{ phase, pending, syncing, lastSummary, lastError, flush, enqueue }`, com flush opcional no mount, no evento `online` e num intervalo. `useSyncStatus(sync)` devolve um `{ tone, pending, syncing }` pronto pro `<SyncStatusBadge>`. Para a barra offline e o prompt de atualização do SW, veja **[PWA & Offline-First](./pwa.md)**.

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
import { lastWriteWins, higherVersionWins } from "tempest-react-sdk";

applyRemote: async (dto) => {
  const local = await analyses.get(dto.id);
  await analyses.save(lastWriteWins(local, dto, (r) => r.updatedAt));
  // ou: higherVersionWins(local, dto, (r) => r.version)
};
```

## Recap

- **`createOfflineStore`** é a fonte de verdade local (IndexedDB, escopado por `user_id`).
- **Pull** drena `GET /api/analyses/changes` por `has_more`, aplica upserts/tombstones e guarda o `server_time` como próximo `since`.
- **Push** grava local primeiro e faz **upsert por `id`** — idempotente.
- **`installBackgroundSync`** reenfileira e replaya mutações offline; idempotência torna o replay seguro.
- Conflito = **last-write-wins por `updated_at`**, definido pelo backend.
- Casa 1:1 com a [receita offline-sync do `tempest-fastapi-sdk`](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/). 🚀
