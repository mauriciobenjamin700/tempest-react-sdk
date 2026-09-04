# CLAUDE.md — tempest-react-sdk

SDK público da Tempest com componentes React, hooks e integrações reutilizáveis. Consumido por todos os apps frontend Tempest. Inspirado nos padrões consolidados em `alofans-frontend` e `transport-admin-system`.

> Este arquivo é o guia operacional do SDK. Padrões globais (PR template PT-BR, conventional commits, `gh pr edit` workaround) vêm de `~/.claude/CLAUDE.md` e continuam valendo.

## Estado atual (snapshot pós-v0.55.0 — `[Unreleased]` vazio)

- **npm**: <https://www.npmjs.com/package/tempest-react-sdk> — 75 tags publicadas (0.1.0 → 0.55.0) com signed provenance via OIDC. Histórico completo em `RELEASES.md` (gerado por `make releases-md`) e `CHANGELOG.md` — **não duplicar aqui**.
- **Testes**: 5846 testes em 557 arquivos, ~56 s sob `vitest + jsdom + fake-indexeddb`. Cobertura medida em 04/09/2026: **99,70% linhas (35 descobertas) / 98,72% statements / 99,85% funções (5) / 95,61% branches (422)**; pisos do CI em **99/98/99/95**, folga de 0,61 ponto no eixo mais apertado (era 0,91). **A cauda deixou de ser só inalcançável:** 21 das 35 linhas e 3 das 5 funções estão na leva RTC/voz de 0.54.0/0.55.0 — `webrtc/peer-mesh.ts` (9 linhas, 19 ramos), `webrtc/mesh-quality.ts` (9, 10), `audio/voice-chain.ts` (3, 5). O resto é poeira de 1–2 linhas, essa sim inalcançável por construção (ver `### P3`). Ranquear por **valor absoluto**, nunca por percentual — é o método da #282, e a [PR #284](https://github.com/mauriciobenjamin700/tempest-react-sdk/pull/284) leva os quatro a 100% nos quatro eixos (39 testes; branch do repo 95,61% → 96,02%, linhas descobertas 35 → 14), sem mexer nos pisos.
- **Superfície**: 40 módulos em `src/`, 128 componentes, 53 hooks no módulo `hooks/` (116 exports `use*` somando todos os módulos), 543 exports na entrada raiz, 67 em `/br` e 21 em `/icons`.
- **Empacotamento (v0.25.0)**: `dist/` preserva o grafo de módulos (`preserveModules`). O que o app paga de fato (brotli): `{ cn }` 133 B · `{ Button }` 794 B · app típico 9.27 KB · offline/PWA 4.54 KB · `styles.css` 28.7 KB · `utilities.css` 1.36 KB (opt-in). Teto sem tree-shaking: 121.08 KB ESM / 145.01 KB CJS. Budgets do `size-limit` são **por fatia importada**, não pelo barrel.
- **Subpaths** (15, a lista é o campo `exports` do `package.json`): `.`, `/testing` (MSW), `/vite` (`createViteConfig` + plugins), `/sw` (helpers de contexto SW), `/charts` (recharts peer), `/editor` (tiptap peer), `/imaging` (decode/encode/resize/crop/compress em canvas, sem dep), `/tabular` (`TabularPredictor` ONNX + cache de modelo, onnxruntime-web peer), `/vision` (onnxruntime-web peer), `/br` (dataset BR + mapa clicável — os quatro arquivos saem do IBGE numa geração só, chaveados por código de 7 dígitos), `/icons` (ícone por slug, 45 shards lazy balanceados), `/icons/virtual` (módulo real: `staticIcons = {}` que o plugin sobrescreve — resolve fora do Vite também), `/styles.css`, `/utilities.css` (camada de layout opt-in), `/package.json`.
- **CLIs** (`bin/`): `create-tempest-app` (scaffold — invocado como `npx -p tempest-react-sdk create-tempest-app .`; **não** existe pacote `create-tempest-app` no npm, então `npm create tempest-app` dá 404) com templates `template/` e `template-pwa/`; `tempest` (project CLI: `doctor`, `lint`, `fix`, `format`, `gen api <openapi>` → Zod + types + services, `gen icons` → registry estático de ícone). `doctor` e `fix` também fazem **análise de CSS** (`bin/lib/css/`, scanner próprio sem dep): sintaxe que o browser derruba, declaração/regra duplicada, propriedade e token inexistentes, e bloco repetido que pede classe global/utility. `fix` remove só o comprovadamente morto (sempre a cópia **anterior** — last-wins); `--no-css` pula, `--dry-run` é a superfície de revisão.
- **Style modules**: `colors.css` (inclui `--tempest-code-*`, resolvidos pro piso de **texto** 4,5:1 — a rampa de chart é de **marca**, 3:1, e reprova como texto) + `typography.css` + `motion.css` + `density.css` + `reset.css` + `responsive.css` + `print.css`; `utilities.css` fica **fora** do bundle (opt-in, copiado pra `dist/` no build).
- **Tooling**: Prettier 3, Husky pre-commit (lint-staged), `Makefile` + `scripts/release.sh` (tag-push pipeline) + `scripts/changelog.mjs` (notes/close) + `scripts/sync-github-releases.sh` (backfill de Releases), 5 workflows — `ci.yml` (PR, matriz node 22/24), `release-npm.yml` (tag push → guard de versão + publish OIDC + read-back do registry + GitHub Release), `size-limit.yml`, `e2e.yml` (gallery), `docs.yml` (Pages).
- **Docs**: 86 páginas base (172 arquivos com as traduções `.en.md`) — 54 na raiz de `docs/`, 15 de componentes por categoria, 11 de design de software, tutorial de 6 — mais 3 diagramas drawio + `llms.txt`/`llms-full.txt` (`npm run docs:llms`).
- **Demo vivo**: app Vite em `examples/gallery` (64 sections) consome o SDK via `file:../..`.

### Adapter design pattern (consolidado v0.1.3+)

Para qualquer wrapper futuro (Datadog, Amplitude, Mixpanel, Unleash, Cloudflare):

1. Caller injeta instância SDK no factory (`{ sentry: Sentry }`, `{ posthog }`, `{ client }`). Nunca peer dep.
2. Exporta `<X>Like` interface (subset mínimo usado) — útil pra mocks de teste.
3. Options minimalistas: `init` (opcional, chamado em provider.init), valores default razoáveis (flushTimeout, breadcrumbCategory).
4. Mapeamento direto sem state — adapter é stateless quando possível.
5. README + `docs/<modulo>.md` documentam mapping table call-por-call.

## Tech stack

- React 18/19 (peer dep) + TypeScript 6.0
- Vite 8 library mode + `vite-plugin-dts` 5 (bundleTypes via `@microsoft/api-extractor`)
- Vitest 4 + @testing-library/react + jsdom + fake-indexeddb
- ESLint 10 + typescript-eslint 8 + Prettier 3
- Husky 9 + lint-staged 17 (formatters em staged files)

Peer deps **obrigatórios**: `react` + `react-dom` (`^18 || ^19`) e `react-router` (`^7 || ^8`) — os três carregam contexto React, e uma cópia aninhada vira uma segunda instância que quebra em runtime. Deps diretas (instaladas junto): `@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`, `fflate`. Todas externalizadas no `vite.config.ts` pro bundler do app tree-shakear.

Peers **opcionais** (`peerDependenciesMeta.optional`), só quem usa o módulo instala: `recharts` (`/charts`), `@tiptap/react` + `@tiptap/starter-kit` (`/editor`), `leaflet` (tile layer do `geo`), `onnxruntime-web` (`/vision`), `vite` + `@vitejs/plugin-react` (`/vite`).

SDKs externos para adapters (não declarados — caller injeta instância):

- `@sentry/browser`, `posthog-js`, `@growthbook/growthbook`, `launchdarkly-js-client-sdk`

## Estrutura

```text
tempest-react-sdk/
├── src/                                     (39 módulos — subpath marcado com ⇢)
│   ├── access/         useCan, <Can>, permissionsFromToken (RBAC)
│   ├── app/            <AppProviders> (ErrorBoundary → Query → Theme → i18n)
│   ├── audio/          createAudioPlayer, useAudio, playAudio
│   ├── auth/           createAuthStore, AuthGuard, decodeJWT, lazyWithRetry, createRefreshQueue, createTempestAuth
│   ├── br/          ⇢  5.571 municípios do IBGE (id + nome + centroide) + 35 RAs do DF + mapa UF clicável (chunks lazy)
│   ├── capture/        createMediaRecorder, useVideoRecorder, useBarcodeScanner, useScreenCapture, useSpeechRecognition
│   ├── charts/      ⇢  wrappers recharts
│   ├── components/     128 componentes UI
│   ├── data/           createDataProvider, <TempestDataProvider>, useDataProvider (CRUD por recurso)
│   ├── editor/      ⇢  RichTextEditor (tiptap)
│   ├── error-boundary/ ErrorBoundary, useErrorHandler
│   ├── feature-flags/  Provider + InMemory + GrowthBook + LaunchDarkly adapters
│   ├── forms/          FormField, validateForm, zodResolver, useZodForm, inputs mascarados BR, useViaCEP
│   ├── geo/            mapas sem tile, createPositionTracker, OSRM backend, haversine/bounds
│   ├── hooks/          52 hooks (useDebounce, useBreakpoint, useInstallPrompt, useServiceWorkerUpdate, …)
│   ├── icons/       ⇢  <Icon name> por slug + IconProvider + 45 shards gerados (generated/)
│   ├── http/           createApiClient (timeout + uploadTimeout), parseResponse, uploadWithProgress, retry, usePoll, idempotency
│   ├── i18n/           createI18n, I18nProvider, useI18n, useTranslate
│   ├── imaging/     ⇢  decodeImage/encodeImage, resize/crop/rotate/flip, compressToTarget, createThumbnails, useImageProcessing
│   ├── logger/         createLogger leveled + plug sinks
│   ├── oauth/          <GoogleSignIn>, useOAuthCallback
│   ├── perf/           createInferenceProfiler, readDeviceProfile, cachedResponseBytes, formatDurationMs (custo de inferência on-device)
│   ├── offline/        createOfflineStore (Dexie), createOfflineSync (outbox+pull+watermark), useOfflineSync, resolvers de conflito
│   ├── push/           usePushSubscription, urlBase64ToUint8Array, isPushSupported
│                        (inbox: <NotificationCenter> + useNotificationInbox em components/)
│   ├── query/          QueryProvider, createQueryKeys, paginação, useOfflineMutation, persistQueryClientOffline
│   ├── router/         defineRoutes, <AppRouter>, <RouteGuard> (React Router declarativo, peer ^7 || ^8)
│   ├── share/          share, isShareSupported, shareOrDownloadBlob
│   ├── sse/            createEventStream, useEventStream
│   ├── store/          createStore, createSelectors (Zustand)
│   ├── styles/         colors + density + motion + typography + reset + responsive + print + index.css
│   ├── sw/          ⇢  registerServiceWorker, installPrecache, installBackgroundSync, inspectCaches/clearCaches
│   ├── tabular/     ⇢  TabularPredictor/CompactPredictor (ONNX), cache de modelo, useTabularPredictor
│   ├── telemetry/      Provider + console + Sentry + PostHog adapters
│   ├── testing/     ⇢  createMockHandlers (MSW-shaped)
│   ├── theme/          ThemeProvider, useTheme, themeInitScript (no-flash)
│   ├── utils/          cn, format BR, storage, writeXlsx, coleções
│   ├── vision/      ⇢  inferência ONNX (ort-vision-sdk-web vendorizado) + hooks de câmera
│   ├── vite/        ⇢  createViteConfig
│   ├── webrtc/         tuneOpus, setTunedLocalDescription, setSenderBitrate (SDP Opus + cap de encoder)
│   ├── ws/             createWebSocket, useWebSocket
│   └── index.ts        barrel raiz (538 exports)
├── bin/                create-tempest-app.mjs + tempest.mjs (doctor/lint/fix/format/gen api)
├── template/           scaffold Vite+React+TS
├── template-pwa/       scaffold PWA (SW próprio + vite.sw.config.ts)
├── docs/               53 páginas base (+ .en.md) + components/ + tutorial/ + diagrams/ + llms.txt
├── examples/gallery/   app Vite com 64 sections consumindo o SDK (file:../..)
├── test/setup.ts       jsdom + jest-dom + fake-indexeddb auto
├── Makefile            release / validate / bump / releases-md / releases-check / releases-sync alvos
├── scripts/            release.sh (tag-push), changelog.mjs, sync-github-releases.sh, gen-llms.mjs, gen-br-geodata.mjs, vendor-vision.mjs
├── RELEASES.md         auto-gerado por `make releases-md`
└── .github/workflows/
    ├── ci.yml          PR — format + lint + typecheck + test + build (node 22/24)
    ├── size-limit.yml  budgets por fatia importada
    ├── docs.yml        MkDocs bilíngue → GitHub Pages
    └── release-npm.yml tag push v*.*.* → smoke install + publish --provenance
```

## Backlog priorizado

**O backlog vive nas issues do GitHub, não aqui.** Esta seção guarda só o que já
saiu; o estado corrente de cada frente está na issue. `gh issue list` para a lista
viva.

Aberto hoje, em ordem de valor:

| #                                                                           | Frente                                     | Por que importa                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#275](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/275) | `createPeerMesh` sem as conexões           | A mesh do #231 guarda o `RTCPeerConnection` num `Map` fechado, e as três APIs de stats do #232 pedem exatamente ele — 0.54.0 e 0.55.0 entregaram as duas metades e elas não se combinam                   |
| [#276](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/276) | `resolveDegradation` ancora no slot errado | Decide pelo **máximo entre os slots de vídeo**; a escolha nitidez/fluidez é sobre a **tela**, então com só câmera ligada quem decide é um stream que o usuário não estava pensando                        |
| [#277](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/277) | `ImageSource` sem `HTMLVideoElement`       | Mudança **só de tipo**: o `toBitmap` já delega pro `createImageBitmap`, que aceita `CanvasImageSource`. Destrava print de gravação de tela em 6 funções do `/imaging`                                     |
| [#278](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/278) | `captureFrame(video, { atMs })`            | `seeked` não garante que o frame composto é o do `currentTime` — o caminho na mão desenha o vizinho sem erro nenhum. Precisa de `requestVideoFrameCallback`. Depende do #277                              |
| [#279](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/279) | `<VideoPlayer>` com `rate`                 | O SDK grava vídeo e não sabe tocar. `playbackRate` não aparece uma vez no `src/`, então acelerar uma gravação de 20 min de tela não tem superfície                                                        |
| [#282](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/282) | Cobertura do `src/webrtc/`                 | Entrou abaixo do padrão: 89,06% branch (277/311), `mesh-quality.ts` a 77,35% de statements — 18 linhas e 29 ramos descobertos em dois arquivos, mais que a cauda inteira que o repo declarou inalcançável |
| [#281](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/281) | Sweep de `axe` no browser real             | Descarta `results.incomplete`, roda em um tema, um viewport e só no estado inicial — a classe de contraste que escapou duas vezes cai exatamente no `incomplete`                                          |

### O consumidor que dita a frente RTC

`~/projects/my/tools/tempest-mirror-screen` — voz/vídeo/tela N↔N por WebRTC em
mesh, self-hosted (FastAPI sinalizando, React no browser). Consome
`tempest-react-sdk@^0.55.0` de verdade, e é de lá que saíram #220–#223 e depois
#231–#235 — **todas entregues** em 0.54.0/0.55.0. E a adoção de volta rendeu duas
issues novas (#275, #276): a mesh entregue não expõe as conexões que as stats
pedem, e o `resolveDegradation` ancora no slot errado. **Adotar é a etapa que
encontra o defeito** — a issue de implementação passa, a de uso reprova.

O padrão vale mais que o app: **a primitiva sai de código que já roda em
produção lá, não de desenho especulativo.** Cada armadilha que virou comentário
naquele repo vira um teste nomeado aqui — é o que impede a próxima cópia de
reintroduzi-la.

O que ele já consome: `createAudioBus`, `createLevelMeter`, `setSenderBitrate`,
`setTunedLocalDescription`, `OpusProfile`, `createVoiceChain`,
`monitorVoiceActivity`, `usePushToTalk`, `createLinkStatsSampler`, `useFullscreen`,
`Icon`/`IconProvider`, `Slider`, `useIdle`, `useTheme`, `ThemeProvider`,
`ToastProvider` — a adoção de 0.54.0/0.55.0 deletou **734 linhas** locais.

O que ele **ainda escreve na mão**:

| Arquivo       | Linhas | Estado                                                                                                                                                                             |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/mesh.ts` | 892    | `createPeerMesh` (#231) entregue, adoção **travada**: sem acesso ao `RTCPeerConnection` (#275) o badge de RTT/vazão morre, e o `resolveDegradation` decide pelo slot errado (#276) |

Já coberto pelo SDK e **fora** do backlog: aquisição de mídia
(`useMicrophone`, `useScreenCapture`, `useCameraStream`, `classifyMediaError`)
e o socket resiliente. Ao portar, conferir contra esses antes de propor API nova.

Lição que vale mais que a lista: **conferir a `main` antes de começar.** Duas
frentes desta rodada foram resolvidas em paralelo por outra máquina — o gate de
dev-mode (`src/utils/dev-mode.ts`) e o crescimento do `materialToLucide` — e a
versão de lá do dev-mode estava **certa** onde a minha estava errada. `git fetch`
e comparar antes de investir horas.

Entregue e fora do backlog: **a leva RTC de 0.54.0/0.55.0** (`createPeerMesh` #231, leitura normalizada de `getStats` #232, `createVoiceChain` #233, VAD + push-to-talk #234), **`registerServiceWorker` avisando de worker já em `waiting`** (#253), **opt-out do colapso do `Pagination` no mobile** (#254), **a trilha "Fundamentos da Web"** (#236), **`useFullscreen`** (#235 — estado lido de `fullscreenchange`, porque `Esc`, F11 e o botão do browser não passam pela sua função; a assinatura vive em `use-fullscreen-element.ts`, compartilhada com o `usePortalHost`), **os quatro datasets de `br/` unidos pelo código IBGE** (#249 — ver a lição abaixo), **a onda de voz/RTC** (`tuneOpus` + `setTunedLocalDescription` #222, `createAudioBus` com ganho >100% e limiter pós-soma #223, `createWebSocket` resiliente #220, `aria-label` no `Slider` #221), **`CodeBlock`** (realce por scanner + tokens `--tempest-code-*`), **`QRCode`** (encoder ISO 18004 próprio, 3,2 KB br), **`Sparkline`** (mini-gráfico inline, sem recharts), **escala contínua de data viz** (`sequentialScale`/`divergingScale`), **`NotificationCenter`** (inbox de push), **`VirtualTable`**, **ícone por slug (`/icons`, issue #37)**, **`tempest fix` convertendo import relativo pra `@/` (issue #56)**, release inicial + pipeline tag-push + provenance, os 4 adapters concretos (Sentry/PostHog/GrowthBook/LaunchDarkly), os hooks e componentes das listas P2 antigas, `<FormField>`, OAuth wrapper, `createMockHandlers`, budget de bundle no CI (`size-limit.yml`), sweep `axe` em jsdom + smoke Playwright do gallery (`e2e.yml`), coverage gateando o CI (pisos 98/97/96/94), política de versionamento de tokens CSS (`docs/styles.md`).

### P1 — componentes

Lista **concluída**. Entregues: `useSortable` (enabler de DnD), `Kanban`,
`VirtualTable`, `NotificationCenter`, `ImageCropper` e `Scheduler`. O próximo alvo
de componente passa a ser a lista P2 abaixo.

### P2 — componentes

Lista **concluída**. Entregues: `Chat`, `Transfer`, `Masonry`, `Markdown`, `Tour` e
`FilterBar`. O próximo alvo de componente precisa de uma lista nova — o que sobrou de
backlog é a fatia de CSS (P2) e a cauda de cobertura (P3).

### P2 — CSS pronto

Fatia **concluída**. A camada opt-in ganhou o dashboard (`.tempest-dashboard` +
`.tempest-widget` com spans por **container query**, `.tempest-stat-row`, moldura de
widget), que era o item de "receita de página inteira". Widget redimensionável **pelo
usuário** ficou de fora com motivo escrito na doc: largura em pixel vinda de drag não
convive com track de grid — quem precisa usa `Resizable` numa área livre ou guarda o span
escolhido.

### Ícones — onda fechada (v0.48.0)

As sete issues de `/icons` abertas na adoção do `servus-frontend` saíram juntas:
`registerIcons` + `<Icon icon>` (#171), subpath `/icons/virtual` como módulo real
(#170), normalização de `icon_code` (#172), shard por faixa de 40 em vez de letra
inicial (#169 — pior fetch 19,10 → 4,78 KB brotli), retry + estado `"error"` +
`subscribeToIconErrors` (#175), `<IconPicker>` (#174) e o guard de grafo que mantém
a lista de slugs fora do caminho do `<Icon>` (#173, que **contestou** a issue: o
subpath `/icons/catalog` pedido economizaria zero, porque o tree-shaking já
separava).

Fechada também a **#145**: `materialToLucide` foi de 130 para **263 pares**, montados
da lista oficial de nomes de Material Symbols em vez de esperar o seed real. A regra de
desempate ficou escrita — prefira o mapeamento que mantém **dois nomes distintos de
Material Symbols distintos em lucide**, porque colidir dois códigos no mesmo ícone perde
a informação que o painel usava pra diferenciar.

### P3 — cauda de cobertura (fechada)

A [#209](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/209) saiu pela
primeira saída: branch coverage de 94,71% para **95,51%** (8458/8855), 53 testes novos em
20 arquivos, folga sobre o piso de 0,71 → 1,51 ponto. Um bug real caiu junto — a quebra
forçada de dois espaços do `Markdown`, que a doc prometia e o `line.trim()` do montador
de parágrafo apagava.

Uma segunda passada foi atrás de **função e linha**, e chegou a **99,93% / 99,87%** com
mais 116 testes (5403 no total). O que funcionou: ranquear por descoberta em **valor
absoluto**, não por percentual — `br/state-geo` sozinho tinha 23 funções (um loader
dinâmico por UF, e o teste que as cobre é também o único guard de que os 27 arquivos
existem e batem com a UF). Depois, hooks sem cobertura de ciclo de vida (`useWebSocket`,
`useEventStream`, `useGeolocation`, `usePositionTracker`, `useOnline`) e caminhos de erro
reais: `IndexedDB` recusando escrita, peer `onnxruntime-web` ausente, `AudioContext` que
não fecha, corpo de `fetch` ilegível. Os pisos subiram junto (99/98/99/95).

O que sobra da cauda é, em boa parte, **inalcançável por construção** — e saber disso vale
mais que o número:

- **Guarda de SSR dentro de componente/hook React não é testável.**
  `vi.stubGlobal("window", undefined)` derruba o `react-dom` (`resolveUpdatePriority` lê
  `window.event`) antes de qualquer asserção. Em módulo sem React o mesmo stub funciona —
  foi assim que `charts/palette` e `theme/apply-theme` chegaram a 100%.
- **Default defensivo atrás de validação** (`values[0] ?? ""` em `filter-apply`, chamado
  só depois de `isComplete`) e **`default:` de switch sobre união fechada** completam o
  grupo.

Corolário prático: a próxima vez que a margem apertar, o ganho vem de módulo **sem React**
e de caminho de erro de protocolo (foi onde `resumable-upload` deu 13 ramos de uma vez),
não de varrer componente.

**100% não é alvo.** Restam 2 funções e 13 linhas, todas inalcançáveis por construção —
guarda de SSR dentro de React, default defensivo atrás de validação, `default:` de união
fechada, e um ramo de `MultiPolygon` que o dataset simplificado de municípios não contém.
Fechar isso exigiria `/* v8 ignore */` ou apagar guarda que serve a contexto fora do
browser (service worker, plugin de build): pioram o código para melhorar o número.

## Como retomar

1. Ler `CLAUDE.md` + `CHANGELOG.md` + último commit / branch.
2. `npm install && npm run build && npm test` — sanidade.
3. Próxima tarefa do backlog.

## Comandos chave

```bash
# Workflow diário
npm run dev               # vite build --watch
npm test                  # vitest watch
npm run test:run          # vitest run
npm run test:coverage
npm run typecheck         # tsc -b --noEmit (cobre tests)
npm run lint
npm run format            # prettier --write .
npm run build             # ESM + CJS + d.ts + styles.css

# Docs
npm run docs:llms         # regenera llms.txt + llms-full.txt
npm run e2e:build         # build do SDK + gallery (pré-requisito das capturas)
npm run docs:shots        # captura docs/assets/gallery/<id>.webp por seção
npm run docs:gallery      # insere as capturas nas páginas (--check no guard)

# Release (tag push → CI publica via release-npm.yml)
make release TAG=0.1.6             # branch + bump + validate + tag + push + PR
make release TAG=0.1.6 DRY_RUN=1   # local-only (skip push/PR)
make release TAG=0.1.6 SKIP_VALIDATE=1   # emergency (CI valida de novo)
make releases                      # lista tags v*.*.*
make validate                      # full sanity sem release
make publish                       # fallback manual (NPM_TOKEN no ~/.npmrc)

# Gallery
cd examples/gallery
npm install
npm run dev               # http://127.0.0.1:5173
```

## Decisões consolidadas (não revisitar sem razão)

- **CSS Modules com prefix `tempest_`, e só isso** — é a única estratégia de estilo do SDK. Não existe (nem entra no backlog) modo "headless"/`data-tempest-classname` para Tailwind, Stitches ou Linaria: manter um segundo caminho de estilo dobraria a superfície de cada componente e diluiria os tokens. Um app que use Tailwind pode conviver com o SDK lado a lado (o prefixo evita colisão), mas os componentes continuam estilizados por CSS Modules + tokens `--tempest-*`.
- **Tokens CSS via `--tempest-*`** — única forma de tema. Apps customizam sobrescrevendo no `:root`.
- **Direct deps + peers de contexto** (v0.2.0+, revisado pós-v0.42.1) — `react`, `react-dom` e `react-router` são peers; demais (`zod`, `zustand`, `dexie`, `react-hook-form`, `@tanstack/react-query`, `lucide-react`) são `dependencies` instaladas junto. Todas continuam externalizadas no Rollup config (bundle do SDK não cresce). Apps que não usam um módulo ainda não pagam — Vite/webpack tree-shake. Decisão original v0.1.x era "peer deps opcionais", revertida em v0.2.0 a pedido do usuário pra simplificar onboarding.
  - **O critério é contexto React, não popularidade.** Duas cópias de `zod`/`dexie`/`lucide-react` custam bytes; duas cópias de uma lib com contexto custam **correção** — `useNavigate() may be used only in the context of a <Router>`. Por isso `react-router` saiu de `dependencies` e virou peer `^7 || ^8`: como dep direta ele gerava cópia aninhada em todo app que já tivesse react-router fora do range fixado. Sintoma exato que o próprio `tempest doctor` acusa via `STATEFUL_DEPS` em `bin/tempest.mjs`.
  - **Dívida conhecida, decidida** ([#210](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/210), fechada em 23/08/2026 mantendo o estado): `@tanstack/react-query`, `zustand` e `react-hook-form` também estão em `STATEFUL_DEPS` e continuam como dep direta. Não é inconsistência acidental — a duplicação deles é rara na prática (o SDK aceita ranges largos: `^5`, `^4 || ^5`, `^7.76`) e o onboarding pesa mais. Se um app real colidir, o caminho é o mesmo aplicado ao router: peer com range largo + entrada de CHANGELOG explicando o crash que evita.
- **Adapters injetam SDK** — Sentry/PostHog/GrowthBook/LaunchDarkly **não** são peer deps. Caller passa a instância. Pattern aplicável pra Datadog/Mixpanel/Unleash/etc.
- **Client-side only, PWA offline-first** — o SDK **não** vai para SSR/RSC. Nada de `"use client"`, nada de suporte ao App Router do Next: o alvo é SPA Vite que roda offline (service worker, IndexedDB, outbox, install prompt). Isso é escopo escolhido, não lacuna: um SDK que precisa funcionar nos dois mundos paga em cada API (dois caminhos de render, hidratação, `window` proibido no módulo) e o offline-first fica pior. Os guards `typeof window === "undefined"` que existem nos hooks **continuam** — eles servem pra não explodir fora do browser (testes, contexto de service worker, plugin de build), não pra prometer render no servidor.
- **Sem Storybook** — docs em markdown + `examples/gallery` (app Vite real) cumprem o papel.
- **`dist` com grafo de módulos preservado** (v0.23.0+) — `preserveModules` no Rollup em vez de bundle por entrada. Muitos arquivos em `dist` é esperado, não regressão. Budgets de tamanho medem fatias importadas.
- **`noUncheckedIndexedAccess` fica desligado globalmente, ligado em lugar nenhum por enquanto** — medido em 29/08/2026: 221 erros no `src/` inteiro, dos quais 168 em `components/`. Amostrados em `audio/level-meter`, `audio/sfx-pool` e `br/geocode`, são acessos dentro de laço limitado pelo próprio `length` ou protegidos por invariante já defendida (`Math.max(1, voices)`, corpo que não executa com anel vazio). Adotar trocaria 221 guardas reais por 221 `!` — o operador que a flag existe para evitar. A varredura com a flag **valeu como auditoria**: achou o único defeito real, paleta vazia em `quantizeScale`/`thresholdScale`, que virou `throw`. Repetir a varredura vale; ligar a flag, não. As outras medidas na mesma passada: `noImplicitReturns` 1 erro (adotado), `exactOptionalPropertyTypes` 113 (muda o `.d.ts` que o consumidor vê, então não é mudança interna), `noPropertyAccessFromIndexSignature` 1130.
- **Sem barrel default export** — sempre named exports.
- **Sem Changesets** — pipeline tag-push (`make release TAG=X`) via `scripts/release.sh` + workflow `release-npm.yml`.
- **Três superfícies sincronizadas por release**: git tag, versão no npm e GitHub Release. O workflow aborta se a tag não bater com o `package.json`, faz read-back do registry (`dist-tags.latest`) e cria/atualiza o Release com as notas do CHANGELOG. `make releases-check` audita; `make releases-sync` faz backfill de tags antigas.
- **i18n minimalista in-house** — apps que precisarem de plurais avançados / namespaces / async devem usar `i18next` direto. SDK cobre o caso simples e barato (~1.5KB gzip).
- **Tema dark via `data-tempest-theme="dark"`** — não usar `class="dark"`. Permite escopo parcial (subárvore).
- **Validações BR** (`validateCPF`/`validateCNPJ`) — algoritmo completo, rejeita todos-iguais.
- **Inverter um vídeo não é primitiva de SDK** — registrado como fora de escopo dentro do [#278](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/278), com a conta que decide: um frame 1080p em RGBA é 1920×1080×4 ≈ 8,3 MB, então 10 s a 30 fps são ~2,5 GB de decode em memória na rota WebCodecs (~1 GB mantendo `VideoFrame` em NV12). A outra rota — seek + `drawImage` de trás para frente num canvas com `captureStream()` + `MediaRecorder` — paga o seek frágil do #278 uma vez **por frame**, leva mais que o tempo real e re-encoda com perda. Fazer certo é decode e encode intercalados por GOP, cientes de keyframe: editor de vídeo, não função. Reabre só com consumidor real trazendo duração máxima, resolução e tolerância de espera.
- **Aspas duplas**, tipagem total, JSDoc em inglês nos exports públicos. PT-BR no resto da doc.

## Lições aprendidas

- **`requestVideoFrameCallback` não dispara em seek pausado — só durante reprodução.**
  Medido em Chromium (04/09/2026): `hasApi=true`, `pausedSeek=false`,
  `whilePlaying=true`. A primeira versão do `captureFrame` **bloqueava** o seek nesse
  callback, o que gastaria o timeout inteiro (3 s) em toda captura com `atMs` e
  seguiria igual no fim. Espera correta é por estado: tocando → próximo frame
  apresentado; seek → `seeked` + dois animation frames; frame corrente pausado →
  nada. Corolário geral: **antes de esperar um sinal do browser, medir se aquele
  estado o emite** — a doc da API diz o que ele significa, não quando fica quieto.
- **`canvas.captureStream(fps)` não sintetiza frames; emite quando o canvas muda.**
  O asset de e2e pintava uma cor por segundo com `captureStream(30)` e produziu
  vídeo de **~1 fps** — frames a 700 ms de distância, medido. Qualquer espera menor
  que isso reportava "nenhum frame apresentado", e a falha parecia bug do código sob
  teste. Repintar a cada `requestAnimationFrame` dá ~59 fps (118 frames em 2 s). Asset
  sintético com taxa irreal invalida o teste sem parecer inválido.
- **`MediaRecorder` nem sempre omite a duração.** A crença registrada no
  `AudioPlayer` — WebM novo reporta `duration: Infinity` — é verdadeira em alguns
  caminhos e não em todos: medido, o Chromium **escreve** duração para gravação
  finalizada num único `stop()` (3.000197 s para 3 s de canvas). A sondagem por seek
  além do fim continua necessária (chunks por `timeslice`, outros engines), mas
  afirmação de bug de browser envelhece — escrever o navegador, a data e o valor
  medido ao lado dela.
- **Medição de contraste tem de desligar `transition`.** Trocar
  `data-tempest-theme` e ler `getComputedStyle` logo depois amostra a animação: o
  componente com `transition: color` devolve o foreground do tema que **sai** contra
  o fundo do que **entra**. Aconteceu três vezes seguidas medindo o `VideoPlayer` —
  o mesmo ícone deu 7,32 e depois 2,33 — e 2,33 parece exatamente um defeito real de
  contraste. Injetar `*{transition:none!important}` antes de medir, e conferir que
  ida-e-volta (claro → escuro → claro) devolve o mesmo número; se não devolver, a
  medição está errada, não o CSS.
- **Vite guarda o CSS do SDK em `node_modules/.vite`, e `vite preview` guarda o
  `index.html`.** Rebuildar o SDK e a gallery e recarregar a página serviu **duas
  vezes** o CSS antigo, com a regra anterior visível no CSSOM — o que faz parecer que
  a mudança de CSS não funciona. Ao validar CSS na gallery, limpe
  `examples/gallery/{node_modules/.vite,dist}`, rebuilde, **reinicie o preview** e
  confira o nome do `assets/index-*.css` que a página carregou contra o que está em
  `dist/`.
- **Dataset unido por nome sempre drifta; una por id estável.** Os quatro arquivos de
  `br/` vinham de duas safras do IBGE comparadas por nome, e 44 renomeações depois o
  seletor oferecia município que o geocoder não achava — sem erro, só resposta vazia. O
  código de 7 dígitos sobrevive à renomeação; **o nome é rótulo, não chave**. Corolário:
  o alias de nome antigo não se escreve à mão, se extrai diffando a safra velha contra a
  nova pelo id que as duas compartilham, e a supressão é **por UF** (`Presidente
Juscelino` ainda é município no MA e no MG).
- **Malha simplificada demais mente sobre conter um ponto.** `qualidade=minima` do IBGE
  desenha o Rio inteiro com 35 vértices e o Centro cai **fora**: `reverseGeocode`
  respondia "Niterói". Point-in-polygon precisa de `intermediaria`; o Douglas-Peucker
  local traz o tamanho de volta. E tolerância **fixa** apaga município pequeno inteiro
  (Santa Cruz de Minas tem 3,5 km²) — limite a tolerância a uma fração da diagonal do
  próprio anel.
- **Lacuna de dado se declara, não se absorve.** O IBGE publica município antes da malha
  dele. O que salva é o gerador **falhar** quando aparece um caso não declarado, e o
  pacote expor a lista (`pendingGeometryIds()`), em vez de o app descobrir como resultado
  vazio em produção.
- **Teto de `size-limit` estoura ao fim de uma rodada, e às vezes é a soma que estoura.**
  Duas correções de `http/` couberam sozinhas e mediram 93 B acima do teto juntas. Subir é
  a resposta certa quando os bytes compram comportamento — o teto anterior media código
  que não executava —, mas escreva o número medido e a razão no CHANGELOG, senão o teto
  vira carimbo.
- **Merjar N PRs que tocam `[Unreleased]` conflita N-1 vezes.** Toda entrada entra no mesmo
  ponto do `CHANGELOG.md`. É concatenação, não escolha de lado: o que já está na `main`
  primeiro, a entrada do branch depois. Merjar o PR com o maior diff de dado **primeiro**
  evita rebasear megabytes.

- `vi.fn(() => obj)` **não funciona** como constructor mock. Use `class Mock { ... }` quando o código faz `new X(...)`.
- jsdom não calcula layout, então `offsetParent` é sempre null. `useFocusTrap` filtra via `getComputedStyle` em vez disso.
- `tsc -b` checa testes — solução: `@types/vitest/globals` + `@testing-library/jest-dom` em `types` do tsconfig.
- Edits em barrels (`src/index.ts`, `src/components/index.ts`, `src/telemetry/index.ts`) precisam ser **lidos** antes de re-escrever — várias vezes acabaram sobrescritos sem re-exports prévios.
- CSS Modules + Vite library: output é um único `dist/styles.css`. Hashes prefixados `tempest_*`.
- Dexie em jsdom funciona com `fake-indexeddb/auto`. `await db.delete()` em `afterEach`.
- Service worker handlers chamam `getSwScope()` retornando `globalThis`. Testes precisam manter props no `globalThis` durante toda a execução do listener.
- **Vite library + format-check em CI**: husky pre-commit só formata staged files via lint-staged. Histórico de ts/tsx nunca passou por prettier — antes do primeiro push tag, rodar `npx prettier --write .` repo-wide. CI `format:check` falha senão.
- **ESM eager-resolve no smoke**: tarball importa `@tanstack/react-query` (e outros peers) no top-level. Smoke install precisa instalar **todos** os optional peers, senão `ERR_MODULE_NOT_FOUND`.
- **npm publish 2FA**: token "Classic Automation" tem bypass 2FA por default. Token "Granular" precisa marcar "Allow bypass 2FA" explicitamente. Sem isso → 403 mesmo no CI.
- **provenance**: requer OIDC provider. Funciona em GitHub Actions (`id-token: write` + `NPM_CONFIG_PROVENANCE=true`). Local fails com `provider: null`.
- **Changesets `npm version` hijack**: ter `"version": "changeset version"` no `package.json.scripts` faz `npm version 0.1.1` (script lifecycle) rodar `changeset version`. Quebra release.sh. Solução: remover scripts changeset quando migrar para outro fluxo.
- **`Input.size: InputSize`** (union) shadowed `HTMLInputElement.size: number`. Componentes que repassavam `...InputHTMLAttributes` para `Input` (como `DatePicker`) precisam de `Omit<..., "size">`.
- **Bundle único mata tree-shaking**: Vite lib mode emite um arquivo por entrada, e o bundler do app não consegue provar que aqueles statements são livres de efeito colateral — importar só `cn` arrastava 8.5 KB gzip. `rollupOptions.output.preserveModules: true` (um arquivo por módulo de origem) derruba o piso pra 118 B brotli. Custo: `dist` vai de 212 pra 1804 arquivos, tarball igual (2.5 MB). `sideEffects: ["**/*.css"]` no `package.json` só ajuda **depois** disso.
- **Budget de bundle no barrel inteiro é métrica errada**: cresce com toda feature e não diz nada do custo pro consumidor. Medir por fatia importada (`size-limit` + campo `import`); manter o barrel só como teto explícito.
- **Token de texto validado contra um fundo não vale sobre outro**: `--tempest-text-subtle` é resolvida contra `--tempest-bg`/`--tempest-surface` e reprova 4,5:1 sobre `--tempest-primary-soft`. Aconteceu duas vezes (tokens de sintaxe do `CodeBlock`, timestamp da bolha do `Chat`) e as duas vezes só apareceu no **browser real** — o `axe` do jsdom desliga `color-contrast` porque não há paint. Sobre superfície tingida, use o foreground daquela superfície (`--tempest-primary-on-soft`) e de-enfatize por **tamanho**, não por cor.
- **Linter de CSS afina no dogfood, não no design**: a primeira versão da análise de CSS acusou 47 problemas no CSS do próprio SDK — 43 eram o **idioma de knob** (`var(--tempest-card-padding, fallback)`, nome que não é token de propósito) e só 4 eram bug. Regra final: `var()` **com fallback** nunca é reportado; sem fallback, sim. Vale pra qualquer checagem nova — rodar no `src/` do SDK antes de considerar pronta, porque a taxa de falso positivo decide se a ferramenta é lida ou ignorada.
- **Erro de sintaxe cascateia em achado falso**: uma declaração rejeitada pelo parser deixa a regra "vazia", e "regra vazia = código morto" é mentira sobre uma regra que só está quebrada. O parser marca `block.invalid` e a semântica cala.
- **`size-limit` + campo `import`**: o path é relativo ao arquivo de config (config fora do repo quebra a resolução) e a sintaxe é `"import": { "./dist/x.js": "{ A, B }" }` — string solta não funciona. Nome de export errado derruba o build inteiro do esbuild.
