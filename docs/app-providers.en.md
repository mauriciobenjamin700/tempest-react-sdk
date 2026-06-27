# AppProviders

Every React app needs a handful of providers at the top of the tree: data
caching, theming, internationalization, error capture. `<AppProviders>` wires
them all together in **one declarative block** — you say what you want enabled
and how to configure it, and the SDK builds the pyramid in the right order for
you. 🚀

## The problem: the provider pyramid

Without `<AppProviders>`, the root of your app tends to become a hand-nested
pyramid. You have to remember **which** providers exist, the **right** nesting
order, and repeat it in every project:

```tsx
// App.tsx — manual assembly (what we want to avoid)
import {
  ErrorBoundary,
  QueryProvider,
  ThemeProvider,
  I18nProvider,
  AppRouter,
} from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <ErrorBoundary fallback={<p>Something went wrong.</p>}>
      <QueryProvider>
        <ThemeProvider>
          <I18nProvider locale="pt-BR" messages={messages}>
            <AppRouter routes={routes} fallback={<p>Loading…</p>} />
          </I18nProvider>
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
```

It works, but it's brittle: order matters (the `ErrorBoundary` must sit on the
outside to catch errors from the inner providers), the nesting grows diagonally,
and every app rewrites the same structure.

!!! note "The providers still exist standalone"

    `QueryProvider`, `ThemeProvider`, `I18nProvider`, and `ErrorBoundary` remain
    exported individually — use them directly when you need fine-grained control.
    `<AppProviders>` is just the convenience that wires the four together for you.

## The solution: a single block

```tsx
// App.tsx
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

That's it. `<AppProviders>` nests everything outer to inner in this order:

```text
ErrorBoundary → QueryProvider → ThemeProvider → I18nProvider → children
```

Notice that **Query and Theme are already on** with the SDK defaults — you
didn't have to configure anything. We only passed `errorBoundary` because it's
opt-in (see below).

!!! tip "Where `<AppProviders>` sits"

    The providers sit **outside** the routing; the `<AppRouter>` (and therefore
    all your routes) sits **inside**. That way every page gets access to cache,
    theme, and i18n, and any render error from any route lands in the
    `ErrorBoundary`. See the routing page for details on `<AppRouter>`.

## What's on by default vs. opt-in

| Prop            | Default state | How to enable / configure                  |
| --------------- | ------------- | ------------------------------------------ |
| `query`         | **On**        | Already active. Pass an object to tune it. |
| `theme`         | **On**        | Already active. Pass an object to tune it. |
| `i18n`          | Off (opt-in)  | Pass `{ locale, messages }` to mount it.   |
| `errorBoundary` | Off (opt-in)  | Pass `{ fallback }` to mount it.           |

- **`query`** and **`theme`** are already active with the SDK defaults — the
  common case (you want data caching and theming) requires no configuration.
- **`i18n`** and **`errorBoundary`** only enter the tree when you pass the
  matching prop. Omit it? The provider is simply not mounted.

!!! info "Query defaults"

    When on by default, `QueryProvider` uses: a 5-minute `staleTime`, a
    30-minute `gcTime`, `retry: 1`, and `refetchOnWindowFocus: false`.

## Disabling a default with `false`

Sometimes the app already mounts its own `QueryClient`, or you don't want the
SDK's theme. Pass `false` to the prop to **remove that provider** from the tree:

```tsx
// query and theme disabled — the app mounts its own outside
import { AppProviders } from "tempest-react-sdk";

export function App() {
  return (
    <AppProviders query={false} theme={false}>
      <YourOwnProviders />
    </AppProviders>
  );
}
```

!!! warning "`false` removes the provider — it doesn't silently disable it"

    With `query={false}`, no `QueryClient` is mounted by `<AppProviders>`. If a
    child component uses `useQuery`, it needs a provider mounted by you higher up
    the tree — otherwise React Query throws at runtime.

## Tuning each provider

Each prop accepts an object with the same options as the standalone provider
(minus `children`, which `<AppProviders>` controls).

### Query

```tsx
import { AppProviders } from "tempest-react-sdk";

<AppProviders query={{ defaultOptions: { queries: { retry: 3 } } }}>
  <App />
</AppProviders>;
```

You can also pass an already-configured `client` (`QueryClient`) instead of
`defaultOptions`.

### Theme

```tsx
import { AppProviders } from "tempest-react-sdk";

<AppProviders theme={{ defaultTheme: "dark", storageKey: "my-app-theme" }}>
  <App />
</AppProviders>;
```

### i18n

```tsx
import { AppProviders } from "tempest-react-sdk";

const messages = {
  "pt-BR": { hello: "Olá" },
  "en-US": { hello: "Hello" },
};

<AppProviders i18n={{ locale: "pt-BR", messages, fallbackLocale: "en-US" }}>
  <App />
</AppProviders>;
```

`i18n` accepts `locale`, `messages`, and optionally `fallbackLocale` and
`storageKey`.

## The ErrorBoundary fallback

The `errorBoundary` prop accepts `fallback` in two forms: a fixed `ReactNode`,
or a **render function** that receives `{ error, reset }` — handy for showing
the error message and offering a "try again" button:

```tsx
import { AppProviders } from "tempest-react-sdk";

<AppProviders
  errorBoundary={{
    fallback: ({ error, reset }) => <button onClick={reset}>{error.message}</button>,
  }}
>
  <App />
</AppProviders>;
```

Besides `fallback`, you can pass `onError` (callback on capture) and `resetKeys`
(values that, when they change, reset the boundary automatically).

## Full example: all props together

Here's everything in action — tuned query, theme disabled, i18n mounted, and an
error boundary with a render function:

```tsx
import { AppProviders } from "tempest-react-sdk";

const messages = {
  "pt-BR": { hello: "Olá" },
  "en-US": { hello: "Hello" },
};

export function Root() {
  return (
    <AppProviders
      query={{ defaultOptions: { queries: { retry: 3 } } }}
      theme={false}
      i18n={{ locale: "pt-BR", messages }}
      errorBoundary={{
        fallback: ({ error, reset }) => <button onClick={reset}>{error.message}</button>,
      }}
    >
      <App />
    </AppProviders>
  );
}
```

## Recap

- `<AppProviders>` replaces the manual provider pyramid with **one declarative
  block**, nesting outer to inner: `ErrorBoundary → QueryProvider →
ThemeProvider → I18nProvider → children`. ✅
- **`query` and `theme` are on** with the SDK defaults; **`i18n` and
  `errorBoundary` are opt-in** — they only mount when you pass the prop.
- Pass `false` to `query` or `theme` to **remove** that provider (when the app
  mounts its own).
- Pass an **object** to any prop to tune the matching provider.
- The error boundary `fallback` can be a `ReactNode` or a **function** that
  receives `{ error, reset }`.
- Place `<AppProviders>` **outside** `<AppRouter>`: providers outside, routes
  inside. 💡
