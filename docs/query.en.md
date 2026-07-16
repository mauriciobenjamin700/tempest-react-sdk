# Query (TanStack Query)

Thin wrappers to standardize cache times, query keys, and the `QueryClient`. You keep using `@tanstack/react-query` as usual — the SDK only ships well-calibrated defaults and a typed key factory.

!!! info "Why do these wrappers exist?"
    Without standardization, every screen guesses a `staleTime` and every domain hand-writes `queryKey: ["user", id]`. That leads to invalidations that miss (a key built differently in two places) and overly aggressive refetching. The SDK centralizes both: named presets plus a factory that guarantees the same key everywhere.

## Provider

Wrap the app tree once, usually in `main.tsx` (or inside `<AppProviders>`):

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryProvider } from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
```

Defaults applied when you do **not** pass a `client`:

- `staleTime`: 5 min (`STALE_TIME.DEFAULT`)
- `gcTime`: 30 min (`CACHE_TIME.DEFAULT`)
- `retry`: 1 (queries) / 0 (mutations)
- `refetchOnWindowFocus`: false

To override, pass `defaultOptions` (merged on top of the defaults) or a ready-made `client` (ignores the SDK defaults):

```tsx
import { QueryClient } from "@tanstack/react-query";
import { QueryProvider, STALE_TIME } from "tempest-react-sdk";

// Option A — tweak only some defaults
<QueryProvider defaultOptions={{ queries: { staleTime: STALE_TIME.LONG } }}>
  <App />
</QueryProvider>;

// Option B — bring your own client (share across roots, plug devtools, etc.)
const client = new QueryClient();
<QueryProvider client={client}>
  <App />
</QueryProvider>;
```

!!! warning "One `QueryClient` per app"
    Do not nest two `QueryProvider`s without passing the same `client`. Each provider creates an isolated cache, and queries from different subtrees stop sharing data. For multiple roots, create the `QueryClient` once and pass it via the `client` prop.

## Time presets

```ts
import { useQuery } from "@tanstack/react-query";
import { STALE_TIME, CACHE_TIME, REFETCH_TIME } from "tempest-react-sdk";

useQuery({
  queryKey: ["dashboard"],
  queryFn: fetchDashboard,
  staleTime: STALE_TIME.LONG, // 30 min — data rarely changes
  gcTime: CACHE_TIME.LONG, // 1 h
  refetchInterval: REFETCH_TIME.FAST, // 30 s — status polling
});
```

- `STALE_TIME`: `SHORT` 30s, `DEFAULT` 5min, `LONG` 30min, `INFINITE` ∞
- `CACHE_TIME`: `SHORT` 5min, `DEFAULT` 30min, `LONG` 1h
- `REFETCH_TIME`: `REALTIME` 5s, `FAST` 30s, `DEFAULT` 60s, `SLOW` 5min

!!! tip "When to use `INFINITE`"
    `STALE_TIME.INFINITE` marks data as never stale — TanStack only refetches on manual invalidation. Ideal for static lists (categories, cities) that change per deploy, not per use.

## Typed query keys

`createQueryKeys` takes a `scope` (the domain prefix) and a map of builders. Every output already carries the scope up front, so the same key is built identically across the whole codebase:

```ts
import { createQueryKeys } from "tempest-react-sdk";

export const userKeys = createQueryKeys("user", {
  me: () => ["me"] as const,
  byId: (id: string) => [id] as const,
  list: (filters: { page: number; size: number }) => ["list", filters] as const,
});

userKeys.all; // ["user"]
userKeys.me(); // ["user", "me"]
userKeys.byId("42"); // ["user", "42"]
userKeys.list({ page: 1, size: 20 }); // ["user", "list", { page: 1, size: 20 }]
```

Note the `all`: it is generated automatically and is the broadest key of the domain — invalidating it tears down every `user/*` query at once.

## Full example — query + mutation + invalidation

This component reads the profile with `useQuery`, updates it with `useMutation`, and invalidates only the affected keys on success:

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, createQueryKeys } from "tempest-react-sdk";

interface User {
  id: string;
  name: string;
}

const api = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

export const userKeys = createQueryKeys("user", {
  me: () => ["me"] as const,
  byId: (id: string) => [id] as const,
});

export function ProfileCard() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: userKeys.me(),
    queryFn: () => api.get<User>("/users/me"),
  });

  const rename = useMutation({
    mutationFn: (name: string) => api.patch<User>("/users/me", { body: { name } }),
    onSuccess: (updated) => {
      // Update the local cache without a new fetch...
      queryClient.setQueryData(userKeys.me(), updated);
      // ...and invalidate the by-id record, in case another screen uses it.
      queryClient.invalidateQueries({ queryKey: userKeys.byId(updated.id) });
    },
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h2>{user?.name}</h2>
      <button disabled={rename.isPending} onClick={() => rename.mutate("New name")}>
        Rename
      </button>
    </div>
  );
}
```

!!! note "Why `setQueryData` + `invalidateQueries`?"
    `setQueryData` applies the mutation response to the cache immediately (no UI flicker), while `invalidateQueries` marks _related_ queries as stale to revalidate in the background. Using a key factory guarantees the invalidated key is exactly the one the query consulted.

Organization pattern: each domain in `src/constants/query-keys/<domain>.ts`, grouped in a barrel.

## `useOfflineMutation`

When the app is offline-first, a mutation should not hit the network directly — it writes to the [`createOfflineSync`](./offline-sync.md) **outbox** and syncs later. `useOfflineMutation` bridges the sync engine and TanStack Query: on `mutate` it enqueues the entry, **optimistically patches the query cache**, kicks a **flush**, and **rolls back** the cache if the enqueue fails.

```tsx
import { useOfflineMutation } from "tempest-react-sdk";
import { notesSync } from "@/sync/engine";
import type { Note } from "@/sync/types";

function useAddNote() {
  return useOfflineMutation<Note, Note[], Note>({
    sync: notesSync,
    queryKey: ["notes"],
    toEntry: (note) => ({ op: "create", recordId: note.id, payload: note }),
    applyOptimistic: (current = [], note) => [...current, note],
  });
}

// const addNote = useAddNote();
// addNote.mutate({ id: crypto.randomUUID(), text: "offline!" });
```

- `toEntry` maps the variables to the outbox `{ op, recordId, payload }`.
- `applyOptimistic` produces the next cache value; the previous one is restored if the enqueue throws.
- `flush` (default `true` → `"after-mutation"`) triggers sync; `false` leaves it to `useOfflineSync`.
- `invalidate` (default `false`) revalidates the `queryKey` in `onSettled`.

!!! tip "Server delivery happens on flush"
    `mutate` resolves with the **outbox entry id**, not the server response — actual delivery runs inside the engine's flush loop, so the UI updates instantly and survives reloads and offline periods.

## Recap

- `<QueryProvider>` at the root — one per app — ships calibrated defaults; override via `defaultOptions` or `client`.
- `STALE_TIME` / `CACHE_TIME` / `REFETCH_TIME` replace magic numbers with named presets.
- `createQueryKeys(scope, builders)` generates typed, consistent keys, with an automatic `all` for broad invalidation.
- Combine `setQueryData` (immediate response) with `invalidateQueries` (revalidation) using the same key factory.
- `useOfflineMutation` bridges the offline engine to the cache: enqueue + optimistic update + flush + rollback.

## See also

- [HTTP](./http.md) — the `createApiClient` that powers your `queryFn`s
- [Offline](./offline.md) — combine with `initialData` for an offline fallback
- [PWA & Offline-First](./pwa.md) — service worker, background sync, status UI
