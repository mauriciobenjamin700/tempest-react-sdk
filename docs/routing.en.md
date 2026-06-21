# Routing

The `routing` module in `tempest-react-sdk` wraps **React Router v7 (declarative mode)** and gives you a single import surface: you declare your route tree with `defineRoutes`, wire everything up with one `<AppRouter>`, and import every primitive (`Link`, `Outlet`, `useNavigate`, …) straight from the SDK — never from `react-router-dom`. On top of v7, the SDK adds what every Tempest app rewrites by hand: code-splitting with automatic retry on a stale chunk, declarative route guards, and a ready-made `<Suspense>` boundary. This page takes you from zero to a tree with nested layouts, lazy loading, and protected routes.

## Why the SDK owns routing now

Before, each app installed `react-router-dom`, built its own `<Suspense>`, wrote its own guard helper, and reinvented chunk retry. That bred divergence across Tempest apps and import paths scattered everywhere.

With the `routing` module you get:

- **One import surface.** Everything comes from `"tempest-react-sdk"` — components, hooks, and the re-exported React Router primitives. Your app never imports from `react-router-dom`.
- **Declarative v7.** You describe _what_ the routes are (a tree of objects), not _how_ to assemble them imperatively.
- **Batteries included.** `<AppRouter>` already builds the router, the `<Suspense>`, and the `<Routes>`. `defineRoutes` gives you typing. Guards and lazy loading are fields on the route itself.

!!! info "Re-exported primitives"
The SDK re-exports React Router's declarative primitives so you import everything from one place: `BrowserRouter`, `HashRouter`, `MemoryRouter`, `Routes`, `Route`, `Outlet`, `Navigate`, `Link`, `NavLink`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `useMatch`, `useRouteError`, and `redirect`.

## Building the tree with `defineRoutes`

`defineRoutes` is an **identity** helper: it takes an array of `TempestRouteObject` and returns the same array, but fully typed. You get autocomplete and type-checking on the tree without annotating anything by hand.

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";

export const routes = defineRoutes([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "login",
    element: <Login />,
  },
]);
```

Each `TempestRouteObject` accepts:

| Field           | Type                                        | Description                                                                   |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `path`          | `string`                                    | The route's URL segment.                                                      |
| `index`         | `boolean`                                   | The parent's index route. Mutually exclusive with `path`.                     |
| `element`       | `ReactNode`                                 | What to render when the route matches.                                        |
| `lazy`          | `() => Promise<{ default: ComponentType }>` | Loads the component on demand (code-split). Automatic retry on a stale chunk. |
| `children`      | `TempestRouteObject[]`                      | Nested routes.                                                                |
| `guard`         | `boolean \| (() => boolean)`                | When falsy, renders a redirect instead of the `element`.                      |
| `redirectTo`    | `string`                                    | The guard's redirect target. Default `"/"`.                                   |
| `caseSensitive` | `boolean`                                   | Makes the `path` match case-sensitive.                                        |

Then just hand the tree to `<AppRouter>`:

```tsx
// App.tsx
import { AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return <AppRouter routes={routes} />;
}
```

`<AppRouter>` builds the router, the `<Suspense>`, and the `<Routes>` from the tree all on its own. Available props:

| Prop             | Type                              | Default     | Description                                               |
| ---------------- | --------------------------------- | ----------- | --------------------------------------------------------- |
| `routes`         | `TempestRouteObject[]`            | —           | The route tree (required).                                |
| `router`         | `"browser" \| "hash" \| "memory"` | `"browser"` | Which router kind to use.                                 |
| `basename`       | `string`                          | —           | A path prefix shared by every route.                      |
| `initialEntries` | `string[]`                        | —           | Initial history — only for the `"memory"` router.         |
| `fallback`       | `ReactNode`                       | —           | The `<Suspense>` fallback shown while a lazy chunk loads. |

## `index` vs `path`

Every route with `children` has to decide what to show when the URL matches the parent **exactly**. That is the `index` route: it has no `path` of its own, it just sets `index: true`.

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { About } from "@/pages/About";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "about", element: <About /> },
    ],
  },
]);
```

Here, opening `/` renders `<RootLayout>` with `<Home>` inside it; opening `/about` renders `<RootLayout>` with `<About>` inside it.

!!! warning "`index` and `path` are mutually exclusive"
A route is either an index (`index: true`) **or** it has a `path`, never both. Setting both is a configuration error.

## Nested layouts with `Outlet`

The parent route renders the **layout**; the children render inside it through `<Outlet>`. The `<Outlet>` is the spot where React Router injects the matched child route.

```tsx
// RootLayout.tsx
import { Link, Outlet } from "tempest-react-sdk";

export function RootLayout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>
      <Outlet />
    </div>
  );
}
```

The `<nav>` stays visible across every child route; the `<Outlet>` swaps content as the URL changes. Use `<Link>` (also re-exported by the SDK) to navigate without reloading the page.

!!! tip "Programmatic navigation"
To navigate from code (after a submit, for example), use `useNavigate`: `const navigate = useNavigate(); navigate("/dashboard");`.

## Lazy loading + the Suspense fallback

Heavy pages don't need to land in the initial bundle. Use the `lazy` field to load the component on demand. It takes a function that does a dynamic `import()` and returns the module with a `default`.

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      {
        path: "dashboard",
        lazy: () => import("@/pages/Dashboard"),
      },
    ],
  },
]);
```

Since the chunk takes a moment to download, `<AppRouter>` wraps everything in a `<Suspense>`. Pass a `fallback` to show something while it loads:

```tsx
// App.tsx
import { AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return <AppRouter routes={routes} fallback={<p>Loading…</p>} />;
}
```

!!! note "Automatic retry on a stale chunk"
When you ship a new deploy, chunk names change. A user who left a tab open for hours may request a chunk that no longer exists and hit an import error. The SDK's `lazy` detects that case and reloads automatically — you don't have to write that retry by hand.

## Guards: protecting routes

Almost every app has routes only authenticated users should see. The `guard` field handles this right on the tree: when the value is falsy, `<AppRouter>` renders a redirect instead of the `element`.

### Boolean form

If the condition is already available as a value, pass a boolean:

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { Dashboard } from "@/pages/Dashboard";

const isAuthenticated = false;

export const routes = defineRoutes([
  {
    path: "dashboard",
    element: <Dashboard />,
    guard: isAuthenticated,
    redirectTo: "/login",
  },
]);
```

### Function form (auth store)

In practice, the auth state lives in a store. Pass a **function** that reads the store at render time — that way the guard always sees the current value:

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth"; // a createAuthStore-based store
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";

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
        guard: () => useAuth.getState().isAuthenticated,
        redirectTo: "/login",
      },
    ],
  },
]);
```

!!! warning "The guard runs on render — read your store via `getState()` or a hook"
The `guard` function is evaluated **during the route's render**. So it must read the state _at that moment_: use `useAuth.getState().isAuthenticated` (an imperative read, outside React) or a selector hook inside a component. Don't capture the value once outside the function — you'd freeze the auth state at initial load.

When `guard` is falsy, the user is redirected to `redirectTo` (default `"/"`). In the example above, anyone not authenticated who tries to open `/dashboard` lands on `/login`.

## The standalone `RouteGuard`

Sometimes you want to protect a piece of UI that isn't a route — or you just prefer the guard explicit in JSX. That's what `<RouteGuard>` is for: it renders the `children` when `when` is truthy, otherwise it emits a `<Navigate>`.

```tsx
// ProtectedDashboard.tsx
import { RouteGuard } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";
import { Dashboard } from "@/pages/Dashboard";

export function ProtectedDashboard() {
  const isAuthenticated = useAuth((state) => state.isAuthenticated);

  return (
    <RouteGuard when={isAuthenticated} redirectTo="/login" replace>
      <Dashboard />
    </RouteGuard>
  );
}
```

`<RouteGuard>` props:

| Prop         | Type        | Default | Description                                    |
| ------------ | ----------- | ------- | ---------------------------------------------- |
| `when`       | `boolean`   | —       | Renders the `children` when truthy.            |
| `redirectTo` | `string`    | `"/"`   | Target when `when` is false.                   |
| `replace`    | `boolean`   | `true`  | Replaces the history entry instead of pushing. |
| `children`   | `ReactNode` | —       | What to protect.                               |

!!! tip "Same state-reading rule"
Here you're inside a React component, so read the store with the hook (`useAuth((state) => state.isAuthenticated)`) to re-render when auth changes — unlike the tree's `guard`, which uses `getState()` because it runs outside the hook lifecycle.

## Choosing the router kind

`<AppRouter>` accepts three kinds via the `router` prop:

- **`"browser"`** (default) — uses the History API; clean URLs (`/dashboard`). This is what you want in production.
- **`"hash"`** — URLs with a `#` (`/#/dashboard`). Useful when the server can't fall back every route to `index.html`.
- **`"memory"`** — in-memory history, never touching the browser URL. Ideal for **tests** and non-DOM environments.

In tests, combine `"memory"` with `initialEntries` to start on a specific route:

```tsx
// App.test.tsx
import { render, screen } from "@testing-library/react";
import { AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

test("renders the dashboard route", () => {
  render(
    <AppRouter
      routes={routes}
      router="memory"
      initialEntries={["/dashboard"]}
      fallback={<p>Loading…</p>}
    />,
  );

  expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
});
```

!!! note "`initialEntries` is `memory`-only"
`initialEntries` sets the initial history and only makes sense with `router="memory"`. On the `browser`/`hash` routers the initial route comes from the browser URL itself.

## Recap

- The `routing` module wraps **declarative React Router v7** and gives you a **single import surface** — everything comes from `"tempest-react-sdk"`.
- `defineRoutes` types your tree; `<AppRouter routes={...} />` builds router + `<Suspense>` + `<Routes>` on its own.
- Use `index: true` for a layout's default route and `path` for the rest — never both together.
- Nested layouts render children in the `<Outlet>`; navigate with `<Link>`.
- `lazy` does code-splitting with automatic retry on a stale chunk; show the Suspense `fallback` while it loads.
- Protect routes with `guard` (boolean or function) + `redirectTo`, or with `<RouteGuard when={...}>` in JSX. The guard runs on render — read the store via `getState()` (in the tree) or via a hook (in a component).
- Pick the router with the `router` prop: `"browser"` in production, `"memory"` + `initialEntries` in tests.
