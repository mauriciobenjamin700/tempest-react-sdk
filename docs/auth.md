# Auth

Quatro peças, todas independentes:

1. `createAuthStore` — fabrica um zustand store tipado pelo `TUser` do app.
2. `AuthGuard` — gate de rota router-agnostic.
3. `decodeJWT` / `isJWTExpired` — leitura defensiva de JWTs (sem validação criptográfica).
4. `lazyWithRetry` — `React.lazy` com retry de chunk + reload na falha final.
5. `createRefreshQueue` — coalesce concurrent refresh calls.

## Store — `createAuthStore<TUser>`

```ts
import { createAuthStore } from "tempest-react-sdk";

type SessionUser = { id: string; name: string; is_admin: boolean };

export const useAuthStore = createAuthStore<SessionUser>({
  name: "tempest-app-auth",
  storage: "local",
});

// uso
const { user, token, isAuthenticated, setSession, setUser, setToken, logout } = useAuthStore();
useAuthStore.getState().setSession({ user, token });
useAuthStore.getState().logout();
```

Persist em `localStorage` (default) ou `sessionStorage` (`storage: "session"`). Após hydrate, `isAuthenticated` é re-derivado de `!!token`.

Opções extras: `initialUser`, `initialToken` (para SSR hydration).

## Guard — `AuthGuard`

Router-agnostic. Você decide o redirect.

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { AuthGuard } from "tempest-react-sdk";

export function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <AuthGuard isAuthenticated={isAuthenticated} fallback={<Navigate to="/login" replace />}>
      <Outlet />
    </AuthGuard>
  );
}
```

Compose com role guards customizados — `AuthGuard` é só um if/else, sem opinião sobre router.

## JWT — `decodeJWT` / `isJWTExpired`

Decoder de **payload only** (não valida assinatura). Use no client para inspeção/UX, **não** para autorização — a validação real é no backend.

```ts
import { decodeJWT, isJWTExpired } from "tempest-react-sdk";

const decoded = decodeJWT<{ sub: string; exp: number; role: string }>(token);
const expired = isJWTExpired(token, 30); // 30s skew → trata como expirado 30s antes
```

`decodeJWT` retorna `null` quando o token é malformado.

## Code-splitting — `lazyWithRetry`

`React.lazy` com retry de chunk + fallback `window.location.reload()` na falha final.

**Por que existe**: após um deploy, usuários com tab aberta tentam carregar chunks deletados (404). O retry geralmente pega a nova versão; o reload resolve quando o `index.html` em cache também está stale.

```tsx
import { lazyWithRetry } from "tempest-react-sdk";

const Settings = lazyWithRetry(() => import("./Settings"), {
  retries: 3, // default
  initialDelay: 400, // default — exponencial: 400, 800, 1600ms
  reloadOnFinalFailure: true, // default
});

<Route
  path="/settings"
  element={
    <Suspense fallback={<Spinner />}>
      <Settings />
    </Suspense>
  }
/>;
```

## Refresh queue — `createRefreshQueue`

Coalesce N chamadas de refresh concorrentes em **1** request. Todas resolvem com o mesmo valor.

```ts
import { createRefreshQueue } from "tempest-react-sdk";

const refresh = createRefreshQueue(async () => {
  const { token } = await api.post<{ token: string }>("/auth/refresh");
  useAuthStore.getState().setToken(token);
  return token;
});

// 5 requests 401 simultâneos → 1 refresh, todos retomam:
await Promise.all([refresh(), refresh(), refresh(), refresh(), refresh()]);
```

Use junto com `createApiClient`:

```ts
const refresh = createRefreshQueue(async () => {
  await AuthService.refresh();
});

const api = createApiClient({
  baseURL: "...",
  refresh, // chamado em 401 — coalesça concorrentes
  onUnauthorized: () => useAuthStore.getState().logout(),
});
```

## Veja também

- [HTTP](./http.md) — `getToken: () => useAuthStore.getState().token` + `refresh: queue`
- [Error Boundary](./error-boundary.md) — `lazyWithRetry` falha final → boundary captura `ChunkLoadError`
