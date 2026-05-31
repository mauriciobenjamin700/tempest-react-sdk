# Auth

Four pieces, all independent:

1. `createAuthStore` — builds a zustand store typed by the app's `TUser`.
2. `AuthGuard` — router-agnostic route gate.
3. `decodeJWT` / `isJWTExpired` — defensive JWT reading (no cryptographic validation).
4. `lazyWithRetry` — `React.lazy` with chunk retry + reload on final failure.
5. `createRefreshQueue` — coalesces concurrent refresh calls.

## Store — `createAuthStore<TUser>`

```ts
import { createAuthStore } from "tempest-react-sdk";

type SessionUser = { id: string; name: string; is_admin: boolean };

export const useAuthStore = createAuthStore<SessionUser>({
  name: "tempest-app-auth",
  storage: "local",
});

// usage
const { user, token, isAuthenticated, setSession, setUser, setToken, logout } = useAuthStore();
useAuthStore.getState().setSession({ user, token });
useAuthStore.getState().logout();
```

Persists to `localStorage` (default) or `sessionStorage` (`storage: "session"`).
After hydration, `isAuthenticated` is re-derived from `!!token`.

Extra options: `initialUser`, `initialToken` (for SSR hydration).

## Guard — `AuthGuard`

Router-agnostic. You decide the redirect.

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

Compose with custom role guards — `AuthGuard` is just an if/else, with no
opinion about the router.

## JWT — `decodeJWT` / `isJWTExpired`

A **payload-only** decoder (does not validate the signature). Use it on the
client for inspection/UX, **not** for authorization — the real validation
happens on the backend.

```ts
import { decodeJWT, isJWTExpired } from "tempest-react-sdk";

const decoded = decodeJWT<{ sub: string; exp: number; role: string }>(token);
const expired = isJWTExpired(token, 30); // 30s skew → treated as expired 30s early
```

`decodeJWT` returns `null` when the token is malformed.

## Code-splitting — `lazyWithRetry`

`React.lazy` with chunk retry + a `window.location.reload()` fallback on final
failure.

**Why it exists**: after a deploy, users with an open tab try to load deleted
chunks (404). The retry usually picks up the new version; the reload resolves
the case where the cached `index.html` is also stale.

```tsx
import { lazyWithRetry } from "tempest-react-sdk";

const Settings = lazyWithRetry(() => import("./Settings"), {
  retries: 3, // default
  initialDelay: 400, // default — exponential: 400, 800, 1600ms
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

Coalesces N concurrent refresh calls into **1** request. They all resolve with
the same value.

```ts
import { createRefreshQueue } from "tempest-react-sdk";

const refresh = createRefreshQueue(async () => {
  const { token } = await api.post<{ token: string }>("/auth/refresh");
  useAuthStore.getState().setToken(token);
  return token;
});

// 5 simultaneous 401 requests → 1 refresh, all resume:
await Promise.all([refresh(), refresh(), refresh(), refresh(), refresh()]);
```

Use it together with `createApiClient`:

```ts
const refresh = createRefreshQueue(async () => {
  await AuthService.refresh();
});

const api = createApiClient({
  baseURL: "...",
  refresh, // called on 401 — coalesces concurrent calls
  onUnauthorized: () => useAuthStore.getState().logout(),
});
```

## See also

- [HTTP](./http.md) — `getToken: () => useAuthStore.getState().token` + `refresh: queue`
- [Error Boundary](./error-boundary.md) — `lazyWithRetry` final failure → boundary catches `ChunkLoadError`
