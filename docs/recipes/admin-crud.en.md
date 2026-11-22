# CRUD admin panel

You work on the back-office of **Mercadinho Ipê**, a chain of neighbourhood grocery stores. The
catalogue team spends the day on this screen: they register the coffee that just arrived, fix the
price of the dish soap, archive the juice that was discontinued and bulk-delete yesterday's
duplicated import drafts.

There are 4,000 products. Nobody scrolls a full list: people search, filter, sort, edit and go
back. And they paste the link of the filtered screen in the team chat — so the filter has to live
**in the URL**.

In this recipe you build that screen end to end with the SDK. 🚀

## What we will build

A `/produtos` page with:

- 🔎 **Debounced search** by name or SKU — one request when the person stops typing, not one per
  key.
- 🏷️ Category and status **filters**, column **sorting** and **server-side pagination**, all kept
  in the URL (`/produtos?busca=café&categoria=mercearia&pagina=2`). Reloading, going back and
  sharing the link bring back the same screen.
- ➕ **Create and edit** in a side `Drawer` (a bottom sheet on phones), with a zod-validated form
  and backend errors showing up on the right field.
- 🗑️ **Delete** one product or **several at once**, always behind a confirmation.
- 🔔 Success and error **toasts**, plus the states a real screen has: loading, empty, empty because
  of the filter, error with "try again", and the phone layout.

The SDK pieces involved:

| Piece | What for | Docs |
| --- | --- | --- |
| `createApiClient` + `createDataProvider` | HTTP client and per-resource CRUD | [HTTP](../http.md), [Data Provider](../data-provider.md#createdataprovider) |
| `useList` / `useCreate` / `useUpdate` / `useDelete` | cache and invalidation via TanStack Query | [The resource hooks](../data-provider.md#the-resource-hooks) |
| `DataTable` | table with server-side pagination, sorting and page size | [Server-side `DataTable`](../components/data.md#datatablet-server-side-pagination) |
| `Drawer` | the form panel | [`Drawer`](../components/overlay.md#drawer) |
| `useZodForm` + `FormField` + `MoneyInput` | validated form, price in cents | [Forms](../forms.md#end-to-end-example-schema-provider-fields-submit), [`MoneyInput`](../forms-br.md#masked-inputs) |
| `ConfirmDialog` + `DropdownMenu` | confirmation and per-row menu | [`ConfirmDialog`](../components/actions.md#confirmdialog), [menu in a row](../components/actions.md#in-a-table-row) |
| `useToast`, `EmptyState`, `ErrorState`, `Badge` | feedback | [Feedback](../components/feedback.md#toast) |
| `useSearchParams`, `useDebounce`, `useLatestRef` | URL and search | [Routing](../routing.md#everything-that-comes-from-react-router), [Hooks](../hooks.md#debounced-search-usedebounce) |

## The backend contract

The backend is a FastAPI service built on `tempest-fastapi-sdk`, with the offset pagination
envelope the SDK already knows (see [FastAPI integration](../integration-fastapi.md#4-pagination)):

```text
GET    /api/products?page=2&size=20&order_by=price_cents&ascending=false&search=café&category=mercearia&status=active
POST   /api/products
PATCH  /api/products/{id}
DELETE /api/products/{id}
```

The list responds like this:

```json
{
  "items": [
    {
      "id": "3f2c9a10",
      "name": "Café torrado e moído 500 g",
      "sku": "MER-CAFE-500",
      "category": "mercearia",
      "price_cents": 1890,
      "stock": 42,
      "status": "active",
      "updated_at": "2026-11-20T14:03:00Z"
    }
  ],
  "total": 137,
  "page": 2,
  "size": 20,
  "pages": 7
}
```

And a repeated SKU on create comes back as `409`, with the field and a stable code:

```json
{ "detail": { "detail": "SKU já cadastrado", "field": "sku" }, "code": "PRODUCT_SKU_TAKEN" }
```

!!! tip "Price in cents, always"
    `price_cents: 1890` is R$ 18.90. Integers don't have the float `0.1 + 0.2` problem, and the
    SDK's [`MoneyInput`](../forms-br.md#masked-inputs) and `Money` already work in cents.

!!! note "The UI copy is in Portuguese"
    The app is Brazilian, so labels, toasts and URL parameter names in the code are in pt-BR. The
    code is the same as in the Portuguese page.

## File by file

The structure looks like this:

```text
src/
├── main.tsx
├── lib/
│   └── api.ts
└── features/products/
    ├── product.ts
    ├── use-product-filters.ts
    ├── ProductFormDrawer.tsx
    └── ProductsPage.tsx
```

### 1. The client and the data provider

```ts
// src/lib/api.ts
import { createApiClient, createDataProvider } from "tempest-react-sdk";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  prefix: "/api",
});

export const dataProvider = createDataProvider(api);
```

One client, one provider, created once. With `prefix: "/api"`, the `"products"` resource becomes
`/api/products`. The `createDataProvider` defaults already speak `page`/`size`/`order_by`/`ascending`,
so there is nothing to configure.

!!! note "What about sign-in?"
    An admin panel has sign-in. Here the client has no `getToken` so the recipe stays on CRUD; the
    [authentication](auth-flow.md) recipe shows the client with token and refresh.

### 2. The providers

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AppProviders,
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  TempestDataProvider,
  ToastProvider,
} from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";

import { dataProvider } from "@/lib/api";
import { ProductsPage } from "@/features/products/ProductsPage";

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado no index.html");

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <ToastProvider position="top-center">
        <TempestDataProvider provider={dataProvider}>
          <BrowserRouter>
            <Routes>
              <Route path="/produtos" element={<ProductsPage />} />
              <Route path="*" element={<Navigate to="/produtos" replace />} />
            </Routes>
          </BrowserRouter>
        </TempestDataProvider>
      </ToastProvider>
    </AppProviders>
  </StrictMode>,
);
```

- `AppProviders` already mounts the `QueryProvider` (cache) and the theme. See
  [AppProviders](../app-providers.md).
- `ToastProvider` sits **above the router**: a toast fired as the drawer closes cannot depend on
  which route is mounted.
- `TempestDataProvider` must sit below the `QueryProvider`, because the resource hooks use the
  `QueryClient`.

### 3. The model and the schema

```ts
// src/features/products/product.ts
import { z } from "zod";

export const CATEGORIES = ["mercearia", "bebidas", "hortifruti", "limpeza"] as const;
export const STATUSES = ["active", "draft", "archived"] as const;

export type ProductCategory = (typeof CATEGORIES)[number];
export type ProductStatus = (typeof STATUSES)[number];

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: ProductCategory;
  price_cents: number;
  stock: number;
  status: ProductStatus;
  updated_at: string;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  mercearia: "Mercearia",
  bebidas: "Bebidas",
  hortifruti: "Hortifrúti",
  limpeza: "Limpeza",
};

export const STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Ativo",
  draft: "Rascunho",
  archived: "Arquivado",
};

export const productSchema = z.object({
  name: z.string().trim().min(3, "Use pelo menos 3 letras"),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,20}$/, "De 4 a 20 caracteres: letras, números e hífen"),
  category: z
    .union([z.enum(CATEGORIES), z.literal("")])
    .refine((value) => value.length > 0, "Escolha uma categoria"),
  price_cents: z.number().int().min(1, "Informe o preço"),
  stock: z.coerce
    .number()
    .int("Estoque é um número inteiro")
    .min(0, "Estoque não pode ser negativo"),
  status: z.enum(STATUSES),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "",
  sku: "",
  category: "",
  price_cents: 0,
  stock: 0,
  status: "draft",
};

export function toFormValues(product: Product | null): ProductFormValues {
  if (!product) return EMPTY_PRODUCT;
  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    price_cents: product.price_cents,
    stock: product.stock,
    status: product.status,
  };
}
```

The `Product` type mirrors the backend JSON. The pt-BR labels live in `value → label` maps, which
`toOptions` turns into `Select` options later on.

The zod schema is the form's source of truth. Three details:

- **`sku`** goes through `toUpperCase()` before the `regex`: the person types `mer-cafe-500` and
  the backend receives `MER-CAFE-500`.
- **`category`** accepts `""` as input and rejects it in the `refine`. That way the create form
  opens **without** a category, instead of saving the first option nobody picked.
- **`stock`** uses `z.coerce.number()`, because an `<input type="number">` hands you text.

`toFormValues` turns an API product into form values. Without a product, it returns the empty
create form.

### 4. Filters in the URL

```ts
// src/features/products/use-product-filters.ts
import { useMemo } from "react";
import {
  ALL_OPTION_VALUE,
  useUrlState,
  type DataTableSort,
  type GetListParams,
  type UrlStatePatch,
  type UrlStateWriteOptions,
} from "tempest-react-sdk";

import type { Product } from "@/features/products/product";

const SORTABLE: ReadonlyArray<keyof Product> = ["name", "price_cents", "stock", "updated_at"];

const DEFAULTS = {
  busca: "",
  categoria: ALL_OPTION_VALUE,
  status: ALL_OPTION_VALUE,
  pagina: 1,
  por_pagina: 20,
  ordem: "",
  dir: "",
};

export type FiltersPatch = UrlStatePatch<typeof DEFAULTS>;

export interface ProductFilters {
  search: string;
  category: string;
  status: string;
  page: number;
  pageSize: number;
  sort: DataTableSort<Product> | null;
  isFiltered: boolean;
  key: string;
}

export function useProductFilters(): {
  filters: ProductFilters;
  update: (patch: FiltersPatch, options?: UrlStateWriteOptions) => void;
  clear: () => void;
} {
  const { state, set, reset } = useUrlState(DEFAULTS);

  const filters = useMemo<ProductFilters>(() => {
    const field = SORTABLE.find((name) => name === state.ordem);
    return {
      search: state.busca,
      category: state.categoria,
      status: state.status,
      page: Math.max(1, Math.trunc(state.pagina)),
      pageSize: Math.max(1, Math.trunc(state.por_pagina)),
      sort: field ? { key: field, direction: state.dir === "desc" ? "desc" : "asc" } : null,
      isFiltered:
        state.busca !== DEFAULTS.busca ||
        state.categoria !== DEFAULTS.categoria ||
        state.status !== DEFAULTS.status,
      key: [state.busca, state.categoria, state.status].join("|"),
    };
  }, [state]);

  const clear = () => reset(["busca", "categoria", "status", "pagina"]);

  return { filters, update: set, clear };
}

export function toListParams(filters: ProductFilters): GetListParams {
  return {
    pagination: { page: filters.page, pageSize: filters.pageSize },
    sort: filters.sort
      ? { field: String(filters.sort.key), order: filters.sort.direction }
      : undefined,
    filters: {
      search: filters.search || undefined,
      category: filters.category === ALL_OPTION_VALUE ? undefined : filters.category,
      status: filters.status === ALL_OPTION_VALUE ? undefined : filters.status,
    },
  };
}
```

This hook is the heart of the screen. It reads the URL and returns typed `filters`, plus `update`
to write to it.

- **The URL names are in Portuguese** (`busca`, `categoria`, `pagina`): that is the URL the team
  sees and shares. `toListParams` translates them into the backend names.
- **Default values leave the URL.** `pagina=1` and `categoria=all` are removed, so the clean URL is
  `/produtos`.
- **An invalid URL does not break the screen.** `useUrlState` types each parameter by its default:
  `?pagina=abc` becomes page 1. `?ordem=senha` is ignored, because only the fields in `SORTABLE`
  get through.
- **A new filter goes back to page 1**: callers of `update` pass `pagina: null` along.

!!! check "Two writes in one click, none lost"
    `DataTable` calls `onPageSizeChange(50)` and `onPageChange(1)` in the same click. With React
    Router's `setSearchParams` the second write started from the URL of the last render and wiped
    `por_pagina=50`; this recipe used to carry a `useRef` with the latest URL to work around it.
    [`useUrlState`](../routing.md#screen-state-in-the-url-with-useurlstate) accumulates the writes
    of one tick and navigates once — one history entry per gesture.

### 5. The search lives in the table

There is no file for the search. `DataTable` takes the term from the URL in `search`, shows every
keystroke in the box and only calls `onSearchChange` after `searchDebounceMs` of quiet — typing
"café" makes **one** request. When the URL changes from outside (browser back, "Limpar filtros"),
the box follows. The search ignores accents: "cafe" finds "Café".

### 6. The form in the drawer

```tsx
// src/features/products/ProductFormDrawer.tsx
import { useEffect } from "react";
import {
  Button,
  Drawer,
  Form,
  FormField,
  FormProvider,
  FormRow,
  Input,
  MoneyInput,
  Select,
  isApiError,
  toOptions,
  useCreate,
  useDescribeApiError,
  useToast,
  useUpdate,
  useZodForm,
} from "tempest-react-sdk";

import {
  CATEGORY_LABELS,
  EMPTY_PRODUCT,
  STATUS_LABELS,
  productSchema,
  toFormValues,
  type Product,
  type ProductFormValues,
} from "@/features/products/product";

const FORM_ID = "product-form";

const ERROR_CODES: Record<string, string> = {
  PRODUCT_SKU_TAKEN: "Já existe um produto com este SKU.",
};

interface ProductFormDrawerProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
}

export function ProductFormDrawer({ open, product, onClose }: ProductFormDrawerProps) {
  const toast = useToast();
  const describe = useDescribeApiError();
  const form = useZodForm(productSchema, { defaultValues: EMPTY_PRODUCT });
  const { reset, setError } = form;

  const createProduct = useCreate<Product>("products");
  const updateProduct = useUpdate<Product>("products");
  const saving = createProduct.isPending || updateProduct.isPending;

  useEffect(() => {
    if (open) reset(toFormValues(product));
  }, [open, product, reset]);

  function handleError(error: unknown): void {
    if (isApiError(error)) {
      for (const [field, message] of Object.entries(error.fields ?? {})) {
        if (field in EMPTY_PRODUCT) setError(field as keyof ProductFormValues, { message });
      }
      if (error.code === "PRODUCT_SKU_TAKEN") {
        setError("sku", { message: ERROR_CODES.PRODUCT_SKU_TAKEN });
      }
    }
    toast.error(describe(error, "Não foi possível salvar o produto.", { codes: ERROR_CODES }));
  }

  function save(values: ProductFormValues): void {
    const callbacks = {
      onSuccess: (saved: Product) => {
        toast.success(product ? `${saved.name} atualizado.` : `${saved.name} cadastrado.`);
        onClose();
      },
      onError: handleError,
    };
    if (product) updateProduct.mutate({ id: product.id, data: values }, callbacks);
    else createProduct.mutate(values, callbacks);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      mobilePlacement="bottom"
      showHandle
      closeOnBackdrop={!saving}
      closeOnEsc={!saving}
      title={product ? `Editar ${product.name}` : "Novo produto"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving}>
            {product ? "Salvar alterações" : "Cadastrar produto"}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <Form id={FORM_ID} layout="stack" gap={4} onSubmit={form.handleSubmit(save)} noValidate>
          <FormField name="name" label="Nome" required>
            <Input placeholder="Café torrado e moído 500 g" autoComplete="off" />
          </FormField>
          <FormRow gap={4}>
            <FormField name="sku" label="SKU" required helperText="Ex.: MER-CAFE-500">
              <Input autoCapitalize="characters" autoComplete="off" />
            </FormField>
            <FormField name="category" label="Categoria" required>
              <Select placeholder="Escolha a categoria" options={toOptions(CATEGORY_LABELS)} />
            </FormField>
          </FormRow>
          <FormRow gap={4}>
            <FormField name="price_cents" label="Preço" required>
              <MoneyInput />
            </FormField>
            <FormField name="stock" label="Estoque" required>
              <Input type="number" inputMode="numeric" min={0} step={1} />
            </FormField>
          </FormRow>
          <FormField name="status" label="Situação">
            <Select options={toOptions(STATUS_LABELS)} />
          </FormField>
        </Form>
      </FormProvider>
    </Drawer>
  );
}
```

The same component creates and edits: `product === null` means create.

- **`useCreate` / `useUpdate`** send the `POST` and the `PATCH` and invalidate the list on success.
  You write no `queryKey` at all.
- **The `useEffect` with `reset`** reloads the form every time the drawer opens: opening "Editar
  Café" and then "Novo produto" doesn't carry the coffee into the create form.
- **The buttons live in the drawer `footer`**, pinned to the bottom even while the form scrolls on a
  phone. `form={FORM_ID}` binds the submit button to the `<form>` elsewhere in the tree.
- **While saving, the drawer doesn't close** on `Esc` or on the backdrop (`closeOnEsc={!saving}`).

Error handling is what separates a demo screen from a production one:

1. `error.fields` carries the offending field, whether it came from FastAPI's validation list or
   from `tempest-fastapi-sdk`'s `field` key. Each message goes to its input with `setError`.
2. `PRODUCT_SKU_TAKEN` gets a sentence you wrote, on the SKU field.
3. [`describeApiError`](../http.md#from-a-typed-error-to-the-sentence-on-screen-describeapierror)
   builds the toast sentence: your sentence for the code, "offline" for `status: 0`, the backend
   `detail`, or the fallback with the HTTP status.

!!! check "Callbacks on the call, not on the hook"
    `onSuccess` and `onError` go in `mutate(values, callbacks)`, per call. That is the right place
    for what depends on the screen (closing the drawer, showing the toast), and it leaves untouched
    the `onSuccess` that `useCreate`/`useUpdate` use to invalidate the list.

### 7. The page

```tsx
// src/features/products/ProductsPage.tsx
import { useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { MoreVertical, PackagePlus, Plus, SearchX, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  EmptyState,
  ErrorState,
  Money,
  Page,
  Select,
  Stack,
  toOptions,
  useDelete,
  useDescribeApiError,
  useList,
  useToast,
  withAllOption,
  type BadgeVariant,
  type DataTableColumn,
  type DataTableRowKey,
} from "tempest-react-sdk";

import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type Product,
  type ProductStatus,
} from "@/features/products/product";
import { ProductFormDrawer } from "@/features/products/ProductFormDrawer";
import { toListParams, useProductFilters } from "@/features/products/use-product-filters";

const STATUS_VARIANT: Record<ProductStatus, BadgeVariant> = {
  active: "success",
  draft: "warning",
  archived: "neutral",
};

interface Selection {
  key: string;
  ids: DataTableRowKey[];
}

export function ProductsPage() {
  const toast = useToast();
  const describe = useDescribeApiError();
  const { filters, update, clear } = useProductFilters();

  const products = useList<Product>("products", toListParams(filters), {
    placeholderData: keepPreviousData,
  });
  const deleteProduct = useDelete<Product>("products");

  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [selection, setSelection] = useState<Selection>({ key: "", ids: [] });

  const items = products.data?.items ?? [];
  const lastPage = products.data?.pages ?? 0;
  const selectionKey = `${filters.key}|${filters.page}|${filters.pageSize}`;
  const selectedIds = selection.key === selectionKey ? selection.ids : [];

  useEffect(() => {
    if (lastPage > 0 && filters.page > lastPage) update({ pagina: lastPage }, { replace: true });
  }, [filters.page, lastPage, update]);

  function setSelected(ids: DataTableRowKey[]): void {
    setSelection({ key: selectionKey, ids });
  }

  function openForm(product: Product | null): void {
    setEditing(product);
    setFormOpen(true);
  }

  async function confirmDelete(): Promise<void> {
    setDeleting(true);
    const results = await Promise.allSettled(
      toDelete.map((product) => deleteProduct.mutateAsync(product.id)),
    );
    setDeleting(false);

    const removed = toDelete.filter((_, index) => results[index].status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    if (removed.length === 1) toast.success(`${removed[0].name} excluído.`);
    if (removed.length > 1) toast.success(`${removed.length} produtos excluídos.`);
    if (failures.length > 0) {
      toast.error(
        describe(failures[0].reason, `${failures.length} produto(s) não puderam ser excluídos.`),
      );
    }
    setSelected([]);
    setToDelete([]);
  }

  const columns: DataTableColumn<Product>[] = [
    { key: "sku", header: "SKU" },
    { key: "name", header: "Produto", sortable: true },
    {
      key: "category",
      header: "Categoria",
      priority: "desktop",
      render: (product) => CATEGORY_LABELS[product.category],
    },
    {
      key: "price_cents",
      header: "Preço",
      sortable: true,
      align: "right",
      render: (product) => <Money cents={product.price_cents} />,
    },
    {
      key: "stock",
      header: "Estoque",
      sortable: true,
      align: "right",
      priority: "tablet",
      render: (product) =>
        product.stock === 0 ? <Badge variant="danger">Esgotado</Badge> : product.stock,
    },
    {
      key: "status",
      header: "Situação",
      priority: "tablet",
      render: (product) => (
        <Badge variant={STATUS_VARIANT[product.status]}>{STATUS_LABELS[product.status]}</Badge>
      ),
    },
  ];

  const rowActions = (product: Product) => (
      <DropdownMenu
        placement="bottom-end"
        trigger={
          <Button variant="ghost" iconOnly aria-label={`Ações para ${product.name}`}>
            <MoreVertical size={16} />
          </Button>
        }
        items={[
          {
            type: "item",
            id: "edit",
            label: "Editar",
            onSelect: () => openForm(product),
          },
          {
            type: "item",
            id: "delete",
            label: "Excluir",
            danger: true,
            onSelect: () => setToDelete([product]),
          },
        ]}
      />
  );

  const emptyMessage = filters.isFiltered ? (
    <EmptyState
      icon={<SearchX size={32} />}
      title="Nenhum produto encontrado"
      description="Nada casa com a busca e os filtros atuais."
      action={
        <Button variant="outline" onClick={clear}>
          Limpar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={<PackagePlus size={32} />}
      title="Seu catálogo está vazio"
      description="Cadastre o primeiro produto para ele aparecer na loja."
      action={<Button onClick={() => openForm(null)}>Cadastrar produto</Button>}
    />
  );

  return (
    <Page
      eyebrow="Catálogo"
      title="Produtos"
      description={
        !products.data
          ? "Carregando catálogo…"
          : filters.isFiltered
            ? `${products.data.total} produtos encontrados`
            : `${products.data.total} produtos cadastrados`
      }
      actions={
        <Button leftIcon={<Plus size={16} />} onClick={() => openForm(null)}>
          Novo produto
        </Button>
      }
      toolbar={
        <Stack direction={{ mobile: "vertical", desktop: "horizontal" }} gap={3} align="stretch">
          <Select
            variant="chip"
            aria-label="Filtrar por categoria"
            value={filters.category}
            onChange={(event) => update({ categoria: event.target.value, pagina: null })}
            options={withAllOption(toOptions(CATEGORY_LABELS), "Todas as categorias")}
          />
          <Select
            variant="chip"
            aria-label="Filtrar por situação"
            value={filters.status}
            onChange={(event) => update({ status: event.target.value, pagina: null })}
            options={withAllOption(toOptions(STATUS_LABELS), "Todas as situações")}
          />
        </Stack>
      }
    >
      {selectedIds.length > 0 && (
        <Stack direction="horizontal" gap={3} align="center" justify="between" wrap>
          <span>
            {selectedIds.length === 1
              ? "1 produto selecionado"
              : `${selectedIds.length} produtos selecionados`}
          </span>
          <Stack direction="horizontal" gap={2}>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Limpar seleção
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 size={16} />}
              onClick={() => setToDelete(items.filter((item) => selectedIds.includes(item.id)))}
            >
              Excluir selecionados
            </Button>
          </Stack>
        </Stack>
      )}

      {products.isError && !products.data ? (
        <ErrorState
          title="Não foi possível carregar os produtos"
          description={describe(products.error, "Tente de novo em instantes.")}
          onRetry={() => void products.refetch()}
        />
      ) : (
        <DataTable<Product>
          data={items}
          columns={columns}
          rowKey={(product) => product.id}
          totalItems={products.data?.total ?? 0}
          page={filters.page}
          onPageChange={(page) => update({ pagina: page })}
          pageSize={filters.pageSize}
          pageSizeOptions={[10, 20, 50]}
          onPageSizeChange={(size) => update({ por_pagina: size, pagina: null })}
          sort={filters.sort}
          onSortChange={(sort) =>
            update({
              ordem: sort ? String(sort.key) : null,
              dir: sort?.direction ?? null,
              pagina: null,
            })
          }
          searchable
          search={filters.search}
          searchDebounceMs={400}
          searchLabel="Buscar produtos"
          searchPlaceholder="Buscar por nome ou SKU"
          onSearchChange={(term) => update({ busca: term, pagina: null }, { replace: true })}
          selectable
          selectedKeys={selectedIds}
          onSelectionChange={setSelected}
          selectionLabel={(product) => `Selecionar ${product.name}`}
          rowActions={rowActions}
          rowActionsLabel="Ações do produto"
          stackOnMobile
          loading={products.isFetching}
          emptyMessage={emptyMessage}
        />
      )}

      <ProductFormDrawer open={formOpen} product={editing} onClose={() => setFormOpen(false)} />

      <ConfirmDialog
        open={toDelete.length > 0}
        title={toDelete.length === 1 ? "Excluir produto" : `Excluir ${toDelete.length} produtos`}
        description={
          toDelete.length === 1
            ? `${toDelete[0].name} sai do catálogo e da loja. Essa ação não pode ser desfeita.`
            : "Os produtos selecionados saem do catálogo e da loja. Essa ação não pode ser desfeita."
        }
        confirmLabel="Sim, excluir"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete([])}
      />
    </Page>
  );
}
```

Let's go piece by piece.

#### The query

`useList<Product>("products", toListParams(filters), ...)` becomes
`GET /api/products?page=…&size=…&search=…`. The cache key includes the params, so every filter
combination has its own cache, and going back to page 1 is instant.

`placeholderData: keepPreviousData` keeps the previous page's rows on screen while the next one
loads. `DataTable` receives `loading={products.isFetching}`, dims those rows and sets `aria-busy`;
on the first load, with no rows yet, it draws skeletons at the right height.

#### `DataTable` in server mode

Passing `totalItems` switches server mode on: `data` is just the current page, and sorting and
pagination become events you handle. Each one writes to the URL:

| Event | Writes |
| --- | --- |
| `onPageChange(3)` | `pagina=3` |
| `onPageSizeChange(50)` | `por_pagina=50` and back to page 1 |
| `onSortChange({ key: "price_cents", direction: "desc" })` | `ordem=price_cents&dir=desc` |
| `onSortChange(null)` (third click) | removes `ordem` and `dir` |

`sort={filters.sort}` keeps the header arrow in the right place when the screen arrives with
`?ordem=` in the URL and when the back button changes the order. Search goes the same way:
`search={filters.search}`, with `onSearchChange` writing with `replace` so each typing pause is not a
history entry.

#### Bulk selection

`selectable` turns on the `DataTable` checkbox column, controlled by `selectedKeys` and
`onSelectionChange`. The header checkbox selects the page on screen and turns `indeterminate` when
only part of it is checked; the keys are what `rowKey` returns, the product id.

The selection stores the filters-and-page `key` alongside. Change the search, the filter or the
page, the key changes and the selection is gone on its own — no `useEffect`, and no risk of deleting
a product the person isn't even looking at.

#### Row menu and deletion

`rowActions` draws the [`DropdownMenu`](../components/actions.md#in-a-table-row) with "Editar"
and "Excluir" in a column of the table itself, without borrowing the `key` of a product field. The menu
opens in a portal, so the table's horizontal scroll doesn't clip it.

Deleting one and deleting many go through the same `ConfirmDialog`. `confirmDelete` calls
`deleteProduct.mutateAsync` for each product with `Promise.allSettled`, so one failure doesn't
cancel the others: if two out of three went through, the toast says which ones did and which one
didn't, with the backend `detail` ("Produto com pedidos em aberto").

!!! tip "Deleted the last row of the last page?"
    Page 5 may stop existing. The `useEffect` with `lastPage` notices `pagina` went past `pages` and
    goes back to the last page that exists, with `replace` so it doesn't pollute the history.

#### Empty, empty by filter, and error

- **Empty catalogue** and **nothing matches the filter** are different sentences: the first one
  invites to create, the second offers "Limpar filtros". Both go into `emptyMessage`, which
  `DataTable` only shows when loading finished with no rows.
- **Error without data** swaps the table for an `ErrorState` with "Tentar novamente". If the failure
  happens with data already on screen (a refetch that failed), the table stays.

#### On the phone 📱

- `stackOnMobile` turns each row into a card below 768 px: label on the left, value on the right,
  no sideways scroll and no SKU wrapping. `priority: "desktop"` still hides the category below
  desktop.
- The filter bar stacks with `direction={{ mobile: "vertical", desktop: "horizontal" }}`.
- The `Drawer` becomes a bottom sheet with `mobilePlacement="bottom"`, and the `DataTable`
  pagination footer goes compact (‹ ›) below 640 px — see
  [`Pagination`](../components/navigation.md#pagination).

## Testing the whole flow

With the backend running, open `/produtos` and check:

1. Type "café" in the search: the URL becomes `?busca=caf%C3%A9` and **one** request goes out.
2. Click "Preço" twice: `ordem=price_cents&dir=desc`, most expensive first.
3. Switch to 50 per page while on page 2: the URL keeps `por_pagina=50` and drops `pagina`.
4. Create a product with an SKU that already exists: the error shows **under the SKU**, and the
   drawer stays open with what you typed.
5. Check two products and delete them: one success toast, and an error one if any was refused.
6. Hit "back" in the browser: search, filters and page come back together, search box included.

!!! note "What was checked in the browser"
    The six steps above ran in Chromium against a simulated backend (a mocked `fetch` following the
    contract on this page), at 1280 px and 390 px wide.

## Recap

- `createDataProvider` + `useList`/`useCreate`/`useUpdate`/`useDelete` give you the whole CRUD
  without a hand-written `queryKey`. Screen callbacks go in `mutate(…, { onSuccess, onError })`.
- `DataTable` with `totalItems` hands page, size and sorting to you; keep all three in the URL.
- `useUrlState` keeps page, filters and order in the URL; writes from one click become one navigation.
- The search is `DataTable`'s own, controlled by the URL and with `searchDebounceMs`: one request per
  search, not per key.
- `useZodForm` + `FormField` validate on the client; `error.fields` and `describeApiError` take the
  server error to the right field and to the toast.
- Every real screen has loading, empty, empty by filter, error and phone. All five are here. ✅
