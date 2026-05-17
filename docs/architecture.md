# Arquitetura

O `tempest-react-sdk` é um pacote único com camadas independentes. O consumidor importa só o que precisa; o resto fica externalizado nos peer deps e não entra no bundle.

![Arquitetura geral](./diagrams/architecture.drawio)

## Camadas

| Camada                                 | O que faz                                                                                  | Depende de                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Componentes (`components/`)**        | UI primitives (Button, Input, Modal, Table, Toast…) com CSS Modules prefixados `tempest_`. | React                                  |
| **Hooks (`hooks/`)**                   | `useDebounce`, `usePagination`, `useClientFilter`, `useMediaQuery`.                        | React                                  |
| **HTTP (`http/`)**                     | `createApiClient`, `parseResponse`, `uploadWithProgress`.                                  | (zod opcional)                         |
| **Auth (`auth/`)**                     | `createAuthStore` (zustand) + `AuthGuard` router-agnostic.                                 | zustand (opcional)                     |
| **Query (`query/`)**                   | `QueryProvider`, `createQueryKeys`, presets de tempo.                                      | @tanstack/react-query (opcional)       |
| **SSE (`sse/`)**                       | `createEventStream` + `useEventStream` com reconnect exponencial.                          | —                                      |
| **WebSocket (`ws/`)**                  | `createWebSocket` + `useWebSocket`.                                                        | —                                      |
| **Push (`push/`)**                     | `WebPushClient` + `usePushSubscription`.                                                   | —                                      |
| **SW (`sw/`)**                         | Helpers main-thread (registro/update) + worker-thread (push/click).                        | —                                      |
| **Offline (`offline/`)**               | `createOfflineStore` (Dexie).                                                              | dexie (opcional)                       |
| **Forms (`forms/`)**                   | `validateForm`, `zodResolver`, `useZodForm`.                                               | zod, react-hook-form (ambos opcionais) |
| **Theme (`theme/`)**                   | `ThemeProvider`, `useTheme`, `themeInitScript`.                                            | —                                      |
| **i18n (`i18n/`)**                     | `createI18n`, `I18nProvider`, `useI18n`.                                                   | —                                      |
| **Áudio (`audio/`)**                   | `createAudioPlayer`, `playAudio`, `useAudio`.                                              | —                                      |
| **Error Boundary (`error-boundary/`)** | `ErrorBoundary` + `useErrorHandler`.                                                       | —                                      |
| **Styles (`styles/`)**                 | Tokens (`--tempest-*`) + reset, exportados como `styles.css`.                              | —                                      |

## Peer dependencies

Tudo opcional exceto `react` + `react-dom`:

| Pacote                  | Quando precisa                                               |
| ----------------------- | ------------------------------------------------------------ |
| `@tanstack/react-query` | Usar `QueryProvider`, `createQueryKeys`                      |
| `zod`                   | `parseResponse`, `validateForm`, `zodResolver`, `useZodForm` |
| `zustand`               | `createAuthStore`                                            |
| `dexie`                 | `createOfflineStore`                                         |
| `react-hook-form`       | `useZodForm`                                                 |
| `lucide-react`          | Ícones em componentes que aceitam `leftIcon`/`rightIcon`     |

## Bundle

Construído com Vite library mode, gera ESM (`tempest-react-sdk.js`) + CJS (`.cjs`) + `index.d.ts` rollupado + `styles.css`. CSS Modules vão pro mesmo arquivo final (`cssCodeSplit: false`).

## Veja também

- [HTTP — fluxo de request](./http.md)
- [Push — fluxo end-to-end](./push.md)
- Diagrama: [architecture.drawio](./diagrams/architecture.drawio)
