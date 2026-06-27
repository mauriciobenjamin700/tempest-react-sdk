# Architecture

`tempest-react-sdk` is a single package with independent layers. You import only
what you use; everything is externalized in the SDK bundle, so your app's bundler
tree-shakes whatever isn't referenced.

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

## See also

- [Scaffold — `create-tempest-app`](./scaffold.md)
- [HTTP — request flow](./http.md)
- Diagram: [architecture.drawio](./diagrams/architecture.drawio)
