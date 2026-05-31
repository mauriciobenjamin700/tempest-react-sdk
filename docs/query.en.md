# Query (TanStack Query)

Thin wrappers to standardize cache times, keys, and the `QueryClient`.

## Provider

```tsx
import { QueryProvider } from "tempest-react-sdk";

<QueryProvider>{children}</QueryProvider>;
```

Defaults: `staleTime` 5min, `gcTime` 30min, `retry: 1`,
`refetchOnWindowFocus: false`.

To override, pass `defaultOptions` or a ready-made `client`.

## Time presets

```ts
import { STALE_TIME, CACHE_TIME, REFETCH_TIME } from "tempest-react-sdk";

useQuery({
    queryKey: [...],
    queryFn: ...,
    staleTime: STALE_TIME.LONG,        // 30min
    gcTime: CACHE_TIME.LONG,           // 1h
    refetchInterval: REFETCH_TIME.FAST // 30s
});
```

## Typed query keys

```ts
import { createQueryKeys } from "tempest-react-sdk";

export const userKeys = createQueryKeys("user", {
  me: () => ["me"] as const,
  byId: (id: string) => [id] as const,
  list: (filters: { page: number; size: number }) => ["list", filters] as const,
});

// userKeys.byId("42") === ["user", "42"]
```

Convention: each domain in `src/constants/query-keys/<domain>.ts`, grouped in a
barrel.

## See also

- [HTTP](./http.md)
- [Offline](./offline.md) — combine with `initialData` for an offline fallback
