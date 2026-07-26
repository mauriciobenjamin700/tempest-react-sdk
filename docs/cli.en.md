# `tempest` CLI

Besides the [`create-tempest-app`](./scaffold.md) scaffolding CLI, the
`tempest-react-sdk` package installs a second `bin` — **`tempest`** — for the
day-to-day health and hygiene of your project: a **doctor** (à la
`flutter doctor`) and a **fix/lint/format** that organizes imports, removes dead
imports and tidies whitespace.

Because it ships inside the SDK, it's available as soon as you install the lib —
run it with `npx tempest <command>` or via the `npm run doctor` / `npm run fix`
scripts the scaffold already creates.

## `tempest doctor`

Diagnoses the current project and prints a `[✓] / [!] / [✗]` report **grouped by
section** (à la `flutter doctor`) — including **silent problems** that don't
break the build but blow up at runtime or eat hours of debugging:

```bash
npx tempest doctor
```

```text
tempest doctor (/path/to/your/app)

Environment
  [✓] Node 22.13.0
  [i] tempest CLI v0.18.0

Project
  [✓] package.json found
  [✓] tempest-react-sdk in dependencies — ^0.18.0
  [✓] tempest-react-sdk installed — v0.18.0
  [✓] react + react-dom present — v19.2.0

Dependency health
  [!] duplicate instance: react — nested copy under tempest-react-sdk;
      run `npm dedupe`; two instances break hooks/context
  [✓] @types/react matches react — v19
  [!] recharts missing (used by charts) — you import charts but recharts
      isn't installed — npm i recharts
  [✓] tempest-react-sdk up to date — v0.18.0

TypeScript
  [✓] tsconfig "@/*" alias
  [!] moduleResolution: node — use "bundler" (otherwise subpaths
      tempest-react-sdk/br, /charts… won't resolve types)
  [✓] jsx: "react-jsx"
  [!] strict mode off — enable "strict": true

Integration
  [✓] vite.config.ts uses createViteConfig
  [✓] src/main.tsx imports styles.css

Tooling
  [✓] ESLint config present
  [✓] eslint installed
  [✓] prettier installed

! 3 warning(s) — usable, but worth fixing.
```

!!! success "It works on a project that does not use the SDK yet"
    When `tempest-react-sdk` is not among your dependencies, `doctor` runs in **generic
    mode**: it audits the health of any React + Vite app and does **not** fail you for
    having adopted nothing.

    The checks that are SDK conventions drop out of the report — the `@/*` alias,
    `createViteConfig`, the `styles.css` import, the expected `src/main.tsx`, the
    optional subpath peers. What remains is what matters for any app: Node version,
    duplicate React instances, declared-but-not-installed dependencies, unmet peers,
    `@types/react` mismatch, `strict`/`jsx`/`moduleResolution`, the lockfile (present,
    single, not stale), ESLint and Prettier, `.env` in `.gitignore`, and client env vars
    missing the `VITE_` prefix.

    ```console
    $ npx tempest doctor
    …
      [i] tempest-react-sdk not installed — checking generic React/Vite health only
    …
    Adopting the SDK (optional)
      [i] install — npm i tempest-react-sdk
      [i] import the stylesheet once, in your entry — import "tempest-react-sdk/styles.css"
      [i] not all-or-nothing — one component at a time works
    ```

    Before this the command produced **two failures and exit 1** for a single fact —
    "you have not installed this yet" — and buried the actionable findings among
    warnings that were really just the SDK's preferences. It was useless on exactly the
    project it should help most.

!!! tip "Use it at onboarding and in CI"
    Run `tempest doctor` after cloning a project (confirms everything is wired)
    and as a quick CI step. It exits with code **1** on any `✗` (blocking
    problem); `!` warnings don't fail the command.

### What it checks

**Environment** — Node ≥ 20.19 (and a warning if it's a **non-LTS** line, odd major); CLI version; **TypeScript** (≥5) and **Vite** (≥5) versions; `package.json` `engines.node` satisfied.

**Project** — `tempest-react-sdk` declared and installed (with version); `react`/`react-dom` present; **React major** ≥ 18.

**Dependency health** (the silent ones):

- **Duplicate instance** of React or a stateful/context lib (`@tanstack/react-query`, `zustand`, `react-hook-form`, `react-router`): a copy **nested** under `tempest-react-sdk` means **two instances** at runtime — invalid hooks, a `QueryClient`/RHF context that "vanishes". Suggests `npm dedupe`. _(Skipped when the SDK is a local `file:`/`link:` dependency.)_
- **Declared-but-not-installed deps** (drift between `package.json` and `node_modules`) → `npm install`.
- **The app's own `peerDependencies`** left unmet.
- **`@types/react` vs `react`** major mismatch → phantom type errors.
- **Optional peers for used subpaths**: importing `tempest-react-sdk/charts` without `recharts`, `/editor` without `@tiptap/react`, `/vision` without `onnxruntime-web`, or passing `tileUrl` to `TrajectoryMap` without `leaflet` — it all compiles, then breaks on the lazy import at runtime.
- **SDK out of date** vs `latest` on npm (best-effort, short timeout; skipped offline).
- **A duplicated `lucide-react`** — a separate check from the one above, because two copies of lucide do not break hooks the way a second React does: they duplicate bytes and, worse, leave `/icons`' **generated slug tables** pointing at exports the older copy lacks. It warns when your `package.json` declares lucide on a different range than the SDK's (the cause), when a nested copy exists under `tempest-react-sdk` (the proof), and **fails** when the installed version is older than the tables need — that case breaks the build with `… is not exported by lucide-react` pointing inside the SDK. See [Icons by slug](./icons.md).

**TypeScript** — `@/*` alias; **`moduleResolution`** ∈ `bundler`/`node16`/`nodenext` (otherwise _subpath exports_ like `tempest-react-sdk/br` won't resolve types — silent!); **`jsx: "react-jsx"`**; **`strict: true`**; **`skipLibCheck`** on; with tests + `vitest`, warns if tsconfig `types` omits `vitest/globals`.

**Integration** — `vite.config.*` using `createViteConfig`; **`@vitejs/plugin-react`** installed (JSX/Fast Refresh); `styles.css` import in the entry (and a warning if imported **more than once**).

**Tooling** — ESLint and Prettier config + binaries; **lockfile** present, single (mixed npm/yarn/pnpm drift out of sync) and **not stale** (`package.json` newer than the lock → `npm install`).

**Env & secrets** — **`.env` in `.gitignore`** (else secrets leak on commit); vars used via `import.meta.env.*` **without the `VITE_` prefix** (Vite won't expose them to the browser → `undefined` at runtime); `.env` vs `.env.example`.

## `tempest fix`

Cleans the code in one shot: **converts relative imports to `@/`**, **organizes
imports**, **removes unused imports**, **strips extra blank lines and trailing
spaces**, then runs **Prettier**.

```bash
npx tempest fix              # the whole project
npx tempest fix src/app      # a single path
npx tempest fix --dry-run    # show what would change, write nothing
npx tempest fix --no-alias   # skip the import conversion (ESLint + Prettier only)
```

Three passes, in this order: the alias conversion, `eslint --fix` (with the
`simple-import-sort`, `unused-imports/no-unused-imports`,
`no-multiple-empty-lines`, `no-trailing-spaces`, `eol-last` rules), then
`prettier --write`. The conversion runs **first** on purpose: turning
`../../services/api` into `@/services/api` changes its `simple-import-sort`
group, so running ESLint afterwards leaves everything sorted in a single `fix`.

### The import conversion

One rule: **no import climbs out of its directory**.

```ts
// before                                   // after
import { api } from "../../services/api";   import { api } from "@/services/api";
import { Button } from "../Button";         import { Button } from "@/components/Button";
import { Row } from "./Row";                // unchanged — siblings stay relative
import cfg from "../../../vite.config";     // unchanged — resolves outside src/
```

A sibling import (`./x`) stays as it is: it already says "this lives right next
to me", which is information `@/` throws away. A path that resolves **outside**
the alias base stays too — that's what protects `../../../vite.config` and
`../../../scripts/x`.

What the conversion reaches beyond `import` and `export … from`:

```ts
import type { User } from "../../types/user";       // import type
const m = await import("../../pages/Dashboard");    // dynamic import()
vi.mock("../../lib/api");                            // vi.mock / vi.doMock
```

And in `.css` files (Vite resolves aliases in stylesheets too):

```css
@import "../../styles/tokens.css";        /* → @/styles/tokens.css */
.hero {
    background: url(../../assets/bg.png); /* → @/assets/bg.png */
}
```

!!! tip "Run `--dry-run` first on a large project"
    `--dry-run` lists the file, the line and the before/after of every import
    without writing anything — and without running ESLint or Prettier. It's how
    you review the diff before letting the tool touch it.

    ```console
    $ npx tempest fix --dry-run
    → alias imports (../ → @/) [dry-run]
      src/pages/admin/Users.tsx 2
        1: "../../lib/api" → "@/lib/api"
        2: "../../styles/tokens.css" → "@/styles/tokens.css"
      ✓ would convert 2 import(s) in 1 file(s)
    ```

!!! info "The alias comes from your `tsconfig.json` — it isn't hardcoded"
    The base is read from `compilerOptions.paths`, following `extends` and
    accepting comments in the JSON. If your project uses `~/*` or `#/*` instead
    of `@/*`, that's the prefix you get; if it uses `app/` instead of `src/`,
    that's the base.

!!! warning "Without `paths` in the tsconfig, the conversion doesn't run"
    That's deliberate. `paths` is what the **type-checker** honors: an alias found
    there is one `tsc --noEmit` accepts after the conversion. Guessing `@` → `src`
    just because a `src/` exists would produce imports that resolve nowhere in any
    project that doesn't have the alias configured. When none is found the command
    says so and moves on to ESLint without touching anything:

    ```console
    ! no path alias found — skipping alias pass  add "paths": { "@/*": ["./src/*"] } to tsconfig.json
    ```

    The conversion also needs `typescript` installed in the project: it uses
    **your project's** compiler to find import positions, so a path-looking string
    inside a comment, a template literal or a variable is never rewritten by
    mistake.

!!! warning "Dead code = imports/vars, not whole functions"
    `fix` **removes unused imports** and **warns** about unused variables (it
    doesn't delete them, to stay safe). It does **not** do deeper dead-code
    elimination (orphan functions/exports) — that needs dedicated analysis and
    is risky to automate. Use a tool like `knip` separately for that.

!!! note "Needs ESLint + Prettier in the project"
    Apps generated by `create-tempest-app` come fully configured. In a bare
    project, install: `npm i -D eslint prettier eslint-plugin-simple-import-sort eslint-plugin-unused-imports`.

## `tempest lint` and `tempest format`

```bash
npx tempest lint     # eslint . (report only, no changes)
npx tempest format   # prettier --write . (formatting only)
```

`lint` is the read-only report; `fix` is `lint` that corrects + formats. Flags you
pass are forwarded to the binary (`npx tempest lint --max-warnings 0`), and the
path stays positional.

## Help

```bash
npx tempest --help
npx tempest --version
```

## Recap

- The **`tempest`** `bin` ships inside the SDK — `npx tempest <command>`.
- **`doctor`** diagnoses the project (à la `flutter doctor`), exits 1 on blocking problems.
- **`fix`** converts relative imports to `@/` + organizes imports + removes dead imports + tidies whitespace + Prettier. `--dry-run` to review, `--no-alias` to skip the conversion.
- **`lint`** reports; **`format`** only formats.
- See also: [Scaffold](./scaffold.md) · [Architecture](./architecture.md).
