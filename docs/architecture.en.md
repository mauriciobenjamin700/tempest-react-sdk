# Architecture

`tempest-react-sdk` is a single package with independent layers. You import only
what you use; everything is externalized in the SDK bundle, so your app's bundler
tree-shakes whatever isn't referenced.

!!! info "This page is the **package** architecture"
    Here you learn how the SDK itself is put together — layers, dependencies,
    subpaths, bundle. If what you want is how to organize **your app** (layers,
    folders, where each kind of state lives, file size limits), the page is
    [Frontend app layers](./design/architecture.md), under the
    [Software Design](./design/index.md) tab.

!!! tip "Import only what you use"
    There's no penalty for the SDK being large. Each layer (HTTP, auth, query,
    forms…) is independent — if you never import `createOfflineStore`, `dexie`
    never enters your bundle. Start with a single `Button` and grow from there.

> Editable diagram: [architecture.drawio](./diagrams/architecture.drawio) (open in [draw.io](https://app.diagrams.net)).

## Scope: client-side only

This SDK targets **client-rendered SPAs with offline capability** — service
worker, IndexedDB outbox, install prompt, background sync. It does **not**
support SSR or React Server Components: no module declares `"use client"`, and
components assume they mount in a browser. Next.js App Router is not a target.

!!! warning "That is a scope choice, not a gap"
    Covering both worlds would cost at every API (two render paths, hydration, no
    `window` at module top level) and offline-first — the whole reason the package
    exists — would come out worse. The `typeof window === "undefined"` guards in
    the hooks exist so they do not throw outside a browser (Node tests, the
    service-worker context, build plugins), not to promise server rendering.


## Layers

### Application foundation

The opinionated base that assembles a whole React app. This is what the
[`create-tempest-app`](./scaffold.md) CLI generates.

| Layer                  | What it does                                                                          | Page                             |
| ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| **Vite (`vite/`)**     | `createViteConfig` — React plugin + `@` → `src` alias + dev server (subpath `/vite`). | [Vite & alias](./vite-config.md) |
| **Router (`router/`)** | `defineRoutes`, `<AppRouter>`, `<RouteGuard>` + React Router v8 re-exports.           | [Routing](./routing.md)          |
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

**`react`**, **`react-dom`** and **`react-router`** are **peer dependencies** —
all three carry React context, and a second copy is not extra bundle weight, it
is a second *instance* that breaks at runtime. Everything else is a **direct
dependency** — installed automatically by `npm install tempest-react-sdk` and
externalized in the bundle (your app's bundler resolves it from `node_modules`
and tree-shakes).

| Package                        | Status              | Used by                                                                         |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------- |
| `react`, `react-dom`           | **Peer (required)** | Everything                                                                      |
| `react-router` (`^7 \|\| ^8`)  | **Peer (required)** | `AppRouter`, `defineRoutes`, `RouteGuard`, re-exports                           |
| `zustand`                      | Direct dep          | `createStore`, `createSelectors`, `createAuthStore`                             |
| `@tanstack/react-query`        | Direct dep          | `QueryProvider`, `createQueryKeys`, `AppProviders`                              |
| `zod`                          | Direct dep          | `parseResponse`, `validateForm`, `zodResolver`, `useZodForm`                    |
| `react-hook-form`              | Direct dep          | `useZodForm`, `FormField`, masked inputs                                        |
| `dexie`                        | Direct dep          | `createOfflineStore`                                                            |
| `lucide-react`                 | Direct dep          | Icons (`leftIcon`/`rightIcon`)                                                  |
| `vite`, `@vitejs/plugin-react` | **Optional peer**   | `createViteConfig` (subpath `tempest-react-sdk/vite`) — already in any Vite app |

!!! warning "Why `react-router` is a peer, not a direct dep"
    It holds React context. A copy nested under
    `tempest-react-sdk/node_modules` is a **different** `<Router>` context than
    the one your app renders, so any SDK hook reaching for it throws
    `useNavigate() may be used only in the context of a <Router>` — a runtime
    crash, not a size regression. Same reason `react` itself is a peer, and it is
    the one exception to the "everything else is a direct dep" rule. The
    `^7 || ^8` range lets an app on either major install a single copy: the
    re-exported surface is identical across both, and both ship the DOM bindings
    inside `react-router` itself (there is no separate `react-router-dom`).

!!! note "The rest stays a direct dep"
    `zustand`, `zod`, `dexie`, `react-hook-form`, `@tanstack/react-query` and
    `lucide-react` are direct dependencies — `npm install tempest-react-sdk`
    pulls them all in, with nothing for you to list by hand. Two copies of those
    cost bytes, not correctness.

Adapters for external SDKs (Sentry, PostHog, GrowthBook, LaunchDarkly) are **not**
declared — the caller injects the instance into the factory.

## Subpaths

| Import                         | Contents                                              |
| ------------------------------ | ----------------------------------------------------- |
| `tempest-react-sdk`            | Main barrel (components, hooks, foundation…).         |
| `tempest-react-sdk/styles.css` | `--tempest-*` tokens + reset + CSS Modules.           |
| `tempest-react-sdk/vite`       | `createViteConfig` (Node-only, for `vite.config.ts`). |
| `tempest-react-sdk/testing`    | `createMockHandlers` (MSW test helpers).              |
| `tempest-react-sdk/icons`      | `Icon` by slug + static registry ([Icons](./icons.md)). |

## Bundle

Vite library mode → ESM (`tempest-react-sdk.js`) + CJS (`.cjs`) + rolled-up
`.d.ts` + `styles.css` (CSS Modules in a single file, `cssCodeSplit: false`).
Budget monitored by `size-limit` in CI.

## Recap

- One package, independent layers; you import only what you use and the bundler
  tree-shakes the rest.
- Only `react` + `react-dom` are peers; the other libs are direct deps installed
  alongside.
- Subpaths: the main barrel, `…/styles.css`, `…/vite` (Node-only), `…/testing` and
  `…/icons` (icon by slug).
- The app foundation ([Vite](./vite-config.md) · [Router](./routing.md) ·
  [Store](./state.md) · [Providers](./app-providers.md)) is what
  [`create-tempest-app`](./scaffold.md) assembles for you.

## See also

- [Software Design — your app's layers](./design/architecture.md)
- [Scaffold — `create-tempest-app`](./scaffold.md)
- [HTTP — request flow](./http.md)
- Diagram: [architecture.drawio](./diagrams/architecture.drawio)
