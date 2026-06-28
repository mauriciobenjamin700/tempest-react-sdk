# Data Provider (CRUD)

A [Refine](https://refine.dev)-style CRUD layer wired to the pagination and endpoint conventions of the [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/). Instead of hand-writing a `queryFn` for every list, every `getOne`, and every create/edit/delete mutation, you describe **the resource** (`"posts"`, `"users"`) and the SDK builds the URL, serializes pagination/sort/filters, and invalidates the right cache on success.

!!! info "Why a data provider on top of `createApiClient` + TanStack Query?"
    [`createApiClient`](./http.md) gives you typed fetch and [Query](./query.md) gives you caching. What's missing is the **repetitive glue**: translating `{ page, sort, filters }` into `?page=&size=&order_by=&ascending=`, choosing PATCH vs PUT, and remembering to invalidate the list after a create. The data provider centralizes that pattern once, aligned to the FastAPI backend conventions. You trade dozens of near-identical `useQuery`/`useMutation` calls for `useList("posts")`, `useCreate("posts")`, and so on.

## When to use

- CRUD screens: paginated lists, detail views, create/edit forms, delete buttons.
- Backends that follow the `tempest-fastapi-sdk` conventions (offset pagination `BasePaginationSchema`, `/{resource}` and `/{resource}/{id}` endpoints).
- When you want caching + automatic invalidation without writing `queryKey`/`invalidateQueries` by hand on every screen.

For calls that are **not** resource CRUD (RPC, aggregations, custom endpoints), keep using [`createApiClient`](./http.md) directly.

## `createDataProvider`

Create the provider once from your `apiClient`, then hand it to the tree via `<TempestDataProvider>`:

```ts
import { createApiClient, createDataProvider } from "tempest-react-sdk";

const apiClient = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
});

export const dataProvider = createDataProvider(apiClient);
```

`createDataProvider(client, options?)` takes the HTTP client and an optional overrides object. The defaults already match the `tempest-fastapi-sdk`:

| Option               | Default        | What it controls                                                                          |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `pageParam`          | `"page"`       | Query-param name for the page number.                                                     |
| `sizeParam`          | `"size"`       | Query-param name for the page size.                                                       |
| `sortFieldParam`     | `"order_by"`   | Query-param name for the sort field.                                                      |
| `sortOrderParam`     | `"ascending"`  | Query-param name for the sort direction.                                                  |
| `sortOrderAsBoolean` | `true`         | `true` → emit a boolean (`order:"asc"` becomes `true`). `false` → emit `"asc"`/`"desc"`.  |
| `updateMethod`       | `"patch"`      | HTTP method used by `update` (`"patch"` or `"put"`).                                       |
| `buildPath`          | see below      | Builds the resource path. Default: `id == null ? "/{resource}" : "/{resource}/{id}"`.     |

!!! note "The defaults follow the `tempest-fastapi-sdk`"
    `BasePaginationFilterSchema` uses `page`/`size`/`order_by`/`ascending`, and `ascending` is a boolean. That's why `sortOrderAsBoolean` defaults to `true`. If your backend expects `?sort=desc` instead of `?ascending=false`, tweak `sortOrderParam` and `sortOrderAsBoolean`.

Example with overrides — a backend that paginates with `pageSize` and sorts with literal `asc`/`desc`:

```ts
import { createApiClient, createDataProvider } from "tempest-react-sdk";

const apiClient = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

export const dataProvider = createDataProvider(apiClient, {
  sizeParam: "pageSize",
  sortOrderAsBoolean: false, // emit literal "asc"/"desc"
  updateMethod: "put", // PUT instead of PATCH
  buildPath: (resource, id) => (id == null ? `/api/${resource}` : `/api/${resource}/${id}`),
});
```

### How each call maps to a request

| Provider method                    | HTTP request                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| `getList("posts", params)`         | `GET /posts?page=&size=&order_by=&ascending=&...filters`     |
| `getOne("posts", id)`              | `GET /posts/{id}`                                            |
| `getMany("posts", ids)`            | `getOne` in parallel for each id                            |
| `create("posts", data)`            | `POST /posts`                                                |
| `update("posts", id, data)`        | `PATCH /posts/{id}` (or `PUT` with `updateMethod: "put"`)    |
| `deleteOne("posts", id)`           | `DELETE /posts/{id}`                                         |

## Provider in the tree

Wrap the app with `<TempestDataProvider>`, passing the provider you created. It **must** sit below a [`<QueryProvider>`](./query.md) — the resource hooks use the `QueryClient` underneath:

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

!!! warning "`<QueryProvider>` on top, always"
    `useList`/`useOne`/`useCreate`/… call `useQuery`/`useMutation` internally. Without a `<QueryProvider>` (or another `QueryClientProvider`) above them in the tree, they throw TanStack Query's "No QueryClient set" error. And without a `<TempestDataProvider>` above them, the hooks throw `useDataProvider must be used within a <TempestDataProvider>`.

## The resource hooks

All of them resolve the provider from context — you only supply the resource name and, optionally, the parameters.

- `useList<T>(resource, params?, options?)` → `UseQueryResult<OffsetPage<T>, Error>`
- `useOne<T>(resource, id, options?)` → `UseQueryResult<T, Error>` (disabled while `id` is `null`/`undefined`)
- `useCreate<T>(resource, options?)` → mutation; `mutate(data)`
- `useUpdate<T>(resource, options?)` → mutation; `mutate({ id, data })`
- `useDelete<T>(resource, options?)` → mutation; `mutate(id)`

The mutations invalidate the right cache on success:

| Hook        | Invalidated in `onSuccess`                       |
| ----------- | ------------------------------------------------ |
| `useCreate` | the resource list                                |
| `useUpdate` | the list **and** the `useOne` record for that id |
| `useDelete` | the resource list                                |

!!! tip "You still pass TanStack Query options"
    Each hook accepts a final `options` argument that flows through to the underlying `useQuery`/`useMutation` (minus `queryKey`/`queryFn`/`mutationFn`, which the SDK controls). So `staleTime`, `placeholderData`, `onError`, and `onSuccess` (called **after** the SDK's invalidation) all keep working.

### The `OffsetPage<T>` envelope

`useList` resolves with the offset-pagination envelope from the `tempest-fastapi-sdk` — you map nothing by hand:

```ts
interface OffsetPage<T> {
  items: T[]; // the rows for the current page
  total: number; // total matching rows across all pages
  page: number; // current page (1-based)
  pages: number; // total number of pages
  size?: number; // page size (fastapi-pagination convention)
  page_size?: number; // page size (alternative convention)
}
```

## Complete example — a "posts" resource

Paginated + sorted + filtered list, create via mutation, and invalidation happening on its own:

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

  // POST /posts — invalidates the "posts" list on success, no extra code
  const createPost = useCreate<Post>("posts");

  if (isLoading) return <p>Loading…</p>;
  if (isError) return <p>Failed to load posts.</p>;

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
        Published only
      </label>

      <button
        disabled={createPost.isPending}
        onClick={() => createPost.mutate({ title: "New post", published: false })}
      >
        Create post
      </button>

      <ul>
        {pageData.items.map((post) => (
          <li key={post.id}>
            {post.title} {post.published ? "✅" : "📝"}
          </li>
        ))}
      </ul>

      <footer>
        Page {pageData.page} of {pageData.pages} — {pageData.total} total
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <button disabled={page >= pageData.pages} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </footer>
    </div>
  );
}
```

And an edit screen using `useOne` + `useUpdate` + `useDelete`:

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
    onSuccess: () => console.log("post removed"),
  });

  if (isLoading || !post) return <p>Loading…</p>;

  return (
    <div>
      <h2>{post.title}</h2>

      <button
        disabled={updatePost.isPending}
        // PATCH /posts/{id} — invalidates the list AND the useOne for this id
        onClick={() => updatePost.mutate({ id: post.id, data: { published: !post.published } })}
      >
        {post.published ? "Unpublish" : "Publish"}
      </button>

      <button disabled={deletePost.isPending} onClick={() => deletePost.mutate(post.id)}>
        Delete
      </button>
    </div>
  );
}
```

!!! note "`useOne` disables itself without an `id`"
    When `id` is `null`/`undefined`, `useOne` doesn't fire the fetch (`enabled: false`). Handy for screens that receive the id asynchronously (route, selection) — no manual `enabled` needed in the common case. You can still pass `enabled` in `options` to combine it with another condition.

## Recap

- `createDataProvider(client, options?)` turns an `apiClient` into a Refine-style CRUD provider with defaults aligned to the `tempest-fastapi-sdk` (`page`/`size`/`order_by`/`ascending`, boolean `ascending`, PATCH on update).
- Wrap the tree with `<TempestDataProvider provider={…}>` **below** a `<QueryProvider>`.
- `useList` resolves an `OffsetPage<T>` (`items`/`total`/`page`/`pages`); `useOne` fetches a record and disables itself without an `id`.
- `useCreate` / `useUpdate` / `useDelete` are mutations that invalidate the right cache on success — list (create/delete) or list + record (update).
- Backend off-convention? Tweak `pageParam`/`sizeParam`/`sortFieldParam`/`sortOrderParam`/`sortOrderAsBoolean`/`updateMethod`/`buildPath`.

## See also

- [HTTP](./http.md) — the `createApiClient` that feeds the data provider
- [Query](./query.md) — the required `<QueryProvider>` on top
- [Access Control](./access-control.md) — gate CRUD actions by role/permission
