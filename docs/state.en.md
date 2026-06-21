# State (Zustand)

Every app needs state that lives **outside** a single component: the shopping cart, user preferences, the current step of a wizard, the auth session. The `state` module in `tempest-react-sdk` gives you two small pieces on top of [Zustand](https://github.com/pmndrs/zustand) for this: `createStore` (a generic store factory with optional persistence) and `createSelectors` (auto-generated per-field selectors for fewer re-renders).

The goal is that you never again hand-write the `persist` + `createJSONStorage` boilerplate or type out selectors one by one. You describe the state, and the SDK handles the rest. 🚀

!!! info "Already know `createAuthStore`?"
If you read the [Auth](auth.md) page, you've seen `createAuthStore<TUser>` — a **ready-made, persisted** auth store. `createStore` is its **generic counterpart**: it works for any domain slice (cart, preferences, wizard). Both are Zustand under the hood, so everything you learn here applies to both.

## What Zustand gives you (and why the SDK wraps it)

Zustand is a minimal hook-based store: you create a store with an _initializer_ `(set, get) => state` and get back a hook (`useStore`) that components subscribe to. When state changes, only the components reading that slice re-render.

It's excellent, but day to day you end up rewriting two pieces of ceremony over and over:

- **Persistence** — wrapping the store in the `persist` middleware, wiring up `createJSONStorage`, choosing between `localStorage` and `sessionStorage`, remembering `partialize`...
- **Per-field selectors** — to avoid re-renders you want to read a single field (`useStore((s) => s.count)`). Doing this by hand, field by field, is verbose and easy to get wrong.

The SDK collapses both into declarative options. You focus on the shape of the state. 💡

## `createStore` — the in-memory store

Let's start simple. With no options, `createStore` is a plain, **in-memory** Zustand store (it's gone on reload). You pass a standard Zustand initializer and get a bound hook back.

```ts
import { createStore } from "tempest-react-sdk";

interface CounterState {
  count: number;
  increment: () => void;
  reset: () => void;
}

export const useCounter = createStore<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}));
```

Inside a component you use it like any Zustand hook:

```tsx
function Counter() {
  const count = useCounter((s) => s.count);
  const increment = useCounter((s) => s.increment);
  return <button onClick={increment}>Clicked {count} times</button>;
}
```

The returned hook also carries Zustand's static methods: `useCounter.getState()`, `useCounter.setState()`, and `useCounter.subscribe()` (more on `getState` at the end).

## `createStore` with persistence

Now the good part. Pass `options.persist` and the SDK wraps the store in the `persist` middleware for you — picking the storage, serializing to JSON, and rehydrating on page load.

Here's a cart that survives reloads:

```ts
import { createStore } from "tempest-react-sdk";

interface CartState {
  items: string[];
  add: (id: string) => void;
  clear: () => void;
}

export const useCart = createStore<CartState>(
  (set) => ({
    items: [],
    add: (id) => set((s) => ({ items: [...s.items, id] })),
    clear: () => set({ items: [] }),
  }),
  { persist: { name: "cart", partialize: (s) => ({ items: s.items }) } },
);
```

Piece by piece:

- The **first argument** is the usual Zustand initializer — nothing changes.
- The **second argument** is `options`. With `persist`, the store now saves to storage.
- `name: "cart"` is the key used in storage. It's required when you persist.
- `partialize: (s) => ({ items: s.items })` says **what** to save — only `items`, not the functions.

### The `persist` options

| Option       | Type                        | Default   | What it does                                                   |
| ------------ | --------------------------- | --------- | -------------------------------------------------------------- |
| `name`       | `string`                    | —         | Storage key (required).                                        |
| `storage`    | `"local"` \| `"session"`    | `"local"` | `localStorage` (persists across sessions) or `sessionStorage`. |
| `partialize` | `(state) => Partial<T>`     | saves all | Selects which fields to serialize.                             |
| `version`    | `number`                    | —         | Persisted schema version — pair with `migrate`.                |
| `migrate`    | `(persisted, version) => T` | —         | Transforms an old payload into the current shape on rehydrate. |

!!! tip "Always use `partialize` for transient fields"
Derived or ephemeral state — a `isLoading` spinner, a just-typed `searchQuery`, handlers — should **not** live in storage. If you persist everything, an `isLoading: true` saved mid-request could rehydrate stuck at `true` on the next reload. List in `partialize` only what is durable source-of-truth (here, `items`). ✅

### Rehydration across reloads

When the page loads, the `persist` middleware reads the saved payload from storage and **merges** it back into the initial state. Concretely, for the cart example:

1. The user adds `"sku-1"` and `"sku-2"` → `items` becomes `["sku-1", "sku-2"]` and is saved to `localStorage["cart"]`.
2. The user reloads the tab. The component mounts with the initializer (`items: []`).
3. `persist` reads `localStorage["cart"]` and rehydrates `items` to `["sku-1", "sku-2"]`.
4. Components subscribed to `items` re-render with the restored cart.

With web storage this happens synchronously, so on the first paint the state is already restored — no flash of an empty cart.

!!! note "Versioning the persisted schema"
Changed the shape of the saved state (renamed a field, swapped `string[]` for objects)? Bump `version` and write a `migrate` that takes the old payload and returns the new shape. Without it, an old payload in a user's browser may rehydrate with a shape your code no longer expects.

## `createSelectors` — one subscription per field

By default, reading state with `useStore((s) => s.count)` already subscribes only to `count`. But writing that inline selector everywhere is repetitive, and it's easy to slip and write `const state = useStore()` — which subscribes to the **whole** store and re-renders the component whenever **any** slice changes.

`createSelectors` fixes this. You pass a bound store and get back **the same hook**, now with a `.use` namespace holding one memoized selector hook per top-level state key.

```ts
import { createStore, createSelectors } from "tempest-react-sdk";

interface CounterState {
  count: number;
  increment: () => void;
  reset: () => void;
}

export const useCounter = createSelectors(
  createStore<CounterState>((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 })),
    reset: () => set({ count: 0 }),
  })),
);
```

Now each field is its own hook under `.use`:

```tsx
function Counter() {
  const count = useCounter.use.count(); // with createSelectors
  // equivalent to: const count = useCounter((s) => s.count);  // plain Zustand
  return <span>{count}</span>;
}
```

`useCounter.use.count()` subscribes to **only** `count`. If another slice of state changes, this component does not re-render. You get selector-level granularity without typing selector functions.

!!! tip "Why this matters for performance"
In a store with many fields, a component that only shows `count` shouldn't re-render when `items` changes. The per-field selectors under `.use` give exactly that isolation — each component subscribes to the minimum it needs, and re-renders become localized instead of global.

### Combining with `createAuthStore`

Because `createAuthStore` also returns a bound Zustand store, you can wrap it with `createSelectors` the same way:

```ts
// auto-selectors over an auth store
import { createAuthStore, createSelectors } from "tempest-react-sdk";

interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = createSelectors(createAuthStore<User>({ name: "app-auth" }));

// in a component:
//   const isAuthenticated = useAuth.use.isAuthenticated();
//   const logout = useAuth.use.logout();
```

Each field of the auth state (`user`, `token`, `isAuthenticated`, `logout`, ...) becomes an isolated hook under `useAuth.use`.

## Reading state outside React — `getState()`

Not all code that needs state is a component. An HTTP interceptor, a route guard, a utility — these run outside the React tree and can't call hooks. For them, use `getState()` on the bound hook:

```ts
import { useAuth } from "./auth-store";

function requireAuth(): boolean {
  // No hook — a synchronous, one-off read, outside React.
  return useAuth.getState().isAuthenticated;
}
```

This is exactly how a route guard reads the auth session: it needs the value _now_, once, without subscribing for re-renders. `getState()` gives you a snapshot. (To _react_ to changes outside React, use `useStore.subscribe()`.)

!!! warning "`getState()` does not subscribe"
`getState()` reads once and won't re-render anything when state changes later. Inside components, always prefer the hook (`useStore(...)` or `useStore.use.field()`) so the UI stays in sync. Reserve `getState()` for non-React code.

## Recap

- **`createStore<T>(initializer, options?)`** wraps Zustand's `create`. With no `options` it's a plain in-memory store; with `options.persist` it gains persistence with no boilerplate.
- **`persist` options**: `name` (storage key, required), `storage` (`"local"` default or `"session"`), `partialize` (choose what to save — **always** exclude transient fields), `version` + `migrate` (schema evolution).
- **Rehydration** is automatic on load: the saved payload is merged back into the initial state.
- **`createSelectors(store)`** adds a `.use` namespace with one hook per field; `useStore.use.field()` subscribes to that field only → fewer re-renders.
- **`getState()`** reads state outside React (route guards, interceptors) — a one-off snapshot, no subscription.
- **`createStore` is the generic one; `createAuthStore` is the ready-made auth one.** Both are Zustand, so `createSelectors` and `getState()` work the same on each.
