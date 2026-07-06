# tempest-react-sdk

[![npm version](https://img.shields.io/npm/v/tempest-react-sdk.svg)](https://www.npmjs.com/package/tempest-react-sdk)
[![CI](https://github.com/mauriciobenjamin700/tempest-react-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/mauriciobenjamin700/tempest-react-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![React 18 / 19](https://img.shields.io/badge/react-18%20%7C%2019-61dafb.svg?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/tempest-react-sdk?label=gzip)](https://bundlephobia.com/package/tempest-react-sdk)

[**📖 Documentação completa (PT-BR) →**](https://mauriciobenjamin700.github.io/tempest-react-sdk/) · [**📖 Full documentation (EN-US) →**](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/)

> O site MkDocs é bilíngue (**PT-BR** padrão · **EN-US**) com seletor de idioma 🇧🇷/🇺🇸 no cabeçalho. — The MkDocs site is bilingual (**PT-BR** default · **EN-US**) with a 🇧🇷/🇺🇸 language switcher in the header. The site is the navigable, per-module source of truth; this README stays the npm/GitHub landing page.

- **PT-BR:** [Scaffold](https://mauriciobenjamin700.github.io/tempest-react-sdk/scaffold/) · [Estrutura de app](https://mauriciobenjamin700.github.io/tempest-react-sdk/architecture/) · [Componentes](https://mauriciobenjamin700.github.io/tempest-react-sdk/components/) · [Hooks](https://mauriciobenjamin700.github.io/tempest-react-sdk/hooks/) · [Utilitários](https://mauriciobenjamin700.github.io/tempest-react-sdk/utilities/)
- **EN-US:** [Scaffold](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/scaffold/) · [App foundation](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/architecture/) · [Components](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/components/) · [Hooks](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/hooks/) · [Utilities](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/utilities/)
- **🤖 For LLMs:** [llms.txt](https://mauriciobenjamin700.github.io/tempest-react-sdk/llms.txt) (curated index) · [llms-full.txt](https://mauriciobenjamin700.github.io/tempest-react-sdk/llms-full.txt) (full docs in one block) — [llmstxt.org](https://llmstxt.org) convention.

> 💡 `pip install -r docs/requirements.txt && mkdocs serve` é só para preview local — em produção use as URLs do GitHub Pages acima. / For local preview only — in production use the GitHub Pages URLs above.

Shared React/TypeScript building blocks used across Tempest frontends: UI components, hooks, HTTP client, auth store, query keys, forms (zod), real-time transports (SSE / WebSocket / Web Push / Service Worker), self-hosted geolocation (tile-free maps, trajectory tracking, distance/estimate math), a clickable Brazil map + states/cities dataset (`/br`), theme, i18n, telemetry, feature flags, offline storage, error boundary, and a curated set of utilities (`cn`, `formatCurrency`, `formatCPF`, etc.).

The goal is to start every new React frontend with the same opinionated foundation already in place — no copy-pasting `Button`/`Input` styles, no rewriting the same auth Zustand store, no re-inventing the SSE reconnect loop. The patterns here are a distillation of what was consolidated in **alofans-frontend** and **transport-admin-system** — apps that consume the SDK gain consistency without paying for boilerplate.

---

## Table of contents

- [Recommended stack](#recommended-stack)
- [Install](#install)
  - [Peer & bundled dependencies](#peer--bundled-dependencies)
  - [CSS import](#css-import)
- [What's inside](#whats-inside)
- [Scaffold a new app](#scaffold-a-new-app)
- [App foundation (routing, state, providers, Vite)](#app-foundation)
- [Architecture overview](#architecture-overview)
- [Quickstart — wiring the app providers](#quickstart--wiring-the-app-providers)
- [Recipes](#recipes)
  - [HTTP client](#http-client-recipe)
  - [Response parsing with zod](#response-parsing-with-zod-recipe)
  - [Upload with progress](#upload-with-progress-recipe)
  - [Polling](#polling-recipe)
  - [Retry & idempotency](#retry--idempotency-recipe)
  - [Auth store (Zustand)](#auth-store-recipe)
  - [Route guard](#route-guard-recipe)
  - [JWT helpers & refresh queue](#jwt-helpers--refresh-queue-recipe)
  - [Code-splitting with retry](#code-splitting-with-retry-recipe)
  - [React Query](#react-query-recipe)
  - [Form layout (`Form`, `FormSection`, `FormRow`, `FormActions`)](#form-layout-recipe)
  - [Forms (zod)](#forms-zod-recipe)
  - [BR validators & masked inputs](#br-validators--masked-inputs-recipe)
  - [ViaCEP lookup](#viacep-lookup-recipe)
  - [WebSocket](#websocket-recipe)
  - [Server-Sent Events (SSE)](#server-sent-events-sse-recipe)
  - [Web Push](#web-push-recipe)
  - [Service Worker helpers](#service-worker-helpers-recipe)
  - [Audio playback](#audio-playback-recipe)
  - [Offline storage (IndexedDB / Dexie)](#offline-storage-indexeddb--dexie-recipe)
  - [Error boundary](#error-boundary-recipe)
  - [Toast notifications](#toast-notifications-recipe)
  - [Modal & ConfirmDialog](#modal--confirmdialog-recipe)
  - [Tables & pagination](#tables--pagination-recipe)
  - [Layout primitives](#layout-primitives-recipe)
  - [Virtual list](#virtual-list-recipe)
  - [Theming (light / dark)](#theming-light--dark-recipe)
  - [i18n](#i18n-recipe)
  - [Feature flags](#feature-flags-recipe)
  - [Telemetry](#telemetry-recipe)
  - [Logger](#logger-recipe)
  - [Web Share API](#web-share-api-recipe)
  - [Hooks catalogue](#hooks-catalogue-recipe)
  - [Utility helpers (`cn`, `format*`, `storage`)](#utility-helpers-recipe)
- [Theming reference](#theming-reference)
- [Conventions](#conventions)
- [Development](#development)
- [Release](#release)
- [License](#license)

---

## Recommended stack

**Vite + React + TypeScript** is the supported consumer stack. The SDK is built and tested against [Vite 7](https://vite.dev) in library mode and assumes a Vite-style host app:

- ESM-first module resolution (the package's `exports` field declares `import` / `require` conditions).
- `import.meta.env` for env vars (the recipes use `import.meta.env.VITE_API_URL`, `import.meta.env.VITE_VAPID_PUBLIC_KEY`, etc.).
- Native CSS Modules (the package's hashed `tempest_*` class names are emitted as CSS Modules under the hood and consumed via the global `tempest-react-sdk/styles.css` import).
- Fast HMR — provider files (`ThemeProvider`, `I18nProvider`, etc.) opt into React Refresh.
- First-class compatibility with the Vite plugin ecosystem (`vite-plugin-pwa` for service workers, `vite-plugin-dts`, `vite-plugin-svgr`, etc.).

**Fastest path — scaffold a fully wired app** with the `create-tempest-app` CLI that ships **inside the SDK** (Vite `@` alias, declarative routing, Zustand store, TanStack Query, providers — all pre-fiados):

```bash
# brand-new project (no install needed)
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
npm run dev

# want it installable + web-push + offline ready? add --pwa
npx -p tempest-react-sdk create-tempest-app my-app --pwa
```

The `--pwa` flag overlays a manifest, install prompt (`useBeforeInstallPrompt`), push wiring (`usePushSubscription`), **offline caching** (app-shell precache + runtime caching), **generated icons** (`tempestPwaIcons`, via `sharp`) and a **dev-mode service worker** (`tempestPwaDevSw`) on top of the base app — full `vite-plugin-pwa` parity for the common case, built from `tempest-react-sdk/sw` + `tempest-react-sdk/vite`, with no `vite-plugin-pwa`. See [Scaffold › PWA mode](https://mauriciobenjamin700.github.io/tempest-react-sdk/scaffold/#modo-pwa-pwa).

Already have a project? Install the SDK, then scaffold `src/` + configs into it:

```bash
npm install tempest-react-sdk
npx create-tempest-app .     # merges into the current dir, skips existing files
```

See [Scaffold a new app](#scaffold-a-new-app) for the generated layout.

Or start from a bare Vite template and add the SDK manually:

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install tempest-react-sdk
```

The demo gallery in [`examples/gallery`](./examples/gallery) is itself a Vite app — use it as the reference project layout.

Other bundlers (Next.js app router, Webpack, Rspack, Parcel) **may** work — the package ships standard ESM + CJS + rolled-up `.d.ts` — but they are **not** exercised in CI, and Vite-specific features used in the recipes (`import.meta.env`, `vite-plugin-pwa`) will need their own equivalents. When in doubt, start with Vite.

Vite reference: <https://vite.dev/guide/>. React + TypeScript template: <https://vite.dev/guide/#scaffolding-your-first-vite-project>.

---

## Install

```bash
npm install tempest-react-sdk
```

Via `package.json`:

```json
{
  "dependencies": {
    "tempest-react-sdk": "^0.1.0"
  }
}
```

Requires React `>=18` and Node `>=20.19` to build.

### Peer & bundled dependencies

Only **react** and **react-dom** are peer dependencies — those must come from the host app so a single React copy lives in the tree.

Everything else (`zod`, `zustand`, `dexie`, `react-hook-form`, `@tanstack/react-query`, `react-router-dom`, `lucide-react`) is a **direct dependency** of the SDK, installed automatically by `npm install tempest-react-sdk`. You never need to install them manually.

| Package                               | Status              | Used by                                                                 |
| ------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `react`, `react-dom` (`^18 \|\| ^19`) | **Peer (required)** | Everything                                                              |
| `@tanstack/react-query` (`^5`)        | Direct dep (auto)   | `QueryProvider`, `createQueryKeys`, `AppProviders`                      |
| `zod` (`^3.23 \|\| ^4`)               | Direct dep (auto)   | `parseResponse`, `validateForm`, `zodResolver`, `useZodForm`            |
| `zustand` (`^4 \|\| ^5`)              | Direct dep (auto)   | `createAuthStore`, `createStore`, `createSelectors`                     |
| `react-router-dom` (`^7`)             | Direct dep (auto)   | `AppRouter`, `defineRoutes`, `RouteGuard`, routing re-exports           |
| `dexie` (`^4.4`)                      | Direct dep (auto)   | `createOfflineStore`                                                    |
| `react-hook-form` (`^7.76`)           | Direct dep (auto)   | `zodResolver`, `useZodForm`, masked inputs                              |
| `lucide-react` (`>=0.400`)            | Direct dep (auto)   | Component icons (`leftIcon`/`rightIcon` on `Input`, `Button`, etc.)     |
| `vite`, `@vitejs/plugin-react`        | **Optional peer**   | `createViteConfig` (`tempest-react-sdk/vite`) — already in any Vite app |

The minimum install is just:

```bash
npm install tempest-react-sdk react react-dom
```

**Bundle impact**: every bundled dep is externalised in the SDK's Rollup config, so the SDK's published bundle stays at ~104 KB ESM. Your app's bundler (Vite / webpack / Rspack) resolves these from `node_modules` and tree-shakes — if you never call `createOfflineStore`, Dexie never enters your final bundle.

**Version conflicts**: if your app already pins (say) `zod@3.20`, npm dedupes when the range is compatible. If ranges diverge you get two copies — pin a single version in your own `package.json` to force one, or open an issue if the SDK's range is too tight.

Adapters for external SDKs (`@sentry/browser`, `posthog-js`, `@growthbook/growthbook`, `launchdarkly-js-client-sdk`) are **not** bundled — install those only when you opt into the adapter. The caller passes the SDK instance to the factory.

### CSS import

Import the base stylesheet **once** at the entry of your app (e.g. `main.tsx` / `src/index.tsx`):

```ts
import "tempest-react-sdk/styles.css";
```

This injects the design tokens (`--tempest-primary`, `--tempest-radius-md`, ...), a minimal CSS reset, and the per-component CSS Modules. Tokens live on `:root` and on `[data-tempest-theme="dark"]`, so the app can override them globally or per subtree (see [Theming](#theming-reference)).

The styles ship hashed under the `tempest_` namespace — they do **not** collide with Tailwind, Stitches, Linaria, or app-level CSS Modules.

---

## What's inside

Every module is re-exported from the package root — `import { Button, useDebounce, createApiClient } from "tempest-react-sdk"` always works.

| Module                                                                                            | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components`                                                                                      | `Avatar`, `Badge`, `Breadcrumbs`, `Button`, `Card`, `Checkbox`, `ChipInput`, `ConfirmDialog`, `Container`, `DatePicker`, `Drawer`, `EmptyState`, `ErrorState`, `FileUpload`, `Form` (`FormSection`, `FormRow`, `FormActions`), `Grid`, `Input`, `InstallBanner`, `InstallButton`, `Modal`, `Pagination`, `Progress`, `Radio`, `RadioGroup`, `SearchBar`, `Select`, `Skeleton`, `Spinner`, `Stack`, `Stepper`, `Switch`, `Table`, `Tabs`, `Textarea`, `Toast` (`ToastProvider`, `useToast`), `Tooltip`, `VirtualList`                                                                 |
| `hooks`                                                                                           | `useDebounce`, `usePagination`, `useClientFilter`, `useMediaQuery`, `useOnline`, `useDocumentVisibility`, `useIntersectionObserver`, `useResizeObserver`, `useClipboard`, `useKeyboardShortcut`, `useBeforeInstallPrompt`, `useIdle`, `useGeolocation`, `useScrollLock`, `useFocusTrap`, `useStableCallback`, `useDeepMemo`                                                                                                                                                                                                                                                          |
| `http`                                                                                            | `createApiClient`, `parseResponse`, `uploadWithProgress`, `retry`, `generateIdempotencyKey`, `usePoll`, types: `ApiClient`, `ApiClientConfig`, `ApiError`, `RequestOptions`, `RetryOptions`, `UploadProgressEvent`, `UploadWithProgressOptions`, `UsePollOptions`, `UsePollResult`                                                                                                                                                                                                                                                                                                   |
| `auth` _(peer: `zustand`)_                                                                        | `createAuthStore`, `AuthGuard`, `decodeJWT`, `isJWTExpired`, `lazyWithRetry`, `createRefreshQueue`, types: `AuthState`, `CreateAuthStoreOptions`, `AuthGuardProps`, `DecodedJWT`, `LazyWithRetryOptions`                                                                                                                                                                                                                                                                                                                                                                             |
| `query` _(peer: `@tanstack/react-query`)_                                                         | `QueryProvider`, `createQueryKeys`, `STALE_TIME`, `CACHE_TIME`, `REFETCH_TIME`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `router` _(dep: `react-router-dom`)_                                                              | `defineRoutes`, `AppRouter`, `RouteGuard`, + re-exports (`Link`, `NavLink`, `Outlet`, `Navigate`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `useMatch`, `useRouteError`, `redirect`, `BrowserRouter`/`HashRouter`/`MemoryRouter`/`Routes`/`Route`), types: `TempestRouteObject`, `RouterKind`, `AppRouterProps`, `RouteGuardProps`                                                                                                                                                                                                                               |
| `store` _(dep: `zustand`)_                                                                        | `createStore`, `createSelectors`, types: `CreateStoreOptions`, `CreateStorePersistOptions`, `WithSelectors`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `app`                                                                                             | `AppProviders` (composes `ErrorBoundary` → `QueryProvider` → `ThemeProvider` → `I18nProvider`), type: `AppProvidersProps`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `vite` _(subpath `tempest-react-sdk/vite`)_                                                       | `createViteConfig`, `tempestPwaManifest` (emits `precache-manifest.json` for offline precache), `tempestPwaIcons` (generates the PNG icon set from one SVG via `sharp`), `tempestPwaDevSw` (serves the SW under `npm run dev`), `tempestPwaIcons({ appleSplash })` (Apple splash screens), types: `CreateViteConfigOptions`, `ProxyEntry`, `TempestViteConfig`, `TempestPwaManifestOptions`, `TempestPwaIconsOptions`, `TempestPwaDevSwOptions`, `AppleSplashSpec`, `TempestVitePlugin`                                                                                              |
| `forms` _(peer: `zod`, `react-hook-form`)_                                                        | `validateForm`, `zodResolver`, `useZodForm`, `validateCPF`, `validateCNPJ`, `formatCEP`, `formatCNPJ`, `unmask`, `CPFInput`, `CNPJInput`, `PhoneInput`, `CEPInput`, `MoneyInput`, `useViaCEP`                                                                                                                                                                                                                                                                                                                                                                                        |
| `sse`                                                                                             | `createEventStream`, `useEventStream`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ws`                                                                                              | `createWebSocket`, `useWebSocket`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `geo` _(opt. peer `leaflet`)_                                                                     | `haversineKm`, `pathLengthKm`, `bearingDeg`, `estimateTravel`, `createOSRMBackend`, `boundingBox`, `projectMercator`, `fitProjection`, `createPositionTracker`, `usePositionTracker`, `TrajectoryMap` — tile-free SVG map + trajectory tracking (no external/paid API; Leaflet is an opt-in, lazy-loaded tile layer for self-hosted tiles), types: `Coordinate`, `TrackPoint`, `TravelEstimate`, `TravelMode`, `GeoBounds`, `RoutingBackend`                                                                                                                                         |
| `br` _(subpath `tempest-react-sdk/br`)_                                                           | `BrazilMap`, `BrazilStateCitySelect`, `listStates`, `getState`, `citiesByUf`, `statesByRegion`, `ufChoices`, `cityChoices`, `isValidUf`, `normalizeUf`, `isValidCity`, `loadBrUfGeoJson`, types `UF`, `BrRegion`, `BrazilState` — clickable 27-UF SVG map (bundled simplified IBGE GeoJSON, lazy-loaded) + states/cities dataset, no external API; mirrors the FastAPI SDK `utils/locations`                                                                                                                                                                                         |
| `push`                                                                                            | `WebPushClient`, `WebPushUnsupportedError`, `WebPushPermissionDeniedError`, `usePushSubscription`, `urlBase64ToUint8Array`, `isPushSupported`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sw` _(also subpath `tempest-react-sdk/sw`)_                                                      | `registerServiceWorker`, `skipWaiting`, `unregisterAllServiceWorkers`, `installPushHandler`, `installNotificationClickHandler`, `installSkipWaitingListener`, `installPrecache` (app-shell offline), `installRuntimeCache` (per-route caching, incl. `rangeRequests`), `createPartialResponse` (206 range slicing), `installBackgroundSync` (offline mutation queue) — the React-free `tempest-react-sdk/sw` subpath is ideal for bundling into your own `sw.ts`                                                                                                                     |
| `charts` _(subpath `tempest-react-sdk/charts`, opt. peer `recharts`)_                             | `AreaChart`, `BarChart`, `LineChart`, `PieChart`, `RadarChart`, `DEFAULT_CHART_COLORS` — themed recharts wrappers (recharts externalized; install it only if you use charts)                                                                                                                                                                                                                                                                                                                                                                                                         |
| `audio`                                                                                           | `createAudioPlayer`, `playAudio`, `stopAudio`, `useAudio`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `offline` _(peer: `dexie`)_                                                                       | `createOfflineStore`, types: `OfflineStore`, `OfflineStoreConfig`, `ListOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `error-boundary`                                                                                  | `ErrorBoundary`, `useErrorHandler`, types: `ErrorBoundaryProps`, `ErrorBoundaryRenderProps`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `theme`                                                                                           | `ThemeProvider`, `useTheme`, `getInitialTheme`, `themeInitScript`, types: `ThemeMode`, `ResolvedTheme`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `i18n`                                                                                            | `createI18n`, `I18nProvider`, `useI18n`, `useTranslate`, types: `Catalog`, `Messages`, `I18n`, `InterpolationValues`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `logger`                                                                                          | `createLogger`, `consoleSink`, types: `Logger`, `LogEntry`, `LogLevel`, `LoggerSink`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `telemetry`                                                                                       | `TelemetryProvider`, `useTelemetry`, `consoleTelemetryAdapter`, `createSentryTelemetryAdapter`, `createPostHogTelemetryAdapter`, types: `TelemetryAdapter`, `TelemetryEvent`, `TelemetryUser`, `CreateSentryTelemetryAdapterOptions`, `SentryLike`, `CreatePostHogTelemetryAdapterOptions`, `PostHogLike`                                                                                                                                                                                                                                                                            |
| `feature-flags`                                                                                   | `FeatureFlagsProvider`, `useFeatureFlag`, `useFlagValue`, `createInMemoryFlags`, `createGrowthBookFeatureFlagsAdapter`, `createLaunchDarklyFeatureFlagsAdapter`, types: `FeatureFlagsAdapter`, `FlagValue`, `GrowthBookLike`, `LDClientLike`                                                                                                                                                                                                                                                                                                                                         |
| `share`                                                                                           | `share`, `isShareSupported`, types: `SharePayload`, `ShareResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `utils`                                                                                           | `cn`, format BR (`formatCurrency`, `formatDate`, `formatDateTime`, `formatPhone`, `formatCPF`, `formatPercent`), `storage`, strings (`slugify`, `truncate`, `capitalize`, `camelCase`, `kebabCase`, `pluralize`), numbers (`clamp`, `formatBytes`, `formatCompactNumber`), arrays (`groupBy`, `uniqueBy`, `chunk`, `range`), objects (`pick`, `omit`, `deepMerge`, `isEmpty`), guards (`isDefined`, `isString`, `isNumber`, `isPlainObject`, `assertNever`), functions (`debounce`, `throttle`, `once`, `memoizeOne`), promises (`sleep`, `withTimeout`), `randomId`, `relativeTime` |
| generic components                                                                                | display (`CopyButton`, `RelativeTime`, `Money`, `TruncateText`, `VisuallyHidden`), headless (`Portal`, `ClickOutside`, `ConditionalWrapper`, `For`, `ErrorText`), media/content (`Image`, `DataList`, `DescriptionList`)                                                                                                                                                                                                                                                                                                                                                             |
| Module                                                                                            | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components`                                                                                      | `Avatar`, `Badge`, `Breadcrumbs`, `Button`, `Card`, `Checkbox`, `ChipInput`, `ConfirmDialog`, `Container`, `DatePicker`, `Drawer`, `EmptyState`, `ErrorState`, `FileUpload`, `Form` (`FormSection`, `FormRow`, `FormActions`), `Grid`, `Input`, `InstallBanner`, `InstallButton`, `Modal`, `Pagination`, `Progress`, `Radio`, `RadioGroup`, `SearchBar`, `Select`, `Skeleton`, `Spinner`, `Stack`, `Stepper`, `Switch`, `Table`, `Tabs`, `Textarea`, `Toast` (`ToastProvider`, `useToast`), `Tooltip`, `VirtualList`                                                                 |
| `hooks`                                                                                           | `useDebounce`, `usePagination`, `useClientFilter`, `useMediaQuery`, `useOnline`, `useDocumentVisibility`, `useIntersectionObserver`, `useResizeObserver`, `useClipboard`, `useKeyboardShortcut`, `useBeforeInstallPrompt`, `useIdle`, `useGeolocation`, `useScrollLock`, `useFocusTrap`, `useStableCallback`, `useDeepMemo`                                                                                                                                                                                                                                                          |
| `http`                                                                                            | `createApiClient`, `parseResponse`, `uploadWithProgress`, `retry`, `generateIdempotencyKey`, `usePoll`, types: `ApiClient`, `ApiClientConfig`, `ApiError`, `RequestOptions`, `RetryOptions`, `UploadProgressEvent`, `UploadWithProgressOptions`, `UsePollOptions`, `UsePollResult`                                                                                                                                                                                                                                                                                                   |
| `auth` _(peer: `zustand`)_                                                                        | `createAuthStore`, `AuthGuard`, `decodeJWT`, `isJWTExpired`, `lazyWithRetry`, `createRefreshQueue`, types: `AuthState`, `CreateAuthStoreOptions`, `AuthGuardProps`, `DecodedJWT`, `LazyWithRetryOptions`                                                                                                                                                                                                                                                                                                                                                                             |
| `query` _(peer: `@tanstack/react-query`)_                                                         | `QueryProvider`, `createQueryKeys`, `STALE_TIME`, `CACHE_TIME`, `REFETCH_TIME`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `router` _(dep: `react-router-dom`)_                                                              | `defineRoutes`, `AppRouter`, `RouteGuard`, + re-exports (`Link`, `NavLink`, `Outlet`, `Navigate`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `useMatch`, `useRouteError`, `redirect`, `BrowserRouter`/`HashRouter`/`MemoryRouter`/`Routes`/`Route`), types: `TempestRouteObject`, `RouterKind`, `AppRouterProps`, `RouteGuardProps`                                                                                                                                                                                                                               |
| `store` _(dep: `zustand`)_                                                                        | `createStore`, `createSelectors`, types: `CreateStoreOptions`, `CreateStorePersistOptions`, `WithSelectors`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `app`                                                                                             | `AppProviders` (composes `ErrorBoundary` → `QueryProvider` → `ThemeProvider` → `I18nProvider`), type: `AppProvidersProps`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `vite` _(subpath `tempest-react-sdk/vite`)_                                                       | `createViteConfig`, `tempestPwaManifest` (emits `precache-manifest.json` for offline precache), `tempestPwaIcons` (generates the PNG icon set from one SVG via `sharp`), `tempestPwaDevSw` (serves the SW under `npm run dev`), `tempestPwaIcons({ appleSplash })` (Apple splash screens), types: `CreateViteConfigOptions`, `ProxyEntry`, `TempestViteConfig`, `TempestPwaManifestOptions`, `TempestPwaIconsOptions`, `TempestPwaDevSwOptions`, `AppleSplashSpec`, `TempestVitePlugin`                                                                                              |
| `forms` _(peer: `zod`, `react-hook-form`)_                                                        | `validateForm`, `zodResolver`, `useZodForm`, `validateCPF`, `validateCNPJ`, `formatCEP`, `formatCNPJ`, `unmask`, `CPFInput`, `CNPJInput`, `PhoneInput`, `CEPInput`, `MoneyInput`, `useViaCEP`                                                                                                                                                                                                                                                                                                                                                                                        |
| `sse`                                                                                             | `createEventStream`, `useEventStream`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ws`                                                                                              | `createWebSocket`, `useWebSocket`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `geo` _(opt. peer `leaflet`)_                                                                     | `haversineKm`, `pathLengthKm`, `bearingDeg`, `estimateTravel`, `createOSRMBackend`, `boundingBox`, `projectMercator`, `fitProjection`, `createPositionTracker`, `usePositionTracker`, `TrajectoryMap` — tile-free SVG map + trajectory tracking (no external/paid API; Leaflet is an opt-in, lazy-loaded tile layer for self-hosted tiles), types: `Coordinate`, `TrackPoint`, `TravelEstimate`, `TravelMode`, `GeoBounds`, `RoutingBackend`                                                                                                                                         |
| `br` _(subpath `tempest-react-sdk/br`)_                                                           | `BrazilMap`, `BrazilStateCitySelect`, `listStates`, `getState`, `citiesByUf`, `statesByRegion`, `ufChoices`, `cityChoices`, `isValidUf`, `normalizeUf`, `isValidCity`, `loadBrUfGeoJson`, types `UF`, `BrRegion`, `BrazilState` — clickable 27-UF SVG map (bundled simplified IBGE GeoJSON, lazy-loaded) + states/cities dataset, no external API; mirrors the FastAPI SDK `utils/locations`                                                                                                                                                                                         |
| `push`                                                                                            | `WebPushClient`, `WebPushUnsupportedError`, `WebPushPermissionDeniedError`, `usePushSubscription`, `urlBase64ToUint8Array`, `isPushSupported`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sw` _(also subpath `tempest-react-sdk/sw`)_                                                      | `registerServiceWorker`, `skipWaiting`, `unregisterAllServiceWorkers`, `installPushHandler`, `installNotificationClickHandler`, `installSkipWaitingListener`, `installPrecache` (app-shell offline), `installRuntimeCache` (per-route caching, incl. `rangeRequests`), `createPartialResponse` (206 range slicing), `installBackgroundSync` (offline mutation queue) — the React-free `tempest-react-sdk/sw` subpath is ideal for bundling into your own `sw.ts`                                                                                                                     |
| `editor` _(subpath `tempest-react-sdk/editor`, opt. peers `@tiptap/react`+`@tiptap/starter-kit`)_ | `RichTextEditor` — themed tiptap v3 rich-text editor with toolbar (tiptap externalized; install it only if you use the editor)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `vision` _(subpath `tempest-react-sdk/vision`, opt. peer `onnxruntime-web`)_                      | `Classifier`, `Detector`, `Segmenter` + results/labels/preprocess — on-device ONNX vision inference, vendored from `@mauriciobenjamin700/ort-vision-sdk-web` (onnxruntime-web externalized; install it only if you use vision)                                                                                                                                                                                                                                                                                                                                                       |
| `audio`                                                                                           | `createAudioPlayer`, `playAudio`, `stopAudio`, `useAudio`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `offline` _(peer: `dexie`)_                                                                       | `createOfflineStore`, types: `OfflineStore`, `OfflineStoreConfig`, `ListOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `error-boundary`                                                                                  | `ErrorBoundary`, `useErrorHandler`, types: `ErrorBoundaryProps`, `ErrorBoundaryRenderProps`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `theme`                                                                                           | `ThemeProvider`, `useTheme`, `getInitialTheme`, `themeInitScript`, types: `ThemeMode`, `ResolvedTheme`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `i18n`                                                                                            | `createI18n`, `I18nProvider`, `useI18n`, `useTranslate`, types: `Catalog`, `Messages`, `I18n`, `InterpolationValues`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `logger`                                                                                          | `createLogger`, `consoleSink`, types: `Logger`, `LogEntry`, `LogLevel`, `LoggerSink`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `telemetry`                                                                                       | `TelemetryProvider`, `useTelemetry`, `consoleTelemetryAdapter`, `createSentryTelemetryAdapter`, `createPostHogTelemetryAdapter`, types: `TelemetryAdapter`, `TelemetryEvent`, `TelemetryUser`, `CreateSentryTelemetryAdapterOptions`, `SentryLike`, `CreatePostHogTelemetryAdapterOptions`, `PostHogLike`                                                                                                                                                                                                                                                                            |
| `feature-flags`                                                                                   | `FeatureFlagsProvider`, `useFeatureFlag`, `useFlagValue`, `createInMemoryFlags`, `createGrowthBookFeatureFlagsAdapter`, `createLaunchDarklyFeatureFlagsAdapter`, types: `FeatureFlagsAdapter`, `FlagValue`, `GrowthBookLike`, `LDClientLike`                                                                                                                                                                                                                                                                                                                                         |
| `share`                                                                                           | `share`, `isShareSupported`, types: `SharePayload`, `ShareResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `utils`                                                                                           | `cn`, format BR (`formatCurrency`, `formatDate`, `formatDateTime`, `formatPhone`, `formatCPF`, `formatPercent`), `storage`, strings (`slugify`, `truncate`, `capitalize`, `camelCase`, `kebabCase`, `pluralize`), numbers (`clamp`, `formatBytes`, `formatCompactNumber`), arrays (`groupBy`, `uniqueBy`, `chunk`, `range`), objects (`pick`, `omit`, `deepMerge`, `isEmpty`), guards (`isDefined`, `isString`, `isNumber`, `isPlainObject`, `assertNever`), functions (`debounce`, `throttle`, `once`, `memoizeOne`), promises (`sleep`, `withTimeout`), `randomId`, `relativeTime` |
| generic components                                                                                | display (`CopyButton`, `RelativeTime`, `Money`, `TruncateText`, `VisuallyHidden`), headless (`Portal`, `ClickOutside`, `ConditionalWrapper`, `For`, `ErrorText`), media/content (`Image`, `DataList`, `DescriptionList`)                                                                                                                                                                                                                                                                                                                                                             |

Full per-module docs are published as a bilingual MkDocs site on GitHub Pages — **[Português (BR)](https://mauriciobenjamin700.github.io/tempest-react-sdk/)** / **[English (US)](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/)** (one page per module + draw.io diagrams in [`docs/diagrams/`](./docs/diagrams)). The source markdown lives in [`docs/`](./docs) (PT-BR base files + `.en.md` translations).

> **Local preview:** `pip install -r docs/requirements.txt && mkdocs serve` (the published site is built and deployed automatically by `.github/workflows/docs.yml`).

A demo app exercising every module lives in [`examples/gallery`](./examples/gallery) — `cd examples/gallery && npm install && npm run dev`.

---

## Scaffold a new app

The **`create-tempest-app`** CLI **ships inside the `tempest-react-sdk` package** (it is the package's `bin`) and generates a ready-to-run Vite + React 19 + TypeScript project already wired with the SDK — no manual provider/router/store setup:

```bash
# brand-new project folder (npx pulls the SDK and runs its bin)
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
cp .env.example .env
npm run dev            # http://127.0.0.1:5173
```

Or, in a project that already depends on the SDK, scaffold into the current directory (existing files are left untouched; an existing `package.json` gets the Tempest scripts/deps merged in):

```bash
npm install tempest-react-sdk
npx create-tempest-app .
```

Generated layout:

```text
my-app/
├── index.html
├── package.json          # react, react-dom, tempest-react-sdk (+ vite/ts devDeps)
├── tsconfig.json         # "@/*" -> "./src/*"
├── vite.config.ts        # export default createViteConfig()
├── .env.example          # VITE_API_URL
└── src/
    ├── main.tsx          # createRoot + "tempest-react-sdk/styles.css" + <App/>
    ├── App.tsx           # <AppProviders> → <AppRouter routes fallback/>
    ├── routes.tsx        # defineRoutes([...]) — index, login, lazy + guarded dashboard
    ├── layouts/RootLayout.tsx   # nav (Link) + <Outlet/>
    ├── pages/            # Home, Login, Dashboard (lazy + protected)
    ├── stores/auth.ts    # createSelectors(createAuthStore<User>())
    └── lib/api.ts        # createApiClient(...) + createQueryKeys
```

Each generated file demonstrates one SDK capability. Full walkthrough: **[scaffold docs (PT)](https://mauriciobenjamin700.github.io/tempest-react-sdk/scaffold/)** · **[EN](https://mauriciobenjamin700.github.io/tempest-react-sdk/en/scaffold/)**.

---

## App foundation

Beyond UI blocks, the SDK ships an opinionated **application foundation** so every Tempest frontend wires Vite, routing, state and cache the same way. These are also what the scaffold above generates.

**Vite config** — one call wires `@vitejs/plugin-react`, the `@` → `src` alias and dev-server defaults (import from the Node subpath):

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  proxy: { "/api": "http://127.0.0.1:8000" },
});
```

> Declare the same alias in `tsconfig.json` so the type-checker resolves it: `"paths": { "@/*": ["./src/*"] }`.

**Declarative routing** (React Router v7) — describe the tree as data, with `lazy` code-splitting and per-route `guard` redirects:

```tsx
import { defineRoutes, AppRouter } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      {
        path: "dashboard",
        lazy: () => import("@/pages/Dashboard"),
        guard: () => useAuth.getState().isAuthenticated,
        redirectTo: "/login",
      },
    ],
  },
]);

// <AppRouter routes={routes} fallback={<p>Loading…</p>} />
```

`AppRouter` also re-exports `Link`, `NavLink`, `Outlet`, `Navigate`, `useNavigate`, `useParams`, … so apps import their whole routing surface from the SDK.

**State (Zustand)** — `createStore` for any domain slice, `createSelectors` for per-field subscription hooks:

```ts
import { createStore, createSelectors } from "tempest-react-sdk";

interface CartState {
  items: string[];
  add: (id: string) => void;
}

export const useCart = createSelectors(
  createStore<CartState>(
    (set) => ({ items: [], add: (id) => set((s) => ({ items: [...s.items, id] })) }),
    { persist: { name: "cart", partialize: (s) => ({ items: s.items }) } },
  ),
);
// const items = useCart.use.items();   // subscribes only to `items`
```

**Provider composition** — `AppProviders` nests ErrorBoundary → Query → Theme → i18n in one block (Query + Theme on by default; i18n + ErrorBoundary opt-in):

```tsx
import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Something went wrong.</p> }}>
      <AppRouter routes={routes} fallback={<p>Loading…</p>} />
    </AppProviders>
  );
}
```

Per-topic guides (bilingual): **[Routing](https://mauriciobenjamin700.github.io/tempest-react-sdk/routing/)** · **[State](https://mauriciobenjamin700.github.io/tempest-react-sdk/state/)** · **[Providers](https://mauriciobenjamin700.github.io/tempest-react-sdk/app-providers/)** · **[Vite & alias](https://mauriciobenjamin700.github.io/tempest-react-sdk/vite-config/)**.

---

## Architecture overview

The SDK is a layered set of building blocks. Apps wire the layers together; the SDK never owns the app shell.

```text
┌──────────────────────────────────────────────────────────────┐
│  App entry (main.tsx)                                        │
│  ├── import "tempest-react-sdk/styles.css"                   │
│  └── <ThemeProvider>                                         │
│        <I18nProvider>                                        │
│          <FeatureFlagsProvider>                              │
│            <TelemetryProvider>                               │
│              <QueryProvider>                                 │
│                <ToastProvider>                               │
│                  <ErrorBoundary>                             │
│                    <RouterProvider … />                      │
└─────────────────────────────┬────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │   Pages    │  │  Features  │  │  Layouts   │
       └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
             │               │               │
             └───────┬───────┴───────┬───────┘
                     ▼               ▼
            ┌────────────────┐ ┌────────────────┐
            │ Components +   │ │  Hooks +       │
            │ Forms          │ │  Stores        │
            └───────┬────────┘ └───────┬────────┘
                    │                  │
                    └────────┬─────────┘
                             ▼
                ┌────────────────────────┐
                │  HTTP client + zod +   │
                │  SSE / WS / WebPush /  │
                │  Offline / Audio       │
                └────────────────────────┘
```

- **Presentation layer** (`components`): purely visual; uncontrolled-or-controlled, accessible by default, themable via CSS tokens.
- **Behaviour layer** (`hooks`, `forms`, `auth`, `error-boundary`): React-aware helpers that orchestrate state.
- **Transport layer** (`http`, `sse`, `ws`, `push`, `sw`): everything that touches the network or the service worker.
- **Persistence layer** (`offline`, `auth` persist, `utils/storage`, `i18n` persist): client-side storage abstractions.
- **Observability layer** (`telemetry`, `logger`, `error-boundary` `onError`): everywhere the app reports on itself.

The SDK ships **no `App.tsx`, no router, no global store**. Each layer is opt-in.

---

## Quickstart — wiring the app providers

A minimal `main.tsx` for an app using HTTP + Query + Auth + Toast + Theme + i18n:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  ThemeProvider,
  I18nProvider,
  QueryProvider,
  ToastProvider,
  ErrorBoundary,
  ErrorState,
  createI18n,
  themeInitScript,
} from "tempest-react-sdk";

import "tempest-react-sdk/styles.css";
import { App } from "./App";

const i18n = createI18n({
  locale: "pt-BR",
  fallback: "en",
  messages: {
    "pt-BR": { hello: "Olá, {name}" },
    en: { hello: "Hello, {name}" },
  },
});

// No-flash dark mode script. Inject in <head> via index.html, OR call here:
document.head.insertAdjacentHTML("afterbegin", `<script>${themeInitScript()}</script>`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider i18n={i18n}>
        <QueryProvider>
          <ToastProvider>
            <ErrorBoundary
              fallback={({ error, reset }) => (
                <ErrorState description={error.message} onRetry={reset} />
              )}
            >
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </ErrorBoundary>
          </ToastProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

You only wrap with what you use — every provider is independent. The example above is the maximal case.

---

## Recipes

Each recipe is self-contained. Pick the ones you need.

### HTTP client recipe

`createApiClient` returns a typed `ApiClient` instance with `.get` / `.post` / `.put` / `.patch` / `.delete` methods, a typed `ApiError`, automatic JSON serialization, `AbortSignal` support, and pluggable `getToken` / `onUnauthorized` hooks.

```ts
import { createApiClient } from "tempest-react-sdk";
import { useAuthStore } from "@/store/auth";

export const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL,
    getToken: () => useAuthStore.getState().token,
    onUnauthorized: () => useAuthStore.getState().logout(),
    withCredentials: true,
    defaultHeaders: { "X-App-Version": __APP_VERSION__ },
});

const user = await api.get<UserResponse>("/users/me");
await api.post("/orders", { body: { total: 100, items: [...] } });
```

Every method throws `ApiError` (`status`, `body`, `url`, `code`) on non-2xx responses. `onUnauthorized` is called automatically on 401, before the error is thrown — so you can refresh-and-retry or sign out as you choose.

### Response parsing with zod recipe

The HTTP client returns untyped JSON (`unknown`). `parseResponse` validates against a zod schema and gives you a `ZodError`-aware failure message tied to the request.

```ts
import { createApiClient, parseResponse } from "tempest-react-sdk";
import { z } from "zod";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export async function getUser(id: string) {
  const raw = await api.get<unknown>(`/users/${id}`);
  return parseResponse(userSchema, raw, `GET /users/${id}`);
}
```

On validation failure `parseResponse` throws an `Error` whose `message` includes the request label and the zod issues — exactly the diagnostic you want during a wire-protocol drift.

### Upload with progress recipe

`fetch` cannot report upload progress in browsers. `uploadWithProgress` falls back to `XMLHttpRequest` internally while keeping the same `ApiError` contract:

```ts
import { uploadWithProgress } from "tempest-react-sdk";

const formData = new FormData();
formData.append("file", file);
formData.append("alo_id", aloId);

const controller = new AbortController();

await uploadWithProgress<{ url: string }>({
  url: `${API}/uploads`,
  method: "POST",
  body: formData,
  withCredentials: true,
  getToken: () => useAuthStore.getState().token,
  signal: controller.signal,
  onProgress: ({ fraction, loaded, total }) => {
    if (fraction !== null) setProgress(Math.round(fraction * 100));
  },
});

// Cancel:
controller.abort();
```

`fraction` is `null` when `total` is unknown (chunked / unsized uploads).

### Polling recipe

`usePoll` runs a callback on an interval, pauses while the tab is hidden, and exposes start/stop controls. Use it for "kind-of-realtime" data when you don't need a socket.

```tsx
import { usePoll } from "tempest-react-sdk";

function ServerStatus() {
  const poll = usePoll({
    interval: 5_000,
    callback: async () => {
      const data = await api.get<Status>("/status");
      setStatus(data);
    },
    immediate: true,
    pauseWhenHidden: true,
  });

  return (
    <Button onClick={poll.running ? poll.stop : poll.start}>
      {poll.running ? "Pause" : "Resume"}
    </Button>
  );
}
```

### Retry & idempotency recipe

```ts
import { retry, generateIdempotencyKey } from "tempest-react-sdk";

const idempotencyKey = generateIdempotencyKey();

const result = await retry(
  () =>
    api.post("/payments", {
      body: payload,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  {
    retries: 3,
    baseDelay: 400,
    shouldRetry: (error) => error instanceof Error && /status (5\d\d|429)/.test(error.message),
  },
);
```

`generateIdempotencyKey` returns a v4 UUID using `crypto.randomUUID()` when available, with a `Math.random` fallback for older runtimes.

### Auth store recipe

`createAuthStore<TUser>()` returns a typed Zustand store with the `persist` middleware already wired. The app owns the user shape — the SDK only owns the state shape.

```ts
import { createAuthStore } from "tempest-react-sdk";

type SessionUser = { id: string; name: string; is_admin: boolean };

export const useAuthStore = createAuthStore<SessionUser>({
  name: "tempest-app-auth",
  storage: "local",
});

// Anywhere:
useAuthStore.getState().setSession({ user, token });
const isAuthed = useAuthStore((s) => s.isAuthenticated);
useAuthStore.getState().logout();
```

The store exposes `user`, `token`, `isAuthenticated`, `setSession`, `setUser`, `setToken`, and `logout`. `isAuthenticated` is derived from `token` and rehydrates correctly after page reload.

### Route guard recipe

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { AuthGuard } from "tempest-react-sdk";
import { useAuthStore } from "@/store/auth";

export function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <AuthGuard isAuthenticated={isAuthenticated} fallback={<Navigate to="/login" replace />}>
      <Outlet />
    </AuthGuard>
  );
}
```

`AuthGuard` is a pure render gate — no router coupling. Use any redirect mechanism (`react-router`, `next/navigation`, `wouter`, ...).

### JWT helpers & refresh queue recipe

```ts
import { decodeJWT, isJWTExpired, createRefreshQueue } from "tempest-react-sdk";

const decoded = decodeJWT<{ sub: string; exp: number; role: string }>(token);
const expired = isJWTExpired(token, 30); // 30-second skew

// Coalesce concurrent refreshes so only one network call runs at a time:
const refresh = createRefreshQueue(async () => {
  const newToken = await api.post<{ token: string }>("/auth/refresh");
  useAuthStore.getState().setToken(newToken.token);
  return newToken.token;
});

// Two concurrent calls → one request, both get the same resolved value:
await Promise.all([refresh(), refresh()]);
```

### Code-splitting with retry recipe

`lazyWithRetry` wraps `React.lazy` so that a stale chunk error retries with exponential backoff instead of crashing the page. A common cause is users on a tab with an old `index.html` after a deploy — the retry usually picks up the new bundle; a final `location.reload()` recovers from a stale `index.html`.

```tsx
import { lazyWithRetry } from "tempest-react-sdk";

const Settings = lazyWithRetry(() => import("./Settings"), {
  retries: 3,
  initialDelay: 400,
  reloadOnFinalFailure: true,
});

<Route
  path="/settings"
  element={
    <Suspense fallback={<Spinner />}>
      <Settings />
    </Suspense>
  }
/>;
```

### React Query recipe

```tsx
import { QueryProvider, createQueryKeys, STALE_TIME } from "tempest-react-sdk";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider defaultOptions={{ queries: { staleTime: STALE_TIME.MEDIUM } }}>
      {children}
    </QueryProvider>
  );
}
```

`STALE_TIME`, `CACHE_TIME`, and `REFETCH_TIME` ship as named constants (`SHORT`, `MEDIUM`, `LONG`) so cache windows stay consistent across features.

Typed query-key factory:

```ts
import { createQueryKeys } from "tempest-react-sdk";

export const eventKeys = createQueryKeys("event", {
  all: ["all"] as const,
  list: (filters: { page: number; size: number }) => ["list", filters] as const,
  byId: (id: string) => [id] as const,
});

// eventKeys.list({ page: 1, size: 20 }) === ["event", "list", { page: 1, size: 20 }]
// eventKeys.byId("42") === ["event", "42"]
```

### Form layout recipe

`Form` is a `<form>` wrapper with a built-in layout variant — pick `stack` for stacked fields (one per row), `inline` for a wrapping horizontal row, or `grid` for an `N`-column layout. Pair with `FormSection` (titled subgroup), `FormRow` (forces side-by-side inside a stacked form), and `FormActions` (footer button row).

**Stacked (default) — one field per row:**

```tsx
import { Form, FormActions, Input, Button } from "tempest-react-sdk";

<Form layout="stack" gap={4} onSubmit={onSubmit}>
  <Input label="Nome" {...form.register("name")} />
  <Input label="Email" type="email" {...form.register("email")} />
  <Input label="Senha" type="password" {...form.register("password")} />
  <FormActions align="end">
    <Button type="submit">Criar conta</Button>
  </FormActions>
</Form>;
```

**Grid — side-by-side columns:**

```tsx
import { Form, FormActions, Input, Button } from "tempest-react-sdk";

<Form layout="grid" columns={2} gap={4} onSubmit={onSubmit}>
  <Input label="Nome" {...register("name")} />
  <Input label="Sobrenome" {...register("last_name")} />
  <Input label="Email" type="email" {...register("email")} />
  <Input label="Telefone" {...register("phone")} />
  <FormActions align="end" style={{ gridColumn: "1 / -1" }}>
    <Button type="submit">Salvar</Button>
  </FormActions>
</Form>;
```

`columns` accepts a number (`repeat(N, minmax(0, 1fr))`) or a raw `grid-template-columns` string (e.g. `"2fr 1fr"`).

**Inline — search-style filter row:**

```tsx
import { Form, Input, Select, Button } from "tempest-react-sdk";

<Form layout="inline" gap={2} onSubmit={onSubmit}>
  <Input label="Buscar" placeholder="nome…" />
  <Select label="Status" options={statusOptions} />
  <Button type="submit">Filtrar</Button>
</Form>;
```

`inline` aligns children at `flex-end` and wraps — perfect for filter bars or short login forms.

**Sections + grouped rows:**

`FormSection` lets you nest layouts (e.g. a stacked form with a 3-column "Address" group inside):

```tsx
import { Form, FormSection, FormRow, FormActions, Input, Button } from "tempest-react-sdk";

<Form layout="stack" gap={5}>
  <Input label="Email" {...register("email")} />

  <FormSection title="Endereço" description="Usado para entrega" layout="grid" columns={3} gap={3}>
    <Input label="CEP" {...register("cep")} />
    <Input label="Cidade" {...register("city")} />
    <Input label="UF" {...register("state")} />
    <Input label="Rua" style={{ gridColumn: "1 / -1" }} {...register("street")} />
  </FormSection>

  <FormRow>
    <Input label="Validade" placeholder="MM/AA" {...register("expiry")} />
    <Input label="CVV" {...register("cvv")} />
  </FormRow>

  <FormActions align="between">
    <Button variant="ghost" type="button" onClick={onCancel}>
      Cancelar
    </Button>
    <Button type="submit">Salvar</Button>
  </FormActions>
</Form>;
```

| Component     | Default layout            | What it does                                                                                  |
| ------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `Form`        | `stack`                   | `<form>` element + flex/grid container. `onSubmit` works as expected.                         |
| `FormSection` | `stack` body              | Titled subgroup with its own independent layout / columns / gap.                              |
| `FormRow`     | always horizontal         | Forces a wrapping side-by-side row regardless of parent layout. Children share width equally. |
| `FormActions` | horizontal, `align="end"` | Footer button row. `align` accepts `start` / `center` / `end` / `between`.                    |

Both `Form` and `FormSection` accept `gap` (number → multiple of 4px, or any CSS length string) and `columns` (number → `repeat(N, minmax(0, 1fr))`, or any `grid-template-columns` string).

### Forms (zod) recipe

Three levels of integration — pick the one that fits the form complexity.

**1. Standalone validation** — independent of any form library:

```ts
import { validateForm } from "tempest-react-sdk";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const result = validateForm(schema, formValues);
if (!result.success) {
  setErrors(result.errors); // { email: "...", password: "..." }
  return;
}
await login(result.data);
```

**2. `react-hook-form` resolver** — drop-in replacement for `@hookform/resolvers/zod`:

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "tempest-react-sdk";

const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
```

**3. All-in-one hook** — the schema infers the form type:

```tsx
import { useZodForm } from "tempest-react-sdk";

function LoginForm() {
  const form = useZodForm(loginSchema, {
    defaultValues: { email: "", password: "" },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => login(data))}>
      <Input {...form.register("email")} label="Email" />
      <Input {...form.register("password")} type="password" label="Senha" />
      <Button type="submit" loading={form.formState.isSubmitting}>
        Entrar
      </Button>
    </form>
  );
}
```

`react-hook-form` is an **optional peer dep** — only install when you use `zodResolver` or `useZodForm`.

### BR validators & masked inputs recipe

Algorithmic validators (full check-digit math, rejects all-same-digit edge cases) plus masked inputs that play nicely with `react-hook-form`:

```ts
import { validateCPF, validateCNPJ, formatCEP, formatCNPJ, unmask } from "tempest-react-sdk";

validateCPF("000.000.000-00"); // false (all-same)
validateCPF("12345678909"); // true
validateCNPJ("11.222.333/0001-81"); // true
formatCEP("01001000"); // "01001-000"
unmask("(11) 99876-5432"); // "11998765432"
```

```tsx
import { CPFInput, PhoneInput, CEPInput, CNPJInput, MoneyInput } from "tempest-react-sdk";
import { Controller, useForm } from "react-hook-form";

function CheckoutForm() {
  const { control, register } = useForm<Checkout>();
  return (
    <>
      <CPFInput {...register("cpf")} label="CPF" />
      <PhoneInput {...register("phone")} label="Telefone" />
      <CEPInput {...register("cep")} label="CEP" />
      <Controller
        name="total"
        control={control}
        render={({ field }) => <MoneyInput {...field} label="Total" currency="BRL" />}
      />
    </>
  );
}
```

`MoneyInput` exposes a numeric value to your form state while rendering a formatted string in the input.

### ViaCEP lookup recipe

```tsx
import { useViaCEP } from "tempest-react-sdk";

function AddressFields({ form }: { form: UseFormReturn<Address> }) {
  const cep = form.watch("cep");
  const { result, loading, error } = useViaCEP(cep);

  useEffect(() => {
    if (result) {
      form.setValue("street", result.logradouro);
      form.setValue("neighborhood", result.bairro);
      form.setValue("city", result.localidade);
      form.setValue("state", result.uf);
    }
  }, [result]);

  return <CEPInput {...form.register("cep")} loading={loading} error={error?.message} />;
}
```

`useViaCEP` debounces requests, caches by CEP, and ignores partial input (`length < 8`).

### WebSocket recipe

Wrapper around `WebSocket` with exponential reconnect (up to 10 attempts), optional ping heartbeat, JSON parsing, and `send` that no-ops while the socket isn't open.

```tsx
import { useWebSocket } from "tempest-react-sdk";

type ChatEvent = { type: "message"; user: string; text: string };

function Chat({ apiUrl, enabled }: { apiUrl: string; enabled: boolean }) {
  const ws = useWebSocket<ChatEvent>(`${apiUrl}/chat`, {
    enabled,
    pingInterval: 30_000,
    onMessage: ({ data }) => console.log(data),
  });

  return (
    <button disabled={ws.status !== "open"} onClick={() => ws.send(JSON.stringify({ text: "hi" }))}>
      Enviar
    </button>
  );
}
```

Imperative (outside React):

```ts
import { createWebSocket } from "tempest-react-sdk";

const socket = createWebSocket(`${apiUrl}/chat`, {
  pingInterval: 30_000,
  onMessage: ({ data }) => console.log(data),
});

socket.send("hello");
socket.close();
```

### Server-Sent Events (SSE) recipe

Stream with exponential reconnect (up to 10 attempts), `ping` heartbeat, JSON parsing by default. For cookie-auth endpoints, pass `withCredentials: true`.

```tsx
import { useEventStream } from "tempest-react-sdk";
import { useNotificationsStore } from "@/store/notifications";

type StreamEvent =
  | { type: "NOTIFY"; message: string }
  | { type: "PAYMENT-SUCCESS"; order_id: string }
  | { type: "PING" };

export function NotificationsListener({ apiUrl, enabled }: { apiUrl: string; enabled: boolean }) {
  const add = useNotificationsStore((s) => s.add);

  useEventStream<StreamEvent>(`${apiUrl}/notifications/stream`, {
    enabled,
    withCredentials: true,
    namedEvents: ["notification", "payment"],
    onMessage: ({ data }) => {
      if (data.type === "PING") return;
      add(data);
    },
  });

  return null;
}
```

Imperative form (e.g., outside React, in a worker, in tests):

```ts
import { createEventStream } from "tempest-react-sdk";

const stream = createEventStream(`${apiUrl}/notifications/stream`, {
  withCredentials: true,
  onMessage: ({ data }) => console.log(data),
  onError: (event) => console.warn("SSE error", event),
});

stream.close();
```

### Web Push recipe

The SDK owns the **browser-side flow**: permission, `pushManager.subscribe`, reading the active subscription, and unsubscribing. The **endpoint** is your responsibility — you supply `onSubscribe` / `onUnsubscribe` callbacks that POST/DELETE to your API.

Pre-requisite: register the service worker before calling `subscribe()` (via `vite-plugin-pwa`, `registerServiceWorker`, or raw `navigator.serviceWorker.register`).

```tsx
import { usePushSubscription, Button } from "tempest-react-sdk";
import { api } from "@/services/api";

export function PushToggle() {
  const push = usePushSubscription({
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    onSubscribe: (subscription) => api.post("/webpush/subscribe", { body: subscription }),
    onUnsubscribe: () => api.delete("/webpush/my"),
  });

  if (!push.supported) return <p>Push não suportado neste navegador.</p>;

  return (
    <Button
      loading={push.loading}
      variant={push.subscribed ? "danger" : "primary"}
      onClick={() => (push.subscribed ? push.unsubscribe() : push.subscribe())}
    >
      {push.subscribed ? "Desinscrever notificações" : "Receber notificações"}
    </Button>
  );
}
```

Imperative version:

```ts
import { WebPushClient } from "tempest-react-sdk";

const push = new WebPushClient({
  vapidPublicKey: VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
  onUnsubscribe: () => api.delete("/webpush/my"),
});

await push.subscribe();
const active = await push.isSubscribed();
await push.unsubscribe();
```

Errors thrown: `WebPushUnsupportedError`, `WebPushPermissionDeniedError`. Anything else bubbles up as the underlying browser exception.

### Service Worker helpers recipe

**Main thread** — register the SW, react to updates, expose a "skip waiting" hook:

```ts
import { registerServiceWorker, skipWaiting } from "tempest-react-sdk";

registerServiceWorker({
  url: "/sw.js",
  onUpdate: (waiting) => {
    if (confirm("Nova versão disponível. Recarregar?")) {
      skipWaiting(waiting);
      window.location.reload();
    }
  },
  onError: (err) => console.error("SW falhou", err),
});
```

**Worker thread** — inside `sw.ts`/`sw.js`, install handlers for push, notification click, and the skip-waiting message:

```ts
/// <reference lib="webworker" />
import {
  installPushHandler,
  installNotificationClickHandler,
  installSkipWaitingListener,
} from "tempest-react-sdk";

installSkipWaitingListener();

installPushHandler({
  defaultTitle: "Tempest",
  defaultIcon: "/icons/Logo.png",
  transform: (payload) => {
    if (payload.tag === "silent-ping") return null; // drop silently
    return payload;
  },
});

installNotificationClickHandler({
  focusOrOpenWindow: true,
  fallbackUrl: "/",
});
```

The SDK does **not** ship the worker file or the bundler config — pair it with `vite-plugin-pwa` (`injectManifest`) or a separately bundled worker.

### Audio playback recipe

`playAudio` for one-shot sounds (notification chime, payment success), `createAudioPlayer` for isolated channels, `useAudio` for a per-component player.

```ts
import { playAudio } from "tempest-react-sdk";

await playAudio("/audio/plim.wav", { volume: 0.4 });
```

```tsx
import { useAudio } from "tempest-react-sdk";

function NotifyBell() {
  const audio = useAudio();
  return <button onClick={() => audio.play("/audio/bell.wav")}>Notify</button>;
}
```

Browsers block autoplay until the user interacts with the page. `playAudio` resolves to `null` when blocked — the UI is expected to "unlock" on first click.

### Offline storage (IndexedDB / Dexie) recipe

Owner-scoped store per domain. Persists SSE history, drafts, offline cache. `dexie` is an **optional peer** — `npm i dexie` only when you import this module.

```ts
import { createOfflineStore } from "tempest-react-sdk";

type Notification = {
  message_id: string;
  owner_id: string;
  type: "NOTIFY" | "PAYMENT-SUCCESS";
  message: string;
  created_at: string;
  read: boolean;
};

export const notificationsStore = createOfflineStore<Notification, string>({
  databaseName: "TempestNotifications",
  version: 1,
  tableName: "notifications",
  indexes: "&message_id, owner_id, read, created_at",
  keyPath: "message_id",
  ownerField: "owner_id",
});

await notificationsStore.put(
  {
    /* … */
  } as Notification,
  "u1",
);
const items = await notificationsStore.list("u1", {
  orderBy: "created_at",
  reverse: true,
  limit: 50,
});
await notificationsStore.updateMany("u1", { read: true });
await notificationsStore.clear("u1");
```

API: `put` / `bulkPut` / `get` / `list` / `update` / `updateMany` / `delete` / `clear` / `count`. `raw` (Dexie table) and `db` (Dexie instance) are exposed for advanced queries.

### Error boundary recipe

Renders a fallback (static element or render-prop), auto-resets via `resetKeys`, forwards errors to `onError` for telemetry. `useErrorHandler` re-throws async errors inside the nearest boundary.

```tsx
import { ErrorBoundary, ErrorState } from "tempest-react-sdk";
import { useLocation } from "react-router-dom";

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary
      resetKeys={[location.pathname]}
      onError={(err, info) => reportToSentry(err, info)}
      fallback={({ error, reset }) => <ErrorState description={error.message} onRetry={reset} />}
    >
      {children}
    </ErrorBoundary>
  );
}
```

```tsx
import { useErrorHandler } from "tempest-react-sdk";

function Streamer() {
  const throwError = useErrorHandler();
  useEffect(() => {
    const stream = openSocket();
    stream.onerror = (err) => throwError(err);
    return () => stream.close();
  }, [throwError]);
  return null;
}
```

### Toast notifications recipe

```tsx
import { ToastProvider, useToast, Button } from "tempest-react-sdk";

// Wrap app once (already in the Quickstart):
<ToastProvider placement="top-right" duration={4000}>
  <App />
</ToastProvider>;

// Use anywhere:
function SaveButton() {
  const toast = useToast();
  return (
    <Button
      onClick={async () => {
        try {
          await save();
          toast.success("Alterações salvas");
        } catch (error) {
          toast.error(String(error));
        }
      }}
    >
      Salvar
    </Button>
  );
}
```

`useToast()` returns `{ show, success, info, warning, error, dismiss }` — `show` takes the full `ToastOptions`.

### Modal & ConfirmDialog recipe

```tsx
import { useState } from "react";
import { Modal, ConfirmDialog, Button } from "tempest-react-sdk";

function DeleteUser({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Excluir
      </Button>
      <ConfirmDialog
        open={open}
        title="Excluir usuário"
        description={`Esta ação é permanente. Excluir ${user.name}?`}
        confirmLabel="Sim, excluir"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={async () => {
          await deleteUser(user.id);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
```

`Modal` is the lower-level primitive (focus trap + scroll lock + ESC to close + backdrop click). `ConfirmDialog` is the opinionated yes/no wrapper.

### Tables & pagination recipe

```tsx
import { Table, Pagination, usePagination } from "tempest-react-sdk";

const columns = [
  { key: "id", label: "ID", align: "right" as const },
  { key: "name", label: "Nome" },
  { key: "email", label: "Email" },
  {
    key: "actions",
    label: "",
    render: (row) => (
      <Button size="sm" onClick={() => edit(row.id)}>
        Editar
      </Button>
    ),
  },
];

function UsersList() {
  const { page, size, setPage, setSize } = usePagination({ initialSize: 20 });
  const { data } = useQuery({
    queryKey: userKeys.list({ page, size }),
    queryFn: () => api.get<Paginated<User>>(`/users?page=${page}&size=${size}`),
  });

  return (
    <>
      <Table columns={columns} rows={data?.items ?? []} loading={!data} />
      <Pagination
        page={page}
        pageSize={size}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setSize}
      />
    </>
  );
}
```

### Layout primitives recipe

`Stack`, `Grid`, and `Container` are zero-dependency layout helpers (flex, grid, max-width).

```tsx
import { Container, Stack, Grid, Card } from "tempest-react-sdk";

<Container size="lg">
  <Stack gap="md" direction="column">
    <h1>Dashboard</h1>
    <Grid columns={3} gap="md">
      <Card>Visitas</Card>
      <Card>Pedidos</Card>
      <Card>Receita</Card>
    </Grid>
  </Stack>
</Container>;
```

### Virtual list recipe

Render thousands of rows without blowing the DOM. Built on top of `useResizeObserver` — supports dynamic row heights.

```tsx
import { VirtualList } from "tempest-react-sdk";

<VirtualList
  items={messages}
  estimatedItemHeight={64}
  overscan={5}
  renderItem={(message) => <MessageRow key={message.id} message={message} />}
/>;
```

### Theming (light / dark) recipe

```tsx
import { ThemeProvider, useTheme } from "tempest-react-sdk";

<ThemeProvider defaultMode="system" persistKey="tempest-theme">
  <App />
</ThemeProvider>;

function ThemeToggle() {
  const { mode, setMode, resolved } = useTheme();
  return (
    <select value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}>
      <option value="light">Claro</option>
      <option value="dark">Escuro</option>
      <option value="system">Sistema ({resolved})</option>
    </select>
  );
}
```

`ThemeProvider` writes `data-tempest-theme="dark"` (or removes it) on the root element. To **avoid the white flash** on initial paint, inline `themeInitScript()` in `<head>` before the React bundle:

```html
<script>
  __INIT_THEME__;
</script>
```

```ts
// build.ts
import { themeInitScript } from "tempest-react-sdk";
const html = template.replace("__INIT_THEME__", themeInitScript());
```

### i18n recipe

Minimal in-house i18n (~1.5 KB gzip). Use this when you need light interpolation + a couple of locales; reach for `i18next` when you need plural rules, namespaces, or async loaders.

```ts
import { createI18n } from "tempest-react-sdk";

const i18n = createI18n({
  locale: "pt-BR",
  fallback: "en",
  messages: {
    "pt-BR": {
      greeting: "Olá, {name}",
      inbox: { empty: "Caixa vazia" },
    },
    en: {
      greeting: "Hello, {name}",
      inbox: { empty: "Empty inbox" },
    },
  },
  persistKey: "tempest-locale",
});
```

```tsx
import { I18nProvider, useTranslate, useI18n } from "tempest-react-sdk";

<I18nProvider i18n={i18n}>
  <App />
</I18nProvider>;

function Header() {
  const t = useTranslate();
  const { locale, setLocale } = useI18n();
  return (
    <header>
      <span>{t("greeting", { name: "Mauricio" })}</span>
      <button onClick={() => setLocale(locale === "pt-BR" ? "en" : "pt-BR")}>
        {locale === "pt-BR" ? "EN" : "PT"}
      </button>
    </header>
  );
}
```

### Feature flags recipe

`FeatureFlagsProvider` takes an `adapter` matching the `FeatureFlagsAdapter` interface (`isEnabled`, `get`, `onChange?`). Ship the `InMemory` adapter while you build, swap for GrowthBook / LaunchDarkly when you're ready.

```tsx
import {
  FeatureFlagsProvider,
  useFeatureFlag,
  useFlagValue,
  createInMemoryFlags,
} from "tempest-react-sdk";

const flags = createInMemoryFlags({
  initial: { "new-checkout": true, "max-items": 10 },
});

<FeatureFlagsProvider adapter={flags}>
  <App />
</FeatureFlagsProvider>;

function CheckoutButton() {
  const isNew = useFeatureFlag("new-checkout");
  const maxItems = useFlagValue<number>("max-items", 5);
  return isNew ? <NewCheckout maxItems={maxItems} /> : <LegacyCheckout />;
}
```

**GrowthBook adapter** — wraps a `GrowthBook` instance. The app initialises GrowthBook (so it controls `apiHost`, `clientKey`, attributes, `loadFeatures()`), the adapter only routes lookups.

```ts
import { GrowthBook } from "@growthbook/growthbook";
import { FeatureFlagsProvider, createGrowthBookFeatureFlagsAdapter } from "tempest-react-sdk";

const gb = new GrowthBook({
    apiHost: import.meta.env.VITE_GROWTHBOOK_API_HOST,
    clientKey: import.meta.env.VITE_GROWTHBOOK_KEY,
    attributes: { id: userId },
});
await gb.loadFeatures();

const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });

<FeatureFlagsProvider adapter={adapter}>
    <App />
</FeatureFlagsProvider>;
```

Mapping: `isEnabled(key)` → `growthbook.isOn(key)`; `get(key, default)` → `growthbook.getFeatureValue(key, default)`; `onChange(listener)` → `growthbook.setRenderer(...)` (installed lazily on first subscription, multiplexes to all listeners).

**LaunchDarkly adapter** — wraps `launchdarkly-js-client-sdk`.

```ts
import * as LDClient from "launchdarkly-js-client-sdk";
import { FeatureFlagsProvider, createLaunchDarklyFeatureFlagsAdapter } from "tempest-react-sdk";

const client = LDClient.initialize(import.meta.env.VITE_LD_CLIENT_ID, {
    kind: "user",
    key: userId,
});
await client.waitUntilReady();

const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });

<FeatureFlagsProvider adapter={adapter}>
    <App />
</FeatureFlagsProvider>;
```

Mapping: `isEnabled(key)` → `client.variation(key, default) === true`; `get(key, default)` → `client.variation(key, default)`; `onChange(listener)` → `client.on("change", listener)` + `client.off` on unsubscribe.

Neither `@growthbook/growthbook` nor `launchdarkly-js-client-sdk` is declared as a peer dep — the adapter only touches the instance you hand it. Install whichever you opt into: `npm install @growthbook/growthbook` or `npm install launchdarkly-js-client-sdk`.

The `FeatureFlagsAdapter` interface is intentionally tiny — any third-party SDK can be wrapped into an adapter in ~20 lines.

### Telemetry recipe

`TelemetryProvider` accepts an adapter matching `TelemetryAdapter` (`init?`, `identify`, `track`, `captureException`, `flush?`). The bundled `consoleTelemetryAdapter` logs every event — useful for dev and tests.

```tsx
import { TelemetryProvider, useTelemetry, consoleTelemetryAdapter } from "tempest-react-sdk";

<TelemetryProvider adapter={consoleTelemetryAdapter}>
  <App />
</TelemetryProvider>;

function CheckoutForm() {
  const telemetry = useTelemetry();
  return (
    <Button
      onClick={() => {
        telemetry?.track({ name: "checkout.completed", properties: { total: 100 } });
      }}
    >
      Pagar
    </Button>
  );
}
```

`useTelemetry()` returns `null` when no provider is mounted — call sites should optional-chain (`telemetry?.track(...)`).

**Sentry adapter** — wraps `@sentry/browser` so the SDK never depends on Sentry directly. The Sentry namespace is supplied by the caller; if the app already initialises Sentry at startup, just pass that instance.

```ts
import * as Sentry from "@sentry/browser";
import { createSentryTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";

const adapter = createSentryTelemetryAdapter({
    sentry: Sentry,
    initOptions: {
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
    },
    flushTimeout: 2000,
    breadcrumbCategory: "app",
});

<TelemetryProvider adapter={adapter}>
    <App />
</TelemetryProvider>;
```

Mapping:

| `TelemetryAdapter` call          | `@sentry/browser` API                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| `init()`                         | `Sentry.init(initOptions)` (only when `initOptions` is provided)   |
| `identify(user)`                 | `Sentry.setUser({ id, email, username, ...traits })`               |
| `track({ name, properties })`    | `Sentry.addBreadcrumb({ category, message, level: "info", data })` |
| `captureException(err, context)` | `Sentry.captureException(err, { extra: context })`                 |
| `flush()`                        | `Sentry.flush(flushTimeout)`                                       |

`@sentry/browser` is **not** declared as a peer dep — the adapter only ever touches the namespace you hand it, so apps that don't use Sentry never pay for it. Install Sentry yourself when you opt in: `npm install @sentry/browser`.

**PostHog adapter** — wraps `posthog-js`.

```ts
import posthog from "posthog-js";
import { createPostHogTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";

const adapter = createPostHogTelemetryAdapter({
    posthog,
    init: {
        apiKey: import.meta.env.VITE_POSTHOG_KEY,
        options: { api_host: "https://us.i.posthog.com" },
    },
});

<TelemetryProvider adapter={adapter}>
    <App />
</TelemetryProvider>;
```

Mapping:

| `TelemetryAdapter` call       | `posthog-js` API                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `init()`                      | `posthog.init(apiKey, options)` (only when `init` is provided)                                   |
| `identify({id, ...})`         | `posthog.identify(id, { email, name, ...traits })`                                               |
| `identify(null)`              | `posthog.reset()`                                                                                |
| `track({ name, properties })` | `posthog.capture(name, properties)`                                                              |
| `captureException(err, ctx)`  | `posthog.captureException(err, ctx)` when available, else `posthog.capture("$exception", { … })` |

`posthog-js` is **not** declared as a peer dep — install only when you opt in: `npm install posthog-js`.

Concrete adapters for Datadog / Amplitude / others are part of the v0.2 roadmap — for now you can write one in ~20 lines following the Sentry / PostHog adapters as templates.

### Logger recipe

Leveled logger with pluggable sinks:

```ts
import { createLogger, consoleSink } from "tempest-react-sdk";

export const log = createLogger({
  level: "info",
  sinks: [consoleSink({ pretty: true })],
  context: { app: "alofans", version: __APP_VERSION__ },
});

log.info("user.signed-in", { user_id: user.id });
log.error("payment.failed", { reason }, error);
```

A sink is any function `(entry: LogEntry) => void` — wire a sink that POSTs to your log ingestion endpoint, batches every 5 seconds, etc.

### Web Share API recipe

Share via the OS share sheet on mobile and supported desktop browsers. Falls back gracefully when `navigator.share` is missing.

```ts
import { share, isShareSupported } from "tempest-react-sdk";

if (!isShareSupported()) {
  copyToClipboard(url);
  return;
}

const result = await share({ title: "Tempest", text: "Check this out", url });
if (result.shared) toast.success("Compartilhado");
if (result.cancelled) {
  /* user dismissed */
}
if (result.unsupported) {
  /* defensive — should not happen after isShareSupported */
}
```

### Hooks catalogue recipe

| Hook                                          | Purpose                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `useDebounce(value, delay)`                   | Debounce a value (search bars, autosave).                                        |
| `usePagination({ initialPage, initialSize })` | `page`/`size`/`setPage`/`setSize` triplet with bounds.                           |
| `useClientFilter(items, predicate)`           | Memoised in-memory filter.                                                       |
| `useMediaQuery(query)`                        | Subscribe to a `matchMedia` query (`(min-width: 1024px)`).                       |
| `useOnline()`                                 | Returns `true`/`false` from `navigator.onLine` + online/offline events.          |
| `useDocumentVisibility()`                     | `"visible"` / `"hidden"`, subscribing to `visibilitychange`.                     |
| `useIntersectionObserver(ref, opts)`          | Returns the latest `IntersectionObserverEntry`.                                  |
| `useResizeObserver(ref)`                      | Returns the latest `width`/`height`.                                             |
| `useClipboard()`                              | `{ copy(text), copied, error }` with `execCommand` fallback.                     |
| `useKeyboardShortcut(shortcut, handler)`      | `"Meta+K"` / `"Ctrl+Shift+P"` patterns.                                          |
| `useBeforeInstallPrompt()`                    | Capture the PWA install prompt and trigger it later.                             |
| `useIdle(timeout)`                            | `true` after `timeout` ms of no input.                                           |
| `useGeolocation()`                            | One-shot or watch position with permission state.                                |
| `useScrollLock(active)`                       | Lock body scroll while a modal is open.                                          |
| `useFocusTrap(ref, active)`                   | Trap focus inside a container.                                                   |
| `useStableCallback(fn)`                       | A `useCallback` that always points at the latest `fn` without churning identity. |
| `useDeepMemo(value)`                          | `useMemo` with deep equality.                                                    |

Each hook is independently importable and tested — see `docs/hooks.md` for full signatures and edge cases.

### Utility helpers recipe

```ts
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
  formatCPF,
  formatPercent,
  storage,
} from "tempest-react-sdk";

cn("btn", isPrimary && "btn-primary", { "btn-disabled": disabled });
formatCurrency(1234.5, "BRL"); // "R$ 1.234,50"
formatDate("2026-05-17"); // "17/05/2026"
formatDateTime("2026-05-17T14:30Z"); // "17/05/2026 11:30"
formatPhone("11998765432"); // "(11) 99876-5432"
formatCPF("12345678909"); // "123.456.789-09"
formatPercent(0.1234, 1); // "12,3%"

storage.set("draft", { title: "..." });
const draft = storage.get<Draft>("draft");
storage.remove("draft");
```

`storage` is an SSR-safe wrapper over `localStorage` — every call is `try/catch`-protected and returns `null` when `window` is unavailable or quota is exceeded.

---

## Theming reference

All tokens live on `:root` (light) and `[data-tempest-theme="dark"]` (dark). Override globally or in a subtree:

```css
:root {
  --tempest-primary: #ff3366;
  --tempest-radius-md: 6px;
  --tempest-font-family: "Inter", system-ui, sans-serif;
}

[data-tempest-theme="dark"] {
  --tempest-bg-default: #0b0e14;
  --tempest-text-primary: #e6e6e6;
}

[data-tempest-theme="dark"] .my-card {
  /* per-subtree dark override */
}
```

Categories of tokens:

- **Color**: `--tempest-primary`, `--tempest-success`, `--tempest-warning`, `--tempest-danger`, `--tempest-info`, `--tempest-bg-*`, `--tempest-text-*`, `--tempest-border-*`.
- **Radius**: `--tempest-radius-sm` / `-md` / `-lg` / `-full`.
- **Shadow**: `--tempest-shadow-sm` / `-md` / `-lg`.
- **Spacing**: `--tempest-space-1` … `--tempest-space-8`.
- **Typography**: `--tempest-font-family`, `--tempest-font-size-sm` / `-md` / `-lg`, `--tempest-line-height-base`.

Tokens are stable public API — breaking changes always bump the SDK minor (or major, on rename).

---

## Conventions

These conventions are enforced across the SDK source and are the same patterns the SDK encourages in consumer apps.

- **TypeScript strict** — no `any` implicit, `verbatimModuleSyntax`, every export typed.
- **Double quotes** everywhere — `"foo"` never `'foo'`.
- **JSDoc in English** on every public export (description + `@example`).
- **CSS Modules** with the `tempest_` prefix — no global class names, no collisions with consumer apps.
- **Empty results return `[]`** — never `null`/`undefined` for "no matches".
- **No barrel default exports** — always named exports. Apps import from the package root, never from submodules.
- **Optional peer deps** for everything that isn't React itself — apps install only what they consume.
- **No Storybook** — `docs/` markdown + `examples/gallery` cover the documentation surface.
- **Dark mode via `data-tempest-theme="dark"` attribute**, never a `class="dark"` toggle — allows scoped subtree overrides.

---

## Development

```bash
npm install
npm run dev            # vite build --watch
npm run build          # ESM + CJS + rolled-up d.ts + styles.css
npm run typecheck      # tsc -b --noEmit (checks tests too)
npm run lint           # eslint .
npm run format         # prettier --write .
npm test               # vitest (watch)
npm run test:run       # vitest run
npm run test:coverage  # vitest run --coverage
npm run clean          # rm -rf dist coverage
```

Snapshot of current health:

- 444 tests / 164 files. 95% line / 96% function coverage.
- ESM 98 KB → 28 KB gzip. CJS 71 KB → 24 KB gzip. CSS 32 KB → 6 KB gzip.
- Husky pre-commit runs `lint-staged` (eslint --fix + prettier --write) on staged files.

The demo gallery lives in `examples/gallery` and consumes the local SDK via `file:../..`:

```bash
cd examples/gallery
npm install
npm run dev            # http://127.0.0.1:5173
```

Every gallery section maps 1-to-1 with a docs page — see [`docs/gallery.md`](./docs/gallery.md).

---

## Release

Versioning is managed with [Changesets](https://github.com/changesets/changesets):

```bash
npx changeset          # describe the change (patch / minor / major)
npx changeset version  # bump versions + update CHANGELOG.md
npm run release        # build + changeset publish
```

CI workflow `.github/workflows/release.yml` publishes to npm whenever a "Version Packages" PR merges into `main`. The first publish is manual — set the `NPM_TOKEN` secret in _Settings → Secrets and variables → Actions_ and run `npm publish` once.

Tags follow `vMAJOR.MINOR.PATCH`. CSS tokens (`--tempest-*`) are treated as public API — renames bump the minor (or major, on removal).

---

## License

MIT © Mauricio Benjamin
