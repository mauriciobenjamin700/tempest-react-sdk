# Tutorial — Routing

Our app will have more than one screen: the task list, a login page and a
dashboard. For the user to move between screens **without reloading the page**,
we need routes. On this page you'll add a new page, wire it to a URL, navigate
with `<Link>`, and finally create a **lazy** and **guarded** route.

Everything comes from `"tempest-react-sdk"` — you never import from
`react-router-dom` directly. The SDK wraps declarative React Router v7 and
exposes `defineRoutes`, `<AppRouter>`, `<Link>`, `<Outlet>` and `useNavigate` in
one place.

## The route tree that already exists

The generated app already has a tree in `src/routes.tsx`. Let's start from a lean
version of it: a layout at the root, with Home as the index route and login as a
child.

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
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
    ],
  },
]);
```

Piece by piece:

- `defineRoutes([...])` is a **typed identity** helper: it returns the same array,
  but with autocomplete and type checking. You annotate nothing by hand.
- The `"/"` route renders `<RootLayout>` (the "skeleton" with the navigation).
- `{ index: true }` is the layout's **default** route — what shows when the URL
  matches exactly `/`.
- `{ path: "login" }` matches `/login`.

!!! warning "`index` and `path` are mutually exclusive"

    A route is either an index (`index: true`) **or** has a `path`, never both.
    Setting both is a configuration error.

## The layout and the `<Outlet>`

The parent route renders the layout; child routes appear inside it, at the point
marked by `<Outlet>`. The navigation stays fixed, and only the content below
swaps.

```tsx
// src/layouts/RootLayout.tsx
import { Link, Outlet } from "tempest-react-sdk";

export function RootLayout() {
  return (
    <div>
      <nav>
        <Link to="/">Tasks</Link> | <Link to="/about">About</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

Use `<Link to="...">` (re-exported by the SDK) instead of `<a href="...">`: the
`<Link>` navigates client-side, without reloading the page. The `<Outlet>` is
where React Router injects the child route that matched the current URL.

## Adding a new page

Let's create an "About" page. First the component:

```tsx
// src/pages/About.tsx
export function About() {
  return (
    <section>
      <h1>About</h1>
      <p>A task list built with tempest-react-sdk.</p>
    </section>
  );
}
```

Now register the route as a child of the layout, alongside Home and login:

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { About } from "@/pages/About";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "about", element: <About /> },
    ],
  },
]);
```

Done: the **About** link in `RootLayout` now opens `/about` and the `<Outlet>`
shows the page. Nothing else to change. 🚀

## How it's all mounted: `<AppRouter>`

You never instantiate the router by hand. The `<AppRouter>` takes the tree and
builds the router, the `<Suspense>` and the `<Routes>` itself. In the generated
app it lives inside `App.tsx`:

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

The `fallback` is what shows while a **lazy** route (next section) downloads its
code. You'll understand `<AppProviders>` in detail on the
[data fetching](data-fetching.md) page — for now, just know it sits **outside**
the routing.

## Lazy route: loading code on demand

Heavy pages don't need to be in the initial bundle. The `lazy` field loads the
component only when the user visits the route. Unlike the other pages, a lazy
component needs a **`export default`**:

```tsx
// src/pages/Dashboard.tsx
export default function Dashboard() {
  return (
    <section>
      <h1>Dashboard</h1>
      <p>Your completed tasks and stats.</p>
    </section>
  );
}
```

And in the tree, swap `element` for `lazy`:

```tsx
// src/routes.tsx (excerpt)
{
  path: "dashboard",
  lazy: () => import("@/pages/Dashboard"),
},
```

While the chunk downloads, the `<AppRouter>` shows the `fallback` you passed in
`App.tsx`.

!!! note "Automatic retry on a stale chunk"

    After a deploy, chunk names change. A user with the tab open for hours may
    request a chunk that no longer exists and hit an import error. The SDK's
    `lazy` detects this and retries the load **automatically** — you don't write
    that retry by hand.

## Guarding a route with `guard`

The dashboard should only be visible to logged-in users. The `guard` field solves
this right in the tree: when the value is _falsy_, the `<AppRouter>` renders a
redirect in place of the `element`.

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { About } from "@/pages/About";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "about", element: <About /> },
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

A non-authenticated user who tries to open `/dashboard` lands on `/login`. The
`useAuth` store doesn't exist yet — you'll create it on the next page. For now,
focus on **how** the guard reads state.

!!! warning "The guard runs on render — read the store via `getState()`"

    The `guard` function is evaluated **during the route's render**, outside the
    hooks cycle. That's why it reads the value _at that instant_ with
    `useAuth.getState().isAuthenticated`. Do **not** capture the value outside the
    function (`const ok = useAuth.getState().isAuthenticated` at the top of the
    file) — you'd freeze the auth state at initial load.

## Programmatic navigation

Sometimes you navigate from code — for example, after a successful login. Use
`useNavigate`:

```tsx
// src/pages/Login.tsx (skeleton — we'll complete it later)
import { useNavigate } from "tempest-react-sdk";

export function Login() {
  const navigate = useNavigate();

  function handleLogin() {
    // ...authenticate...
    navigate("/dashboard");
  }

  return <button onClick={handleLogin}>Sign in</button>;
}
```

## Recap

- All routing comes from `"tempest-react-sdk"` — you never import from
  `react-router-dom`. ✅
- `defineRoutes([...])` types the tree; `<AppRouter routes={routes} />` builds
  router + `<Suspense>` + `<Routes>` itself.
- Use `index: true` for a layout's default route and `path` for the rest — never
  both.
- Layouts render children in the `<Outlet>`; navigate with `<Link to="...">` (in
  JSX) or `useNavigate()` (in code).
- `lazy: () => import("...")` loads code on demand (with automatic retry on a
  stale chunk) — the component needs `export default`.
- Guard routes with `guard` (boolean or function) + `redirectTo`; the guard runs
  on render, so read the store with `getState()`.

➡️ **Next page:** [State — the authentication store](state.md)
