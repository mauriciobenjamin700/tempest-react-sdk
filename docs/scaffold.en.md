# Scaffold — `create-tempest-app`

`create-tempest-app` is the official Tempest scaffolding CLI. With **one command** you create a React 19 + Vite + TypeScript app already wired up with `tempest-react-sdk`: providers, routing, an auth store, and an HTTP client come ready to run. The CLI is **not a separate package** — it ships **inside `tempest-react-sdk` itself** as the package's `bin` (`create-tempest-app`), alongside a bundled `template/` in the tarball.

```json
"bin": { "create-tempest-app": "./bin/create-tempest-app.mjs" }
```

This page is a tutorial: we go from an empty command to the app running in your browser, then walk through every generated file to understand which SDK feature it shows off. 🚀

!!! info "Versioned with the SDK"
Because the CLI lives inside `tempest-react-sdk`, it's **versioned together with the SDK**. Pinning a version means pinning the SDK version: `npx -p tempest-react-sdk@0.5.1 create-tempest-app …`. And the generated app's `tempest-react-sdk` dependency is **stamped to the very SDK version** that produced it — no hardcoded number that drifts out of date.

## Create your first app

For a **brand-new** folder (nothing installed yet), `npx` fetches the SDK and runs its `bin`:

```bash
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
cp .env.example .env
npm run dev            # http://127.0.0.1:5173
```

`-p tempest-react-sdk` tells `npx` which package to fetch; `create-tempest-app my-app` is the `bin` it runs, generating the project into the `my-app` folder.

Open **<http://127.0.0.1:5173>** — the app is already live with providers, routes, and the store working.

!!! tip "No project name?"
Running with **no argument** (or `.`) skips new-folder mode and **merges into the current directory** instead — see the next section.

!!! warning "The target folder must be empty"
In new-project mode (`create-tempest-app my-app`), the target directory **must not exist** or must be **empty**. This keeps you from overwriting one of your projects by accident. If the folder already has files, the CLI suggests using `.` to **merge** into the current directory instead of aborting (see the next section).

## Scaffold into an existing project

If you already have a project that depends on the SDK, you can generate `src/` + configs **into the current directory**, without creating a new folder:

```bash
npm install tempest-react-sdk
npx create-tempest-app .
```

Here `npx create-tempest-app` resolves the `bin` from the `tempest-react-sdk` you just installed — no `-p` needed. Running with **no argument** behaves the same as `.`.

In this "current directory" mode:

- **Existing files are left untouched** — the CLI skips each one that already exists and **reports** what it skipped, never overwriting anything of yours.
- An existing `package.json` has the Tempest scripts and deps **merged** in: your `name`/`version` and the scripts/deps already there are preserved, and `tempest-react-sdk` is pinned to the **SDK's own version** running the scaffold.

!!! info "The `.env`"
`.env.example` declares `VITE_API_URL`, the base used by the HTTP client in `src/lib/api.ts`. Copy it to `.env` and point it at your backend.

### Available scripts

The generated `package.json` ships these scripts:

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | `vite` — dev server at `127.0.0.1:5173`                   |
| `npm run build`     | `tsc --noEmit && vite build` — type-check and bundle      |
| `npm run preview`   | `vite preview` — serve the production build               |
| `npm run typecheck` | `tsc --noEmit` — type-check only                          |
| `npm run lint`      | `eslint .` — ESLint 9 flat config (react-hooks + refresh) |
| `npm run lint:fix`  | `eslint . --fix` — auto-fix what it can                   |

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
import { useQuery } from "@tanstack/react-query";
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

- The CLI is **`tempest-react-sdk`'s own `bin`** (`create-tempest-app`), with a bundled `template/` in the tarball — versioned together with the SDK, not a separate package. ✅
- New folder: `npx -p tempest-react-sdk create-tempest-app my-app` (the target folder **must be empty** or not exist; with no name it **prompts**, default `my-tempest-app`). Use `@X` on `-p` to pin the SDK version.
- Existing project: `npm install tempest-react-sdk` then `npx create-tempest-app .` (or no argument) generates into the current directory — **existing files are preserved** and `package.json` has scripts/deps **merged** (`tempest-react-sdk` pinned to the SDK version).
- `cd my-app && npm install && cp .env.example .env && npm run dev` takes you to **<http://127.0.0.1:5173>** with providers, routes, and auth working.
- Every generated file **demonstrates a feature**: `createViteConfig`, `AppProviders` + `AppRouter`, `defineRoutes` (lazy + guard), `createAuthStore` + `createSelectors`, `createApiClient` + `createQueryKeys`.
- To grow: add pages in `pages/` + entries in `routes.tsx`, create stores with `createStore`, and fetch data with `useQuery` + `queryKeys` + `api`.
