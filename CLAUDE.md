# CLAUDE.md — tempest-react-sdk

SDK público da Tempest com componentes React, hooks e integrações reutilizáveis. Consumido por todos os apps frontend Tempest. Inspirado pelos padrões consolidados em `alofans-frontend` e `transport-admin-system`.

> Este arquivo é o guia operacional do SDK. Padrões globais (PR template PT-BR, conventional commits, `gh pr edit` workaround) vêm de `~/.claude/CLAUDE.md` e continuam valendo.

## Estado atual (snapshot v0.1.4 — publicado)

- **Publicado**: <https://www.npmjs.com/package/tempest-react-sdk> — versões 0.1.0 → 0.1.4 todas live com provenance signed via OIDC.
- **Build verde**: ESM ~103KB → 29KB gzip, CJS ~74KB → 25KB gzip, CSS 33KB → 6KB gzip, `index.d.ts` rollupado.
- **Cobertura**: 487 testes em 169 arquivos. ~13s sob `vitest + jsdom + fake-indexeddb`.
- **Tooling**: Prettier, Husky pre-commit (lint-staged), `Makefile` + `scripts/release.sh` (tag-push pipeline), CI workflow (`release-npm.yml` no tag push + `ci.yml` matriz node 20/22 em PR).
- **Docs**: 24 markdowns em `docs/` + 3 diagramas drawio (`architecture`, `request-flow`, `push-flow`).
- **Demo vivo**: app Vite em `examples/gallery` consome o SDK via `file:../..`.

### Mudanças desde v0.1.0

- v0.1.1: README rewrite (TOC + 32 recipes), Vite stack section, typecheck/changesets cleanup.
- v0.1.2: `Form` / `FormSection` / `FormRow` / `FormActions` components (stack/inline/grid layout variants).
- v0.1.3: `createSentryTelemetryAdapter` (P1 #4).
- v0.1.4: `createPostHogTelemetryAdapter` (P1 #5), `createGrowthBookFeatureFlagsAdapter` (P1 #6), `createLaunchDarklyFeatureFlagsAdapter` (P1 #7).

Adapter design pattern consolidado: caller injeta instância SDK (não vira peer dep), `<X>Like` interface exposta pra mocking, options minimalistas. Aplica para qualquer wrapper futuro (Datadog, Mixpanel, Amplitude, Unleash, etc.).

## Tech Stack

- React 18/19 (peer dep) + TypeScript 5.9
- Vite 7 library mode + `vite-plugin-dts` (rollup types)
- Vitest 4 + @testing-library/react + jsdom + fake-indexeddb
- ESLint 9 + typescript-eslint + Prettier 3
- Changesets para versionamento + release

Peer deps **opcionais** (apps consomem só o que precisam):

- `@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`

## Estrutura

```text
tempest-react-sdk/
├── src/
│   ├── audio/          createAudioPlayer, useAudio, playAudio
│   ├── auth/           createAuthStore, AuthGuard, decodeJWT, lazyWithRetry, createRefreshQueue
│   ├── components/     32 componentes UI (Button, Input, Modal, Table, Drawer, Tabs, etc.)
│   ├── error-boundary/ ErrorBoundary, useErrorHandler
│   ├── feature-flags/  Provider + InMemory adapter + useFeatureFlag/useFlagValue
│   ├── forms/          validateForm, zodResolver, useZodForm, masked inputs BR, useViaCEP
│   ├── hooks/          17 hooks (useDebounce, useClipboard, useKeyboardShortcut, useFocusTrap, ...)
│   ├── http/           createApiClient, parseResponse, uploadWithProgress, retry, usePoll, idempotency
│   ├── i18n/           createI18n, I18nProvider, useI18n, useTranslate
│   ├── logger/         createLogger leveled + plug sinks
│   ├── offline/        createOfflineStore (Dexie wrapper, owner-scoped)
│   ├── push/           WebPushClient, usePushSubscription, urlBase64ToUint8Array
│   ├── query/          QueryProvider, createQueryKeys, STALE_TIME / CACHE_TIME / REFETCH_TIME
│   ├── share/          share() wrapper + isShareSupported
│   ├── sse/            createEventStream, useEventStream
│   ├── styles/         tokens --tempest-* + reset + dark via [data-tempest-theme]
│   ├── sw/             registerServiceWorker + installPushHandler/NotificationClick/SkipWaiting
│   ├── telemetry/      TelemetryProvider + console adapter (Sentry/Datadog/PostHog plugáveis)
│   ├── theme/          ThemeProvider, useTheme, themeInitScript (no-flash)
│   ├── utils/          cn, format BR, storage
│   ├── ws/             createWebSocket, useWebSocket
│   └── index.ts        barrel raiz
├── docs/               markdown por módulo + diagramas drawio + release.md
├── examples/gallery/   app Vite consumindo o SDK (file:../..)
├── test/setup.ts       jsdom + jest-dom + fake-indexeddb auto
├── Makefile            release + validate + bump + releases-md alvos
├── scripts/release.sh  pipeline tag-push (branch + bump + validate + tag + PR)
├── RELEASES.md         auto-gerado por `make releases-md`
└── .github/workflows/
    ├── ci.yml          PR — lint + format + typecheck + test + build
    └── release-npm.yml tag push v*.*.* → smoke + publish --provenance
```

## Próximos passos (priorizado)

### ✓ P0 — release inicial (concluído)

- ✓ Primeiro commit + tag v0.1.0
- ✓ Publicado no npm (`tempest-react-sdk`)
- ✓ README badges
- ✓ Tag-push release pipeline + Makefile + scripts/release.sh
- ✓ NPM_TOKEN secret + provenance via OIDC

### ✓ P1 — adapters concretos (concluído)

- ✓ #4 `createSentryTelemetryAdapter` (v0.1.3)
- ✓ #5 `createPostHogTelemetryAdapter` (v0.1.4)
- ✓ #6 `createGrowthBookFeatureFlagsAdapter` (v0.1.4)
- ✓ #7 `createLaunchDarklyFeatureFlagsAdapter` (v0.1.4)

Adapters seguem o pattern: caller injeta instância SDK (não vira peer dep). Próximos providers (Datadog, Amplitude, Mixpanel, Unleash) seguir o mesmo molde.

### P1 — cobertura de testes para 95%+ branches

Branches atual: 84.86%. Gaps remanescentes (~5%):

- Paths `typeof window === "undefined"` em hooks SSR-safe (`use-online`, `use-media-query`, `use-document-visibility`, `use-idle`, `storage`, `i18n storage`).
- `usePushSubscription` paths de erro raros (66, 83-84, 98-99).
- `use-focus-trap` ramificações Tab/Shift+Tab quando `current === null`.
- `use-before-install-prompt` else branches.

Estratégia: extrair globals para injeção via parameter (refactor mínimo) ou mockar `globalThis.window` com `vi.stubGlobal`. Custo > valor — só atacar se quiser fechar 95%.

### P2 — features adicionais

8. **Hooks novos úteis**:
   - `useEventListener(target, name, handler)` — wrap genérico.
   - `useLocalStorage<T>(key, defaultValue)` — hook em cima do `storage` helper.
   - `useToggle(initial)` — açúcar pra `useState<boolean>`.
   - `useAsync<T>(fn, deps)` — hook genérico (sem cache, distinto de React Query).
9. **Componentes pendentes**:
   - `Accordion`/`Collapse`.
   - `Popover`/`DropdownMenu` (Floating UI ou manual com positioning leve).
   - `Combobox` (Select com busca + filtro).
   - `RangeSlider`.
   - `RatingStars`.
10. **Form helpers**:
    - `<Form>` wrapper integrando RHF + zod + Field components automáticos.
    - `useFieldArray` re-export tipado.
11. **OAuth wrapper**:
    - `<GoogleSignIn>` wrapper sobre `@react-oauth/google` (alofans usa).
    - `useOAuthCallback` pra processar redirect.
12. **MSW handlers helper**:
    - `createMockHandlers` exportando factory pra testes com `msw`.

### P2 — performance & DX

13. **Tree-shaking refinement**:
    - Considerar entry points subpath (`tempest-react-sdk/forms`, `tempest-react-sdk/http`) pra apps que importam só um módulo.
    - Validar que cada subpath build separadamente reduz bundle ainda mais.
14. **CSS-in-JS opcional**:
    - Avaliar tornar styles.css opcional e suportar `data-tempest-classname` para users que usem Tailwind/Stitches/Linaria.
15. **Storybook** (já recusado — manter docs em markdown + gallery app).

### P3 — observabilidade do SDK em produção

16. **Bundle size budget**:
    - GitHub Action que reporta tamanho do bundle por PR (`bundlewatch` ou `size-limit`).
    - Falhar PR se passar de X KB sem aprovação manual.
17. **Versionamento de tokens CSS**:
    - Documentar política: tokens são API pública, mudanças quebram apps consumidores.
    - Considerar `--tempest-v2-*` co-existindo durante migrações.

## Como retomar o trabalho

Quando voltar:

1. Ler `CLAUDE.md` (este arquivo) + `CHANGELOG.md` + último commit / branch.
2. `npm install && npm run build && npm test` — sanidade.
3. Atacar próxima tarefa P0/P1 pendente.

### Comandos chave

```bash
# Workflow diário
npm run dev          # build watch
npm test             # vitest watch
npm run test:run     # ci
npm run test:coverage
npm run typecheck
npm run lint
npm run format
npm run build

# Release (tag-push pipeline — CI publica via release-npm.yml)
make release TAG=0.1.5             # branch + bump + validate + tag + push + PR
make release TAG=0.1.5 DRY_RUN=1   # tudo local, pula push + PR
make releases                      # lista tags v*.*.*
make publish                       # fallback manual (requer NPM_TOKEN no ~/.npmrc)

# Gallery
cd examples/gallery
npm install
npm run dev          # http://127.0.0.1:5173
```

## Decisões consolidadas (não revisitar sem razão)

- **CSS Modules com prefix `tempest_`** — escolhido pra evitar colisão com apps consumidores. Tailwind/Stitches são compatíveis lado a lado.
- **Tokens CSS via `--tempest-*`** — única forma de tema. Apps customizam sobrescrevendo no `:root`.
- **Peer deps opcionais** em `peerDependenciesMeta` — apps instalam só `react` + `react-dom`. Bibliotecas pesadas (Dexie, RHF) são exigidas apenas quando o módulo correspondente é importado.
- **Sem Storybook** — docs em markdown + app gallery `examples/gallery` cumprem o papel. Diagramas em drawio editáveis.
- **Sem barrel default export** — sempre named exports. Imports do consumidor: `import { Button, useDebounce } from "tempest-react-sdk"`.
- **i18n minimalista in-house** — apps que precisarem de plurais avançados / namespaces dinâmicos / loader async devem usar `i18next`. O SDK cobre o caso simples e barato (~1.5KB gzip).
- **Tema dark via `data-tempest-theme="dark"`** — não usar `class="dark"`. Permite escopo parcial (subárvore).
- **Validações BR** (`validateCPF`/`validateCNPJ`) — algoritmo completo, rejeita todos-iguais.
- **Aspas duplas**, tipagem total, JSDoc em inglês nos exports públicos. PT-BR no resto da doc.

## Lições aprendidas (durante construção)

- `vi.fn(() => obj)` **não funciona** como constructor mock. Use `class Mock { ... }` quando o código faz `new X(...)`.
- jsdom não calcula layout, então `offsetParent` é sempre null. `useFocusTrap` filtra via `getComputedStyle` em vez disso.
- `tsc -b` com `include: ["src"]` e `exclude: ["**/*.test.*"]` ainda compila testes em alguns casos — solução: instalar `@types/vitest/globals` + `@testing-library/jest-dom` em `types` do tsconfig, deixar os testes type-checkable.
- Edits em `src/index.ts` precisam ser **lidos** antes de re-escrever — várias vezes o barrel foi reescrito sem incluir módulos adicionados anteriormente. Re-ler sempre antes de Write.
- CSS Modules + Vite library: o output é um único `dist/styles.css`. Vite plugin `dts` faz rollup do `.d.ts` final. CSS Modules são preservados como hashes prefixados (`tempest_*`).
- Dexie em jsdom funciona com `fake-indexeddb/auto` no setup. Lembrar de chamar `await db.delete()` em `afterEach` pra evitar vazamento entre testes.
- Service worker handlers (`installPushHandler`, etc.) chamam `getSwScope()` que retorna `globalThis`. Testes precisam manter as props no `globalThis` durante toda a execução do listener — restaurar só em `afterEach`.
