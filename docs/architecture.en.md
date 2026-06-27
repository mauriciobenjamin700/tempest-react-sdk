# Architecture

`tempest-react-sdk` is a single package with independent layers. You import only
what you use; everything is externalized in the SDK bundle, so your app's bundler
tree-shakes whatever isn't referenced.

!!! tip "Import only what you use"
    There's no penalty for the SDK being large. Each layer (HTTP, auth, query,
    forms…) is independent — if you never import `createOfflineStore`, `dexie`
    never enters your bundle. Start with a single `Button` and grow from there.

> Editable diagram: [architecture.drawio](./diagrams/architecture.drawio) (open in [draw.io](https://app.diagrams.net)).

## Layers

### Application foundation

The opinionated base that assembles a whole React app. This is what the
[`create-tempest-app`](./scaffold.md) CLI generates.

| Layer                  | What it does                                                                          | Page                             |
| ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| **Vite (`vite/`)**     | `createViteConfig` — React plugin + `@` → `src` alias + dev server (subpath `/vite`). | [Vite & alias](./vite-config.md) |
| **Router (`router/`)** | `defineRoutes`, `<AppRouter>`, `<RouteGuard>` + React Router v7 re-exports.           | [Routing](./routing.md)          |
| **Store (`store/`)**   | `createStore`, `createSelectors` (generic Zustand factories).                         | [State](./state.md)              |
| **App (`app/`)**       | `<AppProviders>` — composes ErrorBoundary → Query → Theme → i18n in one block.        | [Providers](./app-providers.md)  |

### UI blocks and integrations

| Layer                                                 | What it does                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Components (`components/`)**                        | 70+ UI primitives (Button, Input, Modal, Table, DataTable, Command, Calendar…) with `tempest_`-prefixed CSS Modules. |
| **Hooks (`hooks/`)**                                  | `useDebounce`, `usePagination`, `useMediaQuery`, `useKeyboardShortcut`, `useFocusTrap`…                              |
| **HTTP (`http/`)**                                    | `createApiClient`, `parseResponse`, `uploadWithProgress`, `retry`, `usePoll`.                                        |
| **Auth (`auth/`)**                                    | `createAuthStore` (Zustand) + `AuthGuard` + JWT helpers + `lazyWithRetry`.                                           |
| **Query (`query/`)**                                  | `QueryProvider`, `createQueryKeys`, time presets.                                                                    |
| **SSE / WebSocket / Push / SW**                       | Real-time transports with reconnect.                                                                                 |
| **Offline (`offline/`)**                              | `createOfflineStore` (Dexie).                                                                                        |
| **Forms (`forms/`)**                                  | `useZodForm`, `zodResolver`, `FormField`, BR masked inputs.                                                          |
| **Theme / i18n / Logger / Telemetry / Feature Flags** | No-flash theme, in-house i18n, leveled logger, injectable adapters.                                                  |
| **Utils (`utils/`)**                                  | `cn`, BR format, arrays/objects/guards/functions/promises, strings, numbers, `randomId`.                             |

## Dependencies

Only **`react`** + **`react-dom`** are **peer dependencies** (single React
instance rule). Everything else is a **direct dependency** — installed
automatically by `npm install tempest-react-sdk` and externalized in the bundle
(your app's bundler resolves it from `node_modules` and tree-shakes).

| Package                        | Status              | Used by                                                                         |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------- |
| `react`, `react-dom`           | **Peer (required)** | Everything                                                                      |
| `react-router-dom@7`           | Direct dep          | `AppRouter`, `defineRoutes`, `RouteGuard`, re-exports                           |
| `zustand`                      | Direct dep          | `createStore`, `createSelectors`, `createAuthStore`                             |
| `@tanstack/react-query`        | Direct dep          | `QueryProvider`, `createQueryKeys`, `AppProviders`                              |
| `zod`                          | Direct dep          | `parseResponse`, `validateForm`, `zodResolver`, `useZodForm`                    |
| `react-hook-form`              | Direct dep          | `useZodForm`, `FormField`, masked inputs                                        |
| `dexie`                        | Direct dep          | `createOfflineStore`                                                            |
| `lucide-react`                 | Direct dep          | Icons (`leftIcon`/`rightIcon`)                                                  |
| `vite`, `@vitejs/plugin-react` | **Optional peer**   | `createViteConfig` (subpath `tempest-react-sdk/vite`) — already in any Vite app |

!!! note "Only `react` and `react-dom` are peers"
    The single React instance rule forces those two to be peer deps. Everything
    else (`zustand`, `zod`, `dexie`, `react-hook-form`, `@tanstack/react-query`,
    `lucide-react`) is a direct dependency — `npm install tempest-react-sdk` pulls
    them all in, with nothing for you to list by hand.

Adapters for external SDKs (Sentry, PostHog, GrowthBook, LaunchDarkly) are **not**
declared — the caller injects the instance into the factory.

## Subpaths

| Import                         | Contents                                              |
| ------------------------------ | ----------------------------------------------------- |
| `tempest-react-sdk`            | Main barrel (components, hooks, foundation…).         |
| `tempest-react-sdk/styles.css` | `--tempest-*` tokens + reset + CSS Modules.           |
| `tempest-react-sdk/vite`       | `createViteConfig` (Node-only, for `vite.config.ts`). |
| `tempest-react-sdk/testing`    | `createMockHandlers` (MSW test helpers).              |

## Bundle

Vite library mode → ESM (`tempest-react-sdk.js`) + CJS (`.cjs`) + rolled-up
`.d.ts` + `styles.css` (CSS Modules in a single file, `cssCodeSplit: false`).
Budget monitored by `size-limit` in CI.

## Recap

- One package, independent layers; you import only what you use and the bundler
  tree-shakes the rest.
- Only `react` + `react-dom` are peers; the other libs are direct deps installed
  alongside.
- Four subpaths: the main barrel, `…/styles.css`, `…/vite` (Node-only) and
  `…/testing`.
- The app foundation ([Vite](./vite-config.md) · [Router](./routing.md) ·
  [Store](./state.md) · [Providers](./app-providers.md)) is what
  [`create-tempest-app`](./scaffold.md) assembles for you.

## See also

- [Scaffold — `create-tempest-app`](./scaffold.md)
- [HTTP — request flow](./http.md)
- Diagram: [architecture.drawio](./diagrams/architecture.drawio)
