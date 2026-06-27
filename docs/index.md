# tempest-react-sdk

Blocos de construção React/TypeScript compartilhados pelos frontends da Tempest:
uma **fundação de aplicação** (Vite + alias `@`, roteamento declarativo, estado
com Zustand, cache com TanStack Query, providers), componentes de UI, hooks,
cliente HTTP, store de auth, formulários (zod), transportes em tempo real
(SSE / WebSocket / Web Push / Service Worker), tema, i18n, telemetria, feature
flags, storage offline, error boundary e um conjunto curado de utilitários.

A meta é começar todo novo frontend React com a mesma fundação opinativa já
montada — sem reconfigurar Vite, sem reescrever o store de auth, sem reinventar
o loop de reconexão do SSE. Inclui a CLI **`create-tempest-app`** que gera um
projeto inteiro já cabeado.

> :material-translate: **Idiomas / Languages** — esta documentação é bilíngue.
> Use o seletor de idioma no topo da página para alternar entre
> **Português (BR)** e **English (US)**.

## Comece em 1 minuto

Gere um app novo já fiado com o SDK (a CLI vem dentro do pacote):

```bash
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
npm run dev            # http://127.0.0.1:5173
```

Novo por aqui? Siga o **[Tutorial — Guia do Usuário](tutorial/index.md)**: do
scaffold ao app completo, um conceito por página.

## Instalação manual

Em um projeto Vite + React + TS existente:

```bash
npm install tempest-react-sdk
```

Importe o CSS uma vez no entrypoint do app:

```ts
import "tempest-react-sdk/styles.css";
```

Apenas **`react`** e **`react-dom`** são peer dependencies (regra de uma única
instância do React). Todo o resto — `react-router-dom`, `zustand`,
`@tanstack/react-query`, `zod`, `react-hook-form`, `dexie`, `lucide-react` — é
**dependência direta**, instalada automaticamente com o SDK e externalizada no
bundle (seu bundler faz tree-shake do que não usar). Detalhes em
[Arquitetura](architecture.md).

## O que tem dentro

| Área                       | Páginas                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tutorial**               | [Comece aqui](tutorial/index.md) · [Roteamento](tutorial/routing.md) · [Estado](tutorial/state.md) · [Buscando dados](tutorial/data-fetching.md) · [Formulários](tutorial/forms.md) · [Fluxo de auth](tutorial/auth-flow.md)                                                                                                                                                                     |
| **Estrutura de aplicação** | [Scaffold](scaffold.md), [Vite & alias](vite-config.md), [Roteamento](routing.md), [Estado (Zustand)](state.md), [Providers](app-providers.md)                                                                                                                                                                                                                                                   |
| **Guia**                   | [Arquitetura](architecture.md), [Gallery (demo)](gallery.md)                                                                                                                                                                                                                                                                                                                                     |
| **Componentes**            | [Catálogo](components.md) — [Entrada](components/inputs.md), [Ação](components/actions.md), [Navegação](components/navigation.md), [Overlay](components/overlay.md), [Layout](components/layout.md), [Dados](components/data.md), [Feedback](components/feedback.md), [Identidade](components/identity.md), [Utilitários](components/utility.md), [Overlays & avançados](components/advanced.md) |
| **Hooks**                  | [Hooks utilitários](hooks.md)                                                                                                                                                                                                                                                                                                                                                                    |
| **Integrações**            | [HTTP](http.md), [Auth](auth.md), [Query](query.md), [SSE](sse.md), [WebSocket](websocket.md), [Web Push](push.md), [Offline](offline.md), [Web Share](share.md), [Áudio](audio.md)                                                                                                                                                                                                              |
| **Formulários**            | [Forms (zod)](forms.md), [Forms BR](forms-br.md)                                                                                                                                                                                                                                                                                                                                                 |
| **Estilo & Tema**          | [Estilos & Design Tokens](styles.md), [Tema](theme.md), [i18n](i18n.md)                                                                                                                                                                                                                                                                                                                          |
| **Observabilidade**        | [Telemetry](telemetry.md), [Feature Flags](feature-flags.md), [Logger](logger.md), [Error Boundary](error-boundary.md)                                                                                                                                                                                                                                                                           |
| **Receitas**               | [Cookbook](cookbook.md), [Utilitários](utilities.md)                                                                                                                                                                                                                                                                                                                                             |
| **Projeto**                | [Testing helpers](testing.md), [Release pipeline](release.md)                                                                                                                                                                                                                                                                                                                                    |

## Início rápido (manual)

Monte a raiz do app com `<AppProviders>` (error boundary + Query + tema + i18n
num bloco só) e `<AppRouter>` (rotas declarativas):

```tsx
import { AppProviders, AppRouter, defineRoutes } from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";

const routes = defineRoutes([{ path: "/", element: <h1>Olá 👋</h1> }]);

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Algo deu errado.</p> }}>
      <AppRouter routes={routes} fallback={<p>Carregando…</p>} />
    </AppProviders>
  );
}
```

## Repositório & npm

- **npm:** <https://www.npmjs.com/package/tempest-react-sdk>
- **GitHub:** <https://github.com/mauriciobenjamin700/tempest-react-sdk>
- **Para LLMs:** [llms.txt](llms.txt) (índice curado) · [llms-full.txt](llms-full.txt) (docs completos)

> O README do repositório é a landing page do npm/GitHub. Esta documentação é a
> fonte de verdade navegável por módulo.
