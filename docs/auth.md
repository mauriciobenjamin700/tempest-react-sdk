# Auth

Autenticação no front-end é sempre o mesmo punhado de problemas: onde guardar a sessão, como proteger uma rota, como ler o que tem dentro do token e o que fazer quando ele expira no meio de um deploy. O módulo `auth` do `tempest-react-sdk` resolve cada um desses problemas com uma peça pequena e independente — você pega só o que precisa, sem herdar um framework de auth inteiro.

São cinco peças, todas desacopladas entre si:

1. `createAuthStore` — fabrica um Zustand store tipado pelo `TUser` do app.
2. `AuthGuard` — gate de rota router-agnostic.
3. `decodeJWT` / `isJWTExpired` — leitura defensiva de JWTs (sem validação criptográfica).
4. `lazyWithRetry` — `React.lazy` com retry de chunk + reload na falha final.
5. `createRefreshQueue` — coalesce chamadas de refresh concorrentes.

!!! info "Por que peças soltas em vez de um `<AuthProvider>` monolítico"
    Cada app Tempest tem um modelo de usuário, um fluxo de login e um backend
    diferentes. Um provider monolítico forçaria todos a um único formato. Cinco
    primitivos compõem livremente: você usa o store sem o guard, o guard sem o
    JWT decoder, e por aí vai.

## Store — `createAuthStore<TUser>`

O SDK **não é dono do seu modelo de usuário**. Você passa o `TUser` e ganha um store Zustand tipado, já com `persist` configurado.

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

Persiste em `localStorage` (default) ou `sessionStorage` (`storage: "session"`). Apenas `user` e `token` são persistidos (`partialize`); após o hydrate, `isAuthenticated` é re-derivado de `!!token` no `onRehydrateStorage`.

Opções extras: `initialUser`, `initialToken` (úteis para hydration em SSR).

!!! tip "Selecione o mínimo necessário"
    `const isAuth = useAuthStore((s) => s.isAuthenticated)` re-renderiza só
    quando `isAuthenticated` muda. Desestruturar o store inteiro
    (`const { ... } = useAuthStore()`) assina **todas** as fatias e re-renderiza
    em qualquer mudança — prefira o seletor em componentes quentes.

## Guard — `AuthGuard`

Router-agnostic: é um if/else puro. Você decide o que renderizar em cada ramo — tipicamente `<Outlet />` quando autenticado e `<Navigate />` para o redirect.

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

`AuthGuard` recebe `isAuthenticated`, `children` e `fallback` — sem opinião sobre router. Compõe com guards de role customizados: aninhe um segundo guard dentro do `children`.

!!! note "Relação com `<RouteGuard>` do módulo routing"
    Se você usa o módulo de roteamento do SDK, o [`<RouteGuard>`](./routing.md)
    declarativo já cobre o caso comum (`when` + `redirectTo`) direto na árvore de
    rotas. Use `AuthGuard` quando precisar de controle imperativo sobre o que
    renderiza em cada ramo, ou quando não estiver usando o `<AppRouter>`.

## JWT — `decodeJWT` / `isJWTExpired`

Decoder de **payload only** — **não** valida a assinatura. Use no client para inspeção/UX (mostrar nome, esconder botão de admin, decidir quando renovar). A autorização real é sempre no backend.

```ts
import { decodeJWT, isJWTExpired } from "tempest-react-sdk";

// decodeJWT LANÇA quando o token é malformado — envolva em try/catch
try {
  const { header, payload, signature } = decodeJWT(token);
  console.log(payload.sub, payload.exp);
} catch {
  // token sem 3 segmentos, ou header/payload não-JSON
}

// isJWTExpired nunca lança — token inválido conta como expirado
const expired = isJWTExpired(token, 30); // 30s de leeway → expirado 30s antes do exp
```

!!! warning "`decodeJWT` lança; não retorna `null`"
    Em um token malformado, `decodeJWT` **lança** `Error` — sempre envolva em
    `try/catch`. Já `isJWTExpired` é defensivo: qualquer erro de decode é tratado
    como "expirado" (`true`), então é seguro chamar direto. A assinatura é
    `isJWTExpired(token, leewaySeconds = 0)`.

!!! danger "Nunca autorize no client"
    O payload de um JWT é base64 — qualquer um pode lê-lo e forjá-lo. Use
    `decodeJWT` só para UX. Toda decisão de permissão de verdade acontece no
    servidor, que valida a assinatura.

## Code-splitting — `lazyWithRetry`

`React.lazy` com retry de chunk + fallback `window.location.reload()` na falha final.

**Por que existe**: após um deploy, usuários com a aba aberta tentam carregar chunks que já foram deletados (404). O retry com backoff geralmente pega a nova versão; o reload resolve quando o `index.html` em cache também está stale.

```tsx
import { Suspense } from "react";
import { lazyWithRetry } from "tempest-react-sdk";
import { Spinner } from "tempest-react-sdk";

const Settings = lazyWithRetry(() => import("./Settings"), {
  retries: 3, // default
  initialDelay: 400, // default — backoff exponencial: 400, 800, 1600ms
  reloadOnFinalFailure: true, // default
});

export function SettingsRoute() {
  return (
    <Suspense fallback={<Spinner />}>
      <Settings />
    </Suspense>
  );
}
```

## Refresh queue — `createRefreshQueue`

Coalesce N chamadas de refresh concorrentes em **1** request. Enquanto um refresh está em voo, toda chamada extra recebe a **mesma** promise; quando ela resolve, todas retomam juntas.

```ts
import { createRefreshQueue } from "tempest-react-sdk";

const refresh = createRefreshQueue(async () => {
  const { token } = await api.post<{ token: string }>("/auth/refresh");
  useAuthStore.getState().setToken(token);
});

// 5 requests com 401 simultâneos → 1 único refresh, todos retomam:
await Promise.all([refresh(), refresh(), refresh(), refresh(), refresh()]);
```

!!! tip "Plugue direto no `createApiClient`"
    Passe a fila como `refresh` no cliente HTTP — ele a chama em todo 401 e a coalescência acontece de graça, evitando uma tempestade de refreshes paralelos derrubando seu endpoint de auth.

Use junto com `createApiClient`:

```ts
const refresh = createRefreshQueue(async () => {
  await AuthService.refresh();
});

const api = createApiClient({
  baseURL: "...",
  refresh, // chamado em 401 — coalesce concorrentes
  onUnauthorized: () => useAuthStore.getState().logout(),
});
```

## Exemplo completo — login, guard e refresh juntos

Um app real costura as cinco peças. Este é o esqueleto completo e copiável:

```tsx
// auth-store.ts
import { createAuthStore } from "tempest-react-sdk";

export type SessionUser = { id: string; name: string; email: string };

export const useAuthStore = createAuthStore<SessionUser>({
  name: "tempest-app-auth",
  storage: "local",
});
```

```ts
// api.ts
import { createApiClient, createRefreshQueue } from "tempest-react-sdk";
import { useAuthStore } from "./auth-store";

const refresh = createRefreshQueue(async () => {
  const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
  const { token } = (await res.json()) as { token: string };
  useAuthStore.getState().setToken(token);
});

export const api = createApiClient({
  baseURL: "/api",
  getToken: () => useAuthStore.getState().token,
  refresh, // chamado em 401 → coalesce → retry da request original
  onUnauthorized: () => useAuthStore.getState().logout(),
});
```

```tsx
// LoginPage.tsx
import { useNavigate } from "react-router-dom";
import { useAuthStore, type SessionUser } from "./auth-store";
import { api } from "./api";

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  async function handleSubmit(email: string, password: string) {
    const { user, token } = await api.post<{ user: SessionUser; token: string }>("/auth/login", {
      body: { email, password },
    });
    setSession({ user, token });
    navigate("/", { replace: true });
  }

  return <form onSubmit={(e) => e.preventDefault()}>{/* ...campos... */}</form>;
}
```

```tsx
// ProtectedLayout.tsx
import { Navigate, Outlet } from "react-router-dom";
import { AuthGuard } from "tempest-react-sdk";
import { useAuthStore } from "./auth-store";

export function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <AuthGuard isAuthenticated={isAuthenticated} fallback={<Navigate to="/login" replace />}>
      <Outlet />
    </AuthGuard>
  );
}
```

O fluxo: o login chama `setSession`, persistindo `user` + `token`. O `ProtectedLayout` lê `isAuthenticated` do store. Cada request injeta o token via `getToken`; ao tomar 401, o `createApiClient` chama a fila de refresh (coalescida) e refaz a request. Se o refresh falhar, `onUnauthorized` dispara `logout()` e o guard redireciona para `/login`.

## Resumo

- **`createAuthStore<TUser>`** — store Zustand tipado e persistido; você é dono do `TUser`.
- **`AuthGuard`** — if/else router-agnostic; você escolhe `children` e `fallback`.
- **`decodeJWT`** lança em token inválido; **`isJWTExpired`** é defensivo e nunca lança. Só para UX, nunca para autorização.
- **`lazyWithRetry`** — sobrevive a chunks stale pós-deploy com backoff + reload.
- **`createRefreshQueue`** — N refreshes concorrentes viram 1.

### Veja também

- [Routing](./routing.md) — `<RouteGuard>` declarativo, alternativa ao `AuthGuard` na árvore de rotas
- [HTTP](./http.md) — `getToken: () => useAuthStore.getState().token` + `refresh: queue`
- [Error Boundary](./error-boundary.md) — a falha final do `lazyWithRetry` vira um `ChunkLoadError` que o boundary captura
