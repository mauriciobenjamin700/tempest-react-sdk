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

!!! note "Também pega o worker que já estava esperando"
    O caso comum não gera evento nenhum: o usuário abriu o app depois do deploy (o worker novo instalou e foi para `waiting`), fechou a aba, e voltou depois. Nessa segunda visita `updatefound` não dispara — o `install` já aconteceu. `registerServiceWorker` lê `registration.waiting` assim que o registro resolve, então `updateAvailable` vira `true` do mesmo jeito. Cada worker é anunciado **uma vez**, mesmo quando os dois caminhos valem na mesma sessão, e nenhum dispara na primeira instalação (sem `controller`) — isso é `onReady`, não update.

!!! tip "Deixe `autoUpdate` desligado aqui"
    `useServiceWorkerUpdate` existe para dar a decisão de recarregar ao usuário. Se você quer recarga silenciosa, use `registerServiceWorker({ url, autoUpdate: true })` direto, sem o hook.

## 2. Precache + cache runtime + navigation preload

Dentro do seu `sw.ts`, registre as rotas específicas **antes** do precache (para vencerem o catch-all):

```ts
/// <reference lib="webworker" />
import { installRuntimeCache, installPrecache } from "tempest-react-sdk/sw";

installRuntimeCache([
  { match: /\/api\//, strategy: "network-first", cacheName: "tempest-api", maxAgeSeconds: 300 },
  { match: /\.(png|jpg|webp)$/, strategy: "cache-first", cacheName: "tempest-img", maxEntries: 60 },
]);

installPrecache(); // app shell + navegação offline
```

`installPrecache` liga a **Navigation Preload API** no `activate` por padrão (`navigationPreload: true`): o navegador começa a buscar a navegação em paralelo com o boot do worker e o handler serve `event.preloadResponse`, cortando a latência da primeira navegação depois que o worker sobe.

!!! note "De onde vem o manifest"
    `installPrecache` lê `precache-manifest.json`, emitido pelo plugin `tempestPwaManifest()` do subpath `tempest-react-sdk/vite`. Veja [Vite config](./vite-config.md).

!!! warning "Deploy em subpath (GitHub Pages e afins)"
    O `tempestPwaManifest()` prefixa as URLs com o `base` do Vite, mas o `installPrecache` roda no worker e **não** enxerga essa config. Se o seu `base` não é `/`, aponte as duas opções de caminho para dentro dele:

    ```ts
    installPrecache({
      manifestUrl: "/meu-app/precache-manifest.json",
      navigateFallback: "/meu-app/index.html",
    });
    ```

    Com os defaults (`/precache-manifest.json` e `/index.html`), o worker instala, busca um manifest que responde 404 e a navegação offline nunca resolve.

### Resposta autenticada não entra no cache (a não ser que você peça)

O Cache Storage guarda por **URL** e sobrevive ao logout. Sem cuidado, o `GET /api/me` da conta A fica lá e é servido para a conta B no mesmo navegador assim que a rede cai — ou demora mais que `networkTimeoutSeconds`. Medido no Chromium 153 (11/10/2026), antes da 0.77.0: B, offline, recebia o corpo de A.

Por isso o `installRuntimeCache` aplica quatro regras sozinho:

- **Requisição com `Authorization` passa direto para a rede**: a rota não lê nem grava o cache, como se o service worker não existisse para ela.
- **`Cache-Control: no-store` nunca é gravado**, e **`private`** só com opt-in.
- **`maxAgeSeconds` vale também no fallback**: entrada vencida é miss, nunca "último recurso" offline. Isso vale para `network-first` e `stale-while-revalidate`.
- **A idade conta da gravação**, não do header `Date` — que não é exposto em resposta CORS, então numa API em outra origem o `maxAgeSeconds` nunca vencia nada.

Quer mesmo dados autenticados offline? Ligue `cacheAuthenticated` na rota:

```ts
/// <reference lib="webworker" />
import { installRuntimeCache } from "tempest-react-sdk/sw";

installRuntimeCache([
  {
    match: /\/api\//,
    strategy: "network-first",
    cacheName: "tempest-api",
    networkTimeoutSeconds: 5,
    maxAgeSeconds: 300,
    cacheAuthenticated: true,
  },
]);
```

Com o opt-in, cada entrada é gravada com `Vary: Authorization`: o Cache API só a devolve para o **mesmo** bearer. Outra conta (ou nenhuma) erra o cache em vez de ler o dado. Um token renovado online simplesmente regrava a entrada.

!!! note "Sessão por cookie"
    O service worker não enxerga o `Cookie` da requisição, então não tem como saber que uma API com sessão por cookie é pessoal. Mande `Cache-Control: private` (ou `no-store`) nas respostas pessoais — agora o SDK respeita — e limpe os dados no logout com [`clearSessionData()`](#6-logout-apague-os-dados-da-sessao).

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

### Credencial não vai para o IndexedDB

A fila vive no IndexedDB `tempest-bg-sync` e sobrevive ao logout. Por isso o `installBackgroundSync` **remove os headers de credencial** antes de gravar — `Authorization` e o resto de `DEFAULT_CREDENTIAL_HEADERS` (`x-api-key`, `x-auth-token`, `x-csrf-token`, …). Antes da 0.77.0 o bearer ficava legível ali depois do logout e a mutação era reenviada com a identidade antiga (medido no Chromium 153, 11/10/2026).

No replay, o worker pede a credencial **atual** à página aberta, por `postMessage` (mensagem do tipo `BACKGROUND_SYNC_CREDENTIALS_MESSAGE`, com um `MessagePort` para a resposta). Instale o provedor uma vez, ao lado do seu auth:

```ts
import { createTempestAuth } from "tempest-react-sdk";
import { provideBackgroundSyncCredentials } from "tempest-react-sdk/sw";

export const auth = createTempestAuth<{ id: string }>({ baseURL: "https://api.example.com" });

provideBackgroundSyncCredentials(
  () => {
    const { token } = auth.useAuthStore.getState();
    return token ? { Authorization: `Bearer ${token}` } : null;
  },
  { getPrincipal: () => auth.useAuthStore.getState().user?.id },
);
```

O que acontece com cada entrada:

| Resposta do provedor | Replay |
| -- | -- |
| headers | reenvia com eles — só os **nomes** que a requisição original tinha, então devolver `Authorization` sempre não vaza o token para uma URL que não o recebia |
| `null` (sem sessão) | descarta a entrada, sem enviar |
| nenhuma (aba fechada, provedor não instalado ou que lançou) | fica pendente até `maxRetentionMinutes` |

Entrada que não tinha credencial nenhuma — nem dono, veja abaixo — é reenviada como estava, sem perguntar.

#### Cada entrada tem dono

O `getPrincipal` amarra a mutação a quem a fez. Logo depois de enfileirar, o worker pergunta à aba que disparou a requisição quem está logado e grava na entrada uma **impressão SHA-256** desse id — nunca o id nem o token. No replay, pergunta de novo:

| Dono da entrada × dono atual | Replay |
| -- | -- |
| iguais | reenvia com a credencial atual (token renovado incluso) |
| diferentes — inclusive outra conta logada sem `clearSessionData()` no meio | **descarta, sem enviar**: mutação de A nunca sai como B, nem anônima |
| entrada sem dono (provedor sem `getPrincipal`, ou a aba não respondeu ao enfileirar) | só as regras de credencial acima |

Vale também para sessão por cookie: a entrada sem header de credencial, mas com dono, só sai se o dono bater. Medido no Chromium 153 (11/10/2026): A enfileira offline, B entra sem limpar nada, o sync dispara — o servidor não recebe POST nenhum e a entrada some.

A pergunta ao enfileirar não atrasa a rejeição do `fetch`; enquanto ela não volta (até 6 s), o replay deixa a entrada pendente.

Fora desse caminho, há dois controles no `installBackgroundSync`:

- **`credentialHeaders`** — a lista de headers removidos. Para um header próprio: `[...DEFAULT_CREDENTIAL_HEADERS, "x-tenant-key"]`.
- **`beforeReplay(request, { queuedAt, strippedHeaders, owner })`** — substitui o pedido à página: devolva o `Request` a enviar, `null` para descartar, ou lance para manter pendente. Útil quando o worker consegue a credencial sozinho; o `owner` permite aplicar a mesma regra de dono.

!!! warning "`credentialHeaders: []` volta ao comportamento antigo"
    Com a lista vazia, todo header — bearer incluso — vai em texto puro para o IndexedDB. É uma escolha explícita, para quem não tem página aberta no replay e aceita o risco.

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

Para um readout "X MB cacheado" ou um botão "limpar cache", use os helpers de main thread:

```ts
import { inspectCaches, clearCaches } from "tempest-react-sdk/sw";

const reports = await inspectCaches({ filter: "tempest-" });
const totalMb = reports.reduce((n, r) => n + (r.bytes ?? 0), 0) / 1e6;

await clearCaches("tempest-img"); // um bucket específico
```

`inspectCaches` mede bytes por padrão (lendo cada resposta); passe `measureBytes: false` para um relatório rápido só de contagem.

## 6. Logout: apague os dados da sessão

O cache de runtime e a fila de background sync são do **navegador**, não do usuário: a próxima conta que entrar herda os dois. No logout, chame `clearSessionData()`:

```ts
import { createTempestAuth } from "tempest-react-sdk";
import { clearSessionData } from "tempest-react-sdk/sw";

export const auth = createTempestAuth({ baseURL: "https://api.example.com" });

export async function signOut() {
  await clearSessionData();
  auth.logout();
}
```

Ele apaga **todo** bucket do Cache Storage menos o precache do app shell (`tempest-precache-*`), e a fila `tempest-bg-sync` inteira. Devolve `{ caches, queueCleared }` com o que removeu.

Por que não um prefixo: antes da 0.77.0 a doc mandava `clearCaches("tempest-")` no logout, e a receita chamava o cache de `api` — o prefixo não casava e **nada** era apagado. Pior: casaria com `tempest-precache-*` e derrubaria o app offline. O filtro padrão inverte a lógica, então funciona qualquer que seja o `cacheName` escolhido. Para estreitar, passe `caches` (um `CacheFilter`); para uma fila com outro nome, `queueName`. Só a fila: `clearBackgroundSyncQueue()`.

!!! tip "Roda na página"
    Cache Storage e IndexedDB são armazenamento da origem, acessíveis da `window` — não precisa mandar mensagem ao service worker. Se o seu auth expõe um callback de fim de sessão, chame `clearSessionData()` nele, para cobrir também a sessão que expira sozinha. Com `getPrincipal` no provedor, a fila já não depende disso para não trocar de dono — mas o cache de runtime depende.

## 7. UI de status offline

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

## 8. Hooks reativos do motor de sync

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

## 9. Resolução de conflitos

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
- **`installPrecache`** liga navigation preload; **`installRuntimeCache`** cobre as estratégias Workbox-like e deixa resposta autenticada fora do cache, salvo `cacheAuthenticated`.
- **`installBackgroundSync`** + **`registerPeriodicSync`** reenviam mutações offline, com ou sem navegação nova — sem gravar credencial; **`provideBackgroundSyncCredentials`** entrega a atual no replay.
- **`clearSessionData`** no logout apaga cache de runtime e fila. 🔒
- **`useStorageEstimate`** + **`requestPersistentStorage`** evitam o despejo do IndexedDB.
- **`inspectCaches`/`clearCaches`** dão visibilidade e limpeza do cache.
- **`<OfflineIndicator>` / `<SyncStatusBadge>` / `useOfflineSync` / `useSyncStatus`** montam a UI de status reativa. 🚀
