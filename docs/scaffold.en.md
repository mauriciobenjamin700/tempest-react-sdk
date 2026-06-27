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

## PWA mode (`--pwa`)

Want the app to be **installable** (home-screen icon), able to **emit web push notifications**, and to **work offline** (app shell + cache) out of the box? Pass the `--pwa` flag:

```bash
npx -p tempest-react-sdk create-tempest-app my-app --pwa
```

The flag works in both modes (new folder **and** `.`/merge). It **overlays** the PWA template on top of the base: everything from the normal app stays the same, plus a few new files and a few overwritten ones.

!!! info "No `vite-plugin-pwa`, no Workbox"
    Install, push **and** offline caching are assembled from the SDK's own helpers (`tempest-react-sdk/sw` + `tempest-react-sdk/vite`) and bundled by a dedicated build. No extra PWA dependency — the PWA app uses the exact same deps as the base app. (Full comparison vs `vite-plugin-pwa` below.)

### What the flag adds

```text
my-app/
├── index.html                  # (overwritten) manifest link + theme-color + apple metas
├── vite.config.ts              # (overwritten) createViteConfig + tempestPwaIcons + Manifest + DevSw
├── vite.sw.config.ts           # dedicated build that bundles src/sw.ts -> dist/sw.js
├── public/
│   ├── manifest.webmanifest    # install metadata (points at the generated PNGs)
│   └── icon.svg                # source icon (swap for yours — the PNGs come from it)
└── src/
    ├── sw.ts                   # service worker: push + notificationclick + skip-waiting + cache
    ├── main.tsx                # (overwritten) registers /sw.js in dev and prod
    ├── vite-env.d.ts           # (overwritten) types VITE_VAPID_PUBLIC_KEY
    └── pages/Dashboard.tsx     # (overwritten) Install button + notifications toggle
```

`package.json` is patched too: the `build` script now bundles the SW (`tsc --noEmit && vite build && npm run build:sw`) and gains a `build:sw`; `sharp` is added as a `devDependency` (generates the icons). The build emits a `dist/precache-manifest.json` (the asset list for offline caching) via `tempestPwaManifest()` and the PNG icon set (`dist/icons/*.png` + `apple-touch-icon.png`) via `tempestPwaIcons()`.

!!! warning "In merge mode, your files are preserved"
    In `.` mode (merging into an existing project), the CLI **never overwrites a file of yours** — only the ones it just generated. If you already had an `index.html`, it is skipped and reported, and its PWA bits are up to you.

### The five pieces

#### 1. Install → `useBeforeInstallPrompt`

`index.html` links the `manifest.webmanifest`, and `Dashboard.tsx` shows an **Install** button only when the browser offers the prompt:

```tsx
const install = useBeforeInstallPrompt();
// ...
{
  install.installable && <Button onClick={() => void install.prompt()}>Install app</Button>;
}
```

#### 2. Service worker → `tempest-react-sdk/sw`

`src/sw.ts` is just glue over the SDK helpers:

```ts
/// <reference lib="webworker" />
import {
  installNotificationClickHandler,
  installPushHandler,
  installSkipWaitingListener,
} from "tempest-react-sdk/sw";

installPushHandler({ defaultTitle: "Notificação", defaultIcon: "/icon.svg" });
installNotificationClickHandler();
installSkipWaitingListener();
```

`vite.sw.config.ts` bundles that file (and the helpers it imports) into a **classic service worker** at `dist/sw.js`, and `main.tsx` registers it via `registerServiceWorker`. In **dev**, the `tempestPwaDevSw()` plugin compiles `sw.ts` on the fly and serves it at `/sw.js` — so push and caching work under `npm run dev` too (without it, the SW would only exist in the build). See the helper details in [Web Push](./push.md).

#### 3. Web push → `usePushSubscription`

`Dashboard.tsx` wires the notifications toggle to the hook, reading the VAPID key from `.env`:

```tsx
const push = usePushSubscription({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "",
  onSubscribe: async (subscription) => {
    // send the subscription to your backend to deliver pushes
    await api.post("/webpush/subscribe", { body: subscription });
  },
  onUnsubscribe: async () => {
    await api.delete("/webpush/my");
  },
});
```

#### 4. Offline → `installPrecache` + `installRuntimeCache`

`vite.config.ts` adds the `tempestPwaManifest()` plugin, which emits a `dist/precache-manifest.json` listing every built asset (the dependency-free counterpart to Workbox's `__WB_MANIFEST`). In `sw.ts`, two helpers consume it:

```ts
import { installPrecache, installRuntimeCache } from "tempest-react-sdk/sw";

// Specific routes FIRST (they win over the precache catch-all):
installRuntimeCache([
  {
    match: (url) => url.pathname.startsWith("/api/"),
    strategy: "network-first", // or "cache-first" / "stale-while-revalidate"
    cacheName: "api",
    networkTimeoutSeconds: 5,
    maxEntries: 50,
    maxAgeSeconds: 60 * 5,
  },
]);

// App shell last — launches offline:
installPrecache({ navigateFallback: "/index.html", navigateFallbackDenylist: [/^\/api\//] });
```

- **`installPrecache`** caches the app shell on `install`, serves assets cache-first, and returns the `navigateFallback` (SPA) when a navigation happens offline. It versions the cache by the manifest's `version` and cleans up old versions on `activate`.
- **`installRuntimeCache`** applies per-route strategies (cache-first / network-first / stale-while-revalidate) with `maxEntries` and `maxAgeSeconds`.

#### 5. Icons → `tempestPwaIcons`

`vite.config.ts` adds `tempestPwaIcons({ source: "public/icon.svg" })`, which at build time rasterizes **a single source SVG** into the full icon set — the dependency-free counterpart to `@vite-pwa/assets-generator`:

```ts
import { tempestPwaIcons } from "tempest-react-sdk/vite";

tempestPwaIcons({ source: "public/icon.svg" });
// emits: dist/icons/icon-192.png, icon-512.png, maskable-512.png, dist/apple-touch-icon.png
```

Rasterization uses **`sharp`** (already a template `devDependency`). The `manifest.webmanifest` points at the generated PNGs, and `tempestPwaManifest()` includes them in the precache automatically. Changing the app icon = swapping `public/icon.svg`.

!!! note "`sharp` is optional"
    The plugin imports `sharp` lazily: if it isn't installed the build **doesn't fail** — it just logs a warning and skips generation. The template ships `sharp` as a devDep, so it works out of the box.

!!! danger "Push and offline only work in a production build"
    Icon generation happens **at build time**, and the app shell is only precached after `npm run build`. In `npm run dev` the `tempestPwaDevSw()` plugin serves the SW (push + runtime caching work), but offline precache and the PNGs only exist in the build. To test full install + offline, run `npm run build && npm run preview` (then tick **Offline** under DevTools › Network to watch the app shell serve).

### `--pwa` vs `vite-plugin-pwa`

`--pwa` now covers the same ground as `vite-plugin-pwa` for the common case, with no new runtime dependency:

| Feature                             | `vite-plugin-pwa` (Workbox) | `--pwa` (SDK)                               |
| ----------------------------------- | --------------------------- | ------------------------------------------- |
| Manifest + installable              | ✅                          | ✅                                          |
| Install prompt                      | manual                      | ✅ `useBeforeInstallPrompt`                 |
| Web push + `notificationclick`      | you write it                | ✅ SDK helpers                              |
| Update flow (skip-waiting)          | ✅                          | ✅ `registerServiceWorker`                  |
| App-shell precache                  | ✅ (`__WB_MANIFEST`)        | ✅ `tempestPwaManifest` + `installPrecache` |
| Runtime caching (cache/network/SWR) | ✅                          | ✅ `installRuntimeCache`                    |
| `navigateFallback` (SPA offline)    | ✅                          | ✅                                          |
| Old-cache cleanup                   | ✅                          | ✅ (version on `activate`)                  |
| Automatic icon generation           | ✅ (sharp)                  | ✅ `tempestPwaIcons` (sharp, optional)      |
| SW in dev                           | ✅ (`devOptions`)           | ✅ `tempestPwaDevSw` (esbuild)              |

Only very elaborate cases are left (Background Sync, range requests, splash-screen generation) — there `vite-plugin-pwa` is still more complete, and you can pass it via `plugins: [...]` in `createViteConfig`.

### PWA mode recap

`--pwa` hands you manifest + service worker + push + **offline cache** + **generated icons** + **SW in dev**, already wired on top of the same base app, using `tempest-react-sdk/sw` (`installPushHandler`, `installPrecache`, `installRuntimeCache`), `tempest-react-sdk/vite` (`tempestPwaManifest`, `tempestPwaIcons`, `tempestPwaDevSw`), `usePushSubscription` and `useBeforeInstallPrompt` — without `vite-plugin-pwa`. Generate the VAPID key on your backend, fill in `VITE_VAPID_PUBLIC_KEY` in `.env`, swap `public/icon.svg`, and test with `npm run build && npm run preview`. 🚀

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
