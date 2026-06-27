# tempest-react-sdk

Shared React/TypeScript building blocks used across Tempest frontends: an
**application foundation** (Vite + `@` alias, declarative routing, Zustand
state, TanStack Query cache, providers), UI components, hooks, an HTTP client,
an auth store, forms (zod), real-time transports (SSE / WebSocket / Web Push /
Service Worker), theme, i18n, telemetry, feature flags, offline storage, an
error boundary and a curated set of utilities.

The goal is to start every new React frontend with the same opinionated
foundation already in place — no re-configuring Vite, no rewriting the auth
store, no re-inventing the SSE reconnect loop. It ships the **`create-tempest-app`**
CLI that scaffolds a whole wired-up project.

> :material-translate: **Languages / Idiomas** — these docs are bilingual.
> Use the language switcher at the top of the page to toggle between
> **Português (BR)** and **English (US)**.

## Get started in 1 minute

Scaffold a new app already wired with the SDK (the CLI ships inside the package):

```bash
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
npm run dev            # http://127.0.0.1:5173
```

New here? Follow the **[Tutorial — User Guide](tutorial/index.md)**: from
scaffold to a complete app, one concept per page.

## Manual install

In an existing Vite + React + TS project:

```bash
npm install tempest-react-sdk
```

Import the CSS once at your app entrypoint:

```ts
import "tempest-react-sdk/styles.css";
```

Only **`react`** and **`react-dom`** are peer dependencies (single React
instance rule). Everything else — `react-router-dom`, `zustand`,
`@tanstack/react-query`, `zod`, `react-hook-form`, `dexie`, `lucide-react` — is
a **direct dependency**, installed automatically with the SDK and externalized
in the bundle (your bundler tree-shakes what you don't use). Details in
[Architecture](architecture.md).

## What's inside

| Area               | Pages                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tutorial**       | [Start here](tutorial/index.md) · [Routing](tutorial/routing.md) · [State](tutorial/state.md) · [Data fetching](tutorial/data-fetching.md) · [Forms](tutorial/forms.md) · [Auth flow](tutorial/auth-flow.md)                                                                                                                                                                                     |
| **App foundation** | [Scaffold](scaffold.md), [Vite & alias](vite-config.md), [Routing](routing.md), [State (Zustand)](state.md), [Providers](app-providers.md)                                                                                                                                                                                                                                                       |
| **Guide**          | [Architecture](architecture.md), [Gallery (demo)](gallery.md)                                                                                                                                                                                                                                                                                                                                    |
| **Components**     | [Catalogue](components.md) — [Data entry](components/inputs.md), [Actions](components/actions.md), [Navigation](components/navigation.md), [Overlay](components/overlay.md), [Layout](components/layout.md), [Data](components/data.md), [Feedback](components/feedback.md), [Identity](components/identity.md), [Utility](components/utility.md), [Overlays & advanced](components/advanced.md) |
| **Hooks**          | [Utility hooks](hooks.md)                                                                                                                                                                                                                                                                                                                                                                        |
| **Integrations**   | [HTTP](http.md), [Auth](auth.md), [Query](query.md), [SSE](sse.md), [WebSocket](websocket.md), [Web Push](push.md), [Offline](offline.md), [Web Share](share.md), [Audio](audio.md)                                                                                                                                                                                                              |
| **Forms**          | [Forms (zod)](forms.md), [Forms BR](forms-br.md)                                                                                                                                                                                                                                                                                                                                                 |
| **Style & Theme**  | [Styles & Design Tokens](styles.md), [Theme](theme.md), [i18n](i18n.md)                                                                                                                                                                                                                                                                                                                          |
| **Observability**  | [Telemetry](telemetry.md), [Feature Flags](feature-flags.md), [Logger](logger.md), [Error Boundary](error-boundary.md)                                                                                                                                                                                                                                                                           |
| **Recipes**        | [Cookbook](cookbook.md), [Utilities](utilities.md)                                                                                                                                                                                                                                                                                                                                               |
| **Project**        | [Testing helpers](testing.md), [Release pipeline](release.md)                                                                                                                                                                                                                                                                                                                                    |

## Quickstart (manual)

Mount the app root with `<AppProviders>` (error boundary + Query + theme + i18n
in one block) and `<AppRouter>` (declarative routes):

```tsx
import { AppProviders, AppRouter, defineRoutes } from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";

const routes = defineRoutes([{ path: "/", element: <h1>Hello 👋</h1> }]);

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Something went wrong.</p> }}>
      <AppRouter routes={routes} fallback={<p>Loading…</p>} />
    </AppProviders>
  );
}
```

## Repository & npm

- **npm:** <https://www.npmjs.com/package/tempest-react-sdk>
- **GitHub:** <https://github.com/mauriciobenjamin700/tempest-react-sdk>
- **For LLMs:** [llms.txt](llms.txt) (curated index) · [llms-full.txt](llms-full.txt) (full docs)

> The repo README is the npm/GitHub landing page. These docs are the navigable,
> per-module source of truth.
