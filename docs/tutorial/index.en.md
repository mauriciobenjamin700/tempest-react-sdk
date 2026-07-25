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
    `react-router`, `zustand`, `@tanstack/react-query`, `zod`,
    `react-hook-form`, `dexie`, `lucide-react`. They are **direct dependencies**
    of the SDK. The only dependencies **you** must provide are `react` and
    `react-dom` — because React requires a single instance across the whole app.

## Step 1 — Create the app with `create-tempest-app`

The official scaffolding CLI **ships inside the SDK itself** (it's the package's
`bin` — there is no separate package). The recommended path is to **create the
folder yourself and scaffold into it** with `.`:

```bash
mkdir my-app
cd my-app
npx -p tempest-react-sdk create-tempest-app .
npm install
cp .env.example .env
npm run dev
```

Open **<http://127.0.0.1:5173>** — the app is already live with providers, routes
and an auth store working.

### Anatomy of the command

It looks long, but every piece has a job:

| Piece                  | What it does                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npx`                  | Downloads and runs a binary **without installing anything globally**, then throws the download away.                      |
| `-p tempest-react-sdk` | Says **which package** the binary comes from. Needed because the CLI lives inside the SDK, under a different name.        |
| `create-tempest-app`   | The `bin` name inside that package — the thing that actually runs.                                                        |
| `.`                    | The **destination**: the current directory. This is the recommended mode.                                                 |

!!! tip "Why `.` instead of `create-tempest-app my-app`?"

    Passing a name works too (`create-tempest-app my-app` creates the `my-app`
    folder and writes into it), but the `.` flow is nicer day to day:

    - **You own the folder and its name.** The `package.json` `name` comes from
      the directory you're in — no discovering later that you ended up with
      `my-app/my-app` because you were already inside the folder.
    - **It coexists with what's already there.** If you already ran `git init`, or
      you already have a `README.md`/`LICENSE`/`.git`, the `.` mode **preserves**
      every existing file and lists what it skipped. The named mode **aborts** if
      the folder isn't empty.
    - **One command for both new and existing projects** — a single flow to
      remember.

!!! info "No argument = `.`"

    `npx -p tempest-react-sdk create-tempest-app` (nothing after it) does exactly
    what `.` does: scaffold into the current directory. The CLI does **not**
    prompt for a project name.

!!! warning "`npm create tempest-app` does **not** work"

    There is no `create-tempest-app` package published on npm — the CLI is the
    `bin` of `tempest-react-sdk`. So `npm create tempest-app` fails with a 404.
    Always use the `-p` form:

    ```bash
    npx -p tempest-react-sdk create-tempest-app .
    ```

    In a project that **already has the SDK installed**, `-p` is unnecessary —
    `npx` finds the `bin` in the local `node_modules`:

    ```bash
    npm install tempest-react-sdk
    npx create-tempest-app .
    ```

### The two modes, side by side

| You type                     | Destination       | If the folder has files                    | Project name         |
| ---------------------------- | ----------------- | ------------------------------------------ | -------------------- |
| `create-tempest-app .`       | current directory | **preserves** yours and reports what it skipped | current folder name |
| `create-tempest-app` (bare)  | current directory | same                                        | current folder name |
| `create-tempest-app my-app`  | `./my-app`        | **aborts** if it exists and isn't empty     | `my-app`             |

!!! tip "Want a PWA?"

    Add `--pwa` to either mode
    (`npx -p tempest-react-sdk create-tempest-app . --pwa`) and the scaffold ships
    with a service worker, a manifest and web-push wiring. Details in
    [Scaffold](../scaffold.md) and [PWA](../pwa.md).

### Pinning the SDK version

The generated app is born with its `tempest-react-sdk` dependency **stamped at
the same version as the CLI that scaffolded it**. To choose that version, put the
`@` on `-p`:

```bash
npx -p tempest-react-sdk@0.23.0 create-tempest-app .
```

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

## If something went wrong

| Symptom                                          | Cause                                                            | What to do                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `404 Not Found - create-tempest-app`             | You ran `npm create tempest-app` — that package isn't on npm.    | Use `npx -p tempest-react-sdk create-tempest-app .`                                             |
| `✗ Directory "my-app" exists and is not empty.`  | New-folder mode against an already populated folder.             | `cd my-app && npx -p tempest-react-sdk create-tempest-app .` — the `.` mode preserves your files. |
| `Skipped N existing file(s)`                     | Not an error: the CLI **did not overwrite** files of yours.      | Check the list; to take the template version, delete the file and run again.                    |
| Components render unstyled                       | The CSS import is missing.                                       | `import "tempest-react-sdk/styles.css"` in `src/main.tsx` (**no** `/dist/`).                     |
| Syntax/engine error while running `npx`          | Old Node.                                                        | The SDK requires **Node >= 20.19**. Check with `node -v`.                                       |
| `VITE_API_URL` undefined at runtime              | Missing `.env`.                                                  | `cp .env.example .env` and point it at your backend.                                            |

## Recap

- `tempest-react-sdk` bundles routing, state, data, forms and auth behind **one
  single import surface** (`"tempest-react-sdk"`). ✅
- **Only `react` and `react-dom` are peer deps**; everything else
  (`react-router`, `zustand`, `@tanstack/react-query`, `zod`,
  `react-hook-form`, ...) is a **direct** dependency installed alongside.
- Create the app with `mkdir my-app && cd my-app`, then
  `npx -p tempest-react-sdk create-tempest-app .` — `.` scaffolds into the current
  directory, preserves what's already there and takes the project name from the
  folder. Then `npm install`, `cp .env.example .env` and `npm run dev`.
- `npm create tempest-app` does **not** exist; the CLI is the SDK's `bin`, so the
  correct form carries `-p tempest-react-sdk` (or no `-p` at all when the SDK is
  already installed in the project).
- The CSS line is `import "tempest-react-sdk/styles.css"` (**no** `/dist/`) —
  without it components are unstyled.
- Each generated file is the gateway to a tutorial concept.

➡️ **Next page:** [Routing — adding pages and routes](routing.md)
