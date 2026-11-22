# Full authentication flow

Loja Aurora sells online and has an **internal dashboard** for its staff: the manager
checks the day's orders, the clerk handles exchanges. Nobody outside can open
`/pedidos`. Whoever tries lands on the login screen and, after signing in, **goes back
to the screen they asked for**. When the token expires, the dashboard ends the session
on its own instead of leaving the screen stuck on a 401. 🔐

This recipe builds that flow with four SDK pieces:
[`createAuthStore`](../auth.md#store-createauthstoretuser),
[`createApiClient`](../http.md#createapiclient), the route `guard` of
[`defineRoutes`](../routing.md#guards-protecting-routes) and
[`useReturnTo`](../routing.md#going-back-to-where-you-were-after-signing-in).

!!! info "Before you start"
    You have installed the SDK and imported `tempest-react-sdk/styles.css` once in
    `src/main.tsx`. If not, follow the [manual install](../index.md#manual-install).

## What we are building

- 🧑‍💼 A **login screen** with e-mail and password, a button with a loading state and
  the error message the backend sent ("E-mail ou senha incorretos").
- 🗂️ A **private layout** with the signed-in person's name and a **Sair** (sign out)
  button.
- 🚧 **Protected routes**: whoever is not signed in goes to `/login` and comes back
  afterwards.
- ⏱️ **A session that expires on its own**: any 401 from the backend signs out and the
  guard sends to the login screen.
- 📱 Everything works the same on a phone: the SDK components are already responsive.

## The backend contract

The backend is a FastAPI service built with `tempest-fastapi-sdk`, mounted under
`/api` (see [FastAPI integration](../integration-fastapi.md#the-contract-both-sides-share)).
There are two routes:

```text
POST /api/auth/login   { "email": "marina@lojaaurora.com.br", "password": "••••••" }
200 → { "access_token": "eyJhbGciOi...", "token_type": "bearer" }
401 → { "detail": "E-mail ou senha incorretos", "code": "INVALID_CREDENTIALS" }

GET /api/auth/me       Authorization: Bearer eyJhbGciOi...
200 → { "id": "u_7f3c", "name": "Marina Souza", "email": "marina@lojaaurora.com.br", "role": "gerente" }
```

## The code, file by file

### 1. The session store

```ts
// src/stores/auth.ts
import { createAuthStore, createSelectors } from "tempest-react-sdk";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "gerente" | "atendente";
}

export const useAuth = createSelectors(
  createAuthStore<User>({ name: "aurora-auth", storage: "local" }),
);
```

### 2. The HTTP client

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  prefix: "/api",
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(),
});
```

### 3. Login as a function

```ts
// src/services/session.ts
import { api } from "@/lib/api";
import { useAuth, type User } from "@/stores/auth";

interface LoginResponse {
  access_token: string;
  token_type: "bearer";
}

export async function signIn(email: string, password: string): Promise<User> {
  const { access_token } = await api.post<LoginResponse>("/auth/login", {
    body: { email, password },
    skipAuth: true,
  });
  const user = await api.get<User>("/auth/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  useAuth.getState().setSession({ user, token: access_token });
  return user;
}
```

### 4. The login screen

```tsx
// src/pages/Login.tsx
import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  FormActions,
  Input,
  PasswordInput,
  describeApiError,
  useNavigate,
  useReturnTo,
} from "tempest-react-sdk";
import { signIn } from "@/services/session";

export function Login() {
  const navigate = useNavigate();
  const returnTo = useReturnTo("/pedidos");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(
        describeApiError(err, "Não foi possível entrar agora. Tente de novo.", {
          codes: { INVALID_CREDENTIALS: "E-mail ou senha incorretos." },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "10vh auto", padding: 16 }}>
      <Card title="Entrar no painel da Loja Aurora">
        <Form layout="stack" gap={4} onSubmit={onSubmit}>
          {error ? <Alert variant="danger" description={error} /> : null}
          <Input
            label="E-mail"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <PasswordInput
            label="Senha"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FormActions align="end">
            <Button type="submit" loading={submitting} fullWidth>
              Entrar
            </Button>
          </FormActions>
        </Form>
      </Card>
    </main>
  );
}
```

### 5. The private layout

```tsx
// src/layouts/PrivateLayout.tsx
import { Button, Outlet, useNavigate } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export function PrivateLayout() {
  const user = useAuth.use.user();
  const logout = useAuth.use.logout();
  const navigate = useNavigate();

  function onLogout(): void {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--tempest-border)",
        }}
      >
        <strong>Loja Aurora</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span>Olá, {user?.name ?? "equipe"}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </header>
      <main style={{ padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
```

### 6. The routes

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { PrivateLayout } from "@/layouts/PrivateLayout";
import { Login } from "@/pages/Login";
import { Orders } from "@/pages/Orders";
import { useAuth } from "@/stores/auth";

export const routes = defineRoutes([
  { path: "login", element: <Login /> },
  {
    element: <PrivateLayout />,
    guard: () => useAuth.use.isAuthenticated(),
    redirectTo: "/login",
    preserveFrom: true,
    children: [
      { index: true, element: <Orders /> },
      { path: "pedidos", element: <Orders /> },
    ],
  },
]);
```

### 7. The app

```tsx
// src/App.tsx
import { AppProviders, AppRouter, Spinner } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Algo deu errado. Recarregue a página.</p> }}>
      <AppRouter routes={routes} fallback={<Spinner />} />
    </AppProviders>
  );
}
```

## Piece by piece

### The session lives in a persisted store

`createAuthStore<User>` returns a Zustand store that already carries `user`, `token`,
`isAuthenticated`, `setSession`, `setUser`, `setToken` and `logout`. It persists
`user` and `token` to `localStorage` under the `aurora-auth` key, so an F5 signs nobody
out.

`createSelectors` adds one hook per field (`useAuth.use.user()`), and each component
re-renders only when the field it reads changes. Outside React, as in the HTTP client,
you read the current value with `useAuth.getState()`.

### The HTTP client talks to the session, not the other way round

`getToken` is called **on every request**. When it returns a string, the client injects
`Authorization: Bearer <token>`. When the backend answers 401, the client calls
`onUnauthorized`, which here is `logout()`. `prefix: "/api"` lets you write
`"/auth/login"` instead of repeating `/api` on every call.

!!! note "Why `skipAuth: true` on login"
    Login is the request that **fetches** the token, so sending the old token along
    makes no sense. `skipAuth` also takes this call out of the "401 → refresh → retry"
    cycle: a wrong password is a screen error, not an expired session.

### Login fetches the user before storing the session

The `tempest-fastapi-sdk` backend returns only `{ access_token }` on login. Who the
person is comes from `GET /auth/me`. The `signIn` function sends the new token **in
that call's header** and only stores the session once it has both. That way the store
never holds `isAuthenticated: true` and `user: null` at the same time.

### The screen covers the four states

- **Idle**: the empty form, with the right `autoComplete` for password managers.
- **Loading**: `loading={submitting}` shows the spinner on the button and blocks the
  second click.
- **Error**: `describeApiError` turns any failure into a sentence for humans. The
  `codes` map swaps the backend's `INVALID_CREDENTIALS` for the sentence you want.
  Network failure, 500 and timeout fall back to the default text.
- **Success**: `navigate(returnTo, { replace: true })` goes back to the screen the
  person had asked for, and `replace` drops `/login` from the history.

!!! tip "Branch on `code`, never on `detail`"
    `detail` is text and may change wording or language. `code` is stable. See
    [Typed errors](../integration-fastapi.md#1-typed-errors-tempestapierror).

### The guard is reactive

`guard: () => useAuth.use.isAuthenticated()` runs **inside the route's render**, so it
may call hooks. That makes the guard react: when a 401 calls `logout()`,
`isAuthenticated` becomes `false`, the route re-renders and the redirect to `/login`
happens on its own, from any private screen.

The guard sits on the **pathless** route that wraps the layout. It protects all the
children at once: `/`, `/pedidos` and any screen you add there.

`preserveFrom: true` makes the redirect carry `state: { from: "/pedidos?status=pago" }`.
On the other side, `useReturnTo("/pedidos")` reads that value and **only accepts a
same-origin path**. Without it, a forged `from` would be an open redirect.

!!! warning "Read the store through a hook in the guard, not `getState()`"
    `guard: () => useAuth.getState().isAuthenticated` also compiles, but it reads the
    value once per render and does not subscribe to changes. After a `logout()` fired
    by the HTTP client, the screen would stay open until the next navigation.

### And on a phone? 📱

Nothing changes in the code. The `Card` takes the full width up to 420 px, the
`fullWidth` `Button` is easy to tap, and the `PasswordInput` brings the show-password
button, which is what helps most on a phone keyboard.

## When to switch to the preset

??? tip "Need to refresh the token instead of signing out? Use `createTempestAuth`"
    If the backend issues a `refresh_token`, signing out on every 401 is bad: the person
    loses what they were typing. The
    [`createTempestAuth`](../integration-fastapi.md#5-turn-key-authentication-createtempestauth)
    preset builds the same store, the client and a deduplicated refresh queue, speaking
    the `tempest-fastapi-sdk` contract. This recipe's routes and guard stay the same:
    you swap `useAuth` for `auth.useAuthStore` and `api` for `auth.api`. For the
    standalone refresh queue, see
    [`createRefreshQueue`](../auth.md#refresh-queue-createrefreshqueue).

!!! danger "Where the token lives"
    This recipe keeps the token in `localStorage`, which any script on the page can
    read. For a sensitive app, use a refresh token in an httpOnly cookie with
    `withCredentials: true` and `csrf: true`. Details in
    [CSRF](../http.md#csrf-a-session-cookie-needs-its-pair).

## Recap

- ✅ `createAuthStore` + `createSelectors` keep the session and survive F5.
- ✅ `createApiClient` injects the Bearer with `getToken` and signs out with
  `onUnauthorized`.
- ✅ Login uses `skipAuth`, fetches `/auth/me` and only then calls `setSession`.
- ✅ `describeApiError` with `codes` becomes the screen's error sentence.
- ✅ A `guard` reading the store **through a hook** + `preserveFrom` + `useReturnTo`
  protect the routes and send the person back where they were.
