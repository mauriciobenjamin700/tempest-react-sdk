# Changelog

Todas as mudanças notáveis seguirão [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-05-17

### Mudança arquitetural — child deps agora são `dependencies`

Decisão original do v0.1.x ("peer deps opcionais") **revertida**. A partir de v0.2.0, as dependências filhas são instaladas automaticamente junto com o SDK.

**Antes (v0.1.x):**

```bash
npm install tempest-react-sdk react react-dom \
  @tanstack/react-query zod zustand react-hook-form lucide-react
```

**Agora (v0.2.0+):**

```bash
npm install tempest-react-sdk react react-dom
```

`zod`, `zustand`, `dexie`, `react-hook-form`, `@tanstack/react-query`, `lucide-react` saíram de `peerDependencies` (+ `peerDependenciesMeta.optional`) e entraram em `dependencies`. Continuam externalizadas no `vite.config.ts` Rollup config — o bundle publicado do SDK **não cresce** (ESM ~114KB, CJS ~82KB).

`react` e `react-dom` continuam como peer dep (regra de uma única instância React).

### Por que

- Onboarding mais simples — `npm install tempest-react-sdk` traz tudo. Apps que usam alofans/transport patterns não precisam mais lembrar a lista de peers.
- Versões de child deps são gerenciadas pelo SDK — apps não precisam atualizar manualmente quando o SDK bumps `zod` ou `zustand`.
- Apps que querem versão diferente continuam pinando no próprio `package.json`; npm dedup resolve quando ranges são compatíveis.

### Conflitos de versão

Se o app já pina `zod@3.20` por exemplo, npm dedup quando range é compatível. Se ranges divergem (`^3.23` do SDK vs `^3.20` do app), npm pode instalar duas cópias — o app deve forçar uma versão única no seu `package.json` ou abrir issue se o range do SDK for muito apertado.

### Workflow CI ajustado

Smoke install simplificado em `.github/workflows/release-npm.yml` — instala apenas `react@^19 react-dom@^19`; as outras chegam via dependência transitiva do tarball.

### Outras mudanças desta release

- **Stack responsivo**: `Stack.direction` agora aceita `ResponsiveValue<StackDirection>` (`{ base, sm, md, lg, xl }`) — combina com `useMediaQuery` interno pra trocar de vertical/horizontal por breakpoint.
- **Table priority**: `TableColumn.priority: "always" | "tablet" | "desktop"` esconde colunas por viewport.
- Re-exports faltando: `ResponsiveValue` / `StackDirection` em `src/components/Layout/index.ts`, `TablePriority` em `src/components/Table/index.ts`.
- Novos style modules: `src/styles/print.css` (estilos para `@media print`), `src/styles/responsive.css` (breakpoint tokens). `index.css` importa ambos.
- Refresh visual contínuo em vários componentes (Button, Card, Drawer, ...).
- CSS bundle: 54 → 59 KB (gzip 8 → 9 KB).

## [0.1.6] — 2026-05-17

### Adicionado

- **`Alert`** — banner inline com `variant: info/success/warning/danger` e `appearance: filled/subtle`. Slot pra título, descrição e ação.
- **`Divider`** — separador horizontal/vertical com `variant: solid/dashed/dotted` e `align: start/center/end` para texto inline.
- **`Kbd`** — `<kbd>` styled pra atalhos. `size: sm/md/lg`. Compose: `<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`.
- **`docs/styles.md`** — referência de tokens CSS + estratégia de customização.

### Atualizado

- Refresh visual em ~14 componentes (Breadcrumbs, Checkbox, Drawer, Pagination, Radio, Select, Skeleton, Spinner, Stepper, Switch, Table, Tabs, Textarea, Toast, Tooltip) usando density/motion/typography tokens.
- `docs/components.md` inclui Alert/Divider/Kbd.
- `CLAUDE.md` snapshot v0.1.6 (499 testes, 39+ componentes).

### Stats

- 499 testes (+12), 172 arquivos (+3).
- ESM ~104KB / CJS ~78KB / CSS 40 → 54KB (gzip 7 → 8KB).

## [0.1.5] — 2026-05-17

### Componentes

- **`Input.size`**: nova prop tipada `InputSize = "sm" | "md" | "lg"` (default `"md"`). Substitui o `size?: number` herdado do HTMLInputAttributes via `Omit<..., "size">`. Drive height/padding/font via tokens density-aware.
- **Button / Card / Badge / Modal**: refresh visual (CSS expandido — variantes / hover / focus states / size scale via tokens).
- **Estilos globais** (`src/styles/`):
  - Expansão de `colors.css` (paleta completa light/dark com semânticos).
  - Novos arquivos: `density.css` (tokens de spacing/sizing escalados), `motion.css` (tokens de transição/animation), `typography.css` (tokens font-family/size/weight/line-height).
  - `reset.css` ampliado e `index.css` importa os novos.
  - CSS bundle: 33KB → 40KB (gzip 6 → 7KB).

### Documentação

- `docs/telemetry.md`: reescrita completa com adapters concretos (Sentry, PostHog), interface formal, exemplo Datadog custom.
- `docs/feature-flags.md`: reescrita completa com adapters GrowthBook e LaunchDarkly, interface formal, exemplo Unleash custom.
- `docs/forms.md`: nova seção "Layout — `Form` + subcomponentes" cobrindo `Form` / `FormSection` / `FormRow` / `FormActions` (stack/inline/grid variants).
- `docs/components.md`: tabela completa reorganizada por categoria (Entrada, Ação, Overlay, Dados, Status, Identidade, Layout). Cobre todos os 36+ componentes.
- `docs/auth.md`: cobre todos os 5 exports (`createAuthStore`, `AuthGuard`, JWT helpers, `lazyWithRetry`, `createRefreshQueue`) com pattern de uso completo.
- `docs/release.md`: novo doc descrevendo pipeline tag-push + comandos make + workflow CI + provenance signing + segredos.
- `docs/README.md`: index inclui release.md.
- `CLAUDE.md`: snapshot atualizado para v0.1.4 (publicado), changeset refs removidos, comandos de release refletem `make release TAG=X`.

### Corrigido

- `DatePicker`: `Omit<InputHTMLAttributes<HTMLInputElement>, "size">` — necessário após `Input.size` mudar de `number` para `InputSize` union.

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
