# Query (TanStack Query)

Wrappers finos pra padronizar tempos de cache, chaves e o `QueryClient`.

## Provider

```tsx
import { QueryProvider } from "tempest-react-sdk";

<QueryProvider>{children}</QueryProvider>;
```

Defaults: `staleTime` 5min, `gcTime` 30min, `retry: 1`, `refetchOnWindowFocus: false`.

Para sobrescrever, passe `defaultOptions` ou um `client` pronto.

## Presets de tempo

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

## Query keys tipadas

```ts
import { createQueryKeys } from "tempest-react-sdk";

export const userKeys = createQueryKeys("user", {
    me: () => ["me"] as const,
    byId: (id: string) => [id] as const,
    list: (filters: { page: number; size: number }) => ["list", filters] as const,
});

// userKeys.byId("42") === ["user", "42"]
```

Padrão: cada domínio em `src/constants/query-keys/<dominio>.ts`, agrupados num barrel.

## Veja também

- [HTTP](./http.md)
- [Offline](./offline.md) — combinar com `initialData` pra fallback offline
