# Architecture

`tempest-react-sdk` is a single package made of independent layers. Consumers
import only what they need; everything else is externalized into peer deps and
never enters the bundle.

> Editable diagram: [architecture.drawio](./diagrams/architecture.drawio) (open it in [draw.io](https://app.diagrams.net)).

## Layers

| Layer | What it does | Depends on |
| --- | --- | --- |
| **Components (`components/`)** | UI primitives (Button, Input, Modal, Table, Toast…) with `tempest_`-prefixed CSS Modules. | React |
| **Hooks (`hooks/`)** | `useDebounce`, `usePagination`, `useClientFilter`, `useMediaQuery`. | React |
| **HTTP (`http/`)** | `createApiClient`, `parseResponse`, `uploadWithProgress`. | (zod optional) |
| **Auth (`auth/`)** | `createAuthStore` (zustand) + router-agnostic `AuthGuard`. | zustand (optional) |
| **Query (`query/`)** | `QueryProvider`, `createQueryKeys`, time presets. | @tanstack/react-query (optional) |
| **SSE (`sse/`)** | `createEventStream` + `useEventStream` with exponential reconnect. | — |
| **WebSocket (`ws/`)** | `createWebSocket` + `useWebSocket`. | — |
| **Push (`push/`)** | `WebPushClient` + `usePushSubscription`. | — |
| **SW (`sw/`)** | Main-thread helpers (register/update) + worker-thread (push/click). | — |
| **Offline (`offline/`)** | `createOfflineStore` (Dexie). | dexie (optional) |
| **Forms (`forms/`)** | `validateForm`, `zodResolver`, `useZodForm`. | zod, react-hook-form (both optional) |
| **Theme (`theme/`)** | `ThemeProvider`, `useTheme`, `themeInitScript`. | — |
| **i18n (`i18n/`)** | `createI18n`, `I18nProvider`, `useI18n`. | — |
| **Audio (`audio/`)** | `createAudioPlayer`, `playAudio`, `useAudio`. | — |
| **Error Boundary (`error-boundary/`)** | `ErrorBoundary` + `useErrorHandler`. | — |
| **Styles (`styles/`)** | Tokens (`--tempest-*`) + reset, exported as `styles.css`. | — |

## Peer dependencies

Everything is optional except `react` + `react-dom`:

| Package | When you need it |
| --- | --- |
| `@tanstack/react-query` | Using `QueryProvider`, `createQueryKeys` |
| `zod` | `parseResponse`, `validateForm`, `zodResolver`, `useZodForm` |
| `zustand` | `createAuthStore` |
| `dexie` | `createOfflineStore` |
| `react-hook-form` | `useZodForm` |
| `lucide-react` | Icons in components that accept `leftIcon`/`rightIcon` |

## Bundle

Built with Vite library mode: emits ESM (`tempest-react-sdk.js`) + CJS (`.cjs`)
+ a rolled-up `index.d.ts` + `styles.css`. CSS Modules go into the same final
file (`cssCodeSplit: false`).

## See also

- [HTTP — request flow](./http.md)
- [Push — end-to-end flow](./push.md)
- Diagram: [architecture.drawio](./diagrams/architecture.drawio)
