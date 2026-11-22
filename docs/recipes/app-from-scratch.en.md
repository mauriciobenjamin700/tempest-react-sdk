# App from scratch in 1 minute

Loja Aurora's stock team asked for an app to check products and prices. You want
something running **today**, with login, a protected route, an HTTP client and theming,
and you do not want to spend the morning building the provider pyramid by hand. 🚀

The [`create-tempest-app`](../scaffold.md) CLI generates a Vite + React + TypeScript
project already wired to the SDK. This recipe goes from the empty command to the first
real screen, talking to the backend.

!!! info "What you need"
    Node 22.12 or newer (the SDK's `engines`) and `npm`. Nothing else: the CLI ships
    **inside** `tempest-react-sdk` and runs through `npx`.

## What we are building

- 📦 The generated project, running at `http://127.0.0.1:5173`.
- 🧭 A quick tour of what the CLI created and why each file exists.
- 🛒 The first real screen: **Produtos** (products), protected by login and loaded on
  demand.
- ⏳ That screen's states: loading, error, empty and list.

## 1. Generate the project

```bash
mkdir estoque-aurora
cd estoque-aurora
npx -p tempest-react-sdk create-tempest-app .
npm install
cp .env.example .env
npm run dev
```

Open <http://127.0.0.1:5173>. The app is already up with providers, routes and the auth
store working. ✅

What each piece of the command does:

- `npx -p tempest-react-sdk` says **which package** the binary comes from. The CLI lives
  inside the SDK under another name, hence the `-p`.
- `create-tempest-app .` generates **in the current directory**. The project name comes
  from the folder name, and files that already exist (`README.md`, `.git`) are kept.
- `cp .env.example .env` creates the `.env` with `VITE_API_URL`, the backend address.

!!! warning "`npm create tempest-app` does not work"
    There is no `create-tempest-app` package on npm. The CLI is the `bin` of
    `tempest-react-sdk`. Always use `npx -p tempest-react-sdk create-tempest-app .`.

## 2. What the CLI generated

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

The heart is `src/App.tsx`. It wires everything with two components:

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

- [`<AppProviders>`](../app-providers.md) nests `ErrorBoundary → QueryProvider →
  ThemeProvider` in the right order (and `I18nProvider`, when you pass `i18n`).
- [`<AppRouter>`](../routing.md) mounts the router, the `<Suspense>` and the `<Routes>`
  from an array of routes.

Each of the other files shows an SDK piece you will reuse:

| File                 | What it shows                                                     |
| -------------------- | ----------------------------------------------------------------- |
| `vite.config.ts`     | `createViteConfig` + `tempestCsp`: Vite, the `@` alias and CSP ready |
| `src/routes.tsx`     | `defineRoutes` with a `lazy` route and an auth `guard`            |
| `src/stores/auth.ts` | `createAuthStore` + `createSelectors`: the persisted session      |
| `src/lib/api.ts`     | `createApiClient` + `createQueryKeys`: HTTP client and cache keys |

!!! note "The generated login is fake, on purpose"
    `src/pages/Login.tsx` creates a fake session with one click, so you can see the
    protected route working with no backend. Swap it for the real login from the
    [Full authentication flow](auth-flow.md) recipe once the backend is ready.

## 3. The first real screen

The stock backend, a FastAPI service with `tempest-fastapi-sdk`, returns:

```text
GET /products
200 → [ { "sku": "AUR-0042", "name": "Caneca esmaltada 350 ml", "price": 49.9, "stock": 18 } ]
```

### The page

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

### The route

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

Save, do the demo login and open <http://127.0.0.1:5173/produtos>. 🎉

## Piece by piece

### `lazy` splits the page into its own chunk

`lazy: () => import("@/pages/Products")` makes Vite emit a JavaScript file just for
this screen. Whoever never opens Produtos never downloads this code. That is why the
page uses `export default`: it is what the dynamic `import()` hands over. `<AppRouter>`
shows the `fallback` while the chunk arrives and, if a deploy swapped the files midway,
retries before giving up. See
[Lazy loading](../routing.md#lazy-loading-the-suspense-fallback).

### `guard` protects, `preserveFrom` brings back

The `guard` runs inside the route's render, so it can read the store through a hook.
When the session goes away, the route re-renders and sends to `/login`. With
`preserveFrom: true`, the redirect carries the requested address, and the login screen
can go back to it with `useReturnTo`. See
[Going back to where you were](../routing.md#going-back-to-where-you-were-after-signing-in).

### The screen has the four states

- ⏳ **Loading**: `loading={isLoading}` draws skeleton rows.
- ❌ **Error**: `ErrorState` with **Tentar de novo** (try again), which calls
  `refetch()`.
- 🫙 **Empty**: the table's `emptyMessage`.
- 📋 **List**: search by SKU and name, sorting by price and stock.

On a phone, the SKU column disappears (`priority: "tablet"`) and product, price and
stock remain. 📱 For lists that grow without limit, switch to the server-paginated
version in the [Paginated list with search and sorting](search-list.md) recipe.

??? tip "Already have a project? Or want a PWA?"
    Inside an existing project, run `npm install tempest-react-sdk` and
    `npx create-tempest-app .`. The CLI generates `src/` and the configs in the current
    directory, **keeps** files that already exist and merges `package.json`.

    For an installable app, with service worker and push, add `--pwa`:
    `npx -p tempest-react-sdk create-tempest-app . --pwa`. Details in
    [PWA mode](../scaffold.md#pwa-mode-pwa).

## Recap

- ✅ `npx -p tempest-react-sdk create-tempest-app .` generates the project in the current
  folder.
- ✅ `<AppProviders>` + `<AppRouter>` already wire error boundary, React Query, theme and
  routing.
- ✅ A new page = a file in `src/pages/` with `export default` + a `lazy` entry in
  `src/routes.tsx`.
- ✅ A `guard` through a hook + `preserveFrom` protect the route and bring the person
  back after login.
- ✅ `DataTable`, `ErrorState` and `Page` give the screen's states with no CSS of your
  own.
