# Tutorial — Start here

Welcome! 🚀 This is the **Tutorial — User Guide** for `tempest-react-sdk`. It is
linear: each page teaches **one concept**, building on the previous one, with
complete copy-pasteable examples. Start on this page and follow the "next page"
links — you'll never get stuck.

Throughout the tutorial we build **the same small app**, page by page: a todo
list with login. No loose theory — each concept shows up because the app needs
it.

## What is `tempest-react-sdk`?

It's Tempest's frontend SDK: a single npm package that bundles everything a React
app keeps repeating — routing, state, data caching, forms, authentication,
theming — behind **one single import surface**. You import everything from
`"tempest-react-sdk"` and never wire the integration by hand.

!!! info "Only `react` and `react-dom` are peer deps"

    When you install the SDK, **everything else comes along** automatically:
    `react-router-dom`, `zustand`, `@tanstack/react-query`, `zod`,
    `react-hook-form`, `dexie`, `lucide-react`. They are **direct dependencies**
    of the SDK. The only dependencies **you** must provide are `react` and
    `react-dom` — because React requires a single instance across the whole app.

## Step 1 — Create the app with `create-tempest-app`

The official scaffolding CLI **ships inside the SDK itself** (it's the package's
`bin`). In an empty directory, run:

```bash
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
cp .env.example .env
npm run dev
```

The `-p tempest-react-sdk` tells `npx` which package to fetch;
`create-tempest-app my-app` is the `bin` it runs. Open
**<http://127.0.0.1:5173>** — the app is already live with providers, routes and
an auth store working.

!!! tip "The target folder must be empty"

    In new-project mode (`create-tempest-app my-app`), the target directory
    **must not exist** or must be **empty**, so nothing of yours is overwritten.
    If you already have a project, install `tempest-react-sdk` and run
    `npx create-tempest-app .` to merge into the current directory.

## Step 2 — The most important line: the CSS

The SDK ships its own CSS (color tokens, typography, reset). The generated app
already imports it for you in `src/main.tsx`:

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import "tempest-react-sdk/styles.css";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(<App />);
```

!!! warning "It's `tempest-react-sdk/styles.css`, no `/dist/`"

    The correct import is `import "tempest-react-sdk/styles.css"`. Do not use
    `tempest-react-sdk/dist/styles.css` — that path is not exposed by the package.
    Without this line, components render **unstyled**.

## Step 3 — Tour the generated files

The project is deliberately lean: each file demonstrates **one feature** you'll
reuse in the tutorial. Here's the structure:

```text
my-app/
├── vite.config.ts        # createViteConfig() — Vite config ready for the SDK
├── .env.example          # VITE_API_URL — HTTP client base
└── src/
    ├── main.tsx          # createRoot + "tempest-react-sdk/styles.css" + <App/>
    ├── App.tsx           # <AppProviders> wrapping <AppRouter/>
    ├── routes.tsx        # defineRoutes([...]) — index, login and lazy + guarded dashboard
    ├── layouts/RootLayout.tsx   # nav with <Link> + <Outlet/>
    ├── pages/Home.tsx
    ├── pages/Login.tsx
    ├── pages/Dashboard.tsx       # export default (lazy), guarded route
    ├── stores/auth.ts            # createSelectors(createAuthStore<User>(...))
    └── lib/api.ts               # createApiClient(...) + createQueryKeys
```

Each file is a gateway to a concept in this tutorial:

| File                 | Concept                | Tutorial page                     |
| -------------------- | ---------------------- | --------------------------------- |
| `src/App.tsx`        | Providers + routing    | [Routing](routing.md)             |
| `src/routes.tsx`     | Route tree + guard     | [Routing](routing.md)             |
| `src/stores/auth.ts` | State (Zustand + auth) | [State](state.md)                 |
| `src/lib/api.ts`     | HTTP client + cache    | [Data fetching](data-fetching.md) |

## Step 4 — Confirm it's running

With `npm run dev` active, open <http://127.0.0.1:5173>. You should see the home
page with a `<nav>` at the top (**Home** and **Dashboard** links) and the `/`
route content below. Clicking **Dashboard** while logged out takes you to login —
that's the route guard in action, which you'll learn in [Routing](routing.md).

!!! check "Ready to begin"

    If the app opened in the browser and the nav links swap the content without
    reloading the page, your foundation is perfect. Let's build on it. ✅

## Recap

- `tempest-react-sdk` bundles routing, state, data, forms and auth behind **one
  single import surface** (`"tempest-react-sdk"`). ✅
- **Only `react` and `react-dom` are peer deps**; everything else
  (`react-router-dom`, `zustand`, `@tanstack/react-query`, `zod`,
  `react-hook-form`, ...) is a **direct** dependency installed alongside.
- Create the app with `npx -p tempest-react-sdk create-tempest-app my-app`, then
  `npm install`, `cp .env.example .env` and `npm run dev`.
- The CSS line is `import "tempest-react-sdk/styles.css"` (**no** `/dist/`) —
  without it components are unstyled.
- Each generated file is the gateway to a tutorial concept.

➡️ **Next page:** [Routing — adding pages and routes](routing.md)
