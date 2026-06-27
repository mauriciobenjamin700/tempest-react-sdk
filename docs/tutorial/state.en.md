# Tutorial — State

On the previous page, the dashboard guard read
`useAuth.getState().isAuthenticated` — but the `useAuth` store doesn't exist yet.
Let's create it now. Along the way, you'll learn the SDK's two state pieces:
`createStore` (a generic store) and `createAuthStore` (the ready-made auth store),
both on top of [Zustand](https://github.com/pmndrs/zustand), with
`createSelectors` on top.

State is everything that lives **outside** a single component and needs to be read
in several places: the user session, a task filter, a counter. That's what this
page is about.

## `createStore` — a generic store

Start with the simplest. `createStore` takes a Zustand-style _initializer_
`(set) => state` and returns a bound hook. Let's store the task-list filter:

```ts
// src/stores/filter.ts
import { createStore } from "tempest-react-sdk";

type Filter = "all" | "active" | "done";

interface FilterState {
  filter: Filter;
  setFilter: (filter: Filter) => void;
}

export const useFilter = createStore<FilterState>((set) => ({
  filter: "all",
  setFilter: (filter) => set({ filter }),
}));
```

Inside a component, you use it like any Zustand hook — passing a **selector** to
read only the slice you care about:

```tsx
// src/components/FilterTabs.tsx
import { useFilter } from "@/stores/filter";

export function FilterTabs() {
  const filter = useFilter((s) => s.filter);
  const setFilter = useFilter((s) => s.setFilter);

  return (
    <div>
      <button onClick={() => setFilter("all")} disabled={filter === "all"}>
        All
      </button>
      <button onClick={() => setFilter("active")} disabled={filter === "active"}>
        Active
      </button>
      <button onClick={() => setFilter("done")} disabled={filter === "done"}>
        Done
      </button>
    </div>
  );
}
```

`useFilter((s) => s.filter)` subscribes to **only** `filter` — if another slice of
state changes, this component does not re-render.

## `createSelectors` — one hook per field

Writing `(s) => s.filter` inline everywhere is repetitive, and it's easy to slip
and write `const state = useFilter()` — which subscribes to the **whole** store
and re-renders whenever **any** field changes. `createSelectors` fixes that: you
wrap the store and get a `.use` namespace with one hook per field.

```ts
// src/stores/filter.ts
import { createStore, createSelectors } from "tempest-react-sdk";

type Filter = "all" | "active" | "done";

interface FilterState {
  filter: Filter;
  setFilter: (filter: Filter) => void;
}

export const useFilter = createSelectors(
  createStore<FilterState>((set) => ({
    filter: "all",
    setFilter: (filter) => set({ filter }),
  })),
);
```

Now each field is its own hook under `.use`:

```tsx
// src/components/FilterTabs.tsx
import { useFilter } from "@/stores/filter";

export function FilterTabs() {
  const filter = useFilter.use.filter(); // subscribes to only `filter`
  const setFilter = useFilter.use.setFilter();
  // ...same buttons as before...
}
```

!!! tip "Why this matters for performance"

    `useFilter.use.filter()` subscribes to **only** `filter`. In an app with many
    state slices, a component that only shows the filter won't re-render when the
    task list changes. You get selector granularity without writing selector
    functions by hand. ✅

## `createAuthStore` — the ready-made auth store

The user session always has the same shape: `user`, `token`, `isAuthenticated`,
plus `setSession` / `logout` actions. The SDK ships this ready and **persisted**
with `createAuthStore`. You only tell it your **user shape** (`TUser`) — the SDK
does not own your user model.

```ts
// src/stores/auth.ts
import { createAuthStore, createSelectors } from "tempest-react-sdk";

export interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = createSelectors(
  createAuthStore<User>({ name: "app-auth", storage: "local" }),
);
```

- `createAuthStore<User>` creates the Zustand auth store with `persist`.
- `name: "app-auth"` is the storage key.
- `storage: "local"` uses `localStorage` (survives across sessions); `"session"`
  would use `sessionStorage`.
- `createSelectors(...)` gives the per-field hooks via `useAuth.use.<field>()`.

The available state and actions:

| Field / action    | Type                                         | What it does                                          |
| ----------------- | -------------------------------------------- | ----------------------------------------------------- |
| `user`            | `User \| null`                               | The logged-in user, or `null`.                        |
| `token`           | `string \| null`                             | The current access token.                             |
| `isAuthenticated` | `boolean`                                    | Derived from `!!token`.                               |
| `setSession`      | `(s: { user: User; token: string }) => void` | Log in: store user + token at once.                   |
| `setUser`         | `(user: User \| null) => void`               | Update just the user.                                 |
| `setToken`        | `(token: string \| null) => void`            | Update just the token (re-derives `isAuthenticated`). |
| `logout`          | `() => void`                                 | Log out: clear user, token and flag.                  |

!!! note "Automatic rehydration"

    Since the store is persisted, on page reload the SDK reads the payload saved
    in `localStorage` and restores `user` + `token`, re-deriving
    `isAuthenticated` from `!!token`. The user stays logged in across reloads —
    with no extra code.

## Reading the store in a component

Inside a React component, use the `.use` hooks so the UI re-renders when auth
changes:

```tsx
// src/layouts/RootLayout.tsx
import { Link, Outlet } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export function RootLayout() {
  const isAuthenticated = useAuth.use.isAuthenticated();
  const user = useAuth.use.user();
  const logout = useAuth.use.logout();

  return (
    <div>
      <nav>
        <Link to="/">Tasks</Link>
        {isAuthenticated ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <span>Hi, {user?.name}</span>
            <button onClick={logout}>Sign out</button>
          </>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

## Reading the store outside React — `getState()`

Not all code that needs state is a component. The route guard from the previous
page runs **outside** the React tree and can't call hooks. For those cases, use
`getState()` on the bound hook — a one-off snapshot, no subscription:

```ts
// guard excerpt, from the routing page
guard: () => useAuth.getState().isAuthenticated,
```

!!! warning "`getState()` doesn't subscribe — use it only outside React"

    `getState()` reads once and does **not** re-render anything when state changes
    later. Inside components, always prefer the hook (`useAuth.use.field()`) so the
    UI stays in sync. Reserve `getState()` for route guards, HTTP interceptors and
    other code outside the React tree.

## Recap

- **`createStore<T>(initializer, options?)`** creates a generic Zustand store;
  read with a selector (`useStore((s) => s.field)`) to subscribe to only what
  matters.
- **`createSelectors(store)`** adds the `.use` namespace, with one hook per field
  (`useStore.use.field()`) → fewer re-renders, no hand-written selectors. ✅
- **`createAuthStore<TUser>({ name, storage })`** is the ready-made, **persisted**
  auth store, with `user` / `token` / `isAuthenticated` / `setSession` /
  `setToken` / `setUser` / `logout`. You only define `TUser`.
- Inside components, read with `.use.field()`; outside React (guards,
  interceptors), read with `getState()` — a snapshot without subscription.
- Both are Zustand under the hood, so `createSelectors` and `getState()` work the
  same on either.

➡️ **Next page:** [Data fetching — providers, HTTP client and React Query](data-fetching.md)
