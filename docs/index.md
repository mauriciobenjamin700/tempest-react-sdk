# tempest-react-sdk

Blocos de construção React/TypeScript compartilhados pelos frontends da Tempest:
componentes de UI, hooks, cliente HTTP, store de auth, query keys, formulários
(zod), transportes em tempo real (SSE / WebSocket / Web Push / Service Worker),
tema, i18n, telemetria, feature flags, storage offline, error boundary e um
conjunto curado de utilitários (`cn`, `formatCurrency`, `formatCPF`, etc.).

A meta é começar todo novo frontend React com a mesma fundação opinativa já
montada — sem copiar e colar estilos de `Button`/`Input`, sem reescrever o
mesmo store de auth com Zustand, sem reinventar o loop de reconexão do SSE.

> :material-translate: **Idiomas / Languages** — esta documentação é bilíngue.
> Use o seletor de idioma no topo da página para alternar entre
> **Português (BR)** e **English (US)**.

## Instalação

```bash
npm install tempest-react-sdk
```

Importe o CSS uma vez no entrypoint do app:

```ts
import "tempest-react-sdk/dist/styles.css";
```

Peer dependencies são todas opcionais exceto `react` + `react-dom` — instale
apenas o que cada módulo exige (`zod`, `zustand`, `@tanstack/react-query`,
`dexie`, `react-hook-form`, `lucide-react`). Veja a tabela completa em
[Arquitetura](architecture.md#peer-dependencies).

## O que tem dentro

| Área | Páginas |
| --- | --- |
| **Guia** | [Arquitetura](architecture.md), [Gallery (demo)](gallery.md) |
| **Componentes** | [Catálogo](components.md) — [Entrada de dados](components/inputs.md), [Ação](components/actions.md), [Navegação](components/navigation.md), [Overlay](components/overlay.md), [Layout](components/layout.md), [Dados](components/data.md), [Status & feedback](components/feedback.md), [Identidade & micro](components/identity.md) |
| **Hooks** | [Hooks utilitários](hooks.md) |
| **Integrações** | [HTTP](http.md), [Auth](auth.md), [Query](query.md), [SSE](sse.md), [WebSocket](websocket.md), [Web Push](push.md), [Offline](offline.md), [Web Share](share.md), [Áudio](audio.md) |
| **Formulários** | [Forms (zod)](forms.md), [Forms BR](forms-br.md) |
| **Estilo & Tema** | [Estilos & Design Tokens](styles.md), [Tema](theme.md), [i18n](i18n.md) |
| **Observabilidade** | [Telemetry](telemetry.md), [Feature Flags](feature-flags.md), [Logger](logger.md), [Error Boundary](error-boundary.md) |
| **Projeto** | [Testing helpers](testing.md), [Release pipeline](release.md) |

## Início rápido

```tsx
import {
  ThemeProvider,
  QueryProvider,
  ToastProvider,
  I18nProvider,
} from "tempest-react-sdk";
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

## Repositório & npm

- **npm:** <https://www.npmjs.com/package/tempest-react-sdk>
- **GitHub:** <https://github.com/mauriciobenjamin700/tempest-react-sdk>

> O README do repositório traz a referência completa de recipes e da API
> pública. Esta documentação é a fonte de verdade navegável por módulo.
