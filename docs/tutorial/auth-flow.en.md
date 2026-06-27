# Tutorial — Auth flow

You already have all the loose pieces: the auth store ([State](state.md)), the
route guard ([Routing](routing.md)), the HTTP client
([Data fetching](data-fetching.md)) and validated forms ([Forms](forms.md)). On
this final page we **stitch it all** into a complete flow: login → protected area
→ logout, plus automatic logout when the backend responds **401**.

## The full cycle, in one picture

```text
1. User opens /dashboard with no session
        → guard reads useAuth.getState().isAuthenticated (false)
        → redirect to /login
2. User submits login
        → api.post("/auth/login")  → { user, token }
        → useAuth.use.setSession({ user, token })
        → navigate("/dashboard")
3. guard now reads isAuthenticated === true → shows the Dashboard
4. Any call that returns 401
        → onUnauthorized → useAuth.getState().logout()
        → guard redirects to /login again
5. User clicks "Sign out"
        → useAuth.use.logout() → back to step 1
```

Each step uses exactly one piece you already built. Let's assemble them.

## Step 1 — The store and the client (recap)

These two files already exist from the previous pages. They're the foundation of
the flow — notice how the client reads and clears the **same** store:

```ts
// src/stores/auth.ts
import { createAuthStore, createSelectors } from "tempest-react-sdk";

export interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = createSelectors(
  createAuthStore<User>({ name: "app-auth", storage: "local" }),
);
```

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(),
});
```

`getToken` injects the token on every request; `onUnauthorized` logs out when the
backend rejects the token. Both read the store outside React with `getState()`.

## Step 2 — The login screen

Login calls the backend, receives `{ user, token }`, stores the session with
`setSession` and navigates to the dashboard. We reuse `useZodForm` + `FormField`
from the forms chapter:

```tsx
// src/pages/Login.tsx
import { useState } from "react";
import {
  useZodForm,
  FormProvider,
  Form,
  FormField,
  FormActions,
  Input,
  Button,
  useNavigate,
} from "tempest-react-sdk";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/stores/auth";

const loginSchema = z.object({
  email: z.string().email("Invalid e-mail"),
  password: z.string().min(1, "Enter your password"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function Login() {
  const navigate = useNavigate();
  const setSession = useAuth.use.setSession();
  const [failed, setFailed] = useState(false);

  const form = useZodForm(loginSchema, {
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFailed(false);
    try {
      const session = await api.post<{ user: User; token: string }>("/auth/login", {
        body: values,
      });
      setSession(session);
      navigate("/dashboard");
    } catch {
      setFailed(true);
    }
  }

  return (
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="email" label="E-mail" required>
          <Input type="email" />
        </FormField>
        <FormField name="password" label="Password" required>
          <Input type="password" />
        </FormField>
        {failed && <p role="alert">Invalid e-mail or password.</p>}
        <FormActions align="end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Sign in
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  );
}
```

Piece by piece:

- `setSession({ user, token })` is the **only** action that turns the session on:
  it stores user and token and re-derives `isAuthenticated` to `true`.
- `navigate("/dashboard")` goes to the protected destination — which now opens,
  because the guard sees `isAuthenticated === true`.
- The `try/catch` separates the **network/credentials** error (shows the message)
  from zod validation (which won't even let `onSubmit` run with empty fields).

## Step 3 — The protected area (the guard)

The dashboard route already has the guard you wrote in the routing chapter. It's
the gate that reads the store **at render time**:

```tsx
// src/routes.tsx (the protected route)
{
  path: "dashboard",
  lazy: () => import("@/pages/Dashboard"),
  guard: () => useAuth.getState().isAuthenticated,
  redirectTo: "/login",
},
```

Before login, `isAuthenticated` is `false` → the `<AppRouter>` redirects to
`/login`. After `setSession`, the next attempt to open `/dashboard` finds `true` →
the Dashboard renders.

!!! warning "Why the guard uses `getState()` and not the hook"

    The `guard` runs **outside** the hooks cycle (during route mounting), so it
    can't call `useAuth.use.isAuthenticated()`. It reads the current snapshot with
    `getState()`. Inside **components** — like `RootLayout` — you use the `.use`
    hook to re-render when auth changes. Same store, two ways to read depending on
    the context. 💡

## Step 4 — Manual logout

`RootLayout` (from the state chapter) already shows a "Sign out" button when there
is a session. It calls the `logout` action:

```tsx
// excerpt from src/layouts/RootLayout.tsx
import { useAuth } from "@/stores/auth";

const logout = useAuth.use.logout();
// ...
<button onClick={logout}>Sign out</button>;
```

`logout()` clears `user`, `token` and `isAuthenticated`. Since `RootLayout` reads
`isAuthenticated` via the `.use` hook, the `<nav>` re-renders immediately: the
"Sign out" button disappears and the "Sign in" link returns. If the user is on a
protected route, the guard sends them back to login.

## Step 5 — Automatic logout on 401

Here the flow closes. When a token expires, the backend responds **401** on the
next call. The client's `onUnauthorized` — which you configured in Step 1 — fires
the `logout()`:

```ts
// already in src/lib/api.ts
onUnauthorized: () => useAuth.getState().logout(),
```

You do **not** need to check 401 manually in each `useQuery`/`useMutation`: any
call via `api` that returns 401 logs the user out centrally, and the guard does
the rest. A single source of truth for "the session ended".

!!! tip "Refreshing the token instead of logging out"

    If your backend has a refresh token, you can **renew** the session before
    giving up: pass a `refresh` to `createApiClient` and it will try `refresh()`
    and retry the request once on a 401, logging out only if the refresh also
    fails. See the [Auth](../auth.md) page (`createRefreshQueue`) for that
    advanced pattern.

## Congratulations! 🎉

You built a complete app with `tempest-react-sdk`, end to end:

- **Routing** with layout, pages, a lazy route and a guard.
- **State** with `createStore`, `createSelectors` and the persisted auth store.
- **Data** with `createApiClient`, `createQueryKeys`, `useQuery` and
  `useMutation`.
- **Forms** validated with `useZodForm` + `FormField` + masked BR fields.
- **Auth** tying store + guard + HTTP client into a cohesive flow.

## Recap

- The auth flow is **one store + one guard + one client**, all reading the
  **same** `useAuth`. ✅
- **Login**: `api.post("/auth/login")` → `setSession({ user, token })` →
  `navigate("/dashboard")`.
- **Protected area**: the `guard` reads `useAuth.getState().isAuthenticated` on
  render and redirects with `redirectTo` when false.
- **Manual logout**: `useAuth.use.logout()` on a button; `RootLayout` re-renders
  because it reads via the `.use` hook.
- **Automatic logout**: `onUnauthorized: () => useAuth.getState().logout()` on the
  client logs out on any 401 — a single source of truth.
- Inside components, read with `.use`; outside React (guard, client), read with
  `getState()`.
