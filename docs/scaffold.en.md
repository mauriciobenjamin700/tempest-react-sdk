# Scaffold — `create-tempest-app`

`create-tempest-app` is the official Tempest scaffolding CLI. With **one command** you create a React 19 + Vite + TypeScript app already wired up with `tempest-react-sdk`: providers, routing, an auth store, and an HTTP client come ready to run. It's a **zero-dependency** Node CLI published to npm — nothing to install globally, you always run the latest version.

This page is a tutorial: we go from an empty command to the app running in your browser, then walk through every generated file to understand which SDK feature it shows off. 🚀

## Create your first app

Pick the package manager you already use — they all call the same CLI:

```bash
npm create tempest-app my-app
```

```bash
npx create-tempest-app my-app
```

```bash
pnpm create tempest-app my-app
```

All three do the same thing: download the latest CLI and generate the project into the `my-app` folder.

!!! tip "No project name?"
If you omit the name (`npm create tempest-app`), the CLI will **prompt** you interactively. The suggested default is `my-tempest-app` — just hit Enter to accept it.

!!! warning "The target folder must be empty"
The target directory **must not exist** or must be **empty**. This keeps you from overwriting one of your projects by accident. If the folder already has files, the CLI aborts without touching anything — delete it or pick another name.

## Run the app

Once scaffolding finishes, it's four steps to the home screen:

```bash
cd my-app
npm install
cp .env.example .env
npm run dev
```

Open **<http://127.0.0.1:5173>** — the app is already live with providers, routes, and the store working.

!!! info "The `.env`"
`.env.example` declares `VITE_API_URL`, the base used by the HTTP client in `src/lib/api.ts`. Copy it to `.env` and point it at your backend.

### Available scripts

The generated `package.json` ships four scripts:

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | `vite` — dev server at `127.0.0.1:5173`              |
| `npm run build`     | `tsc --noEmit && vite build` — type-check and bundle |
| `npm run preview`   | `vite preview` — serve the production build          |
| `npm run typecheck` | `tsc --noEmit` — type-check only                     |

## Tour of what gets generated

The generated project is lean on purpose: each file exists to **demonstrate an SDK feature** you'll reuse. Here's the full structure:

```text
my-app/
├── index.html
├── package.json          # deps: react, react-dom, tempest-react-sdk; devDeps: vite, @vitejs/plugin-react, typescript, @types/*
├── tsconfig.json         # @ -> ./src alias in "paths"
├── vite.config.ts        # export default createViteConfig()
├── .env.example          # VITE_API_URL
├── .gitignore
└── src/
    ├── main.tsx          # createRoot + "tempest-react-sdk/styles.css" + <App/>
    ├── App.tsx           # <AppProviders> wrapping <AppRouter routes fallback/>
    ├── routes.tsx        # defineRoutes([...]) with index, login, and a lazy + guarded dashboard
    ├── layouts/RootLayout.tsx   # nav (Link) + <Outlet/>, reads useAuth.use.isAuthenticated()
    ├── pages/Home.tsx
    ├── pages/Login.tsx          # fakes a session via useAuth.use.setSession() then navigate("/dashboard")
    ├── pages/Dashboard.tsx      # default export (lazy), protected route
    ├── stores/auth.ts           # createSelectors(createAuthStore<User>({ name: "app-auth" }))
    └── lib/api.ts               # createApiClient({ baseURL, getToken, onUnauthorized }) + createQueryKeys
```

### Each file → the SDK feature it shows

| File                 | SDK feature demonstrated                                    |
| -------------------- | ----------------------------------------------------------- |
| `vite.config.ts`     | `createViteConfig` — Vite config ready for the SDK          |
| `src/App.tsx`        | `AppProviders` + `AppRouter` — providers and routing        |
| `src/routes.tsx`     | `defineRoutes` with a `lazy` route + auth guard             |
| `src/stores/auth.ts` | `createAuthStore` + `createSelectors` — typed auth store    |
| `src/lib/api.ts`     | `createApiClient` + `createQueryKeys` — HTTP client + cache |

Let's look at the three most important ones.

#### `vite.config.ts` → `createViteConfig`

```ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig();
```

One line. `createViteConfig` already wires up the React plugin, the `@ -> ./src` alias, and the defaults the SDK expects. See the [Vite Config](./vite-config.md) page to customize.

#### `src/App.tsx` → `AppProviders` + `AppRouter`

```tsx
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

`AppProviders` mounts React Query, the error boundary, the theme, and the router in one shot. `AppRouter` consumes the routes array and renders the `fallback` while `lazy` routes load. Details in [App Providers](./app-providers.md).

#### `src/stores/auth.ts` → `createAuthStore` + `createSelectors`

```ts
import { createAuthStore, createSelectors } from "tempest-react-sdk";

export interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = createSelectors(createAuthStore<User>({ name: "app-auth" }));
```

`createAuthStore<User>` creates a persisted Zustand auth store (`name: "app-auth"` is the storage key). `createSelectors` gives you atomic access via `useAuth.use.<field>()` — that's how `RootLayout.tsx` reads `useAuth.use.isAuthenticated()` and `Login.tsx` calls `useAuth.use.setSession()`. More patterns in [State](./state.md).

!!! note "The rest is self-explanatory"
`routes.tsx` uses `defineRoutes([...])` with an index route, a login route, and a `dashboard` that is both **lazy** and **guarded**. `lib/api.ts` instantiates `createApiClient` with `baseURL`/`getToken`/`onUnauthorized` and exports `createQueryKeys` so you can organize your cache keys.

## Next steps

With the app running, here's how to grow from it:

### 1. Add a page

Create `src/pages/About.tsx` and register the route in `src/routes.tsx`:

```tsx
import { defineRoutes } from "tempest-react-sdk";

export const routes = defineRoutes([
  // ...existing routes
  { path: "/about", element: <About /> },
]);
```

### 2. Add a store

For non-auth state, use the SDK's `createStore`:

```ts
import { createStore } from "tempest-react-sdk";

export const useCounter = createStore<{ count: number; inc: () => void }>((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),
}));
```

### 3. Fetch data with React Query + queryKeys + api

Combine the HTTP client, the query keys, and `useQuery` (already available through `AppProviders`):

```tsx
import { useQuery } from "tempest-react-sdk";
import { api, queryKeys } from "@/lib/api";

export function UserList() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => api.get("/users"),
  });

  if (isLoading) return <p>Loading…</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

Go deeper in [Query](./query.md) and [HTTP](./http.md).

## Recap

- `npm create tempest-app my-app` (or `npx` / `pnpm create`) generates a **React 19 + Vite + TypeScript** app already wired with `tempest-react-sdk` — a zero-dependency CLI, always on the latest version. ✅
- With no name, it **prompts** (default `my-tempest-app`); the target folder **must be empty**.
- `cd my-app && npm install && cp .env.example .env && npm run dev` takes you to **<http://127.0.0.1:5173>** with providers, routes, and auth working.
- Every generated file **demonstrates a feature**: `createViteConfig`, `AppProviders` + `AppRouter`, `defineRoutes` (lazy + guard), `createAuthStore` + `createSelectors`, `createApiClient` + `createQueryKeys`.
- To grow: add pages in `pages/` + entries in `routes.tsx`, create stores with `createStore`, and fetch data with `useQuery` + `queryKeys` + `api`.
