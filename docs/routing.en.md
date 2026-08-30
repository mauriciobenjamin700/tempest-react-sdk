# Routing

The `routing` module in `tempest-react-sdk` wraps **React Router in declarative mode** (`^7 || ^8`) and gives you a single import surface: you declare your route tree with `defineRoutes`, wire everything up with one `<AppRouter>`, and import every primitive (`Link`, `Outlet`, `useNavigate`, …) straight from the SDK. On top of that, the SDK adds what every Tempest app rewrites by hand: code-splitting with automatic retry on a stale chunk, declarative route guards, and a ready-made `<Suspense>` boundary. This page takes you from zero to a tree with nested layouts, lazy loading, and protected routes.

!!! warning "`react-router` is a peer dependency — install it in your app"
    ```bash
    npm install react-router
    ```

    The SDK does **not** bundle `react-router`, because it holds React context: a copy nested under `tempest-react-sdk/node_modules` would be a different `<Router>` than yours, and every SDK hook would throw `useNavigate() may be used only in the context of a <Router>`. The accepted range is `^7 || ^8` — the surface re-exported here is identical across both majors, and neither uses `react-router-dom` (the DOM bindings ship inside `react-router` itself).

## Why the SDK owns routing now

Before, each app built its own `<Suspense>`, wrote its own guard helper, and reinvented chunk retry. That bred divergence across Tempest apps and import paths scattered everywhere.

With the `routing` module you get:

- **One import surface.** Everything comes from `"tempest-react-sdk"` — components, hooks, and the re-exported React Router primitives. Your app installs `react-router` (the peer) but imports from a single place.
- **Declarative.** You describe _what_ the routes are (a tree of objects), not _how_ to assemble them imperatively.
- **Batteries included.** `<AppRouter>` already builds the router, the `<Suspense>`, and the `<Routes>`. `defineRoutes` gives you typing. Guards and lazy loading are fields on the route itself.

!!! info "Re-exported primitives"
    The SDK re-exports React Router's declarative primitives so you import everything from one place: `BrowserRouter`, `HashRouter`, `MemoryRouter`, `Routes`, `Route`, `Outlet`, `Navigate`, `Link`, `NavLink`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `useMatch`, `useRouteError`, and `redirect`.

    Importing straight from `react-router` also works and resolves to the same copy — the re-export is a convenience, not an isolation boundary. That is what makes incremental adoption possible: an app already importing `react-router` directly can start using the SDK without rewriting a single import.

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
| `guard`         | `boolean \| (() => RouteGuardResult)`       | `false` redirects, `true` renders, `"pending"` holds the decision.            |
| `guardFallback` | `ReactNode`                                 | Rendered while the guard answers `"pending"`. Defaults to the `<AppRouter>` `fallback`. |
| `redirectTo`    | `string`                                    | The guard's redirect target. Default `"/"`.                                   |
| `caseSensitive` | `boolean`                                   | Makes the `path` match case-sensitive.                                        |

!!! tip "A `lazy` page may declare props"
    `ComponentType` there is literal: any component works, whether its props are
    required, optional or absent. A page typed `({ id }: Props) => …` goes into
    the tree without a cast. Props the route needs to supply still come from the
    `element` or a context — `lazy` mounts the component with no arguments.

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
    The `guard` function is evaluated **during the route's render**. So it must read the state _at that moment_: use `useAuth.getState().isAuthenticated` (an imperative read, outside React) or call a hook straight in the guard function, which runs inside the render cycle — see the next section. Don't capture the value once outside the function: you'd freeze the auth state at initial load.

When `guard` is falsy, the user is redirected to `redirectTo` (default `"/"`). In the example above, anyone not authenticated who tries to open `/dashboard` lands on `/login`.

### The async function form: the third state `"pending"`

A two-answer guard cannot talk about a permission that has **not resolved yet** — and the SDK ships exactly one of those: `useCan`, which returns `{ allowed, isLoading }`. With only `true`/`false`, the guard has to answer something while the check is in flight, and both possible answers are wrong:

- answering `false` **redirects the person who does have** the permission, in a flash, every time the route is opened cold (F5 straight on the URL, an external link);
- answering `true` **renders the screen for someone who does not**, until the answer lands.

So the guard takes a third answer:

```ts
type RouteGuardResult = boolean | "pending";
```

`"pending"` holds the decision and renders `guardFallback` instead — no redirect, no leaked screen:

```tsx
// routes.tsx
import { defineRoutes, useCan } from "tempest-react-sdk";
import { Spinner } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      {
        path: "finance",
        lazy: () => import("@/pages/Finance"),
        redirectTo: "/",
        guardFallback: <Spinner size="lg" />,
        guard: function useFinanceGuard() {
          const { allowed, isLoading } = useCan({ action: "read", resource: "finance" });
          return isLoading ? "pending" : allowed;
        },
      },
    ],
  },
]);
```

!!! danger "Name the function `use…` — ESLint rejects it otherwise"
    The `guard` runs **inside the render**, so it may call hooks. But `react-hooks/rules-of-hooks` only accepts a hook inside a function whose name starts with `use` (or a `PascalCase` component). Written as an anonymous arrow, the example above fails linting with:

    ```text
    React Hook "useCan" is called in function "guard" that is neither a React
    function component nor a custom React Hook function.
    ```

    The form that passes is the **named function expression**, exactly as in the example:

    ```ts
    guard: function useFinanceGuard() { … }   // ✅ passes
    guard: () => { … useCan() … }             // ❌ lint error
    ```

    A guard with **no** hook (`() => useAuth.getState().isAuthenticated`) can stay an anonymous arrow — `getState()` is not a hook.

!!! tip "One spinner covers `lazy` and `pending`"
    When the route defines no `guardFallback`, the SDK uses the `fallback` you already handed `<AppRouter>` — the same one covering the `lazy` chunk load. Both are "not ready yet", and in most apps they deserve the same spinner.

!!! warning "Each guarded route remounts, and that is deliberate"
    React Router renders the matched route's element **at the same position** in the tree. Without a distinct key per route, React would reconcile two different routes onto the same guard instance, and the previous route's hook state would survive into the next — a guard reading `useState("from-a")` would still read `"from-a"` after navigating to a route whose guard initialises it to `"from-b"`. `<AppRouter>` keys by route object for exactly that reason, and a named test fails if the key ever goes away.

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

| Prop         | Type               | Default | Description                                    |
| ------------ | ------------------ | ------- | ---------------------------------------------- |
| `when`       | `RouteGuardResult` | —       | `true` renders the `children`, `false` redirects, `"pending"` holds. |
| `fallback`   | `ReactNode`        | `null`  | Rendered while `when` is `"pending"`.          |
| `redirectTo` | `string`           | `"/"`   | Target when `when` is false.                   |
| `replace`    | `boolean`          | `true`  | Replaces the history entry instead of pushing. |
| `children`   | `ReactNode`        | —       | What to protect.                               |

!!! tip "Same state-reading rule"
    Here you're inside a React component, so read the store with the hook (`useAuth((state) => state.isAuthenticated)`) to re-render when auth changes. The tree's `guard` runs **inside** the render too, so it has both options: `getState()` for a simple imperative read, or hooks — as long as the function is named `use…`, as in the `"pending"` section above.

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

- The `routing` module wraps **declarative React Router v8** and gives you a **single import surface** — everything comes from `"tempest-react-sdk"`.
- `defineRoutes` types your tree; `<AppRouter routes={...} />` builds router + `<Suspense>` + `<Routes>` on its own.
- Use `index: true` for a layout's default route and `path` for the rest — never both together.
- Nested layouts render children in the `<Outlet>`; navigate with `<Link>`.
- `lazy` does code-splitting with automatic retry on a stale chunk; show the Suspense `fallback` while it loads.
- Protect routes with `guard` (boolean or function) + `redirectTo`, or with `<RouteGuard when={...}>` in JSX. The guard runs on render, so it may call hooks — name the function `use…` for ESLint to accept it.
- A permission that resolves asynchronously answers `"pending"`: the decision is held and `guardFallback` (or the `<AppRouter>` `fallback`) shows, instead of redirecting someone who has access or leaking the screen to someone who does not.
- Pick the router with the `router` prop: `"browser"` in production, `"memory"` + `initialEntries` in tests.
