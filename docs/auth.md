# Auth

`createAuthStore` fabrica um zustand store tipado pelo `TUser` do app. `AuthGuard` é router-agnostic — você decide o redirect.

## Store

```ts
import { createAuthStore } from "tempest-react-sdk";

type SessionUser = { id: string; name: string; is_admin: boolean };

export const useAuthStore = createAuthStore<SessionUser>({
    name: "tempest-app-auth",
    storage: "local",
});

// uso
const { user, token, isAuthenticated, setSession, logout } = useAuthStore();
```

Persist em `localStorage` (ou `sessionStorage` com `storage: "session"`). Após hydrate, `isAuthenticated` é re-derivado de `!!token`.

## Guard

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

## Veja também

- [HTTP](./http.md) — `getToken: () => useAuthStore.getState().token`
