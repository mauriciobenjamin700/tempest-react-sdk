# tempest-react-sdk

Shared React/TypeScript building blocks used across Tempest frontends: UI
components, hooks, HTTP client, auth store, query keys, forms (zod), real-time
transports (SSE / WebSocket / Web Push / Service Worker), theme, i18n,
telemetry, feature flags, offline storage, error boundary, and a curated set of
utilities (`cn`, `formatCurrency`, `formatCPF`, etc.).

The goal is to start every new React frontend with the same opinionated
foundation already in place — no copy-pasting `Button`/`Input` styles, no
rewriting the same Zustand auth store, no re-inventing the SSE reconnect loop.

> :material-translate: **Idiomas / Languages** — this documentation is
> bilingual. Use the language selector at the top of the page to switch between
> **Português (BR)** and **English (US)**.

## Install

```bash
npm install tempest-react-sdk
```

Import the CSS once at the app entrypoint:

```ts
import "tempest-react-sdk/dist/styles.css";
```

All peer dependencies are optional except `react` + `react-dom` — install only
what each module requires (`zod`, `zustand`, `@tanstack/react-query`, `dexie`,
`react-hook-form`, `lucide-react`). See the full table in
[Architecture](architecture.md#peer-dependencies).

## What's inside

| Area              | Pages                                                                                                                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guide**         | [Architecture](architecture.md), [Gallery (demo)](gallery.md)                                                                                                                                                                                                                                                                    |
| **Components**    | [Catalogue](components.md) — [Data entry](components/inputs.md), [Actions](components/actions.md), [Navigation](components/navigation.md), [Overlay](components/overlay.md), [Layout](components/layout.md), [Data](components/data.md), [Status & feedback](components/feedback.md), [Identity & micro](components/identity.md) |
| **Hooks**         | [Utility hooks](hooks.md)                                                                                                                                                                                                                                                                                                        |
| **Integrations**  | [HTTP](http.md), [Auth](auth.md), [Query](query.md), [SSE](sse.md), [WebSocket](websocket.md), [Web Push](push.md), [Offline](offline.md), [Web Share](share.md), [Audio](audio.md)                                                                                                                                              |
| **Forms**         | [Forms (zod)](forms.md), [Forms BR](forms-br.md)                                                                                                                                                                                                                                                                                 |
| **Style & Theme** | [Styles & Design Tokens](styles.md), [Theme](theme.md), [i18n](i18n.md)                                                                                                                                                                                                                                                          |
| **Observability** | [Telemetry](telemetry.md), [Feature Flags](feature-flags.md), [Logger](logger.md), [Error Boundary](error-boundary.md)                                                                                                                                                                                                           |
| **Project**       | [Testing helpers](testing.md), [Release pipeline](release.md)                                                                                                                                                                                                                                                                    |

## Quickstart

```tsx
import { ThemeProvider, QueryProvider, ToastProvider, I18nProvider } from "tempest-react-sdk";
import "tempest-react-sdk/dist/styles.css";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      <I18nProvider locale="pt-BR" fallbackLocale="en" messages={messages}>
        <QueryProvider>
          <ToastProvider position="top-right">{children}</ToastProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
```

## Repository & npm

- **npm:** <https://www.npmjs.com/package/tempest-react-sdk>
- **GitHub:** <https://github.com/mauriciobenjamin700/tempest-react-sdk>

> The repository README carries the full recipes and public-API reference. This
> documentation is the navigable, per-module source of truth.
