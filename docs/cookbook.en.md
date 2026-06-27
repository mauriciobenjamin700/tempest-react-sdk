# Cookbook — Recipes

This page is a **cookbook**: each section answers a "I want to do X" with **one
complete, copy-pasteable example** (imports included, no `...`), followed by a
couple of explanations. The recipes combine several `tempest-react-sdk` modules
into flows that Tempest apps repeat all the time. 🚀

!!! info "Common prerequisites"
    Every recipe assumes you have installed the SDK and imported the CSS once at your
    app entrypoint:

    ```bash
    npm install tempest-react-sdk
    ```

    ```tsx
    // src/main.tsx
    import "tempest-react-sdk/styles.css";
    ```

    Only `react` and `react-dom` are **peer dependencies** — everything else
    (`zod`, `zustand`, `dexie`, `react-hook-form`, `@tanstack/react-query`,
    `lucide-react`, `react-router-dom`) is installed alongside as a direct
    dependency. Current version: **0.7.0**.

## Full authentication flow

You want persisted login, protected routes, and an HTTP client that injects the
token and logs out on its own when the backend replies with a 401. Combine
`createAuthStore`, `<RouteGuard>`, and `createApiClient`.

```tsx
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

// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(),
});

// src/pages/Login.tsx
import { useState } from "react";
import { Button, Form, FormActions, Input, useNavigate } from "tempest-react-sdk";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/stores/auth";

export function Login() {
  const navigate = useNavigate();
  const setSession = useAuth.use.setSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const { user, token } = await api.post<{ user: User; token: string }>("/auth/login", {
      email,
      password,
    });
    setSession({ user, token });
    navigate("/dashboard");
  }

  return (
    <Form layout="stack" gap={4} onSubmit={onSubmit}>
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <FormActions align="end">
        <Button type="submit">Sign in</Button>
      </FormActions>
    </Form>
  );
}

// src/routes.tsx
import { defineRoutes, RouteGuard } from "tempest-react-sdk";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";

export const routes = defineRoutes([
  { path: "login", element: <Login /> },
  {
    path: "dashboard",
    element: (
      <RouteGuard when={useAuth.getState().isAuthenticated} redirectTo="/login">
        <Dashboard />
      </RouteGuard>
    ),
  },
]);
```

- `createAuthStore<User>` is a persisted Zustand store; `setSession`, `token`,
  `isAuthenticated`, and `logout` come ready. `getState()` reads the current value
  **outside** React — exactly what the HTTP client and the guard need.
- `createApiClient` injects `Authorization: Bearer <token>` whenever `getToken()`
  returns a string and, on a 401, calls `onUnauthorized` (here, `logout()`). To
  refresh the token instead of logging out, add `refresh`/`createRefreshQueue` —
  see [Auth](./auth.md).

!!! tip "Guard as a route vs. component"
    Use `guard: () => useAuth.getState().isAuthenticated` right in the `defineRoutes`
    tree when a whole route is protected; use `<RouteGuard when={...}>` when you guard
    a piece of JSX. Details in [Routing](./routing.md).

## Paginated list with search and sorting

You want a table with search, column sorting, and pagination without writing that
state by hand. `DataTable<T>` does it all client-side over whatever data you pass.

```tsx
// src/pages/Users.tsx
import { useQuery } from "@tanstack/react-query";
import { DataTable, type DataTableColumn } from "tempest-react-sdk";
import { api } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const columns: DataTableColumn<User>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "email", header: "Email" },
  { key: "role", header: "Role", sortable: true, align: "right" },
];

export function Users() {
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <DataTable
      data={data ?? []}
      columns={columns}
      searchable
      pageSize={10}
      initialSort={{ key: "name", direction: "asc" }}
      rowKey={(row) => row.id}
      emptyMessage="No users found"
    />
  );
}
```

- `DataTable` receives the **full** dataset in `data` and handles search, sorting,
  and pagination on the client. Mark sortable columns with `sortable: true`;
  clicking a header cycles asc → desc → no sorting.
- `searchable` adds an input above the table that filters by case-insensitive
  substring. Restrict the searched columns with `searchKeys`. See
  [Overlays & advanced](./components/advanced.md).

!!! note "Server-side pagination"
    For large datasets, fetch one page at a time (pass `page`/`pageSize` in the
    `queryFn`) and use the headless `Table` instead of `DataTable` — that way sorting
    and pagination are the backend's job.

## Form with zod validation

You want a form validated by a zod schema, with masked Brazilian fields (CPF,
phone) and automatic error messages. Combine `useZodForm`, `<FormProvider>`, and
`<FormField>`.

```tsx
// src/pages/Signup.tsx
import {
  Button,
  CPFInput,
  Form,
  FormActions,
  FormField,
  FormProvider,
  Input,
  PhoneInput,
  useZodForm,
  validateCPF,
} from "tempest-react-sdk";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Invalid email"),
  cpf: z.string().refine(validateCPF, "Invalid CPF"),
  phone: z.string().min(14, "Invalid phone"),
});

type SignupValues = z.infer<typeof schema>;

export function Signup() {
  const form = useZodForm(schema, {
    defaultValues: { name: "", email: "", cpf: "", phone: "" },
  });

  function onSubmit(values: SignupValues) {
    console.log("payload", values);
  }

  return (
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" label="Name" required>
          <Input />
        </FormField>
        <FormField name="email" label="Email" required>
          <Input type="email" />
        </FormField>
        <FormField name="cpf" label="CPF" required>
          <CPFInput />
        </FormField>
        <FormField name="phone" label="Phone" required>
          <PhoneInput />
        </FormField>
        <FormActions align="end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Create account
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  );
}
```

- `useZodForm(schema, options)` wraps `useForm` + `zodResolver` and **infers** the
  value type from the schema — you never type the form shape twice.
- `<FormField name="cpf">` injects `value`/`onChange`/`error` into the child control
  via `Controller`, eliminating the `<Controller render={...} />` boilerplate. It
  reads `control` from the `<FormProvider>` in the tree. The BR inputs (`CPFInput`,
  `PhoneInput`) already apply the mask — `validateCPF` checks the real check digits.
  See [Forms](./forms.md) and [Forms BR](./forms-br.md).

## Dark mode with no flash

You want to toggle between light and dark **without the white flash** on page load.
The trick is to run an inline script in the `<head>` before the CSS, using
`themeInitScript()`, and to use `ThemeProvider` + `useTheme` in the app.

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script>
      // Replace with the output of themeInitScript() — it reads
      // localStorage["tempest-theme"] and applies data-tempest-theme on <html>
      // before the first paint.
      (function () {
        try {
          var stored = localStorage.getItem("tempest-theme");
          var dark =
            stored === "dark" ||
            (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
          if (dark) document.documentElement.setAttribute("data-tempest-theme", "dark");
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/App.tsx
import { ThemeProvider, useTheme } from "tempest-react-sdk";

function ThemeToggle() {
  const { theme, resolvedTheme, toggle } = useTheme();
  return (
    <button onClick={toggle}>
      {resolvedTheme === "dark" ? "🌙" : "☀️"} ({theme})
    </button>
  );
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <ThemeToggle />
    </ThemeProvider>
  );
}
```

- The inline script is the part that kills the flash: it applies
  `data-tempest-theme="dark"` on `<html>` **before** any CSS paints. Generate its
  contents with `themeInitScript()` (in SSR/React, inject it via
  `<script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />`).
- `useTheme()` returns `theme` (raw preference), `resolvedTheme` (what's applied),
  and `toggle()`. With `defaultTheme="system"`, the provider reacts to the system
  `prefers-color-scheme`. The `--tempest-*` tokens react on their own. See
  [Theme](./theme.md).

!!! tip "Using AppProviders"
    If you use `<AppProviders>`, theme is already on — tweak it with
    `theme={{ defaultTheme: "dark" }}`. The inline script in `index.html` is still
    required for the no-flash.

## Offline-first

You want to store data locally (notifications, drafts) that survives a reload and
sync with the backend when online. Combine `createOfflineStore` (Dexie) with the
HTTP client.

```ts
// src/stores/notifications.ts
import { createOfflineStore } from "tempest-react-sdk";
import { api } from "@/lib/api";

export type Notification = {
  message_id: string;
  owner_id: string;
  type: "NOTIFY" | "PAYMENT-SUCCESS";
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

/**
 * Fetches from the backend, writes to IndexedDB, and returns what's in the
 * local cache. If the network fails, it falls back to the offline cache
 * instead of breaking the UI.
 */
export async function syncNotifications(ownerId: string): Promise<Notification[]> {
  try {
    const fresh = await api.get<Notification[]>("/notifications");
    await notificationsStore.bulkPut(fresh, ownerId);
  } catch {
    // Offline or backend unavailable — carry on with the local cache.
  }
  return notificationsStore.list(ownerId, {
    orderBy: "created_at",
    reverse: true,
    limit: 50,
  });
}

// Mark all as read, locally:
export async function markAllRead(ownerId: string): Promise<void> {
  await notificationsStore.updateMany(ownerId, { read: true });
}
```

- `createOfflineStore<T, K>` wraps Dexie with owner scoping: every operation takes
  the `ownerId`, so data from different users never mixes. The `indexes` syntax is
  Dexie's (`&` = unique primary key).
- The sync pattern is simple: try the backend, write the result with `bulkPut`, and
  **always** read from the local store at the end — so the UI works online and
  offline with the same code. See [Offline](./offline.md).

!!! warning "Don't use it for volatile UI state"
    IndexedDB is for data that must **survive a reload** (history, drafts, cache). For
    ephemeral UI state (spinner, active tab) use Zustand — it's much cheaper. See
    [State](./state.md).

## Command palette ⌘K

You want a ⌘K-style palette that opens with a keyboard shortcut and navigates the
app. Combine the `Command` component, the `useKeyboardShortcut` hook, and
`useNavigate`.

```tsx
// src/components/CommandPalette.tsx
import { useState } from "react";
import { Command, useKeyboardShortcut, useNavigate, useTheme } from "tempest-react-sdk";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { toggle } = useTheme();

  // ⌘K (macOS) / Ctrl+K (Windows/Linux) opens the palette.
  useKeyboardShortcut({ key: "k", mod: true }, () => setOpen(true));

  return (
    <Command
      open={open}
      onOpenChange={setOpen}
      placeholder="Type a command…"
      emptyMessage="No results"
      items={[
        {
          id: "home",
          label: "Go to home",
          group: "Navigation",
          onSelect: () => navigate("/"),
        },
        {
          id: "dashboard",
          label: "Open dashboard",
          group: "Navigation",
          keywords: ["panel"],
          onSelect: () => navigate("/dashboard"),
        },
        {
          id: "theme",
          label: "Toggle theme",
          group: "Preferences",
          onSelect: () => toggle(),
        },
      ]}
    />
  );
}
```

- `Command` filters items by substring (over `label` + `keywords`), groups by
  `group`, traps focus while open, and closes on Escape, outside click, or
  selection. Each `item.onSelect` is the action — here, `navigate(...)` and
  `toggle()`.
- `useKeyboardShortcut({ key: "k", mod: true }, ...)` matches **Ctrl or Cmd + K**
  on any OS. The hook takes a `KeyboardShortcut` object (not a string) and, by
  default, ignores the shortcut when focus is inside an input. See
  [Overlays & advanced](./components/advanced.md) and [Hooks](./hooks.md).

## App from scratch in 1 minute

You want to start a fresh project already wired with providers, routing, and an auth
store — without building the pyramid by hand. Use the `create-tempest-app` CLI.

```bash
# New folder — npx downloads the SDK and runs its bin
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
cp .env.example .env
npm run dev            # http://127.0.0.1:5173
```

The generated `src/App.tsx` already wires everything with `<AppProviders>` (React
Query + theme + error boundary) on the outside and `<AppRouter>` on the inside:

```tsx
// src/App.tsx — generated by the CLI
import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Something went wrong.</p> }}>
      <AppRouter routes={routes} fallback={<p>Loading…</p>} />
    </AppProviders>
  );
}
```

- The CLI is the **`bin` of `tempest-react-sdk` itself** — not a separate package.
  The generated app ships with `createAuthStore` + `createSelectors`,
  `defineRoutes` (with a `lazy` + guarded route), and `createApiClient`, each file
  demonstrating an SDK feature.
- `<AppProviders>` nests `ErrorBoundary → QueryProvider → ThemeProvider →
I18nProvider → children` in the right order, and `<AppRouter>` assembles router +
  `<Suspense>` + `<Routes>` from the route array. See [Scaffold](./scaffold.md),
  [App Providers](./app-providers.md), and [Routing](./routing.md).

!!! tip "Already have a project?"
    Inside an existing project, run `npm install tempest-react-sdk` and
    `npx create-tempest-app .` — the CLI generates `src/` + configs **in the current
    directory**, preserving files that already exist and merging `package.json`.

## Recap

- **Full auth**: `createAuthStore` (persisted session) + `createApiClient` (token +
  `onUnauthorized` → `logout`) + `<RouteGuard>`/`guard` to protect routes.
- **Lists**: `DataTable<T>` solves search + sorting + pagination client-side over
  `useQuery` data.
- **Forms**: `useZodForm` + `<FormProvider>` + `<FormField>` + masked BR inputs give
  typed validation from a single schema.
- **Dark mode**: an inline script (`themeInitScript`) in the `<head>` kills the
  flash; `ThemeProvider` + `useTheme().toggle()` switch themes.
- **Offline**: `createOfflineStore` (Dexie, owner-scoped) + a "try backend, fall
  back to cache" sync.
- **⌘K palette**: `Command` + `useKeyboardShortcut({ key: "k", mod: true })` +
  `useNavigate`.
- **App from scratch**: `create-tempest-app` scaffolds everything wired with
  `<AppProviders>` + `<AppRouter>`.
