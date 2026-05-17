# Changelog

Todas as mudanças notáveis seguirão [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/).

## [0.1.4] — 2026-05-17

### Adicionado

- **`createPostHogTelemetryAdapter`** — `TelemetryAdapter` wrapping `posthog-js`. `identify` → `posthog.identify(id, traits)` (ou `reset()` quando `null`), `track` → `posthog.capture(name, props)`, `captureException` → `posthog.captureException(err, ctx)` quando disponível com fallback para `capture("$exception", { ... })`, `init` opcional para chamar `posthog.init(apiKey, options)` no mount do provider. 8 testes novos.
- **`createGrowthBookFeatureFlagsAdapter`** — `FeatureFlagsAdapter` wrapping uma instância `GrowthBook`. `isEnabled` → `growthbook.isOn`, `get` → `growthbook.getFeatureValue`, `onChange` instala `setRenderer` lazy na primeira inscrição e multiplexa para todos os listeners. 5 testes novos.
- **`createLaunchDarklyFeatureFlagsAdapter`** — `FeatureFlagsAdapter` wrapping `launchdarkly-js-client-sdk`. `isEnabled` → `client.variation(key, default) === true`, `get` → `client.variation`, `onChange` → `client.on("change", listener)` + `client.off` no unsubscribe. 5 testes novos.
- Tipos exportados: `PostHogLike`, `CreatePostHogTelemetryAdapterOptions`, `GrowthBookLike`, `CreateGrowthBookFeatureFlagsAdapterOptions`, `LDClientLike`, `CreateLaunchDarklyFeatureFlagsAdapterOptions`.
- Nenhuma das três SDKs (`posthog-js`, `@growthbook/growthbook`, `launchdarkly-js-client-sdk`) é peer dep — apps instalam só o que usam, adapter só toca na instância fornecida.

## [0.1.3] — 2026-05-17

### Adicionado

- **`createSentryTelemetryAdapter`** — concrete `TelemetryAdapter` para `@sentry/browser`. Mapeia `identify` → `Sentry.setUser`, `track` → `Sentry.addBreadcrumb`, `captureException` → `Sentry.captureException`, `flush` → `Sentry.flush`. Aceita `initOptions` (chamado em `provider.init`), `flushTimeout` (default 2000ms), `breadcrumbCategory` (default `"app"`).
- `@sentry/browser` é injetado pelo caller (não vira peer dep) — apps que já inicializam Sentry no startup passam a instância existente; apps que não usam não pagam pelo bundle.
- Tipo `SentryLike` exporta a interface mínima da SDK Sentry usada — útil para mocks.
- 11 testes novos cobrindo init com/sem initOptions, identify mapping (incluindo traits), null user, breadcrumb props, custom category, captureException context, flush + flush no-op quando ausente.

### Corrigido

- README telemetry recipe: `consoleTelemetryAdapter` é **value** (não função) — uso correto `adapter={consoleTelemetryAdapter}`. `track` aceita `{ name, properties }`, não `(name, properties)`.
- README telemetry recipe: `useTelemetry()` retorna `null` quando provider ausente — call sites devem optional-chain.

## [0.1.2] — 2026-05-17

### Adicionado

- **`Form` component** com 3 variantes de layout: `stack` (default, fields verticais), `inline` (linha horizontal com wrap, alinhada ao fim), `grid` (N colunas via `columns` prop). Aceita `gap` (number → escala 4px ou CSS string).
- **`FormSection`** — subgrupo titulado com `title`/`description` e layout independente do pai (stack/inline/grid + columns/gap próprios).
- **`FormRow`** — força side-by-side row dentro de forms stacked (útil pra agrupar CEP+cidade, expiry+CVV). Children dividem largura igualmente.
- **`FormActions`** — footer row de botões com `align` (start/center/end/between).
- 13 testes novos cobrindo layouts, gap conversion, grid template columns, alignment, submit handler.

## [0.1.1] — 2026-05-17

### Documentado

- README: nova seção **Recommended stack** declarando Vite + React + TypeScript como stack suportada, com link para [vite.dev/guide](https://vite.dev/guide/) e comando bootstrap (`npm create vite@latest my-app -- --template react-ts`).
- README: expansão completa do README (TOC, peer-deps table, architecture diagram, quickstart com providers, 31 recipes cobrindo todos os módulos, theming reference, conventions, dev & release sections) modelada no padrão `tempest-fastapi-sdk`.

### Infra

- Pipeline de release reescrito: substituído fluxo changesets por tag-push workflow (`.github/workflows/release-npm.yml`) + `Makefile` + `scripts/release.sh` adaptados de `localm-web`. Push de tag `v*.*.*` → CI valida (lint + format + typecheck + test + build + smoke-install) → `npm publish --provenance` com `NPM_TOKEN`.
- `prepublishOnly` script garante typecheck + lint + test + build antes de `npm publish` manual.
- Workflow CI smoke step instala **todos** peer deps opcionais (`@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`) — ESM eager-resolve quebrava o import sem isso.
- Repo-wide `prettier --write` aplicado em 126 arquivos (husky pre-commit só formatava staged via lint-staged).
- `RELEASES.md` gerado automaticamente a partir das git tags via `make releases-md`.

### Corrigido

- Typecheck: removidos `@ts-expect-error` órfãos em 11 arquivos de teste; `KeyBuilder` em `src/query/create-query-keys.ts` aceita assinaturas tipadas mais estreitas; `ErrorBoundary.reset.test.tsx` não declara mais `namespace JSX { interface Element {} }` (conflitava com jsx-runtime).
- `package.json`: `author`, `homepage`, `repository`, `bugs` apontam para `mauriciobenjamin700/tempest-react-sdk` (antes era placeholder `tempest/`).

## [0.1.0] — Inicial

### Adicionado

- **HTTP**: `createApiClient`, `parseResponse`, `uploadWithProgress`.
- **Auth**: `createAuthStore` (zustand), `AuthGuard` router-agnostic.
- **Query**: `QueryProvider`, `createQueryKeys`, `STALE_TIME` / `CACHE_TIME` / `REFETCH_TIME`.
- **SSE**: `createEventStream`, `useEventStream` (reconnect exponencial, heartbeat).
- **WebSocket**: `createWebSocket`, `useWebSocket`.
- **Web Push**: `WebPushClient`, `usePushSubscription`.
- **Service Worker**: `registerServiceWorker`, `installPushHandler`, `installNotificationClickHandler`, `installSkipWaitingListener`.
- **Audio**: `createAudioPlayer`, `playAudio`, `useAudio`.
- **Offline (Dexie)**: `createOfflineStore` (owner-scoped).
- **Forms**: `validateForm`, `zodResolver`, `useZodForm`.
- **Error Boundary**: `ErrorBoundary`, `useErrorHandler`.
- **Tema**: `ThemeProvider`, `useTheme`, `themeInitScript`.
- **i18n**: `I18nProvider`, `useI18n`, `useTranslate`, `createI18n`.
- **Componentes**: Button, Input, Select, Textarea, Modal, ConfirmDialog, Table, Pagination, Badge, Card, Spinner, Skeleton, EmptyState, ErrorState, SearchBar, Toast.
- **Hooks**: `useDebounce`, `usePagination`, `useClientFilter`, `useMediaQuery`.
- **Utils**: `cn`, formatadores BR, `storage`.
- **Styles**: tokens `--tempest-*`, dark via `data-tempest-theme="dark"`.
- **Docs**: 15 markdowns + 3 diagramas drawio.
- **Gallery**: app Vite em `examples/gallery`.
