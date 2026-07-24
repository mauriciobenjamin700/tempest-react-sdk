# PWA & Offline-First

O `tempest-react-sdk` traz tudo que um app Tempest precisa pra virar um **PWA offline-first** — sem depender de Workbox nem de `vite-plugin-pwa`. Esta página é o mapa: registro e atualização do service worker, cache, sincronização em background, durabilidade do armazenamento e a UI de status. O **motor de sincronização** (`createOfflineSync`) tem sua própria receita em [Offline Sync (FastAPI)](./offline-sync.md) — aqui cobrimos a camada PWA ao redor dele.

!!! info "As peças"
    | Camada | O que faz | Onde roda |
    | -- | -- | -- |
    | `tempest-react-sdk/vite` | gera manifest, ícones, SW de dev | build (Vite) |
    | `tempest-react-sdk/sw` | precache, cache runtime, background sync | dentro do `sw.ts` |
    | hooks + componentes | update, status, quota, indicadores | main thread (React) |

## 1. Registrar o service worker e atualizar com consentimento

`registerServiceWorker` cuida do `register()` + detecção de update. Para o fluxo **guiado pelo usuário** ("Nova versão — atualizar"), use o hook `useServiceWorkerUpdate` com o componente `<UpdatePrompt>`:

```tsx
import { useServiceWorkerUpdate, UpdatePrompt } from "tempest-react-sdk";

export function ServiceWorkerGate() {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });
  return <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />;
}
```

Quando um worker novo termina de instalar, `updateAvailable` vira `true`; `applyUpdate()` ativa o worker em espera (`skipWaiting`) e recarrega a página assim que ele assume o controle.

!!! tip "Deixe `autoUpdate` desligado aqui"
    `useServiceWorkerUpdate` existe para dar a decisão de recarregar ao usuário. Se você quer recarga silenciosa, use `registerServiceWorker({ url, autoUpdate: true })` direto, sem o hook.

## 2. Precache + cache runtime + navigation preload

Dentro do seu `sw.ts`, registre as rotas específicas **antes** do precache (para vencerem o catch-all):

```ts
/// <reference lib="webworker" />
import { installRuntimeCache, installPrecache } from "tempest-react-sdk/sw";

installRuntimeCache([
  { match: /\/api\//, strategy: "network-first", cacheName: "api", maxAgeSeconds: 300 },
  { match: /\.(png|jpg|webp)$/, strategy: "cache-first", cacheName: "img", maxEntries: 60 },
]);

installPrecache(); // app shell + navegação offline
```

`installPrecache` liga a **Navigation Preload API** no `activate` por padrão (`navigationPreload: true`): o navegador começa a buscar a navegação em paralelo com o boot do worker e o handler serve `event.preloadResponse`, cortando a latência da primeira navegação depois que o worker sobe.

!!! note "De onde vem o manifest"
    `installPrecache` lê `precache-manifest.json`, emitido pelo plugin `tempestPwaManifest()` do subpath `tempest-react-sdk/vite`. Veja [Vite config](./vite-config.md).

## 3. Background sync + periodic sync

`installBackgroundSync` enfileira mutações (`POST`/`PUT`/`PATCH`/`DELETE`) que falham offline e as reenvia quando a rede volta — via Background Sync API, com fallback oportunista para navegadores sem ela (Safari).

```ts
import { installBackgroundSync } from "tempest-react-sdk/sw";

installBackgroundSync({ match: (url) => url.pathname.startsWith("/api/") });
```

Para reenviar mesmo **sem uma navegação nova**, registre um *periodic sync* na main thread. O SW já escuta o evento `periodicsync`:

```ts
import { registerPeriodicSync } from "tempest-react-sdk/sw";

const registration = await navigator.serviceWorker.ready;
await registerPeriodicSync({ registration, minIntervalMinutes: 360 });
```

`registerPeriodicSync` checa a permissão `periodic-background-sync` primeiro e retorna `false` quando indisponível (Chrome-only) — chamar sempre é seguro.

## 4. Durabilidade: peça armazenamento persistente

Sem `navigator.storage.persist()`, o navegador pode **despejar** o IndexedDB e o Cache Storage sob pressão de disco — fatal pra dados offline. `useStorageEstimate` mostra uso/quota e expõe a ação de tornar o armazenamento permanente:

```tsx
import { useStorageEstimate } from "tempest-react-sdk";

function StorageMeter() {
  const { usage, quota, ratio, persisted, requestPersist } = useStorageEstimate();
  return (
    <div>
      <progress value={ratio ?? 0} />
      <span>
        {((usage ?? 0) / 1e6).toFixed(1)} de {((quota ?? 0) / 1e6).toFixed(0)} MB
      </span>
      {!persisted && <button onClick={requestPersist}>Tornar permanente</button>}
    </div>
  );
}
```

Fora do React, use as funções puras `estimateStorage()` e `requestPersistentStorage()`.

## 5. Observabilidade do cache

Para um readout "X MB cacheado" ou um "limpar cache" no logout, use os helpers de main thread:

```ts
import { inspectCaches, clearCaches } from "tempest-react-sdk/sw";

const reports = await inspectCaches({ filter: "tempest-" });
const totalMb = reports.reduce((n, r) => n + (r.bytes ?? 0), 0) / 1e6;

await clearCaches("tempest-"); // no logout
```

`inspectCaches` mede bytes por padrão (lendo cada resposta); passe `measureBytes: false` para um relatório rápido só de contagem.

## 6. UI de status offline

Dois componentes prontos, guiados por `useOnline` e pelo motor de sync:

```tsx
import { OfflineIndicator, SyncStatusBadge, useSyncStatus } from "tempest-react-sdk";
import { notesSync } from "@/sync/engine";

function StatusBar() {
  const { tone, pending } = useSyncStatus(notesSync);
  return (
    <>
      <OfflineIndicator position="top" />
      <SyncStatusBadge tone={tone} pending={pending} />
    </>
  );
}
```

- **`<OfflineIndicator>`** — barra fixa que aparece offline e pisca uma confirmação ao reconectar. Não renderiza nada online, então é seguro montar na raiz do app.
- **`<SyncStatusBadge>`** — pílula com ícone + label + contagem de pendências, alimentada por `useSyncStatus(sync).tone`.

## 7. Hooks reativos do motor de sync

`useOfflineSync` inscreve um componente no `OfflineSync` e opcionalmente dispara flush no mount, no evento `online` e num intervalo:

```tsx
import { useOfflineSync } from "tempest-react-sdk";
import { notesSync } from "@/sync/engine";

function useNotesSync() {
  return useOfflineSync(notesSync, { flushOnMount: true, intervalMs: 30_000 });
  // → { phase, pending, syncing, lastSummary, lastError, lastSyncedAt, enqueue, flush }
}
```

Para mutações **otimistas** que gravam no outbox e atualizam o cache do TanStack Query (com rollback em falha), use `useOfflineMutation` — veja [Query](./query.md#useofflinemutation).

## 8. Resolução de conflitos

O pull sobrescreve o registro local pela versão do servidor. Quando precisar de uma política explícita dentro do `applyRemote`, os helpers cobrem os dois casos comuns (empate → remoto vence):

```ts
import { lastWriteWins, higherVersionWins } from "tempest-react-sdk";

applyRemote: async (dto) => {
  const local = await store.get(dto.id);
  await store.save(lastWriteWins(local, dto, (r) => r.updatedAt));
};
```

## Recap

- **`useServiceWorkerUpdate` + `<UpdatePrompt>`** dão o fluxo de atualização com consentimento. ✅
- **`installPrecache`** liga navigation preload; **`installRuntimeCache`** cobre as estratégias Workbox-like.
- **`installBackgroundSync`** + **`registerPeriodicSync`** reenviam mutações offline, com ou sem navegação nova.
- **`useStorageEstimate`** + **`requestPersistentStorage`** evitam o despejo do IndexedDB.
- **`inspectCaches`/`clearCaches`** dão visibilidade e limpeza do cache.
- **`<OfflineIndicator>` / `<SyncStatusBadge>` / `useOfflineSync` / `useSyncStatus`** montam a UI de status reativa. 🚀
