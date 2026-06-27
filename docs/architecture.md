# Arquitetura

O `tempest-react-sdk` é um pacote único com camadas independentes. O consumidor
importa só o que usa; tudo é externalizado no bundle do SDK, então o bundler do
app faz tree-shake do que não é referenciado.

> Diagrama editável: [architecture.drawio](./diagrams/architecture.drawio) (abra no [draw.io](https://app.diagrams.net)).

## Camadas

### Fundação de aplicação

A base opinativa que monta um app React inteiro. É o que a CLI
[`create-tempest-app`](./scaffold.md) gera.

| Camada                 | O que faz                                                                             | Página                           |
| ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| **Vite (`vite/`)**     | `createViteConfig` — plugin React + alias `@` → `src` + dev server (subpath `/vite`). | [Vite & alias](./vite-config.md) |
| **Router (`router/`)** | `defineRoutes`, `<AppRouter>`, `<RouteGuard>` + re-exports do React Router v7.        | [Roteamento](./routing.md)       |
| **Store (`store/`)**   | `createStore`, `createSelectors` (fábricas Zustand genéricas).                        | [Estado](./state.md)             |
| **App (`app/`)**       | `<AppProviders>` — compõe ErrorBoundary → Query → Theme → i18n num bloco.             | [Providers](./app-providers.md)  |

### Blocos de UI e integrações

| Camada                                                | O que faz                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Componentes (`components/`)**                       | 70+ UI primitives (Button, Input, Modal, Table, DataTable, Command, Calendar…) com CSS Modules prefixados `tempest_`. |
| **Hooks (`hooks/`)**                                  | `useDebounce`, `usePagination`, `useMediaQuery`, `useKeyboardShortcut`, `useFocusTrap`…                               |
| **HTTP (`http/`)**                                    | `createApiClient`, `parseResponse`, `uploadWithProgress`, `retry`, `usePoll`.                                         |
| **Auth (`auth/`)**                                    | `createAuthStore` (Zustand) + `AuthGuard` + JWT helpers + `lazyWithRetry`.                                            |
| **Query (`query/`)**                                  | `QueryProvider`, `createQueryKeys`, presets de tempo.                                                                 |
| **SSE / WebSocket / Push / SW**                       | Transportes em tempo real com reconnect.                                                                              |
| **Offline (`offline/`)**                              | `createOfflineStore` (Dexie).                                                                                         |
| **Forms (`forms/`)**                                  | `useZodForm`, `zodResolver`, `FormField`, inputs mascarados BR.                                                       |
| **Theme / i18n / Logger / Telemetry / Feature Flags** | Tema (no-flash), i18n in-house, logger leveled, adapters injetáveis.                                                  |
| **Utils (`utils/`)**                                  | `cn`, format BR, arrays/objects/guards/functions/promises, strings, numbers, `randomId`.                              |

## Dependências

Apenas **`react`** + **`react-dom`** são **peer dependencies** (regra de uma
única instância do React). Todo o resto é **dependência direta** — instalada
automaticamente por `npm install tempest-react-sdk` e externalizada no bundle
(o bundler do app resolve do `node_modules` e faz tree-shake).

| Pacote                         | Status              | Usado por                                                                                |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------- |
| `react`, `react-dom`           | **Peer (obrigat.)** | Tudo                                                                                     |
| `react-router-dom@7`           | Dep direta          | `AppRouter`, `defineRoutes`, `RouteGuard`, re-exports                                    |
| `zustand`                      | Dep direta          | `createStore`, `createSelectors`, `createAuthStore`                                      |
| `@tanstack/react-query`        | Dep direta          | `QueryProvider`, `createQueryKeys`, `AppProviders`                                       |
| `zod`                          | Dep direta          | `parseResponse`, `validateForm`, `zodResolver`, `useZodForm`                             |
| `react-hook-form`              | Dep direta          | `useZodForm`, `FormField`, inputs mascarados                                             |
| `dexie`                        | Dep direta          | `createOfflineStore`                                                                     |
| `lucide-react`                 | Dep direta          | Ícones (`leftIcon`/`rightIcon`)                                                          |
| `vite`, `@vitejs/plugin-react` | **Peer opcional**   | `createViteConfig` (subpath `tempest-react-sdk/vite`) — já presente em qualquer app Vite |

Adapters de SDKs externos (Sentry, PostHog, GrowthBook, LaunchDarkly) **não**
são declarados — o caller injeta a instância na factory.

## Subpaths

| Import                         | Conteúdo                                              |
| ------------------------------ | ----------------------------------------------------- |
| `tempest-react-sdk`            | Barrel principal (componentes, hooks, foundation…).   |
| `tempest-react-sdk/styles.css` | Tokens `--tempest-*` + reset + CSS Modules.           |
| `tempest-react-sdk/vite`       | `createViteConfig` (Node-only, pro `vite.config.ts`). |
| `tempest-react-sdk/testing`    | `createMockHandlers` (helpers MSW pra testes).        |

## Bundle

Vite library mode → ESM (`tempest-react-sdk.js`) + CJS (`.cjs`) + `.d.ts`
rollupado + `styles.css` (CSS Modules num arquivo só, `cssCodeSplit: false`).
Orçamento monitorado por `size-limit` no CI.

## Veja também

- [Scaffold — `create-tempest-app`](./scaffold.md)
- [HTTP — fluxo de request](./http.md)
- Diagrama: [architecture.drawio](./diagrams/architecture.drawio)
