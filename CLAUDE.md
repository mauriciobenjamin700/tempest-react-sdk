# CLAUDE.md — tempest-react-sdk

SDK público da Tempest com componentes React, hooks e integrações reutilizáveis. Consumido por todos os apps frontend Tempest. Inspirado nos padrões consolidados em `alofans-frontend` e `transport-admin-system`.

> Este arquivo é o guia operacional do SDK. Padrões globais (PR template PT-BR, conventional commits, `gh pr edit` workaround) vêm de `~/.claude/CLAUDE.md` e continuam valendo.

## Estado atual (snapshot v0.23.0 — em preparo, aguardando tag)

- **npm**: <https://www.npmjs.com/package/tempest-react-sdk> — 29 tags publicadas (0.1.0 → 0.22.0) com signed provenance via OIDC. Histórico completo em `RELEASES.md` (gerado por `make releases-md`) e `CHANGELOG.md` — **não duplicar aqui**.
- **Testes**: 1490 testes em 358 arquivos, ~33 s sob `vitest + jsdom + fake-indexeddb`.
- **Superfície**: 34 módulos em `src/`, 104 componentes, 45 hooks, 384 exports na entrada raiz.
- **Empacotamento (v0.23.0)**: `dist/` preserva o grafo de módulos (`preserveModules`). O que o app paga de fato (brotli): `{ cn }` 118 B · `{ Button }` 820 B · app típico 6.83 KB · offline/PWA 4.45 KB · `styles.css` 20.6 KB. Teto sem tree-shaking: 64.5 KB ESM / 79.9 KB CJS. Budgets do `size-limit` são **por fatia importada**, não pelo barrel.
- **Subpaths** (8): `.`, `/testing` (MSW), `/vite` (`createViteConfig`), `/sw` (helpers de contexto SW), `/charts` (recharts peer), `/editor` (tiptap peer), `/vision` (onnxruntime-web peer), `/br` (dataset BR + mapa clicável), `/styles.css`.
- **CLIs** (`bin/`): `create-tempest-app` (scaffold, `npm create tempest-app`) com templates `template/` e `template-pwa/`; `tempest` (project CLI: `doctor`, `lint`, `fix`, `format`, `gen api <openapi>` → Zod + types + services).
- **Style modules**: `colors.css` + `typography.css` + `motion.css` + `density.css` + `reset.css` + `responsive.css` + `print.css`.
- **Tooling**: Prettier 3, Husky pre-commit (lint-staged), `Makefile` + `scripts/release.sh` (tag-push pipeline), 4 workflows — `ci.yml` (PR, matriz node 20/22), `release-npm.yml` (tag push), `size-limit.yml`, `docs.yml` (Pages).
- **Docs**: 44 páginas base em `docs/` (88 arquivos com as traduções `.en.md`) + 10 páginas de componentes por categoria + tutorial de 6 páginas + 3 diagramas drawio + `llms.txt`/`llms-full.txt` (`npm run docs:llms`).
- **Demo vivo**: app Vite em `examples/gallery` (37 sections) consome o SDK via `file:../..`.

### Adapter design pattern (consolidado v0.1.3+)

Para qualquer wrapper futuro (Datadog, Amplitude, Mixpanel, Unleash, Cloudflare):

1. Caller injeta instância SDK no factory (`{ sentry: Sentry }`, `{ posthog }`, `{ client }`). Nunca peer dep.
2. Exporta `<X>Like` interface (subset mínimo usado) — útil pra mocks de teste.
3. Options minimalistas: `init` (opcional, chamado em provider.init), valores default razoáveis (flushTimeout, breadcrumbCategory).
4. Mapeamento direto sem state — adapter é stateless quando possível.
5. README + `docs/<modulo>.md` documentam mapping table call-por-call.

## Tech stack

- React 18/19 (peer dep) + TypeScript 5.9
- Vite 7 library mode + `vite-plugin-dts` (rollup types)
- Vitest 4 + @testing-library/react + jsdom + fake-indexeddb
- ESLint 9 + typescript-eslint + Prettier 3
- Husky 9 + lint-staged 17 (formatters em staged files)

Apenas `react` + `react-dom` são peer deps **obrigatórios** (regra de uma instância React). Deps diretas (instaladas junto): `@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`, `react-router-dom`, `fflate`. Todas externalizadas no `vite.config.ts` pro bundler do app tree-shakear.

Peers **opcionais** (`peerDependenciesMeta.optional`), só quem usa o módulo instala: `recharts` (`/charts`), `@tiptap/react` + `@tiptap/starter-kit` (`/editor`), `leaflet` (tile layer do `geo`), `onnxruntime-web` (`/vision`), `vite` + `@vitejs/plugin-react` (`/vite`).

SDKs externos para adapters (não declarados — caller injeta instância):

- `@sentry/browser`, `posthog-js`, `@growthbook/growthbook`, `launchdarkly-js-client-sdk`

## Estrutura

```text
tempest-react-sdk/
├── src/                                     (34 módulos — subpath marcado com ⇢)
│   ├── access/         useCan, <Can>, permissionsFromToken (RBAC)
│   ├── app/            <AppProviders> (ErrorBoundary → Query → Theme → i18n)
│   ├── audio/          createAudioPlayer, useAudio, playAudio
│   ├── auth/           createAuthStore, AuthGuard, decodeJWT, lazyWithRetry, createRefreshQueue, createTempestAuth
│   ├── br/          ⇢  dataset de estados/municípios + mapa UF clicável + centroides (chunks lazy)
│   ├── charts/      ⇢  wrappers recharts
│   ├── components/     104 componentes UI
│   ├── data/           createDataProvider, <TempestDataProvider>, useDataProvider (CRUD por recurso)
│   ├── editor/      ⇢  RichTextEditor (tiptap)
│   ├── error-boundary/ ErrorBoundary, useErrorHandler
│   ├── feature-flags/  Provider + InMemory + GrowthBook + LaunchDarkly adapters
│   ├── forms/          FormField, validateForm, zodResolver, useZodForm, inputs mascarados BR, useViaCEP
│   ├── geo/            mapas sem tile, createPositionTracker, OSRM backend, haversine/bounds
│   ├── hooks/          45 hooks (useDebounce, useBreakpoint, useInstallPrompt, useServiceWorkerUpdate, …)
│   ├── http/           createApiClient, parseResponse, uploadWithProgress, retry, usePoll, idempotency
│   ├── i18n/           createI18n, I18nProvider, useI18n, useTranslate
│   ├── logger/         createLogger leveled + plug sinks
│   ├── oauth/          <GoogleSignIn>, useOAuthCallback
│   ├── offline/        createOfflineStore (Dexie), createOfflineSync (outbox+pull+watermark), useOfflineSync, resolvers de conflito
│   ├── push/           usePushSubscription, urlBase64ToUint8Array, isPushSupported
│   ├── query/          QueryProvider, createQueryKeys, paginação, useOfflineMutation, persistQueryClientOffline
│   ├── router/         defineRoutes, <AppRouter>, <RouteGuard> (React Router v7 declarativo)
│   ├── share/          share, isShareSupported, shareOrDownloadBlob
│   ├── sse/            createEventStream, useEventStream
│   ├── store/          createStore, createSelectors (Zustand)
│   ├── styles/         colors + density + motion + typography + reset + responsive + print + index.css
│   ├── sw/          ⇢  registerServiceWorker, installPrecache, installBackgroundSync, inspectCaches/clearCaches
│   ├── telemetry/      Provider + console + Sentry + PostHog adapters
│   ├── testing/     ⇢  createMockHandlers (MSW-shaped)
│   ├── theme/          ThemeProvider, useTheme, themeInitScript (no-flash)
│   ├── utils/          cn, format BR, storage, writeXlsx, coleções
│   ├── vision/      ⇢  inferência ONNX (ort-vision-sdk-web vendorizado) + hooks de câmera
│   ├── vite/        ⇢  createViteConfig
│   ├── ws/             createWebSocket, useWebSocket
│   └── index.ts        barrel raiz (384 exports)
├── bin/                create-tempest-app.mjs + tempest.mjs (doctor/lint/fix/format/gen api)
├── template/           scaffold Vite+React+TS
├── template-pwa/       scaffold PWA (SW próprio + vite.sw.config.ts)
├── docs/               44 páginas base (+ .en.md) + components/ + tutorial/ + diagrams/ + llms.txt
├── examples/gallery/   app Vite com 37 sections consumindo o SDK (file:../..)
├── test/setup.ts       jsdom + jest-dom + fake-indexeddb auto
├── Makefile            release / validate / bump / releases-md alvos
├── scripts/            release.sh (tag-push), gen-llms.mjs, gen-br-geodata.mjs, vendor-vision.mjs
├── RELEASES.md         auto-gerado por `make releases-md`
└── .github/workflows/
    ├── ci.yml          PR — format + lint + typecheck + test + build (node 20/22)
    ├── size-limit.yml  budgets por fatia importada
    ├── docs.yml        MkDocs bilíngue → GitHub Pages
    └── release-npm.yml tag push v*.*.* → smoke install + publish --provenance
```

## Backlog priorizado

Entregue e fora do backlog: release inicial + pipeline tag-push + provenance, os 4 adapters concretos (Sentry/PostHog/GrowthBook/LaunchDarkly), os hooks e componentes das listas P2 antigas, `<FormField>`, OAuth wrapper, `createMockHandlers`, budget de bundle no CI (`size-limit.yml`), sweep `axe` em jsdom + smoke Playwright do gallery (`e2e.yml`), coverage gateando o CI (pisos 96/94/94/89), política de versionamento de tokens CSS (`docs/styles.md`).

### P1 — features opcionais

1. **CSS opcional** (`data-tempest-classname`) para users de Tailwind/Stitches/Linaria.

### P2 — polimento

2. **13 warnings de `react-refresh/only-export-components`** em Providers (hook exportado junto do componente, intencional). Viram annotations em todo run de CI. Resolver com `allowExportNames` ou override por arquivo.
3. **Cauda de branches (90.1% → 95%)**: sobra ~470 branches espalhadas em ~90 arquivos, ~5 cada. Sem alvo gordo — só valeria com um objetivo específico (badge).

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

- **CSS Modules com prefix `tempest_`** — evita colisão com apps consumidores. Tailwind/Stitches OK lado a lado.
- **Tokens CSS via `--tempest-*`** — única forma de tema. Apps customizam sobrescrevendo no `:root`.
- **Direct deps + react peer** (v0.2.0+) — apenas `react` + `react-dom` como peer; demais (`zod`, `zustand`, `dexie`, `react-hook-form`, `@tanstack/react-query`, `lucide-react`) viram `dependencies` instaladas junto. Continuam externalizadas no Rollup config (bundle do SDK não cresce). Apps que não usam um módulo ainda não pagam — Vite/webpack tree-shake. Decisão original v0.1.x era "peer deps opcionais", revertida em v0.2.0 a pedido do usuário pra simplificar onboarding.
- **Adapters injetam SDK** — Sentry/PostHog/GrowthBook/LaunchDarkly **não** são peer deps. Caller passa a instância. Pattern aplicável pra Datadog/Mixpanel/Unleash/etc.
- **Client-side only, PWA offline-first** — o SDK **não** vai para SSR/RSC. Nada de `"use client"`, nada de suporte ao App Router do Next: o alvo é SPA Vite que roda offline (service worker, IndexedDB, outbox, install prompt). Isso é escopo escolhido, não lacuna: um SDK que precisa funcionar nos dois mundos paga em cada API (dois caminhos de render, hidratação, `window` proibido no módulo) e o offline-first fica pior. Os guards `typeof window === "undefined"` que existem nos hooks **continuam** — eles servem pra não explodir fora do browser (testes, contexto de service worker, plugin de build), não pra prometer render no servidor.
- **Sem Storybook** — docs em markdown + `examples/gallery` (app Vite real) cumprem o papel.
- **`dist` com grafo de módulos preservado** (v0.23.0+) — `preserveModules` no Rollup em vez de bundle por entrada. Muitos arquivos em `dist` é esperado, não regressão. Budgets de tamanho medem fatias importadas.
- **Sem barrel default export** — sempre named exports.
- **Sem Changesets** — pipeline tag-push (`make release TAG=X`) via `scripts/release.sh` + workflow `release-npm.yml`.
- **i18n minimalista in-house** — apps que precisarem de plurais avançados / namespaces / async devem usar `i18next` direto. SDK cobre o caso simples e barato (~1.5KB gzip).
- **Tema dark via `data-tempest-theme="dark"`** — não usar `class="dark"`. Permite escopo parcial (subárvore).
- **Validações BR** (`validateCPF`/`validateCNPJ`) — algoritmo completo, rejeita todos-iguais.
- **Aspas duplas**, tipagem total, JSDoc em inglês nos exports públicos. PT-BR no resto da doc.

## Lições aprendidas

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
- **`size-limit` + campo `import`**: o path é relativo ao arquivo de config (config fora do repo quebra a resolução) e a sintaxe é `"import": { "./dist/x.js": "{ A, B }" }` — string solta não funciona. Nome de export errado derruba o build inteiro do esbuild.
