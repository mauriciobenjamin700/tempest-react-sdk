# Painel CRUD (admin)

Você trabalha no back-office da **Mercadinho Ipê**, uma rede de mercados de bairro. A equipe de
catálogo passa o dia nesta tela: cadastra o café que chegou, corrige o preço do detergente, arquiva
o suco que saiu de linha e apaga em lote os rascunhos duplicados da importação de ontem.

São 4 mil produtos. Ninguém vai rolar uma lista inteira: a pessoa busca, filtra, ordena, edita e
volta. E manda o link da tela filtrada no chat do time — então o filtro precisa morar **na URL**.

Nesta receita você monta essa tela de ponta a ponta com o SDK. 🚀

## O que vamos construir

Uma página `/produtos` com:

- 🔎 **Busca com debounce** por nome ou SKU — uma requisição quando a pessoa para de digitar, não
  uma por tecla.
- 🏷️ **Filtros** de categoria e situação, **ordenação** por coluna e **paginação no servidor**,
  tudo guardado na URL (`/produtos?busca=café&categoria=mercearia&pagina=2`). Recarregar, voltar e
  compartilhar o link devolvem a mesma tela.
- ➕ **Cadastrar e editar** num `Drawer` lateral (que vira bottom sheet no celular), com formulário
  validado por zod e erro do backend aparecendo no campo certo.
- 🗑️ **Excluir** um produto ou **vários de uma vez**, sempre com confirmação.
- 🔔 **Toasts** de sucesso e de erro, e os estados que uma tela real tem: carregando, vazia, vazia
  por causa do filtro, erro com "tentar de novo" e layout de celular.

As peças do SDK que entram:

| Peça | Para quê | Doc |
| --- | --- | --- |
| `createApiClient` + `createDataProvider` | cliente HTTP e CRUD por recurso | [HTTP](../http.md), [Data Provider](../data-provider.md#createdataprovider) |
| `useList` / `useCreate` / `useUpdate` / `useDeleteMany` | cache e invalidação via TanStack Query | [Os hooks de recurso](../data-provider.md#os-hooks-de-recurso) |
| `DataTable` | tabela com paginação, ordenação e tamanho de página no servidor | [`DataTable` no servidor](../components/data.md#datatablet-paginacao-no-servidor) |
| `Drawer` | painel do formulário | [`Drawer`](../components/overlay.md#drawer) |
| `useZodForm` + `FormField` + `MoneyInput` | formulário validado, preço em centavos | [Formulários](../forms.md#exemplo-completo-schema-provider-fields-submit), [`MoneyInput`](../forms-br.md#inputs-com-mascara) |
| `ConfirmDialog` + `DropdownMenu` | confirmação e menu por linha | [`ConfirmDialog`](../components/actions.md#confirmdialog), [menu na linha](../components/actions.md#numa-linha-de-tabela) |
| `useToast`, `EmptyState`, `ErrorState`, `Badge` | feedback | [Feedback](../components/feedback.md#toast) |
| `useSearchParams`, `useDebounce`, `useLatestRef` | URL e busca | [Roteamento](../routing.md#tudo-o-que-vem-do-react-router), [Hooks](../hooks.md#busca-com-debounce-usedebounce) |

## O contrato com o backend

O backend é um serviço FastAPI em cima do `tempest-fastapi-sdk`, com o envelope de paginação offset
que o SDK já conhece (veja [Integração com FastAPI](../integration-fastapi.md#4-paginacao)):

```text
GET    /api/products?page=2&size=20&order_by=price_cents&ascending=false&search=café&category=mercearia&status=active
POST   /api/products
PATCH  /api/products/{id}
DELETE /api/products/{id}
```

A listagem responde assim:

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

E um SKU repetido no cadastro volta como `409`, com o campo e um código estável:

```json
{ "detail": { "detail": "SKU já cadastrado", "field": "sku" }, "code": "PRODUCT_SKU_TAKEN" }
```

!!! tip "Preço em centavos, sempre"
    `price_cents: 1890` é R$ 18,90. Inteiro não tem o `0.1 + 0.2` do float, e o
    [`MoneyInput`](../forms-br.md#inputs-com-mascara) e o `Money` do SDK já trabalham em centavos.

## Arquivo por arquivo

A estrutura fica assim:

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

### 1. O cliente e o data provider

```ts
// src/lib/api.ts
import { createApiClient, createDataProvider } from "tempest-react-sdk";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  prefix: "/api",
});

export const dataProvider = createDataProvider(api);
```

Um cliente, um provider, criados uma vez. Com `prefix: "/api"`, o recurso `"products"` vira
`/api/products`. Os defaults do `createDataProvider` já falam `page`/`size`/`order_by`/`ascending`,
então você não configura nada.

!!! note "E o login?"
    Painel admin tem login. Aqui o cliente está sem `getToken` para a receita focar no CRUD; a
    receita de [autenticação](auth-flow.md) mostra o cliente com token e refresh.

### 2. Os providers

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

- `AppProviders` já monta o `QueryProvider` (cache) e o tema. Veja [AppProviders](../app-providers.md).
- `ToastProvider` fica **acima do router**: um toast disparado na hora em que o drawer fecha não pode
  depender da rota que está montada.
- `TempestDataProvider` precisa estar abaixo do `QueryProvider`, porque os hooks de recurso usam o
  `QueryClient`.

### 3. O modelo e o schema

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
    .refine((value) => value !== "", "Escolha uma categoria"),
  price_cents: z.number().int().min(1, "Informe o preço"),
  stock: z.coerce
    .number()
    .int("Estoque é um número inteiro")
    .min(0, "Estoque não pode ser negativo"),
  status: z.enum(STATUSES),
});

export type ProductFormInput = z.input<typeof productSchema>;
export type ProductFormValues = z.output<typeof productSchema>;

export const EMPTY_PRODUCT: ProductFormInput = {
  name: "",
  sku: "",
  category: "",
  price_cents: 0,
  stock: 0,
  status: "draft",
};

export function toFormValues(product: Product | null): ProductFormInput {
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

O tipo `Product` espelha o JSON do backend. Os rótulos em pt-BR ficam em mapas
`valor → rótulo`, que o `toOptions` transforma em opções de `Select` mais adiante.

O schema zod é a fonte de verdade do formulário. Três detalhes:

- **`sku`** passa por `toUpperCase()` antes do `regex`: a pessoa digita `mer-cafe-500` e o backend
  recebe `MER-CAFE-500`.
- **`category`** aceita `""` na entrada e recusa no `refine`. Assim o formulário de cadastro abre
  **sem** categoria escolhida, em vez de gravar a primeira da lista sem ninguém ter escolhido. O
  `value !== ""` é um predicado de tipo: a **saída** do schema (`ProductFormValues`, o que o
  `save` recebe) fica só com as categorias, enquanto a **entrada** (`ProductFormInput`, o tipo dos
  valores iniciais) aceita o `""`. O `useZodForm` tipa os campos pela entrada e o `handleSubmit`
  pela saída, então os dois lados batem sem cast.
- **`stock`** usa `z.coerce.number()`, porque um `<input type="number">` entrega texto.

`toFormValues` converte um produto da API nos valores do formulário. Sem produto, devolve o
formulário vazio de cadastro.

### 4. Filtros na URL

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

Este hook é o coração da tela. Ele lê a URL e devolve `filters` já tipados, e devolve `update` para
escrever nela.

- **Os nomes na URL são em português** (`busca`, `categoria`, `pagina`): é a URL que a equipe vê e
  compartilha. `toListParams` traduz para os nomes do backend.
- **Valor padrão sai da URL.** `pagina=1` e `categoria=all` são apagados, então a URL limpa é
  `/produtos`.
- **URL inválida não quebra a tela.** O `useUrlState` tipa cada parâmetro pelo default:
  `?pagina=abc` vira página 1. `?ordem=senha` é ignorado, porque só os campos de `SORTABLE` passam.
- **Filtro novo volta para a página 1**: quem chama `update` passa `pagina: null` junto.

!!! check "Duas escritas no mesmo clique, nenhuma perdida"
    O `DataTable` chama `onPageSizeChange(50)` e `onPageChange(1)` no mesmo clique. Com o
    `setSearchParams` do React Router a segunda escrita partia da URL do último render e apagava o
    `por_pagina=50`; esta receita carregava um `useRef` com a última URL para contornar isso. O
    [`useUrlState`](../routing.md#estado-da-tela-na-url-com-useurlstate) acumula as escritas do
    mesmo tique e navega uma vez — uma entrada no histórico por gesto.

### 5. A busca fica na tabela

Não há arquivo para a busca. O `DataTable` recebe o termo da URL em `search`, mostra cada tecla na
caixa e só chama `onSearchChange` depois de `searchDebounceMs` sem digitar — digitar "café" faz
**uma** requisição. Quando a URL muda por fora (voltar no navegador, "Limpar filtros"), a caixa
acompanha. A busca não diferencia acento: "cafe" acha "Café".

### 6. O formulário no drawer

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
  applyApiFieldErrors,
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
    applyApiFieldErrors(form, error);
    if (isApiError(error)) {
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

O mesmo componente cadastra e edita: `product === null` é cadastro.

- **`useCreate` / `useUpdate`** fazem o `POST` e o `PATCH` e invalidam a lista no sucesso. Você não
  escreve `queryKey` nenhuma.
- **O `useEffect` com `reset`** recarrega o formulário toda vez que o drawer abre: abrir "Editar
  Café" e depois "Novo produto" não carrega o café para o cadastro.
- **Os botões ficam no `footer`** do drawer, presos no rodapé mesmo com o formulário rolando no
  celular. O `form={FORM_ID}` liga o botão de submit ao `<form>` que está em outro ponto da árvore.
- **Enquanto salva, o drawer não fecha** por `Esc` nem pelo fundo (`closeOnEsc={!saving}`).

O tratamento de erro é o que separa uma tela de demo de uma tela de produção:

1. `error.fields` traz o campo culpado, venha ele da lista de validação do FastAPI ou da chave
   `field` do `tempest-fastapi-sdk`. O `applyApiFieldErrors` põe cada mensagem no seu input e
   foca o primeiro; um nome que o formulário não tem volta em `unmatched`, em vez de marcar um
   input que não existe.
2. `PRODUCT_SKU_TAKEN` ganha uma frase escrita por você, no campo SKU.
3. [`describeApiError`](../http.md#do-erro-tipado-para-a-frase-na-tela-describeapierror) monta a
   frase do toast: a sua frase para o código, "sem conexão" para `status: 0`, o `detail` do
   backend, ou o fallback com o status HTTP.

!!! check "Callbacks na chamada, não no hook"
    `onSuccess` e `onError` vão no `mutate(values, callbacks)`, por chamada. É o lugar certo para
    o que depende da tela (fechar o drawer, mostrar o toast, e a mensagem muda entre cadastro e
    edição). No hook também funcionaria: o `onSuccess` do app roda depois da invalidação da lista,
    não no lugar dela. Até a 0.92.0 ele a substituía, e a lista ficava velha (#699).

### 7. A página

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
  useDeleteMany,
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
  const deleteProducts = useDeleteMany<Product>("products");

  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product[]>([]);
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
    const { deleted, failed } = await deleteProducts.mutateAsync(
      toDelete.map((product) => product.id),
    );

    const removed = toDelete.filter((product) => deleted.some((entry) => entry.id === product.id));
    if (removed.length === 1) toast.success(`${removed[0].name} excluído.`);
    if (removed.length > 1) toast.success(`${removed.length} produtos excluídos.`);
    if (failed.length > 0) {
      toast.error(
        describe(failed[0].error, `${failed.length} produto(s) não puderam ser excluídos.`),
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
        loading={deleteProducts.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete([])}
      />
    </Page>
  );
}
```

Vamos por partes.

#### A query

`useList<Product>("products", toListParams(filters), ...)` vira
`GET /api/products?page=…&size=…&search=…`. A chave do cache inclui os parâmetros, então cada
combinação de filtro tem o seu cache, e voltar para a página 1 é instantâneo.

`placeholderData: keepPreviousData` mantém as linhas da página anterior na tela enquanto a próxima
carrega. O `DataTable` recebe `loading={products.isFetching}`, esmaece essas linhas e marca
`aria-busy`; na primeira carga, sem linhas ainda, ele desenha esqueletos na altura certa.

#### O `DataTable` em modo servidor

Passar `totalItems` liga o modo servidor: `data` é só a página atual, e ordenação e paginação viram
eventos que você trata. Cada um escreve na URL:

| Evento | Escreve |
| --- | --- |
| `onPageChange(3)` | `pagina=3` |
| `onPageSizeChange(50)` | `por_pagina=50` e volta para a página 1 |
| `onSortChange({ key: "price_cents", direction: "desc" })` | `ordem=price_cents&dir=desc` |
| `onSortChange(null)` (terceiro clique) | remove `ordem` e `dir` |

`sort={filters.sort}` mantém a seta do cabeçalho no lugar certo quando a tela chega com `?ordem=` na
URL e quando o botão voltar muda a ordem. A busca segue o mesmo caminho: `search={filters.search}`,
`onSearchChange` com `replace` para cada pausa na digitação não virar uma entrada no histórico.

#### Seleção em lote

`selectable` liga a coluna de checkbox do `DataTable`, controlada por `selectedKeys` e
`onSelectionChange`. O checkbox do cabeçalho marca a página que está na tela e fica `indeterminate`
quando só parte dela está marcada; as chaves são o retorno de `rowKey`, o id do produto.

A seleção guarda junto a `key` dos filtros e da página. Mudou a busca, o filtro ou a página, a chave
muda e a seleção some sozinha — sem `useEffect`, e sem o risco de excluir um produto que a pessoa
nem está vendo.

#### Menu por linha e exclusão

`rowActions` desenha o [`DropdownMenu`](../components/actions.md#numa-linha-de-tabela) de "Editar" e
"Excluir" numa coluna da própria tabela, sem emprestar a `key` de um campo do produto. O menu abre em portal, então não é cortado pela rolagem horizontal da
tabela.

Excluir um e excluir vários passam pelo mesmo `ConfirmDialog`. `confirmDelete` manda os ids para
o [`useDeleteMany`](../data-provider.md#excluir-uma-selecao-usedeletemany), que exclui cada um por
conta própria e invalida a lista **uma** vez — com um `useDelete` por id, 10 produtos custavam 10
invalidações e 10 `GET` da lista. Uma falha não cancela as outras: o resultado separa `deleted` de
`failed`, e se dois de três saíram, o toast diz quais saíram e qual não saiu, com o `detail` do
backend ("Produto com pedidos em aberto").

!!! tip "Excluiu a última linha da última página?"
    A página 5 pode deixar de existir. O `useEffect` com `lastPage` percebe que `pagina` passou de
    `pages` e volta para a última página que existe, com `replace` para não sujar o histórico.

#### Vazio, vazio por filtro e erro

- **Catálogo vazio** e **nada casa com o filtro** são frases diferentes: a primeira chama para
  cadastrar, a segunda oferece "Limpar filtros". As duas entram em `emptyMessage`, que o `DataTable`
  só mostra quando a carga terminou sem linhas.
- **Erro sem dados** troca a tabela por um `ErrorState` com "Tentar novamente". Se a falha
  acontece com dados já na tela (um refetch que caiu), a tabela continua lá.

#### No celular 📱

- `stackOnMobile` transforma cada linha num cartão abaixo de 768 px: rótulo à esquerda, valor à
  direita, sem rolagem lateral e sem o SKU quebrando linha. `priority: "desktop"` ainda esconde a
  categoria abaixo do desktop.
- A barra de filtros empilha com `direction={{ mobile: "vertical", desktop: "horizontal" }}`.
- O `Drawer` vira bottom sheet com `mobilePlacement="bottom"`, e o rodapé de paginação do
  `DataTable` fica compacto (‹ ›) abaixo de 640 px — veja
  [`Pagination`](../components/navigation.md#pagination).

## Testando o fluxo inteiro

Com o backend rodando, abra `/produtos` e confira:

1. Digite "café" na busca: a URL vira `?busca=caf%C3%A9` e sai **uma** requisição.
2. Clique duas vezes em "Preço": `ordem=price_cents&dir=desc`, o mais caro primeiro.
3. Troque para 50 por página estando na página 2: a URL fica com `por_pagina=50` e sem `pagina`.
4. Cadastre um produto com um SKU que já existe: o erro aparece **embaixo do SKU**, e o drawer
   continua aberto com o que você digitou.
5. Marque dois produtos e exclua: um toast de sucesso, e um de erro se algum foi recusado.
6. Aperte "voltar" no navegador: busca, filtros e página voltam juntos, e a caixa de busca também.

!!! note "O que foi conferido no navegador"
    Os seis passos acima rodaram no Chromium contra um backend simulado (`fetch` mockado com o
    contrato desta página), a 1280 px e a 390 px de largura.

## Recap

- `createDataProvider` + `useList`/`useCreate`/`useUpdate`/`useDeleteMany` dão o CRUD inteiro sem
  uma `queryKey` escrita à mão. Callbacks de tela vão no `mutate(…, { onSuccess, onError })`.
- O `DataTable` com `totalItems` delega página, tamanho e ordenação para você; guarde os três na URL.
- `useUrlState` guarda página, filtros e ordem na URL; escritas do mesmo clique viram uma navegação.
- A busca é a do `DataTable`, controlada pela URL e com `searchDebounceMs`: uma requisição por busca,
  não por tecla.
- `useZodForm` + `FormField` validam no cliente; `error.fields` e `describeApiError` levam o erro
  do servidor para o campo certo e para o toast.
- Toda tela real tem carregando, vazio, vazio por filtro, erro e celular. Os cinco estão aqui. ✅
