# Lista paginada com busca e ordenação

No painel da Loja Aurora, duas telas parecem iguais e não são. A tela **Equipe** lista
as 40 pessoas com acesso ao painel. A tela **Clientes** lista 48 mil compradores. As
duas precisam de busca, ordenação por coluna, paginação e uma mensagem decente quando
nada aparece. 🔎

A diferença é **onde** a busca roda. Quarenta linhas cabem no navegador: o
[`DataTable<T>`](../components/advanced-data.md#datatablet) faz tudo em memória. Quarenta
e oito mil não cabem: o backend pagina, filtra e ordena, e a tabela só mostra a página
que chegou. Esta receita mostra as duas, com o mesmo componente.

!!! info "Antes de começar"
    Esta receita usa o cliente `api` da receita
    [Fluxo de autenticação completo](auth-flow.md) e o `QueryProvider` que já vem no
    [`<AppProviders>`](../app-providers.md). Instalação em
    [instalação manual](../index.md#instalacao-manual).

## O que vamos construir

- 👥 **Equipe**: lista pequena, busca e ordenação no navegador.
- 🛍️ **Clientes**: lista grande, busca com debounce, ordenação e paginação no servidor.
- ⏳ **Carregando**: linhas-esqueleto na altura real, sem a tabela pular.
- 🫙 **Vazio**: uma tela para "ainda não há clientes" e outra para "a busca não achou".
- ❌ **Erro**: mensagem e botão **Tentar de novo**.
- 📱 **Celular**: colunas menos importantes somem em tela estreita.

## Tela 1: a lista pequena (client-side)

O backend devolve a lista inteira:

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

### O que acontece aqui

- `DataTable` recebe o dataset **completo** em `data` e cuida de busca, ordenação e
  paginação no navegador. As colunas com `sortable: true` ordenam ao clicar no
  cabeçalho: asc → desc → sem ordenação.
- `searchable` coloca uma caixa de busca acima da tabela. Ela filtra por trecho do
  texto, sem diferenciar maiúscula de minúscula nem acento ("joao" acha "João"). `searchKeys` limita a busca a nome e
  e-mail, para "gerente" não casar com a coluna de papel.
- `loading={isLoading}` desenha linhas-esqueleto enquanto a primeira resposta não
  chega. "Estou buscando" e "não há nada" são frases diferentes, e o `emptyMessage` só
  aparece na segunda.
- `ErrorState` mostra a falha com um botão que chama `refetch()`. Veja
  [`ErrorState`](../components/feedback.md#errorstate).

!!! tip "Até quantas linhas o client-side aguenta?"
    Algumas centenas, tranquilo. Passou de mil, ou a lista cresce sem limite (clientes,
    pedidos, notas), vá para a tela 2. Além do peso, filtrar só o que está na memória
    mente para quem busca: o registro que não veio parece não existir.

## Tela 2: a lista grande (server-side)

Aqui o contrato é o envelope de paginação do `tempest-fastapi-sdk`, o mesmo do
`fastapi-pagination` (veja [Paginação](../integration-fastapi.md#4-paginacao)):

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
  const [search, setSearch] = useState<string>("");
  const [sort, setSort] = useState<DataTableSort<Customer> | null>({
    key: "nome",
    direction: "asc",
  });

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
        searchDebounceMs={400}
        onSearchChange={setSearch}
        emptyMessage={`Nenhum cliente encontrado para "${search}"`}
        loading={customers.isFetching}
      />
    </Page>
  );
}
```

### Pedaço por pedaço

**`totalItems` liga o modo servidor.** Com ele, `data` passa a ser só a página atual, a
contagem de páginas vem de `total`, e busca e ordenação viram eventos
(`onSearchChange`, `onSortChange`) em vez de filtros em memória. Veja
[`DataTable<T>` — paginação no servidor](../components/data.md#datatablet-paginacao-no-servidor).

**`usePaginatedQuery` é a outra metade.** Ele guarda a página, manda `page` e `size`
para a sua `queryFn` e devolve `items`, `total`, `pageNumber` e `setPage`: exatamente as
props que a tabela pede. Com `orderBy` definido, ele também manda `order_by` e
`ascending`. A página anterior fica na tela enquanto a próxima carrega, então a tabela
não pisca.

**A busca tem debounce.** Com `searchDebounceMs={400}` a caixa mostra cada tecla, mas
`onSearchChange` só é chamado quando a pessoa para de digitar por 400 ms. Sem isso,
"souza" viraria cinco requisições. A busca também ignora acento: "joao" acha "João".

**Filtro novo volta para a página 1.** `search` e `sort` estão na `queryKey`. Quando ela
muda, o `usePaginatedQuery` volta para a página 1 no mesmo render, sem pedir antes a
página 7 de um resultado que só tem 2.

!!! check "Os estados da tela"
    - ⏳ **Primeira carga**: `loading` sem linhas desenha esqueletos na altura real.
    - 🔄 **Trocando de página**: `loading` com linhas esmaece a tabela e marca
      `aria-busy`. As linhas antigas ficam, e o paginador não salta sob o dedo.
    - 🫙 **Loja sem clientes**: `EmptyState` no lugar da tabela inteira. Veja
      [`EmptyState`](../components/feedback.md#emptystate).
    - 🔍 **Busca sem resultado**: a tabela continua, com o `emptyMessage` e a caixa de
      busca à mão para corrigir o termo.
    - ❌ **Erro**: `ErrorState` com `onRetry={customers.refetch}`.

### E no celular? 📱

`priority` decide quem sai primeiro quando a tela estreita. `"tablet"` some abaixo de
768 px e `"desktop"` abaixo de 1024 px. No celular ficam **Nome**, **Total gasto** e
**Situação**, que é o que a atendente precisa ver no balcão. O CPF aparece no
computador, onde há espaço.

!!! warning "Busca e ordenação precisam ir juntas para o servidor"
    No modo servidor, `searchable` sem `onSearchChange` filtraria só a página que está
    na tela. A pessoa digitaria "Souza", não veria a Ana Souza da página 9 e concluiria
    que ela não existe. Com `totalItems`, a tabela já delega a busca. Seu trabalho é
    mandar o termo para o backend.

??? note "E o backend?"
    No lado FastAPI, o `tempest-fastapi-sdk` entrega o envelope `{ items, total, page,
    size, pages }` e lê `page`, `size`, `order_by` e `ascending` da query. O `q` é
    seu: um `ILIKE` em nome, e-mail e CPF resolve a maioria das telas. Se o seu backend
    usa `page_size` em vez de `size`, passe `sizeParam: "page_size"` ao
    `usePaginatedQuery`.

## Recap

- ✅ **Lista pequena**: `DataTable` com `data` completo, `searchable` e `sortable` faz
  tudo no navegador.
- ✅ **Lista grande**: `totalItems` + `page` + `onPageChange` ligam o modo servidor, e
  o `usePaginatedQuery` entrega essas props prontas.
- ✅ `searchDebounceMs` segura a busca; `search` e `sort` na `queryKey` voltam para a
  página 1.
- ✅ `loading`, `EmptyState`, `emptyMessage` e `ErrorState` cobrem carregando, vazio,
  busca sem resultado e erro.
- ✅ `priority` nas colunas resolve o celular.
