# Tutorial — Data fetching

Our task list has to come from somewhere: a backend. On this page you'll mount the
_providers_ at the top of the app, create a typed HTTP client with
`createApiClient`, organize the cache keys with `createQueryKeys`, and fetch and
mutate data with `useQuery` and `useMutation`, handling loading and error states.

## Step 1 — The providers at the top

For React Query to work, the app needs a cache provider at the top of the tree.
`<AppProviders>` mounts that provider (and the theme, and the error boundary) at
once. It already ships in the generated `App.tsx`:

```tsx
// src/App.tsx
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

`<AppProviders>` nests from the outside in:
`ErrorBoundary → QueryProvider → ThemeProvider → I18nProvider → children`. **Query
and Theme come on by default** with the SDK's defaults — you configure nothing to
get data caching.

!!! info "Cache defaults"

    When on by default, the `QueryProvider` uses: `staleTime` of 5 minutes,
    `gcTime` of 30 minutes, `retry: 1` and `refetchOnWindowFocus: false`. To
    adjust, pass `query={{ defaultOptions: { queries: { retry: 3 } } }}`.

## Step 2 — The HTTP client with `createApiClient`

`createApiClient` creates a typed `fetch` client that handles JSON, query params,
bearer token and 401 handling. Let's centralize it in `src/lib/api.ts`:

```ts
// src/lib/api.ts
import { createApiClient, createQueryKeys } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(),
});
```

Piece by piece:

- `baseURL` comes from `.env` (`VITE_API_URL`) — the base for every request.
- `getToken` is called **on every request**; reading the token via `getState()`,
  each call uses the current token and sends the `Authorization: Bearer ...`
  header.
- `onUnauthorized` fires on **401** responses — here we log the user out.

The client exposes `get`, `post`, `put`, `patch`, `delete` (all generic in the
return type) and `upload`. Each returns the parsed, typed JSON.

!!! tip "Remember `getToken` with `getState()`?"

    The HTTP client runs **outside** React, so it reads the auth store with
    `getState()` — exactly the pattern you saw on the [State](state.md) page. No
    hook, no subscription: just a snapshot of the token at call time. 💡

## Step 3 — Cache keys with `createQueryKeys`

React Query identifies each cache slice by a **query key**. Instead of scattering
magic arrays through your code, centralize them with `createQueryKeys`:

```ts
// src/lib/api.ts (continued)
export const taskKeys = createQueryKeys("tasks", {
  all: () => ["all"] as const,
  byId: (id: string) => [id] as const,
});

// taskKeys.all()  === ["tasks", "all"]
// taskKeys.byId("42") === ["tasks", "42"]
```

Each key is prefixed with the domain (`"tasks"`), so there's no collision between
different domains.

## Step 4 — Reading data with `useQuery`

Now the task list. `useQuery` comes from `@tanstack/react-query` (a **direct**
dependency of the SDK, installed alongside it — you don't install anything
separately).

!!! note "Where `useQuery` comes from"

    The `useQuery` and `useMutation` hooks are imported from
    `"@tanstack/react-query"`, not from `"tempest-react-sdk"`. The SDK provides
    the **provider** (`QueryProvider`, via `AppProviders`), the **keys**
    (`createQueryKeys`) and the time presets; the hooks you use straight from
    React Query. Since it's a direct dependency of the SDK, it's already
    installed.

```tsx
// src/pages/Home.tsx
import { useQuery } from "@tanstack/react-query";
import { api, taskKeys } from "@/lib/api";

interface Task {
  id: string;
  title: string;
  done: boolean;
}

export function Home() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: taskKeys.all(),
    queryFn: () => api.get<Task[]>("/tasks"),
  });

  if (isLoading) return <p>Loading tasks…</p>;
  if (isError) return <p>Error: {(error as Error).message}</p>;

  return (
    <ul>
      {data?.map((task) => (
        <li key={task.id}>
          {task.done ? "✅" : "⬜"} {task.title}
        </li>
      ))}
    </ul>
  );
}
```

Piece by piece:

- `queryKey: taskKeys.all()` identifies this cache — other components using the
  same key share the same data.
- `queryFn` makes the request. `api.get<Task[]>("/tasks")` returns a typed
  `Task[]`.
- `isLoading` / `isError` / `error` are the **states** React Query keeps for you —
  handle them before rendering the data.

## Step 5 — Mutating data with `useMutation`

Fetching is only half. To **create** a task, use `useMutation` (also from
`@tanstack/react-query`). After success, we invalidate the list query so it's
refetched with the new task.

```tsx
// src/components/AddTask.tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, taskKeys } from "@/lib/api";

interface Task {
  id: string;
  title: string;
  done: boolean;
}

export function AddTask() {
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newTitle: string) =>
      api.post<Task>("/tasks", { body: { title: newTitle, done: false } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all() });
      setTitle("");
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(title);
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Add"}
      </button>
      {mutation.isError && <p>Failed to save.</p>}
    </form>
  );
}
```

Piece by piece:

- `mutationFn` receives the argument from `mutation.mutate(...)` and does the
  `POST`. Note the `{ body: {...} }` — `createApiClient` serializes `body` to JSON
  for you.
- `onSuccess` invalidates `taskKeys.all()`: React Query refetches the list
  automatically, and `<Home>` shows the new task without you reloading the page.
- `mutation.isPending` disables the button during submit; `mutation.isError`
  shows the error.

!!! tip "Why invalidate instead of inserting by hand"

    Invalidating the query (`invalidateQueries`) lets the server be the source of
    truth: you refetch the list and get the real `id`, timestamps, any field the
    backend filled in. It's more robust than trying to insert the optimistic
    object into the local list. ✅

## Recap

- `<AppProviders>` mounts the `QueryProvider` (cache) **on by default** — with no
  config you already have React Query working. ✅
- **`createApiClient({ baseURL, getToken, onUnauthorized })`** creates a typed
  `fetch` client: `getToken` injects the bearer on every call, `onUnauthorized`
  fires on 401. It reads the auth store with `getState()`.
- **`createQueryKeys("domain", {...})`** centralizes cache keys, prefixed by the
  domain.
- **`useQuery`** (from `@tanstack/react-query`, a direct SDK dependency) fetches
  data and gives you `isLoading` / `isError` / `data`.
- **`useMutation`** + `queryClient.invalidateQueries(...)` mutates data and
  refetches the list — the server stays the source of truth.

➡️ **Next page:** [Forms — zod validation and BR masks](forms.md)
