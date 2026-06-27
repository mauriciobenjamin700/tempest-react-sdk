# Tutorial — Buscando dados

Nossa lista de tarefas precisa vir de algum lugar: um backend. Nesta página você
vai montar os _providers_ no topo do app, criar um cliente HTTP tipado com
`createApiClient`, organizar as chaves de cache com `createQueryKeys`, e buscar e
alterar dados com `useQuery` e `useMutation`, tratando os estados de carregando e
erro.

## Passo 1 — Os providers no topo

Para o React Query funcionar, o app precisa de um provider de cache no topo da
árvore. O `<AppProviders>` monta esse provider (e o tema, e o error boundary) de
uma vez. Ele já vem no `App.tsx` gerado:

```tsx
// src/App.tsx
import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Algo deu errado.</p> }}>
      <AppRouter routes={routes} fallback={<p>Carregando…</p>} />
    </AppProviders>
  );
}
```

O `<AppProviders>` aninha de fora pra dentro: `ErrorBoundary → QueryProvider →
ThemeProvider → I18nProvider → children`. **Query e Theme já vêm ligados** com os
defaults do SDK — você não configura nada pra ter cache de dados.

!!! info "Defaults do cache"

    Quando ligado por padrão, o `QueryProvider` usa: `staleTime` de 5 minutos,
    `gcTime` de 30 minutos, `retry: 1` e `refetchOnWindowFocus: false`. Para
    ajustar, passe `query={{ defaultOptions: { queries: { retry: 3 } } }}`.

## Passo 2 — O cliente HTTP com `createApiClient`

`createApiClient` cria um cliente `fetch` tipado que cuida de JSON, query params,
bearer token e tratamento de 401. Vamos centralizá-lo em `src/lib/api.ts`:

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

Peça por peça:

- `baseURL` vem do `.env` (`VITE_API_URL`) — a base de toda requisição.
- `getToken` é chamado **a cada requisição**; lendo o token via `getState()`,
  cada chamada usa o token atual e manda o header `Authorization: Bearer ...`.
- `onUnauthorized` dispara em respostas **401** — aqui deslogamos o usuário.

O cliente expõe `get`, `post`, `put`, `patch`, `delete` (todos genéricos no tipo
de retorno) e `upload`. Cada um devolve o JSON já parseado e tipado.

!!! tip "Lembra do `getToken` com `getState()`?"

    O cliente HTTP roda **fora** do React, então lê a store de auth com
    `getState()` — exatamente o padrão que você viu na página de
    [Estado](state.md). Sem hook, sem assinatura: só um snapshot do token na hora
    da chamada. 💡

## Passo 3 — Chaves de cache com `createQueryKeys`

O React Query identifica cada pedaço de cache por uma **query key**. Em vez de
espalhar arrays mágicos pelo código, centralize-as com `createQueryKeys`:

```ts
// src/lib/api.ts (continuação)
export const taskKeys = createQueryKeys("tasks", {
  all: () => ["all"] as const,
  byId: (id: string) => [id] as const,
});

// taskKeys.all()  === ["tasks", "all"]
// taskKeys.byId("42") === ["tasks", "42"]
```

Cada chave é prefixada com o domínio (`"tasks"`), então não há colisão entre
domínios diferentes.

## Passo 4 — Lendo dados com `useQuery`

Agora a lista de tarefas. `useQuery` vem do `@tanstack/react-query` (dependência
**direta** do SDK, instalada junto — você não precisa instalar nada à parte).

!!! note "De onde vem o `useQuery`"

    Os hooks `useQuery` e `useMutation` são importados de `"@tanstack/react-query"`,
    não de `"tempest-react-sdk"`. O SDK fornece o **provider** (`QueryProvider`,
    via `AppProviders`), as **chaves** (`createQueryKeys`) e os presets de tempo;
    os hooks você usa direto do React Query. Como ele é dependência direta do SDK,
    já está instalado.

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

  if (isLoading) return <p>Carregando tarefas…</p>;
  if (isError) return <p>Erro: {(error as Error).message}</p>;

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

Peça por peça:

- `queryKey: taskKeys.all()` identifica este cache — outros componentes que usem a
  mesma chave compartilham o mesmo dado.
- `queryFn` faz a requisição. `api.get<Task[]>("/tasks")` devolve um `Task[]` já
  tipado.
- `isLoading` / `isError` / `error` são os **estados** que o React Query mantém
  pra você — trate-os antes de renderizar os dados.

## Passo 5 — Alterando dados com `useMutation`

Buscar é só metade. Para **criar** uma tarefa, use `useMutation` (também do
`@tanstack/react-query`). Depois do sucesso, invalidamos a query da lista para que
ela seja buscada de novo com a tarefa nova.

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
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Salvando…" : "Adicionar"}
      </button>
      {mutation.isError && <p>Erro ao salvar.</p>}
    </form>
  );
}
```

Peça por peça:

- `mutationFn` recebe o argumento de `mutation.mutate(...)` e faz o `POST`. Note o
  `{ body: {...} }` — o `createApiClient` serializa o `body` em JSON pra você.
- `onSuccess` invalida `taskKeys.all()`: o React Query re-busca a lista
  automaticamente, e a `<Home>` mostra a tarefa nova sem você recarregar a página.
- `mutation.isPending` desabilita o botão durante o envio; `mutation.isError`
  mostra o erro.

!!! tip "Por que invalidar em vez de inserir na mão"

    Invalidar a query (`invalidateQueries`) deixa o servidor ser a fonte de
    verdade: você re-busca a lista e ganha o `id` real, timestamps, qualquer campo
    que o backend preencheu. É mais robusto do que tentar inserir o objeto otimista
    na lista local. ✅

## Recap

- O `<AppProviders>` monta o `QueryProvider` (cache) **ligado por padrão** — sem
  config você já tem React Query funcionando. ✅
- **`createApiClient({ baseURL, getToken, onUnauthorized })`** cria um cliente
  `fetch` tipado: `getToken` injeta o bearer a cada chamada, `onUnauthorized`
  dispara em 401. Lê a auth store com `getState()`.
- **`createQueryKeys("dominio", {...})`** centraliza as chaves de cache, prefixadas
  pelo domínio.
- **`useQuery`** (de `@tanstack/react-query`, dependência direta do SDK) busca
  dados e te dá `isLoading` / `isError` / `data`.
- **`useMutation`** + `queryClient.invalidateQueries(...)` altera dados e re-busca
  a lista — o servidor continua sendo a fonte de verdade.

➡️ **Próxima página:** [Formulários — validação com zod e máscaras BR](forms.md)
