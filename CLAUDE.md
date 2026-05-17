# CLAUDE.md — tempest-react-sdk

SDK público da Tempest com componentes React, hooks e integrações reutilizáveis. Consumido por todos os apps frontend Tempest. Inspirado nos padrões consolidados em `alofans-frontend` e `transport-admin-system`.

> Este arquivo é o guia operacional do SDK. Padrões globais (PR template PT-BR, conventional commits, `gh pr edit` workaround) vêm de `~/.claude/CLAUDE.md` e continuam valendo.

## Estado atual (snapshot v0.1.6 — publicado)

- **npm**: <https://www.npmjs.com/package/tempest-react-sdk> — versões 0.1.0 → 0.1.6 todas live, signed provenance via OIDC.
- **Build**: ESM ~104KB → 30KB gzip, CJS ~78KB → 27KB gzip, CSS 54KB → 8KB gzip, `index.d.ts` rollupado.
- **Testes**: 499 testes em 172 arquivos. ~13s sob `vitest + jsdom + fake-indexeddb`.
- **Tooling**: Prettier 3, Husky pre-commit (lint-staged), `Makefile` + `scripts/release.sh` (tag-push pipeline), CI `release-npm.yml` (tag push) + `ci.yml` (PR matriz node 20/22).
- **Docs**: 24 markdowns em `docs/` (1 por módulo + `architecture.md`, `gallery.md`, `release.md`) + 3 diagramas drawio (`architecture`, `request-flow`, `push-flow`).
- **Demo vivo**: app Vite em `examples/gallery` consome o SDK via `file:../..`.

### Histórico de releases

| Ver   | Tag                            | Highlights                                                                                                                    |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0 | initial release                | 444 testes, ESM 98KB, README inicial, infra changesets (depois removida)                                                      |
| 0.1.1 | docs + ci                      | README rewrite (TOC + 31 recipes), Vite stack section, typecheck cleanup, format-check em CI                                  |
| 0.1.2 | feat: Form                     | `Form` / `FormSection` / `FormRow` / `FormActions` (stack/inline/grid layout variants)                                        |
| 0.1.3 | feat: Sentry                   | `createSentryTelemetryAdapter` (P1 #4) — wrap `@sentry/browser`                                                               |
| 0.1.4 | feat: PostHog + flags adapters | `createPostHogTelemetryAdapter`, `createGrowthBookFeatureFlagsAdapter`, `createLaunchDarklyFeatureFlagsAdapter` (P1 #5/#6/#7) |
| 0.1.5 | docs + style refresh           | Docs audit completo, Input.size tipado, Button/Card/Badge/Modal refresh, novos style modules (density/motion/typography)      |
| 0.1.6 | feat: Alert + Divider + Kbd    | 3 componentes novos + refresh visual em ~14 components + `docs/styles.md`                                                     |

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

Apenas `react` + `react-dom` são peer deps (regra de uma instância React). O resto (`@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`) virou **direct dependency** a partir de v0.2.0 — instalado automaticamente pelo `npm install tempest-react-sdk`. Continua externalizado no `vite.config.ts` para o bundler do app tree-shakear.

SDKs externos para adapters (não declarados — caller injeta instância):

- `@sentry/browser`, `posthog-js`, `@growthbook/growthbook`, `launchdarkly-js-client-sdk`

## Estrutura

```text
tempest-react-sdk/
├── src/
│   ├── audio/          createAudioPlayer, useAudio, playAudio
│   ├── auth/           createAuthStore, AuthGuard, decodeJWT, isJWTExpired, lazyWithRetry, createRefreshQueue
│   ├── components/     39+ componentes UI (Alert, Avatar, Badge, Button, Divider, Form/FormSection/FormRow/FormActions, Input, Kbd, Modal, Table, Tabs, VirtualList, etc.)
│   ├── error-boundary/ ErrorBoundary, useErrorHandler
│   ├── feature-flags/  Provider + InMemory + GrowthBook + LaunchDarkly adapters
│   ├── forms/          validateForm, zodResolver, useZodForm, masked inputs BR, useViaCEP
│   ├── hooks/          17 hooks (useDebounce, useClipboard, useKeyboardShortcut, useFocusTrap, …)
│   ├── http/           createApiClient, parseResponse, uploadWithProgress, retry, usePoll, idempotency
│   ├── i18n/           createI18n, I18nProvider, useI18n, useTranslate
│   ├── logger/         createLogger leveled + plug sinks
│   ├── offline/        createOfflineStore (Dexie wrapper, owner-scoped)
│   ├── push/           WebPushClient, usePushSubscription, urlBase64ToUint8Array, isPushSupported
│   ├── query/          QueryProvider, createQueryKeys, STALE_TIME / CACHE_TIME / REFETCH_TIME
│   ├── share/          share() + isShareSupported
│   ├── sse/            createEventStream, useEventStream
│   ├── styles/         colors.css + density.css + motion.css + typography.css + reset.css + index.css
│   ├── sw/             registerServiceWorker, installPushHandler, installNotificationClickHandler, installSkipWaitingListener
│   ├── telemetry/      Provider + console + Sentry + PostHog adapters
│   ├── theme/          ThemeProvider, useTheme, themeInitScript (no-flash)
│   ├── utils/          cn, format BR, storage
│   ├── ws/             createWebSocket, useWebSocket
│   └── index.ts        barrel raiz
├── docs/               24 markdowns por módulo + release.md + 3 diagramas drawio
├── examples/gallery/   app Vite consumindo o SDK (file:../..)
├── test/setup.ts       jsdom + jest-dom + fake-indexeddb auto
├── Makefile            release / validate / bump / releases-md alvos
├── scripts/release.sh  pipeline tag-push (branch + bump + validate + tag + PR)
├── RELEASES.md         auto-gerado por `make releases-md`
└── .github/workflows/
    ├── ci.yml          PR — lint + format + typecheck + test + build
    └── release-npm.yml tag push v*.*.* → smoke install + publish --provenance
```

## Backlog priorizado

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

### P1 — cobertura de branches 95%+

Branches atual: ~85%. Gaps (~5%):

- Paths `typeof window === "undefined"` em hooks SSR-safe (`use-online`, `use-media-query`, `use-document-visibility`, `use-idle`, `storage`, `i18n storage`).
- `usePushSubscription` paths de erro raros.
- `use-focus-trap` ramificações Tab/Shift+Tab quando `current === null`.
- `use-before-install-prompt` else branches.

Custo > valor — só atacar se quiser cravar badge 95%.

### P2 — features adicionais

8. **Hooks novos**: `useEventListener`, `useLocalStorage<T>`, `useToggle`, `useAsync<T>`.
9. **Componentes pendentes**: `Accordion`/`Collapse`, `Popover`/`DropdownMenu` (Floating UI), `Combobox`, `RangeSlider`, `RatingStars`.
10. **Form helpers extras**: `<FormField>` wrapper RHF + zod automático, `useFieldArray` re-export tipado.
11. **OAuth wrapper**: `<GoogleSignIn>` sobre `@react-oauth/google`, `useOAuthCallback`.
12. **MSW handlers**: `createMockHandlers` factory pra testes com `msw`.

### P2 — performance & DX

13. **Subpath entries**: `tempest-react-sdk/forms`, `tempest-react-sdk/http` — tree-shaking refinement.
14. **CSS opcional**: `data-tempest-classname` para users de Tailwind/Stitches/Linaria.

### P3 — observabilidade SDK em produção

15. **Bundle size budget**: GH Action (`size-limit`) falha PR se passar de X KB.
16. **Versionamento de tokens CSS**: tokens são API pública; mudanças bumpam minor/major.

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
- **Sem Storybook** — docs em markdown + `examples/gallery` (app Vite real) cumprem o papel.
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
