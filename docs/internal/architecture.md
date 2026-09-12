# Arquitetura: onde o código mora e o que ele custa

Leia antes de criar arquivo ou módulo, mover código, adicionar export ou subpath,
mexer em barrel, ou tocar no empacotamento.

## Estrutura de `src/`

40 módulos, um por domínio. O que é subpath público está marcado com ⇢.

```text
src/
├── access/          useCan, <Can>, permissionsFromToken (RBAC)
├── app/             <AppProviders> (ErrorBoundary → Query → Theme → i18n)
├── audio/           createAudioPlayer, useAudio, playAudio, createAudioBus
├── auth/            createAuthStore, AuthGuard, decodeJWT, createRefreshQueue
├── br/           ⇢  5.571 municípios do IBGE + 35 RAs do DF + mapa UF clicável
├── capture/         createMediaRecorder, useVideoRecorder, useBarcodeScanner
├── charts/       ⇢  wrappers recharts
├── components/      129 componentes UI
├── data/            createDataProvider, <TempestDataProvider>, useDataProvider
├── editor/       ⇢  RichTextEditor (tiptap)
├── error-boundary/  ErrorBoundary, useErrorHandler
├── feature-flags/   Provider + InMemory + GrowthBook + LaunchDarkly
├── forms/           FormField, zodResolver, useZodForm, inputs BR, useViaCEP
├── geo/             mapas sem tile, createPositionTracker, OSRM, haversine
├── hooks/           54 hooks `useX`
├── http/            createApiClient, parseResponse, uploadWithProgress, retry
├── i18n/            createI18n, I18nProvider, useI18n, useTranslate
├── icons/        ⇢  <Icon name> por slug + IconProvider + 46 shards gerados
├── imaging/      ⇢  decode/encode/resize/crop/compress em canvas, sem dep
├── logger/          createLogger leveled + sinks
├── oauth/           <GoogleSignIn>, useOAuthCallback
├── offline/         createOfflineStore (Dexie), createOfflineSync, resolvers
├── perf/            createInferenceProfiler, readDeviceProfile
├── push/            usePushSubscription, isPushSupported
├── query/           QueryProvider, createQueryKeys, useOfflineMutation
├── router/          defineRoutes, <AppRouter>, <RouteGuard>
├── share/           share, isShareSupported, shareOrDownloadBlob
├── sse/             createEventStream, useEventStream
├── store/           createStore, createSelectors (Zustand)
├── styles/          colors + density + motion + typography + reset + print
├── sw/           ⇢  registerServiceWorker, installPrecache, inspectCaches
├── tabular/      ⇢  TabularPredictor/CompactPredictor (ONNX) + cache
├── telemetry/       Provider + console + Sentry + PostHog
├── testing/      ⇢  createMockHandlers (MSW-shaped)
├── theme/           ThemeProvider, useTheme, createTheme, themeInitScript
├── utils/           cn, format BR, storage, writeXlsx, coleções
├── vision/       ⇢  inferência ONNX (ort-vision-sdk-web vendorizado)
├── vite/         ⇢  createViteConfig
├── webrtc/          tuneOpus, setTunedLocalDescription, createPeerMesh
├── ws/              createWebSocket, useWebSocket
└── index.ts         barrel raiz
```

Fora de `src/`: `bin/` (CLIs `create-tempest-app` e `tempest`), `template/` e
`template-pwa/` (scaffolds), `loader/` (loader de `.css` para Node cru),
`examples/gallery/` (app Vite que consome o SDK via `file:../..`),
`scripts/`, `test/`, `e2e/`.

## Barris

- **Sempre named export**, nunca default.
- `src/index.ts` re-exporta `./components`, `./hooks` e cada módulo.
- **Leia o barrel antes de reescrevê-lo.** Ele já foi sobrescrito sem os
  re-exports anteriores mais de uma vez; o guard `test/public-surface.test.ts`
  pega export não documentado, não export perdido.
- Todo export de runtime da entrada raiz **tem de aparecer na documentação** —
  é o que `public-surface` afere.

## Subpaths

A lista viva é o campo `exports` do `package.json`. Hoje são 18: `.`, `/testing`,
`/vite`, `/sw`, `/charts`, `/editor`, `/imaging`, `/tabular`, `/vision`, `/br`,
`/icons`, `/icons/virtual`, `/styles.css`, `/styles/*.css`,
`/styles/manifest.json`, `/utilities.css`, `/node-css-loader`, `/package.json`.

Adicionar subpath é mudança de superfície pública: entra no `exports`, no
`files`, na doc e no CHANGELOG do mesmo commit.

## Empacotamento

- **`preserveModules`** (v0.25.0+): um arquivo de saída por módulo de origem. Ter
  muitos arquivos em `dist/` é esperado, não regressão. Bundle único mata o
  tree-shaking — medido, importar só `cn` arrastava 8,5 kB gzip antes disso.
- **`sideEffects: ["**/*.css"]`** no `package.json` é o que deixa o bundler jogar
  fora a folha de um componente que o app não alcança. Só vale quando a resolução
  passa por `node_modules` (ver [`lessons.md`](./lessons.md)).
- **CSS por componente** (0.63.0): cada `dist/**/*.module.js` importa
  `styles/component/<X>.css`, escrito por `scripts/link-component-css.mjs`
  **depois** do build. O app importa só a fundação (`tokens.css` + `scoped.css`).
  Medido num app de 3 componentes: 29,15 → **4,49 kB br** (Vite) / 4,88 kB
  (webpack), computed styles idênticos em 37 seletores, claro e escuro.
- **Fora de um bundler**, o pacote ships o loader:
  `node --import tempest-react-sdk/node-css-loader seu-script.mjs`.

## Contagens, e como reproduzi-las

```bash
# exports de runtime na entrada raiz (567 na 0.64.0)
node --import ./loader/css-loader.mjs --input-type=module \
  -e 'const m = await import("./dist/tempest-react-sdk.js"); console.log(Object.keys(m).length)'
```

O `--import` não é opcional: sem o loader o comando morre em
`ERR_UNKNOWN_FILE_EXTENSION` antes de contar nada. Contar `export` no `.d.ts` dá
~1250, porque enxerga todo tipo interno do bundle — não use.

```bash
npx size-limit          # budgets por fatia importada
npm run docs:llms       # regenera llms.txt / llms-full.txt
```

## Budgets de tamanho

`.size-limit.checks.json` guarda os limites; `.size-limit.js` é só o ajuste de
medição (carrega CSS como módulo vazio). **Budget é por fatia importada**, nunca
pelo barrel inteiro — o barrel cresce com toda feature e não diz nada sobre o
custo do consumidor. Os dois checks de barrel existem como teto explícito.

Subir um teto é a resposta certa quando os bytes compram comportamento — com o
número medido e a razão escritos no CHANGELOG. Sem isso, o teto vira carimbo.

## Peers e dependências

- **Peers obrigatórios**: `react`, `react-dom` (`^18 || ^19`) e `react-router`
  (`^7 || ^8`). O critério é **contexto React**, não popularidade: duas cópias de
  `zod` custam bytes; duas de uma lib com contexto custam correção.
- **Deps diretas** (instaladas junto): `@tanstack/react-query`, `zod`, `zustand`,
  `dexie`, `react-hook-form`, `lucide-react`, `fflate`. Todas externalizadas no
  `vite.config.ts`.
- **Peers opcionais**: `recharts`, `@tiptap/*`, `leaflet`, `onnxruntime-web`,
  `vite` + `@vitejs/plugin-react`.
- **Adapters injetam a instância** (Sentry, PostHog, GrowthBook, LaunchDarkly):
  nunca peer dep. O caller passa o SDK; exportamos uma interface `<X>Like` com o
  subset usado.
