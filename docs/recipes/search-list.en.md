# Paginated list with search and sorting

In Loja Aurora's dashboard, two screens look alike and are not. The **Equipe** (team)
screen lists the 40 people with dashboard access. The **Clientes** (customers) screen
lists 48 thousand buyers. Both need search, sorting by column, pagination and a decent
message when nothing shows up. 🔎

The difference is **where** the search runs. Forty rows fit in the browser: the
[`DataTable<T>`](../components/advanced-data.md#datatablet) does everything in memory.
Forty-eight thousand do not: the backend paginates, filters and sorts, and the table
only shows the page that arrived. This recipe shows both, with the same component.

!!! info "Before you start"
    This recipe uses the `api` client from the
    [Full authentication flow](auth-flow.md) recipe and the `QueryProvider` that already
    ships in [`<AppProviders>`](../app-providers.md). Install in
    [manual install](../index.md#manual-install).

## What we are building

- 👥 **Equipe**: a small list, search and sorting in the browser.
- 🛍️ **Clientes**: a large list, debounced search, sorting and pagination on the server.
- ⏳ **Loading**: skeleton rows at the real height, no jumping table.
- 🫙 **Empty**: one screen for "no customers yet" and another for "the search found
  nothing".
- ❌ **Error**: a message and a **Tentar de novo** (try again) button.
- 📱 **Mobile**: less important columns disappear on narrow screens.

## Screen 1: the small list (client-side)

The backend returns the whole list:

```text
GET /api/team
200 → [ { "id": 1, "name": "Marina Souza", "email": "marina@lojaaurora.com.br", "role": "Gerente" }, ... ]
```

```tsx
// src/pages/Team.tsx
import { useQuery } from "@tanstack/react-query";
import { DataTable, ErrorState, Page, type DataTableColumn } from "tempest-react-sdk";
import { api } from "@/lib/api";

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
}

const columns: DataTableColumn<Member>[] = [
  { key: "name", header: "Nome", sortable: true },
  { key: "email", header: "E-mail", priority: "tablet" },
  { key: "role", header: "Papel", sortable: true, align: "right" },
];

export function Team() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["team"],
    queryFn: () => api.get<Member[]>("/team"),
  });

  return (
    <Page title="Equipe" description="Quem tem acesso ao painel da loja.">
      {isError ? (
        <ErrorState
          title="Não foi possível carregar a equipe"
          description="Confira sua conexão e tente de novo."
          retryLabel="Tentar de novo"
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          searchable
          searchKeys={["name", "email"]}
          pageSize={10}
          initialSort={{ key: "name", direction: "asc" }}
          rowKey={(row) => row.id}
          emptyMessage="Nenhuma pessoa encontrada"
          loading={isLoading}
        />
      )}
    </Page>
  );
}
```

### What happens here

- `DataTable` receives the **complete** dataset in `data` and handles search, sorting
  and pagination in the browser. Columns with `sortable: true` sort when the header is
  clicked: asc → desc → unsorted.
- `searchable` adds a search box above the table. It filters by a piece of the text,
  case-insensitive. `searchKeys` limits the search to name and e-mail, so "gerente"
  does not match the role column.
- `loading={isLoading}` draws skeleton rows while the first answer has not arrived.
  "I am fetching" and "there is nothing" are different sentences, and `emptyMessage`
  only shows for the second.
- `ErrorState` shows the failure with a button that calls `refetch()`. See
  [`ErrorState`](../components/feedback.md#errorstate).

!!! tip "How many rows can client-side take?"
    A few hundred, easily. Past a thousand, or when the list grows without limit
    (customers, orders, invoices), go to screen 2. Besides the weight, filtering only
    what is in memory lies to the person searching: the record that did not arrive
    looks like it does not exist.

## Screen 2: the large list (server-side)

Here the contract is the `tempest-fastapi-sdk` pagination envelope, the same as
`fastapi-pagination` (see [Pagination](../integration-fastapi.md#4-pagination)):

```text
GET /api/clientes?page=2&size=20&order_by=nome&ascending=true&q=souza
200 → {
  "items": [
    { "id": "c_91", "nome": "Ana Souza", "email": "ana@email.com", "cpf": "39053344705",
      "cidade": "Recife", "uf": "PE", "total_gasto": 1890.5, "ativo": true }
  ],
  "total": 312, "page": 2, "size": 20, "pages": 16
}
```

```tsx
// src/pages/Customers.tsx
import { useState } from "react";
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  formatCPF,
  formatCurrency,
  useDebounce,
  usePaginatedQuery,
  type DataTableColumn,
  type DataTableSort,
  type OffsetPage,
} from "tempest-react-sdk";
import { api } from "@/lib/api";

interface Customer {
  id: string;
  nome: string;
  email: string;
  cpf: string;
  cidade: string;
  uf: string;
  total_gasto: number;
  ativo: boolean;
}

const PAGE_SIZE = 20;

const columns: DataTableColumn<Customer>[] = [
  { key: "nome", header: "Nome", sortable: true },
  { key: "cpf", header: "CPF", priority: "desktop", render: (row) => formatCPF(row.cpf) },
  {
    key: "cidade",
    header: "Cidade",
    priority: "tablet",
    render: (row) => `${row.cidade}/${row.uf}`,
  },
  {
    key: "total_gasto",
    header: "Total gasto",
    sortable: true,
    align: "right",
    render: (row) => formatCurrency(row.total_gasto),
  },
  {
    key: "ativo",
    header: "Situação",
    render: (row) => (
      <Badge variant={row.ativo ? "success" : "neutral"}>{row.ativo ? "Ativo" : "Inativo"}</Badge>
    ),
  },
];

export function Customers() {
  const [term, setTerm] = useState<string>("");
  const [sort, setSort] = useState<DataTableSort<Customer> | null>({
    key: "nome",
    direction: "asc",
  });
  const search = useDebounce(term, 400);

  const customers = usePaginatedQuery<Customer>({
    queryKey: ["clientes", search, sort],
    pageSize: PAGE_SIZE,
    orderBy: sort ? String(sort.key) : undefined,
    ascending: sort ? sort.direction === "asc" : undefined,
    queryFn: (params) =>
      api.get<OffsetPage<Customer>>("/clientes", {
        params: { ...params, q: search || undefined },
      }),
  });

  if (customers.error) {
    return (
      <ErrorState
        title="Não foi possível carregar os clientes"
        description="O servidor não respondeu. Tente de novo em instantes."
        retryLabel="Tentar de novo"
        onRetry={customers.refetch}
      />
    );
  }

  if (!customers.isLoading && customers.total === 0 && search === "") {
    return (
      <EmptyState
        title="Nenhum cliente ainda"
        description="Os clientes aparecem aqui depois da primeira compra na loja."
      />
    );
  }

  return (
    <Page title="Clientes" description={`${customers.total} clientes cadastrados`}>
      <DataTable
        data={customers.items}
        columns={columns}
        rowKey={(row) => row.id}
        pageSize={PAGE_SIZE}
        totalItems={customers.total}
        page={customers.pageNumber}
        onPageChange={customers.setPage}
        initialSort={{ key: "nome", direction: "asc" }}
        onSortChange={setSort}
        searchable
        onSearchChange={setTerm}
        emptyMessage={`Nenhum cliente encontrado para "${search}"`}
        loading={customers.isFetching}
      />
    </Page>
  );
}
```

### Piece by piece

**`totalItems` turns on server mode.** With it, `data` becomes just the current page,
the page count comes from `total`, and search and sorting become events
(`onSearchChange`, `onSortChange`) instead of in-memory filters. See
[`DataTable<T>` — server-side pagination](../components/data.md#datatablet-server-side-pagination).

**`usePaginatedQuery` is the other half.** It keeps the page, sends `page` and `size`
to your `queryFn` and returns `items`, `total`, `pageNumber` and `setPage`: exactly the
props the table asks for. With `orderBy` set, it also sends `order_by` and `ascending`.
The previous page stays on screen while the next one loads, so the table does not
flicker.

**The search is debounced.** The table reports every keystroke in `onSearchChange`.
`useDebounce(term, 400)` only hands over the term once the person stops typing for
400 ms. Without it, "souza" would be five requests. See
[`useDebounce`](../hooks.md#debounced-search-usedebounce).

**A new filter goes back to page 1.** `search` and `sort` are in the `queryKey`. When it
changes, `usePaginatedQuery` goes back to page 1 in the same render, without first
asking for page 7 of a result that only has 2.

!!! check "The screen's states"
    - ⏳ **First load**: `loading` with no rows draws skeletons at the real height.
    - 🔄 **Changing page**: `loading` with rows dims the table and sets `aria-busy`.
      The old rows stay, and the paginator does not jump under the finger.
    - 🫙 **Store with no customers**: `EmptyState` replaces the whole table. See
      [`EmptyState`](../components/feedback.md#emptystate).
    - 🔍 **Search with no result**: the table stays, with the `emptyMessage` and the
      search box at hand to fix the term.
    - ❌ **Error**: `ErrorState` with `onRetry={customers.refetch}`.

### And on a phone? 📱

`priority` decides who leaves first when the screen narrows. `"tablet"` hides below
768 px and `"desktop"` below 1024 px. On a phone, **Nome**, **Total gasto** and
**Situação** stay, which is what the clerk needs at the counter. The CPF shows on the
computer, where there is room.

!!! warning "Search and sorting must go to the server together"
    In server mode, `searchable` without `onSearchChange` would filter only the page on
    screen. The person would type "Souza", not see Ana Souza on page 9 and conclude she
    does not exist. With `totalItems`, the table already delegates the search. Your job
    is to send the term to the backend.

??? note "And the backend?"
    On the FastAPI side, `tempest-fastapi-sdk` delivers the `{ items, total, page,
    size, pages }` envelope and reads `page`, `size`, `order_by` and `ascending` from
    the query. `q` is yours: an `ILIKE` on name, e-mail and CPF covers most screens. If
    your backend uses `page_size` instead of `size`, pass `sizeParam: "page_size"` to
    `usePaginatedQuery`.

## Recap

- ✅ **Small list**: `DataTable` with the complete `data`, `searchable` and `sortable`
  does everything in the browser.
- ✅ **Large list**: `totalItems` + `page` + `onPageChange` turn on server mode, and
  `usePaginatedQuery` hands over those props ready.
- ✅ `useDebounce` holds the search; `search` and `sort` in the `queryKey` go back to
  page 1.
- ✅ `loading`, `EmptyState`, `emptyMessage` and `ErrorState` cover loading, empty,
  search with no result and error.
- ✅ `priority` on the columns solves mobile.
