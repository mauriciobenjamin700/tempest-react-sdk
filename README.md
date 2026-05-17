# tempest-react-sdk

SDK público da Tempest com componentes React, hooks e integrações reutilizáveis para todos os produtos. Os padrões aqui são uma destilação do que foi consolidado em **alofans-frontend** e **transport-admin-system** — quem consumir o SDK ganha consistência sem precisar copiar/colar boilerplate entre projetos.

## Instalação

```bash
npm install tempest-react-sdk
```

O SDK declara como **peer dependencies** somente o que você costuma ter no projeto:

```bash
npm install react react-dom @tanstack/react-query zod zustand lucide-react
```

`@tanstack/react-query`, `zod`, `zustand` e `lucide-react` são opcionais — só são exigidos quando você usa as features correspondentes (`QueryProvider`, `parseResponse`, `createAuthStore` e ícones de componentes que aceitam `leftIcon`/`rightIcon`).

Importe o CSS de tema uma vez (idealmente no `main.tsx`):

```ts
import "tempest-react-sdk/styles.css";
```

Os tokens (`--tempest-primary`, `--tempest-radius-md`, etc.) ficam disponíveis no `:root` e podem ser sobrescritos no seu próprio CSS para temar o app.

## O que vem no pacote

| Categoria | Exporta |
|-----------|---------|
| **Componentes** | `Avatar`, `Badge`, `Breadcrumbs`, `Button`, `Card`, `Checkbox`, `ChipInput`, `ConfirmDialog`, `Container`, `DatePicker`, `Drawer`, `EmptyState`, `ErrorState`, `FileUpload`, `Grid`, `Input`, `Modal`, `Pagination`, `Progress`, `Radio`, `RadioGroup`, `SearchBar`, `Select`, `Skeleton`, `Spinner`, `Stack`, `Stepper`, `Switch`, `Table`, `Tabs`, `Textarea`, `ToastProvider`, `Tooltip`, `useToast`, `VirtualList` |
| **Hooks** | `useDebounce`, `usePagination`, `useClientFilter`, `useMediaQuery`, `useOnline`, `useDocumentVisibility`, `useIntersectionObserver`, `useResizeObserver`, `useClipboard`, `useKeyboardShortcut`, `useBeforeInstallPrompt`, `useIdle`, `useGeolocation`, `useScrollLock`, `useFocusTrap`, `useStableCallback`, `useDeepMemo` |
| **HTTP** | `createApiClient`, `parseResponse`, `uploadWithProgress`, `retry`, `generateIdempotencyKey`, `usePoll` |
| **Forms** | `validateForm`, `zodResolver`, `useZodForm`, `validateCPF`, `validateCNPJ`, `formatCEP`, `formatCNPJ`, `CPFInput`, `CNPJInput`, `PhoneInput`, `CEPInput`, `MoneyInput`, `useViaCEP` |
| **WebSocket** | `createWebSocket`, `useWebSocket` |
| **Auth** | `createAuthStore`, `AuthGuard`, `decodeJWT`, `isJWTExpired`, `lazyWithRetry`, `createRefreshQueue` |
| **Query** | `QueryProvider`, `createQueryKeys`, `STALE_TIME`, `CACHE_TIME`, `REFETCH_TIME` |
| **SSE** | `createEventStream`, `useEventStream` |
| **Web Push** | `WebPushClient`, `usePushSubscription`, `urlBase64ToUint8Array`, `isPushSupported` |
| **Service Worker** | `registerServiceWorker`, `skipWaiting`, `unregisterAllServiceWorkers`, `installPushHandler`, `installNotificationClickHandler`, `installSkipWaitingListener` |
| **Audio** | `createAudioPlayer`, `playAudio`, `stopAudio`, `useAudio` |
| **Offline (IndexedDB)** | `createOfflineStore` (peer dep opcional: `dexie`) |
| **Error Boundary** | `ErrorBoundary`, `useErrorHandler` |
| **Tema** | `ThemeProvider`, `useTheme`, `getInitialTheme`, `themeInitScript` |
| **i18n** | `I18nProvider`, `useI18n`, `useTranslate`, `createI18n` |
| **Logger** | `createLogger`, `consoleSink` |
| **Telemetry** | `TelemetryProvider`, `useTelemetry`, `consoleTelemetryAdapter` |
| **Feature Flags** | `FeatureFlagsProvider`, `useFeatureFlag`, `useFlagValue`, `createInMemoryFlags` |
| **Web Share** | `share`, `isShareSupported` |
| **Utils** | `cn`, `formatCurrency`, `formatDate`, `formatDateTime`, `formatPhone`, `formatCPF`, `formatPercent`, `storage` |

📚 Documentação completa em [`docs/`](./docs) — 1 markdown por módulo + diagramas draw.io editáveis em [`docs/diagrams/`](./docs/diagrams).

🎨 Demo visual + funcional em [`examples/gallery`](./examples/gallery) — `cd examples/gallery && npm install && npm run dev`. Catálogo descrito em [`docs/gallery.md`](./docs/gallery.md).

## Uso rápido

### Cliente HTTP

```ts
import { createApiClient, parseResponse } from "tempest-react-sdk";
import { z } from "zod";
import { useAuthStore } from "@/store/auth";

export const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL,
    getToken: () => useAuthStore.getState().token,
    onUnauthorized: () => useAuthStore.getState().logout(),
    withCredentials: true,
});

const userSchema = z.object({ id: z.string(), name: z.string() });

export async function getUser(id: string) {
    const raw = await api.get<unknown>(`/users/${id}`);
    return parseResponse(userSchema, raw, `GET /users/${id}`);
}
```

### Provider de Query

```tsx
import { QueryProvider, ToastProvider } from "tempest-react-sdk";

export function AppProviders({ children }: { children: React.ReactNode }) {
    return (
        <QueryProvider>
            <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
    );
}
```

### Auth + Guard de rota

```ts
import { createAuthStore } from "tempest-react-sdk";

type SessionUser = { id: string; name: string; is_admin: boolean };

export const useAuthStore = createAuthStore<SessionUser>({ name: "tempest-app-auth" });
```

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { AuthGuard } from "tempest-react-sdk";
import { useAuthStore } from "@/store/auth";

export function ProtectedLayout() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    return (
        <AuthGuard isAuthenticated={isAuthenticated} fallback={<Navigate to="/login" replace />}>
            <Outlet />
        </AuthGuard>
    );
}
```

### Componente + Toast

```tsx
import { Button, useToast } from "tempest-react-sdk";

export function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
    const toast = useToast();
    return (
        <Button
            onClick={async () => {
                try {
                    await onSave();
                    toast.success("Alterações salvas");
                } catch (error) {
                    toast.error(String(error));
                }
            }}
        >
            Salvar
        </Button>
    );
}
```

### Upload com progresso

`fetch` não reporta progresso de upload no navegador. `uploadWithProgress` usa `XMLHttpRequest` internamente e mantém o mesmo contrato de erro (`ApiError`) do `createApiClient`.

```ts
import { uploadWithProgress } from "tempest-react-sdk";

const formData = new FormData();
formData.append("file", file);
formData.append("alo_id", aloId);

const controller = new AbortController();

await uploadWithProgress<{ url: string }>({
    url: `${API}/uploads`,
    method: "POST",
    body: formData,
    withCredentials: true,
    getToken: () => useAuthStore.getState().token,
    signal: controller.signal,
    onProgress: ({ fraction, loaded, total }) => {
        if (fraction !== null) setProgress(Math.round(fraction * 100));
        console.log(`${loaded}/${total}`);
    },
});

// cancelar:
controller.abort();
```

### WebSocket

Wrapper sobre `WebSocket` com reconnect exponencial (até 10 tentativas), ping heartbeat opcional, parsing JSON e `send` no-op enquanto não está aberto.

```tsx
import { useWebSocket } from "tempest-react-sdk";

type ChatEvent = { type: "message"; user: string; text: string };

function Chat({ apiUrl, enabled }: { apiUrl: string; enabled: boolean }) {
    const ws = useWebSocket<ChatEvent>(`${apiUrl}/chat`, {
        enabled,
        pingInterval: 30_000,
        onMessage: ({ data }) => console.log(data),
    });

    return (
        <button disabled={ws.status !== "open"} onClick={() => ws.send(JSON.stringify({ text: "hi" }))}>
            Enviar
        </button>
    );
}
```

Imperativo (fora de React):

```ts
import { createWebSocket } from "tempest-react-sdk";

const socket = createWebSocket(`${apiUrl}/chat`, {
    pingInterval: 30_000,
    onMessage: ({ data }) => console.log(data),
});

socket.send("hello");
socket.close();
```

### Formulários (zod)

Três níveis de integração:

**1. Validação avulsa** — independente de form library:

```ts
import { validateForm } from "tempest-react-sdk";
import { z } from "zod";

const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

const result = validateForm(schema, formValues);
if (!result.success) {
    setErrors(result.errors); // { email: "...", password: "..." }
    return;
}
await login(result.data);
```

**2. `react-hook-form` resolver** — substitui `@hookform/resolvers/zod`:

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "tempest-react-sdk";

const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
```

**3. Hook tudo-em-um** — schema dita o tipo:

```tsx
import { useZodForm } from "tempest-react-sdk";

function LoginForm() {
    const form = useZodForm(loginSchema, { defaultValues: { email: "", password: "" } });
    return (
        <form onSubmit={form.handleSubmit((data) => login(data))}>
            <input {...form.register("email")} />
            <input {...form.register("password")} type="password" />
        </form>
    );
}
```

`react-hook-form` é peer dep **opcional** — só instale quando usar `zodResolver`/`useZodForm`.

### Server-Sent Events (SSE)

Stream com reconexão exponencial automática (até 10 tentativas), heartbeat `ping` e parsing JSON por padrão. Para autenticar via cookie, use `withCredentials: true`.

```tsx
import { useEventStream } from "tempest-react-sdk";
import { useNotificationsStore } from "@/store/notifications";

type StreamEvent =
    | { type: "NOTIFY"; message: string }
    | { type: "PAYMENT-SUCCESS"; order_id: string }
    | { type: "PING" };

export function NotificationsListener({ apiUrl, enabled }: { apiUrl: string; enabled: boolean }) {
    const add = useNotificationsStore((s) => s.add);

    useEventStream<StreamEvent>(`${apiUrl}/notifications/stream`, {
        enabled,
        withCredentials: true,
        namedEvents: ["notification", "payment"],
        onMessage: ({ data }) => {
            if (data.type === "PING") return;
            add(data);
        },
    });

    return null;
}
```

Versão imperativa (fora de React):

```ts
import { createEventStream } from "tempest-react-sdk";

const stream = createEventStream(`${apiUrl}/notifications/stream`, {
    withCredentials: true,
    onMessage: ({ data }) => console.log(data),
    onError: (event) => console.warn("SSE erro", event),
});

// quando quiser parar:
stream.close();
```

### Web Push

O SDK cuida do fluxo no navegador (permissão, `pushManager.subscribe`, leitura/cancelamento). O endpoint é responsabilidade do app — você fornece `onSubscribe` / `onUnsubscribe`.

Pré-requisito: registrar o service worker (via `vite-plugin-pwa`, `registerServiceWorker` ou `navigator.serviceWorker.register`) antes de chamar `subscribe()`.

```tsx
import { usePushSubscription } from "tempest-react-sdk";
import { api } from "@/services/api";
import { Button } from "tempest-react-sdk";

export function PushToggle() {
    const push = usePushSubscription({
        vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
        onSubscribe: (subscription) =>
            api.post("/webpush/subscribe", { body: subscription }),
        onUnsubscribe: () => api.delete("/webpush/my"),
    });

    if (!push.supported) return <p>Push não suportado neste navegador.</p>;

    return (
        <Button
            loading={push.loading}
            variant={push.subscribed ? "danger" : "primary"}
            onClick={() => (push.subscribed ? push.unsubscribe() : push.subscribe())}
        >
            {push.subscribed ? "Desinscrever notificações" : "Receber notificações"}
        </Button>
    );
}
```

Versão imperativa:

```ts
import { WebPushClient } from "tempest-react-sdk";

const push = new WebPushClient({
    vapidPublicKey: VAPID_PUBLIC_KEY,
    onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
    onUnsubscribe: () => api.delete("/webpush/my"),
});

await push.subscribe();
const active = await push.isSubscribed();
await push.unsubscribe();
```

### Service Worker

**Main thread** — registrar SW + lidar com updates:

```ts
import { registerServiceWorker, skipWaiting } from "tempest-react-sdk";

registerServiceWorker({
    url: "/sw.js",
    onUpdate: (waiting) => {
        if (confirm("Nova versão disponível. Recarregar?")) {
            skipWaiting(waiting);
            window.location.reload();
        }
    },
    onError: (err) => console.error("SW falhou", err),
});
```

**Worker thread** — dentro do seu `sw.ts` (ou `sw.js`), instalar handlers de push, click e skip-waiting:

```ts
/// <reference lib="webworker" />
import {
    installPushHandler,
    installNotificationClickHandler,
    installSkipWaitingListener,
} from "tempest-react-sdk";

installSkipWaitingListener();

installPushHandler({
    defaultTitle: "Tempest",
    defaultIcon: "/icons/Logo.png",
    transform: (payload) => {
        if (payload.tag === "silent-ping") return null;
        return payload;
    },
});

installNotificationClickHandler();
```

O SDK não amarra a um bundler de SW — combine com `vite-plugin-pwa` (`injectManifest`) ou um worker bundleado à parte.

### Áudio (notificações sonoras)

`playAudio` para tocadas pontuais (chime de notificação, feedback de pagamento). `createAudioPlayer` para canais isolados. `useAudio` para hook por componente.

```ts
import { playAudio } from "tempest-react-sdk";

await playAudio("/audio/plim.wav", { volume: 0.4 });
```

```tsx
import { useAudio } from "tempest-react-sdk";

function NotifyBell() {
    const audio = useAudio();
    return <button onClick={() => audio.play("/audio/bell_sound.wav")}>🔔</button>;
}
```

Política de autoplay: navegadores bloqueiam playback antes de interação do usuário. `playAudio` retorna `null` quando bloqueado — UI deve "destravar" no primeiro clique.

### Offline (IndexedDB via Dexie)

Store por domínio, com scoping opcional por owner (multi-usuário). Persiste histórico de SSE, drafts, cache, etc. Dexie é **peer dependency opcional** — `npm i dexie` só quando precisar.

```ts
import { createOfflineStore } from "tempest-react-sdk";

type Notification = {
    message_id: string;
    owner_id: string;
    type: "NOTIFY" | "PAYMENT-SUCCESS" | "ALO-STATUS-CHANGED";
    message: string;
    created_at: string;
    read: boolean;
};

export const notificationsStore = createOfflineStore<Notification, string>({
    databaseName: "TempestNotifications",
    version: 1,
    tableName: "notifications",
    indexes: "&message_id, owner_id, read, created_at",
    keyPath: "message_id",
    ownerField: "owner_id",
});

await notificationsStore.put({ message_id: "n1", owner_id: "u1", /* ... */ } as Notification, "u1");
const items = await notificationsStore.list("u1", { orderBy: "created_at", reverse: true, limit: 50 });
await notificationsStore.updateMany("u1", { read: true });
await notificationsStore.clear("u1");
```

API: `put` / `bulkPut` / `get` / `list` / `update` / `updateMany` / `delete` / `clear` / `count`. `raw` + `db` expostos pra queries Dexie avançadas.

### Error Boundary

Captura erros de render, expõe fallback (estático ou render-prop), reset automático via `resetKeys` (ex.: trocar de rota), `onError` pra telemetria. `useErrorHandler` re-lança erros async no boundary mais próximo.

```tsx
import { ErrorBoundary, ErrorState } from "tempest-react-sdk";
import { useLocation } from "react-router-dom";

export function AppShell({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    return (
        <ErrorBoundary
            resetKeys={[location.pathname]}
            onError={(err, info) => reportToSentry(err, info)}
            fallback={({ error, reset }) => (
                <ErrorState description={error.message} onRetry={reset} />
            )}
        >
            {children}
        </ErrorBoundary>
    );
}
```

```tsx
import { useErrorHandler } from "tempest-react-sdk";

function Streamer() {
    const throwError = useErrorHandler();
    useEffect(() => {
        const stream = openSocket();
        stream.onerror = (err) => throwError(err);
        return () => stream.close();
    }, [throwError]);
    return null;
}
```

### Query keys tipadas

```ts
import { createQueryKeys } from "tempest-react-sdk";

export const eventKeys = createQueryKeys("event", {
    list: (filters: { page: number; size: number }) => ["list", filters] as const,
    byId: (id: string) => [id] as const,
});

// eventKeys.byId("42") === ["event", "42"]
```

## Tema

Sobrescreva as variáveis CSS expostas em `styles.css` para customizar paleta, raio, sombras e tipografia:

```css
:root {
    --tempest-primary: #ff3366;
    --tempest-radius-md: 6px;
}
```

Para modo escuro, ative com o atributo `data-tempest-theme="dark"` no `<html>` ou em qualquer ancestral.

## Padrões usados pelo SDK

- **TypeScript estrito**, sem `any` implícito, com `verbatimModuleSyntax`.
- **CSS Modules** com prefixo `tempest_` para evitar colisões.
- **Aspas duplas** em todo o código.
- **Sem dependências obrigatórias além de React/ReactDOM** — bibliotecas pesadas são `peerDependenciesMeta.optional`.
- **Empty results** retornam `[]` por convenção; nada de erros para "lista vazia".

## Desenvolvimento

```bash
npm install
npm run build    # gera dist/ (ESM + CJS + d.ts + styles.css)
npm run typecheck
npm run lint
```

## Licença

MIT © Tempest
