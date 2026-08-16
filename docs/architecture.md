# Arquitetura

O `tempest-react-sdk` é um pacote único com camadas independentes. O consumidor
importa só o que usa; tudo é externalizado no bundle do SDK, então o bundler do
app faz tree-shake do que não é referenciado.

!!! info "Esta página é a arquitetura **do pacote**"
    Aqui você aprende como o SDK é montado — camadas, dependências, subpaths,
    bundle. Se o que você quer é como organizar o **seu app** (camadas, pastas,
    onde mora cada estado, limites de arquivo), a página é
    [Camadas de um app frontend](./design/architecture.md), na aba
    [Design de Software](./design/index.md).

!!! tip "Importe só o que usa"
    Não existe penalidade por o SDK ser grande. Cada camada (HTTP, auth, query,
    forms…) é independente — se você nunca importa `createOfflineStore`, o `dexie`
    não entra no seu bundle. Comece com um `Button` e cresça a partir daí.

> Diagrama editável: [architecture.drawio](./diagrams/architecture.drawio) (abra no [draw.io](https://app.diagrams.net)).

## Escopo: só client-side

O SDK é feito para **SPA client-rendered com capacidade offline** — service
worker, outbox no IndexedDB, prompt de instalação, background sync. Ele **não**
suporta SSR nem React Server Components: nenhum módulo declara `"use client"` e
os componentes assumem que montam num browser. O App Router do Next não é alvo.

!!! warning "Isso é escolha de escopo, não lacuna"
    Cobrir os dois mundos custaria em cada API (dois caminhos de render,
    hidratação, `window` proibido no topo do módulo) e o offline-first — a razão
    de existir do pacote — sairia pior. Os guards
    `typeof window === "undefined"` que existem nos hooks servem pra não explodir
    fora do browser (testes em Node, contexto de service worker, plugin de
    build), não pra prometer render no servidor.


## Camadas

### Fundação de aplicação

A base opinativa que monta um app React inteiro. É o que a CLI
[`create-tempest-app`](./scaffold.md) gera.

| Camada                 | O que faz                                                                             | Página                           |
| ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| **Vite (`vite/`)**     | `createViteConfig` — plugin React + alias `@` → `src` + dev server (subpath `/vite`). | [Vite & alias](./vite-config.md) |
| **Router (`router/`)** | `defineRoutes`, `<AppRouter>`, `<RouteGuard>` + re-exports do React Router v8.        | [Roteamento](./routing.md)       |
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

**`react`**, **`react-dom`** e **`react-router`** são **peer dependencies** — os
três carregam contexto React, e uma segunda cópia não é peso extra no bundle, é
uma segunda *instância* que quebra em runtime. Todo o resto é **dependência
direta** — instalada automaticamente por `npm install tempest-react-sdk` e
externalizada no bundle (o bundler do app resolve do `node_modules` e faz
tree-shake).

| Pacote                         | Status              | Usado por                                                                                |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------- |
| `react`, `react-dom`           | **Peer (obrigat.)** | Tudo                                                                                     |
| `react-router` (`^7 \|\| ^8`)  | **Peer (obrigat.)** | `AppRouter`, `defineRoutes`, `RouteGuard`, re-exports                                    |
| `zustand`                      | Dep direta          | `createStore`, `createSelectors`, `createAuthStore`                                      |
| `@tanstack/react-query`        | Dep direta          | `QueryProvider`, `createQueryKeys`, `AppProviders`                                       |
| `zod`                          | Dep direta          | `parseResponse`, `validateForm`, `zodResolver`, `useZodForm`                             |
| `react-hook-form`              | Dep direta          | `useZodForm`, `FormField`, inputs mascarados                                             |
| `dexie`                        | Dep direta          | `createOfflineStore`                                                                     |
| `lucide-react`                 | Dep direta          | Ícones (`leftIcon`/`rightIcon`)                                                          |
| `vite`, `@vitejs/plugin-react` | **Peer opcional**   | `createViteConfig` (subpath `tempest-react-sdk/vite`) — já presente em qualquer app Vite |

!!! warning "Por que `react-router` é peer, e não dep direta"
    Ele guarda contexto React. Uma cópia aninhada em
    `tempest-react-sdk/node_modules` é um `<Router>` **diferente** do que o seu
    app renderiza, então qualquer hook do SDK que alcance esse contexto estoura
    com `useNavigate() may be used only in the context of a <Router>` — crash de
    runtime, não regressão de tamanho. É a mesma razão de `react` ser peer, e é a
    única exceção à regra "todo o resto é dep direta". O range `^7 || ^8` deixa o
    app em qualquer um dos dois majors instalar uma cópia só: a superfície
    re-exportada é idêntica nas duas versões, e ambas entregam os bindings de DOM
    dentro do próprio `react-router` (não existe `react-router-dom` separado).

!!! note "O resto continua dep direta"
    `zustand`, `zod`, `dexie`, `react-hook-form`, `@tanstack/react-query` e
    `lucide-react` são dependências diretas — `npm install tempest-react-sdk` já
    traz tudo, sem você listar nada à mão. Duas cópias dessas custam bytes, não
    correção.

Adapters de SDKs externos (Sentry, PostHog, GrowthBook, LaunchDarkly) **não**
são declarados — o caller injeta a instância na factory.

## Subpaths

| Import                         | Conteúdo                                              |
| ------------------------------ | ----------------------------------------------------- |
| `tempest-react-sdk`            | Barrel principal (componentes, hooks, foundation…).   |
| `tempest-react-sdk/styles.css` | Tokens `--tempest-*` + reset + CSS Modules.           |
| `tempest-react-sdk/vite`       | `createViteConfig` (Node-only, pro `vite.config.ts`). |
| `tempest-react-sdk/testing`    | `createMockHandlers` (helpers MSW pra testes).        |
| `tempest-react-sdk/icons`      | `Icon` por slug + registro estático ([Ícones](./icons.md)). |

## Bundle

Vite library mode → ESM (`tempest-react-sdk.js`) + CJS (`.cjs`) + `.d.ts`
rollupado + `styles.css` (CSS Modules num arquivo só, `cssCodeSplit: false`).
Orçamento monitorado por `size-limit` no CI.

## Recap

- Um pacote, camadas independentes; você importa só o que usa e o bundler faz
  tree-shake do resto.
- Só `react` + `react-dom` são peers; as demais libs são deps diretas instaladas
  junto.
- Subpaths: o barrel principal, `…/styles.css`, `…/vite` (Node-only), `…/testing` e
  `…/icons` (ícone por slug).
- A fundação de app ([Vite](./vite-config.md) · [Router](./routing.md) ·
  [Store](./state.md) · [Providers](./app-providers.md)) é o que o
  [`create-tempest-app`](./scaffold.md) monta pra você.

## Veja também

- [Design de Software — camadas do seu app](./design/architecture.md)
- [Scaffold — `create-tempest-app`](./scaffold.md)
- [HTTP — fluxo de request](./http.md)
- Diagrama: [architecture.drawio](./diagrams/architecture.drawio)
