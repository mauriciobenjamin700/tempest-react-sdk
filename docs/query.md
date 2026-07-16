# Query (TanStack Query)

Wrappers finos pra padronizar tempos de cache, chaves de query e o `QueryClient`. Você continua usando o `@tanstack/react-query` de sempre — o SDK só entrega os defaults bem calibrados e um factory de keys tipado.

!!! info "Por que esses wrappers existem?"
    Sem padronização, cada tela escolhe um `staleTime` no chute e cada domínio escreve `queryKey: ["user", id]` à mão. Isso gera invalidações que não pegam (key montada diferente em dois lugares) e refetch agressivo demais. O SDK centraliza ambos: presets nomeados e um factory que garante a mesma key em todo lugar.

## Provider

Envolva a árvore do app uma única vez, normalmente no `main.tsx` (ou dentro de `<AppProviders>`):

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

Defaults aplicados quando você **não** passa um `client`:

- `staleTime`: 5 min (`STALE_TIME.DEFAULT`)
- `gcTime`: 30 min (`CACHE_TIME.DEFAULT`)
- `retry`: 1 (queries) / 0 (mutations)
- `refetchOnWindowFocus`: false

Para sobrescrever, passe `defaultOptions` (mesclado por cima dos defaults) ou um `client` pronto (ignora os defaults do SDK):

```tsx
import { QueryClient } from "@tanstack/react-query";
import { QueryProvider, STALE_TIME } from "tempest-react-sdk";

// Opção A — só ajustar alguns defaults
<QueryProvider defaultOptions={{ queries: { staleTime: STALE_TIME.LONG } }}>
  <App />
</QueryProvider>;

// Opção B — trazer seu próprio client (compartilhar entre roots, plugar devtools, etc.)
const client = new QueryClient();
<QueryProvider client={client}>
  <App />
</QueryProvider>;
```

!!! warning "Um único `QueryClient` por app"
    Não aninhe dois `QueryProvider` sem passar o mesmo `client`. Cada provider cria um cache isolado, e queries de subárvores diferentes deixam de compartilhar dados. Para múltiplos roots, crie o `QueryClient` uma vez e passe via prop `client`.

## Presets de tempo

```ts
import { useQuery } from "@tanstack/react-query";
import { STALE_TIME, CACHE_TIME, REFETCH_TIME } from "tempest-react-sdk";

useQuery({
  queryKey: ["dashboard"],
  queryFn: fetchDashboard,
  staleTime: STALE_TIME.LONG, // 30 min — dado muda pouco
  gcTime: CACHE_TIME.LONG, // 1 h
  refetchInterval: REFETCH_TIME.FAST, // 30 s — polling de status
});
```

- `STALE_TIME`: `SHORT` 30s, `DEFAULT` 5min, `LONG` 30min, `INFINITE` ∞
- `CACHE_TIME`: `SHORT` 5min, `DEFAULT` 30min, `LONG` 1h
- `REFETCH_TIME`: `REALTIME` 5s, `FAST` 30s, `DEFAULT` 60s, `SLOW` 5min

!!! tip "Quando usar `INFINITE`"
    `STALE_TIME.INFINITE` marca o dado como nunca obsoleto — o TanStack só refaz o fetch via invalidação manual. Ideal para listas estáticas (categorias, cidades) que mudam por deploy, não por uso.

## Query keys tipadas

`createQueryKeys` recebe um `scope` (prefixo do domínio) e um mapa de builders. Cada saída já vem com o scope na frente, então a mesma key é montada de forma idêntica em toda a base de código:

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

Note o `all`: ele é gerado automaticamente e é a key mais ampla do domínio — invalidá-lo derruba todas as queries `user/*` de uma vez.

## Exemplo completo — query + mutation + invalidação

Esse componente lê o perfil com `useQuery`, atualiza com `useMutation` e invalida só as keys afetadas no sucesso:

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
      // Atualiza o cache local sem novo fetch...
      queryClient.setQueryData(userKeys.me(), updated);
      // ...e invalida o registro por id, caso outra tela o use.
      queryClient.invalidateQueries({ queryKey: userKeys.byId(updated.id) });
    },
  });

  if (isLoading) return <p>Carregando…</p>;

  return (
    <div>
      <h2>{user?.name}</h2>
      <button disabled={rename.isPending} onClick={() => rename.mutate("Novo nome")}>
        Renomear
      </button>
    </div>
  );
}
```

!!! note "Por que `setQueryData` + `invalidateQueries`?"
    `setQueryData` aplica a resposta da mutation no cache imediatamente (UI sem flicker), enquanto `invalidateQueries` marca queries _relacionadas_ como obsoletas pra revalidar no background. Usar uma key factory garante que a key invalidada seja exatamente a mesma que a query consultou.

Padrão de organização: cada domínio em `src/constants/query-keys/<dominio>.ts`, agrupados num barrel.

## `useOfflineMutation`

Quando o app é offline-first, uma mutation não deve bater na rede direto — ela grava no **outbox** do [`createOfflineSync`](./offline-sync.md) e sincroniza depois. `useOfflineMutation` faz a ponte entre o motor de sync e o TanStack Query: no `mutate` ele enfileira a entrada, **atualiza o cache da query otimisticamente**, dá o **flush** e faz **rollback** do cache se o enqueue falhar.

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

- `toEntry` mapeia as variáveis pra `{ op, recordId, payload }` do outbox.
- `applyOptimistic` produz o próximo valor do cache; o anterior é restaurado se o enqueue lançar.
- `flush` (default `true` → `"after-mutation"`) dispara a sincronização; `false` deixa isso pro `useOfflineSync`.
- `invalidate` (default `false`) revalida a `queryKey` no `onSettled`.

!!! tip "A entrega ao servidor acontece no flush"
    O `mutate` resolve com o **id da entrada no outbox**, não com a resposta do servidor — a entrega real roda no loop de flush do motor, então a UI atualiza na hora e sobrevive a reloads e a períodos offline.

## Recap

- `<QueryProvider>` na raiz — um por app — entrega defaults calibrados; sobrescreva via `defaultOptions` ou `client`.
- `STALE_TIME` / `CACHE_TIME` / `REFETCH_TIME` substituem números mágicos por presets nomeados.
- `createQueryKeys(scope, builders)` gera keys tipadas e consistentes, com um `all` automático pra invalidação ampla.
- Combine `setQueryData` (resposta imediata) com `invalidateQueries` (revalidação) usando a mesma key factory.
- `useOfflineMutation` liga o motor offline ao cache: enqueue + optimistic update + flush + rollback.

## Veja também

- [HTTP](./http.md) — o `createApiClient` que alimenta as `queryFn`
- [Offline](./offline.md) — combinar com `initialData` pra fallback offline
- [PWA & Offline-First](./pwa.md) — service worker, background sync, status UI
