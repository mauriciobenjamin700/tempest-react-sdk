# App do zero em 1 minuto

O time de estoque da Loja Aurora pediu um app para conferir produtos e preços. Você quer
algo rodando **hoje**, com login, rota protegida, cliente HTTP e tema, e não quer gastar
a manhã montando a pirâmide de providers à mão. 🚀

A CLI [`create-tempest-app`](../scaffold.md) gera um projeto Vite + React + TypeScript
já ligado ao SDK. Esta receita vai do comando vazio até a primeira tela de verdade,
falando com o backend.

!!! info "O que você precisa"
    Node 22.12 ou mais novo (o `engines` do SDK) e `npm`. Mais nada: a CLI vem **dentro** do
    `tempest-react-sdk` e roda pelo `npx`.

## O que vamos construir

- 📦 O projeto gerado, rodando em `http://127.0.0.1:5173`.
- 🧭 Um tour rápido pelo que a CLI criou e por que cada arquivo existe.
- 🛒 A primeira tela real: **Produtos**, protegida por login e carregada sob demanda.
- ⏳ Os estados dessa tela: carregando, erro, vazio e lista.

## 1. Gere o projeto

```bash
mkdir estoque-aurora
cd estoque-aurora
npx -p tempest-react-sdk create-tempest-app .
npm install
cp .env.example .env
npm run dev
```

Abra <http://127.0.0.1:5173>. O app já está no ar com providers, rotas e store de
autenticação funcionando. ✅

O que cada pedaço do comando faz:

- `npx -p tempest-react-sdk` diz **de qual pacote** vem o binário. A CLI mora dentro do
  SDK, com outro nome, por isso o `-p`.
- `create-tempest-app .` gera **no diretório atual**. O nome do projeto sai do nome da
  pasta, e arquivos que já existem (`README.md`, `.git`) são preservados.
- `cp .env.example .env` cria o `.env` com `VITE_API_URL`, o endereço do backend.

!!! warning "`npm create tempest-app` não funciona"
    Não existe pacote `create-tempest-app` no npm. A CLI é o `bin` do
    `tempest-react-sdk`. Use sempre `npx -p tempest-react-sdk create-tempest-app .`.

## 2. O que a CLI gerou

```text
estoque-aurora/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── routes.tsx
    ├── layouts/RootLayout.tsx
    ├── pages/Home.tsx
    ├── pages/Login.tsx
    ├── pages/Dashboard.tsx
    ├── stores/auth.ts
    └── lib/api.ts
```

O coração é o `src/App.tsx`. Ele liga tudo com dois componentes:

```tsx
// src/App.tsx
import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Something went wrong.</p> }}>
      <AppRouter routes={routes} fallback={<p>Loading…</p>} />
    </AppProviders>
  );
}
```

- [`<AppProviders>`](../app-providers.md) aninha `ErrorBoundary → QueryProvider →
  ThemeProvider` na ordem certa (e o `I18nProvider`, quando você passa `i18n`).
- [`<AppRouter>`](../routing.md) monta o router, o `<Suspense>` e as `<Routes>` a partir
  de um array de rotas.

Cada um dos outros arquivos demonstra uma peça do SDK que você vai reaproveitar:

| Arquivo              | O que ele mostra                                                     |
| -------------------- | -------------------------------------------------------------------- |
| `vite.config.ts`     | `createViteConfig` + `tempestCsp`: Vite, alias `@` e CSP prontos     |
| `src/routes.tsx`     | `defineRoutes` com rota `lazy` e `guard` de autenticação             |
| `src/stores/auth.ts` | `createAuthStore` + `createSelectors`: a sessão persistida           |
| `src/lib/api.ts`     | `createApiClient` + `createQueryKeys`: cliente HTTP e chaves de cache |

!!! note "O login gerado é de mentira, de propósito"
    `src/pages/Login.tsx` cria uma sessão falsa com um clique, para você ver a rota
    protegida funcionando sem backend. Troque pelo login real da receita
    [Fluxo de autenticação completo](auth-flow.md) quando o backend estiver pronto.

## 3. A primeira tela de verdade

O backend de estoque, um serviço FastAPI com `tempest-fastapi-sdk`, devolve:

```text
GET /products
200 → [ { "sku": "AUR-0042", "name": "Caneca esmaltada 350 ml", "price": 49.9, "stock": 18 } ]
```

### A página

```tsx
// src/pages/Products.tsx
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  ErrorState,
  Page,
  formatCurrency,
  type DataTableColumn,
} from "tempest-react-sdk";
import { api } from "@/lib/api";

interface Product {
  sku: string;
  name: string;
  price: number;
  stock: number;
}

const columns: DataTableColumn<Product>[] = [
  { key: "sku", header: "SKU", priority: "tablet" },
  { key: "name", header: "Produto", sortable: true },
  {
    key: "price",
    header: "Preço",
    sortable: true,
    align: "right",
    render: (row) => formatCurrency(row.price),
  },
  { key: "stock", header: "Estoque", sortable: true, align: "right" },
];

export default function Products() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["app", "products"],
    queryFn: () => api.get<Product[]>("/products"),
  });

  return (
    <Page title="Produtos" description="Preço e estoque de cada item da loja.">
      {isError ? (
        <ErrorState
          title="Não foi possível carregar os produtos"
          retryLabel="Tentar de novo"
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          rowKey={(row) => row.sku}
          searchable
          searchKeys={["sku", "name"]}
          pageSize={20}
          emptyMessage="Nenhum produto cadastrado"
          loading={isLoading}
        />
      )}
    </Page>
  );
}
```

### A rota

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { useAuth } from "@/stores/auth";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      {
        path: "dashboard",
        lazy: () => import("@/pages/Dashboard"),
        guard: () => useAuth.use.isAuthenticated(),
        redirectTo: "/login",
      },
      {
        path: "produtos",
        lazy: () => import("@/pages/Products"),
        guard: () => useAuth.use.isAuthenticated(),
        redirectTo: "/login",
        preserveFrom: true,
      },
    ],
  },
]);
```

Salve, faça o login de demonstração e abra <http://127.0.0.1:5173/produtos>. 🎉

## Pedaço por pedaço

### `lazy` separa a página num pedaço próprio

`lazy: () => import("@/pages/Products")` faz o Vite gerar um arquivo JavaScript só para
essa tela. Quem nunca abre Produtos nunca baixa esse código. Por isso a página usa
`export default`: é o que o `import()` dinâmico entrega. O `<AppRouter>` mostra o
`fallback` enquanto o pedaço chega e, se o deploy trocou os arquivos no meio do
caminho, tenta de novo antes de desistir. Veja
[Lazy loading](../routing.md#lazy-loading-o-fallback-do-suspense).

### `guard` protege, `preserveFrom` devolve

O `guard` roda dentro do render da rota, então pode ler o store por hook. Quando a
sessão some, a rota re-renderiza e manda para `/login`. Com `preserveFrom: true`, o
redirect leva o endereço pedido, e a tela de login pode voltar para ele com
`useReturnTo`. Veja
[Voltar para onde estava](../routing.md#voltar-para-onde-estava-depois-do-login).

### A tela tem os quatro estados

- ⏳ **Carregando**: `loading={isLoading}` desenha linhas-esqueleto.
- ❌ **Erro**: `ErrorState` com **Tentar de novo**, que chama `refetch()`.
- 🫙 **Vazio**: o `emptyMessage` da tabela.
- 📋 **Lista**: busca por SKU e nome, ordenação por preço e estoque.

No celular, a coluna SKU some (`priority: "tablet"`) e ficam produto, preço e estoque. 📱
Para listas que crescem sem limite, troque pela versão com paginação no servidor da
receita [Lista paginada com busca e ordenação](search-list.md).

??? tip "Já tem um projeto? Ou quer PWA?"
    Dentro de um projeto que já existe, rode `npm install tempest-react-sdk` e
    `npx create-tempest-app .`. A CLI gera `src/` e as configs no diretório atual,
    **preserva** os arquivos que já existem e mescla o `package.json`.

    Para um app instalável, com service worker e push, acrescente `--pwa`:
    `npx -p tempest-react-sdk create-tempest-app . --pwa`. Detalhes em
    [Modo PWA](../scaffold.md#modo-pwa-pwa).

## Recap

- ✅ `npx -p tempest-react-sdk create-tempest-app .` gera o projeto na pasta atual.
- ✅ `<AppProviders>` + `<AppRouter>` já ligam error boundary, React Query, tema e
  roteamento.
- ✅ Página nova = arquivo em `src/pages/` com `export default` + entrada `lazy` em
  `src/routes.tsx`.
- ✅ `guard` por hook + `preserveFrom` protegem a rota e devolvem a pessoa depois do
  login.
- ✅ `DataTable`, `ErrorState` e `Page` dão os estados da tela sem CSS próprio.
