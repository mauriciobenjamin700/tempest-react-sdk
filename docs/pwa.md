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

- **Requisição com header de credencial passa direto para a rede** — `Authorization`, `X-Api-Key`, `X-Auth-Token` e o resto de `DEFAULT_CREDENTIAL_HEADERS` (troque por rota com `credentialHeaders`): a rota não lê nem grava o cache, como se o service worker não existisse para ela.
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

Com o opt-in, cada entrada é gravada com `Vary` em cada header de credencial que a requisição levou (`Vary: authorization`, por exemplo): o Cache API só a devolve para a **mesma** credencial. Outra conta (ou nenhuma) erra o cache em vez de ler o dado. Um token renovado online simplesmente regrava a entrada.

A revalidação que continua depois da resposta — o refresh do `stale-while-revalidate` e a rede que perdeu para o `networkTimeoutSeconds` — vai para o `event.waitUntil`, então o navegador não derruba o worker no meio da gravação.

!!! warning "Limite: sessão por cookie"
    O service worker **não enxerga** o `Cookie` da requisição, então não distingue uma API com sessão por cookie de um GET público. Bloquear por `request.credentials` não resolve: desligaria o cache de toda imagem e fonte da mesma origem. Numa API com sessão por cookie, a privacidade do cache depende de duas coisas fora do SDK:

    - o servidor mandar `Cache-Control: private` (ou `no-store`) nas respostas pessoais — o SDK respeita;
    - o app chamar [`clearSessionData()`](#6-logout-apague-os-dados-da-sessao) no logout.

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

Entradas gravadas por versões anteriores também são limpas: na primeira abertura depois da atualização, o banco migra e apaga os headers de credencial do disco. No replay, a lista é aplicada de novo, então nenhuma entrada sai com a credencial que guardou.

No replay, o worker pede a credencial **atual** às páginas abertas, por `postMessage` (mensagem do tipo `BACKGROUND_SYNC_CREDENTIALS_MESSAGE`, com um `MessagePort` para a resposta). Instale o provedor uma vez, ao lado do seu auth — o template `--pwa` já faz isso em `src/pwa.tsx`:

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

!!! warning "Sem provedor, nenhuma mutação é reenviada"
    A fila não guarda o token, então só a página pode devolvê-lo — e só a página diz quem está logado. Sem `provideBackgroundSyncCredentials`, a aba não responde, o dono da entrada fica **desconhecido** e ela fica pendente até `maxRetentionMinutes` e some, tenha ou não header de credencial. Em build de desenvolvimento o worker avisa no console (uma vez por replay). API com sessão por cookie e sem token instala o provedor do mesmo jeito: `provideBackgroundSyncCredentials(() => null, { getPrincipal })`. App sem login nenhum usa [`ownerPolicy: "lenient"`](#ownerpolicy-app-sem-login).

#### Cada entrada tem dono

O `getPrincipal` amarra a mutação a quem a fez. Logo depois de enfileirar, o worker pergunta à aba que disparou a requisição quem está logado e grava na entrada uma **impressão SHA-256** desse id — nunca o id nem o token. A pergunta não atrasa a rejeição do `fetch`; enquanto ela não volta (até 6 s), o replay deixa a entrada pendente.

O dono fica em um de três estados:

| Estado | Quando | Replay |
| -- | -- | -- |
| **com dono** | a aba respondeu com `getPrincipal` | só sai com a resposta de uma aba em que o **mesmo** dono está logado; nenhuma bate → descarta |
| **sem dono** | a aba respondeu sem `getPrincipal` | qualquer resposta serve (prefere uma sem principal) |
| **desconhecido** | ninguém respondeu, `getPrincipal` lançou, a aba sumiu (ou não havia aba), o carimbo se perdeu depois dos 6 s, ou a entrada é de antes da 0.77 | **falha fechado**, com ou sem header de credencial: só sai quando **toda** aba que respondeu está sem principal; basta uma aba com principal para descartar; sem resposta, fica pendente |

No replay o worker pergunta a **todas** as abas em paralelo, com um único prazo de 3 s, e usa a resposta que serve — uma aba de outra conta respondendo primeiro não derruba a mutação de A. Depois:

| Resposta escolhida | Replay |
| -- | -- |
| headers com todos os que foram removidos | reenvia com eles — só os **nomes** que a requisição original tinha, então devolver `Authorization` sempre não vaza o token para uma URL que não o recebia |
| headers sem algum que foi removido | fica pendente (não sai anônima para levar 401 e sumir) |
| `null` (sem sessão) | descarta, sem enviar |
| nenhuma resposta válida | fica pendente até `maxRetentionMinutes` |

Só a entrada **sem dono** e sem header de credencial é reenviada como estava, sem perguntar. A de dono **desconhecido** pergunta mesmo sem header: numa API com sessão por cookie (`credentials: "include"`), o navegador anexa no replay o cookie de quem estiver logado naquela hora, então reenviar sem checar mandaria a mutação de A com a sessão de B (até a 0.77.0 era assim; `ownerPolicy: "lenient"` restaura isso, veja abaixo). E uma aba sem `getPrincipal` — por exemplo, ainda rodando o bundle de antes do deploy — não autoriza o replay se outra aba responde com principal: ela não diz nada sobre o cookie que vai junto. Erro no provedor (`getHeaders` ou `getPrincipal` que lança) volta como `{ error: true }` explícito, nunca como silêncio.

Medido no Chromium 153 (11/10/2026), com service worker, IndexedDB e duas abas reais: A enfileira offline, B entra sem limpar nada, o sync dispara — o servidor não recebe POST; com a aba de B aberta ao lado, a mutação de A sai com o token renovado de A.

O replay é um só por fila: `sync`, `periodicsync` e o fallback do Safari disparando juntos compartilham a mesma passada, e a mesma mutação não sai duas vezes. E `clearBackgroundSyncQueue()` alcança o que está em voo: cada entrada é conferida no banco logo antes de sair, e uma requisição que ainda estava falhando quando a fila foi limpa não é gravada depois.

Fora desse caminho, há três controles no `installBackgroundSync`:

- **`credentialHeaders`** — a lista de headers removidos. Para um header próprio: `[...DEFAULT_CREDENTIAL_HEADERS, "x-tenant-key"]`. O provedor precisa devolver todos eles.
- **`beforeReplay(request, { queuedAt, strippedHeaders, ownerState, owner })`** — substitui o pedido às páginas: devolva o `Request` a enviar, `null` para descartar, ou lance para manter pendente. Útil quando o worker consegue a credencial sozinho; `ownerState`/`owner` permitem aplicar a mesma regra de dono.
- **`ownerPolicy`** — `"strict"` (padrão) ou `"lenient"`; veja [`ownerPolicy`: app sem login](#ownerpolicy-app-sem-login).

!!! warning "Limite: credencial na URL ou no corpo"
    Só **headers** saem da fila. Um token em query string (`?access_token=…`) ou dentro do corpo da mutação é gravado como foi enviado. Mande credencial em header.

!!! warning "`credentialHeaders: []` volta ao comportamento antigo"
    Com a lista vazia, todo header — bearer incluso — vai em texto puro para o IndexedDB e é reenviado como foi gravado. É uma escolha explícita, para quem não tem página aberta no replay e aceita o risco.

#### `ownerPolicy`: app sem login

O padrão é `ownerPolicy: "strict"`. App **sem login**, em que nenhuma página informa principal e não há provedor, pode voltar ao reenvio sem consulta da 0.77.0 com `ownerPolicy: "lenient"`:

```ts
import { installBackgroundSync } from "tempest-react-sdk/sw";

installBackgroundSync({ match: /\/api\//, ownerPolicy: "lenient" });
```

| Entrada | `"strict"` (padrão) | `"lenient"` |
| -- | -- | -- |
| dono **desconhecido**, sem header de credencial | pergunta às páginas: reenvia só se toda resposta vem sem principal, descarta se alguma tem principal, pendente sem resposta | reenvia como estava, sem perguntar |
| dono **desconhecido**, com header de credencial removido | pergunta às páginas (mesma regra) | pergunta às páginas (mesma regra) |
| **com dono** / **sem dono** | igual nos dois modos | igual nos dois modos |

!!! danger "`lenient` não serve para sessão por cookie"
    No replay o navegador anexa o cookie de quem estiver logado naquela hora. Com `"lenient"`, a mutação de A cujo dono não foi carimbado (aba fechada, `clientId` vazio, carimbo perdido, entrada antiga) sai com a sessão de B. Com cookie, fique no `"strict"` e instale o provedor com `getPrincipal`. Um `beforeReplay` próprio ignora a opção.

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
    Cache Storage e IndexedDB são armazenamento da origem, acessíveis da `window` — não precisa mandar mensagem ao service worker. Se o seu auth expõe um callback de fim de sessão, chame `clearSessionData()` nele, para cobrir também a sessão que expira sozinha. Com `getPrincipal` no provedor e token em header, a fila já não depende disso para não trocar de dono — mas o cache de runtime depende. Com sessão por cookie, a checagem do dono confia que o `getPrincipal` de cada aba reflete o cookie que o navegador vai mandar; uma aba com estado velho (A ainda na memória enquanto B entrou em outra aba) autoriza o replay com o cookie de B. Por isso, com cookie, chame `clearSessionData()` no logout mesmo usando `getPrincipal`.

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
