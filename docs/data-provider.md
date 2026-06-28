# Data Provider (CRUD)

Camada de CRUD no estilo [Refine](https://refine.dev) fiada nas convenções de paginação e endpoints do [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/). Em vez de escrever uma `queryFn` à mão para cada lista, cada `getOne`, cada mutation de criar/editar/excluir, você descreve **o recurso** (`"posts"`, `"users"`) e o SDK monta a URL, serializa paginação/ordenação/filtros e invalida o cache certo no sucesso.

!!! info "Por que um data provider em cima do `createApiClient` + TanStack Query?"
    O [`createApiClient`](./http.md) entrega fetch tipado e a [Query](./query.md) entrega cache. O que falta é a **cola repetitiva**: traduzir `{ page, sort, filters }` para `?page=&size=&order_by=&ascending=`, escolher PATCH vs PUT, e lembrar de invalidar a lista depois de criar. O data provider centraliza esse padrão uma vez, alinhado às convenções do backend FastAPI. Você troca dezenas de `useQuery`/`useMutation` quase idênticos por `useList("posts")`, `useCreate("posts")`, etc.

## Quando usar

- Telas de CRUD: listagens paginadas, detalhe, formulários de criar/editar, botão de excluir.
- Backends que seguem as convenções do `tempest-fastapi-sdk` (paginação offset `BasePaginationSchema`, endpoints `/{resource}` e `/{resource}/{id}`).
- Quando você quer cache + invalidação automática sem escrever `queryKey`/`invalidateQueries` à mão em cada tela.

Para chamadas que **não** são CRUD de recurso (RPC, agregações, endpoints custom), continue usando o [`createApiClient`](./http.md) direto.

## `createDataProvider`

Crie o provider uma vez, a partir do seu `apiClient`, e passe-o para a árvore via `<TempestDataProvider>`:

```ts
import { createApiClient, createDataProvider } from "tempest-react-sdk";

const apiClient = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
});

export const dataProvider = createDataProvider(apiClient);
```

`createDataProvider(client, options?)` recebe o cliente HTTP e um objeto opcional de overrides. Os defaults já casam com o `tempest-fastapi-sdk`:

| Opção                | Default        | Para que serve                                                                              |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `pageParam`          | `"page"`       | Nome do query-param do número da página.                                                    |
| `sizeParam`          | `"size"`       | Nome do query-param do tamanho da página.                                                   |
| `sortFieldParam`     | `"order_by"`   | Nome do query-param do campo de ordenação.                                                  |
| `sortOrderParam`     | `"ascending"`  | Nome do query-param da direção da ordenação.                                                |
| `sortOrderAsBoolean` | `true`         | `true` → emite booleano (`order:"asc"` vira `true`). `false` → emite `"asc"`/`"desc"`.      |
| `updateMethod`       | `"patch"`      | Método HTTP usado por `update` (`"patch"` ou `"put"`).                                       |
| `buildPath`          | ver abaixo     | Monta o path do recurso. Default: `id == null ? "/{resource}" : "/{resource}/{id}"`.        |

!!! note "Os defaults seguem o `tempest-fastapi-sdk`"
    `BasePaginationFilterSchema` usa `page`/`size`/`order_by`/`ascending`, e `ascending` é um booleano. Por isso `sortOrderAsBoolean` é `true` por default. Se o seu backend espera `?sort=desc` em vez de `?ascending=false`, ajuste `sortOrderParam` e `sortOrderAsBoolean`.

Exemplo com overrides — um backend que pagina com `pageSize` e ordena com `sort=field:desc` num único param:

```ts
import { createApiClient, createDataProvider } from "tempest-react-sdk";

const apiClient = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

export const dataProvider = createDataProvider(apiClient, {
  sizeParam: "pageSize",
  sortOrderAsBoolean: false, // emite "asc"/"desc" literais
  updateMethod: "put", // PUT em vez de PATCH
  buildPath: (resource, id) => (id == null ? `/api/${resource}` : `/api/${resource}/${id}`),
});
```

### Como cada chamada vira uma requisição

| Método do provider                 | Requisição HTTP                                                |
| ---------------------------------- | ------------------------------------------------------------- |
| `getList("posts", params)`         | `GET /posts?page=&size=&order_by=&ascending=&...filters`      |
| `getOne("posts", id)`              | `GET /posts/{id}`                                             |
| `getMany("posts", ids)`            | `getOne` em paralelo para cada id                            |
| `create("posts", data)`            | `POST /posts`                                                 |
| `update("posts", id, data)`        | `PATCH /posts/{id}` (ou `PUT` com `updateMethod: "put"`)      |
| `deleteOne("posts", id)`           | `DELETE /posts/{id}`                                          |

## Provider na árvore

Envolva o app com `<TempestDataProvider>` passando o provider criado. Ele **precisa** estar abaixo de um [`<QueryProvider>`](./query.md) — os hooks de recurso usam o `QueryClient` por baixo:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryProvider, TempestDataProvider } from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";
import { App } from "./App";
import { dataProvider } from "./data-provider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <TempestDataProvider provider={dataProvider}>
        <App />
      </TempestDataProvider>
    </QueryProvider>
  </StrictMode>,
);
```

!!! warning "`<QueryProvider>` por cima, sempre"
    `useList`/`useOne`/`useCreate`/… chamam `useQuery`/`useMutation` internamente. Sem um `<QueryProvider>` (ou outro `QueryClientProvider`) acima na árvore, eles lançam o erro do TanStack Query "No QueryClient set". E sem um `<TempestDataProvider>` acima, os hooks lançam `useDataProvider must be used within a <TempestDataProvider>`.

## Os hooks de recurso

Todos resolvem o provider via contexto — você só informa o nome do recurso e, opcionalmente, os parâmetros.

- `useList<T>(resource, params?, options?)` → `UseQueryResult<OffsetPage<T>, Error>`
- `useOne<T>(resource, id, options?)` → `UseQueryResult<T, Error>` (desabilitado enquanto `id` for `null`/`undefined`)
- `useCreate<T>(resource, options?)` → mutation; `mutate(data)`
- `useUpdate<T>(resource, options?)` → mutation; `mutate({ id, data })`
- `useDelete<T>(resource, options?)` → mutation; `mutate(id)`

As mutations já invalidam o cache certo no sucesso:

| Hook        | Invalida no `onSuccess`                          |
| ----------- | ----------------------------------------------- |
| `useCreate` | a lista do recurso                              |
| `useUpdate` | a lista **e** o registro `useOne` daquele `id`  |
| `useDelete` | a lista do recurso                              |

!!! tip "Você ainda passa opções do TanStack Query"
    Cada hook aceita um último argumento `options` que é repassado para o `useQuery`/`useMutation` por baixo (menos `queryKey`/`queryFn`/`mutationFn`, que o SDK controla). Então `staleTime`, `placeholderData`, `onError`, `onSuccess` (chamado **depois** da invalidação do SDK) continuam funcionando normalmente.

### O envelope `OffsetPage<T>`

`useList` resolve com o envelope de paginação offset do `tempest-fastapi-sdk` — você não mapeia nada à mão:

```ts
interface OffsetPage<T> {
  items: T[]; // as linhas da página atual
  total: number; // total de registros que casam, em todas as páginas
  page: number; // página atual (1-based)
  pages: number; // total de páginas
  size?: number; // tamanho da página (convenção fastapi-pagination)
  page_size?: number; // tamanho da página (convenção alternativa)
}
```

## Exemplo completo — recurso "posts"

Listagem paginada + ordenada + filtrada, criação via mutation, e a invalidação acontecendo sozinha:

```tsx
import { useState } from "react";
import { useList, useCreate } from "tempest-react-sdk";

interface Post {
  id: string;
  title: string;
  published: boolean;
}

export function PostsPage() {
  const [page, setPage] = useState(1);
  const [onlyPublished, setOnlyPublished] = useState(false);

  // GET /posts?page=1&size=20&order_by=created_at&ascending=false&published=true
  const { data, isLoading, isError } = useList<Post>("posts", {
    pagination: { page, pageSize: 20 },
    sort: { field: "created_at", order: "desc" },
    filters: onlyPublished ? { published: true } : undefined,
  });

  // POST /posts — invalida a lista de "posts" no sucesso, sem código extra
  const createPost = useCreate<Post>("posts");

  if (isLoading) return <p>Carregando…</p>;
  if (isError) return <p>Erro ao carregar posts.</p>;

  const pageData = data!; // OffsetPage<Post>

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={onlyPublished}
          onChange={(e) => {
            setOnlyPublished(e.target.checked);
            setPage(1);
          }}
        />
        Só publicados
      </label>

      <button
        disabled={createPost.isPending}
        onClick={() => createPost.mutate({ title: "Novo post", published: false })}
      >
        Criar post
      </button>

      <ul>
        {pageData.items.map((post) => (
          <li key={post.id}>
            {post.title} {post.published ? "✅" : "📝"}
          </li>
        ))}
      </ul>

      <footer>
        Página {pageData.page} de {pageData.pages} — {pageData.total} no total
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <button disabled={page >= pageData.pages} onClick={() => setPage((p) => p + 1)}>
          Próxima
        </button>
      </footer>
    </div>
  );
}
```

E uma tela de edição usando `useOne` + `useUpdate` + `useDelete`:

```tsx
import { useOne, useUpdate, useDelete } from "tempest-react-sdk";

interface Post {
  id: string;
  title: string;
  published: boolean;
}

export function EditPost({ id }: { id: string }) {
  const { data: post, isLoading } = useOne<Post>("posts", id);

  const updatePost = useUpdate<Post>("posts");
  const deletePost = useDelete<Post>("posts", {
    onSuccess: () => console.log("post removido"),
  });

  if (isLoading || !post) return <p>Carregando…</p>;

  return (
    <div>
      <h2>{post.title}</h2>

      <button
        disabled={updatePost.isPending}
        // PATCH /posts/{id} — invalida a lista E o useOne deste id
        onClick={() => updatePost.mutate({ id: post.id, data: { published: !post.published } })}
      >
        {post.published ? "Despublicar" : "Publicar"}
      </button>

      <button disabled={deletePost.isPending} onClick={() => deletePost.mutate(post.id)}>
        Excluir
      </button>
    </div>
  );
}
```

!!! note "`useOne` se desabilita sozinho sem `id`"
    Quando `id` é `null`/`undefined`, o `useOne` não dispara o fetch (`enabled: false`). Útil em telas que recebem o id de forma assíncrona (rota, seleção) — não precisa de `enabled` manual no caso comum. Você ainda pode passar `enabled` em `options` para combinar com outra condição.

## Recap

- `createDataProvider(client, options?)` transforma um `apiClient` num provider CRUD no estilo Refine, com defaults alinhados ao `tempest-fastapi-sdk` (`page`/`size`/`order_by`/`ascending`, `ascending` booleano, PATCH no update).
- Envolva a árvore com `<TempestDataProvider provider={…}>` **abaixo** de um `<QueryProvider>`.
- `useList` resolve um `OffsetPage<T>` (`items`/`total`/`page`/`pages`); `useOne` busca um registro e se desabilita sem `id`.
- `useCreate` / `useUpdate` / `useDelete` são mutations que invalidam o cache certo no sucesso — lista (create/delete) ou lista + registro (update).
- Backends fora da convenção? Ajuste `pageParam`/`sizeParam`/`sortFieldParam`/`sortOrderParam`/`sortOrderAsBoolean`/`updateMethod`/`buildPath`.

## Veja também

- [HTTP](./http.md) — o `createApiClient` que alimenta o data provider
- [Query](./query.md) — o `<QueryProvider>` obrigatório por cima
- [Access Control](./access-control.md) — restringir ações de CRUD por papel/permissão
