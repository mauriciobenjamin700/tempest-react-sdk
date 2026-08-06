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

Stylesheets
  [i] 34 stylesheet(s) · 210 rules · 806 declarations
  [✗] src/pages/Dashboard.module.css:12 — the value of `padding` swallows the
      declaration(s) below it — a `;` is missing, so the browser drops all of them
  [!] src/components/Card.module.css:8 — `bacground-color` is not a CSS property
      — did you mean `background-color`?
  [i] src/components/Row.module.css:4 — 7 rules in 6 file(s) declare the same 3
      properties — one global class beats 7 local copies
  [i] 2 finding(s) are auto-fixable — run `tempest fix`

Design
  [i] 42 source file(s) · 1830 lines of code · median 38 — largest:
      src/pages/Orders.tsx (204)
  [!] src/pages/Orders.tsx:1 — 204 lines of code (limit 150) — extract a
      sub-component, a hook or a pure function
  [!] src/pages/Orders.tsx:31 — a component must not call the network — move it
      to a service and read it with useQuery
  [i] 2 limit(s) waived with a written reason — @tempest-limits markers

Tooling
  [✓] ESLint config present
  [✓] eslint installed
  [✓] prettier installed

! 3 warning(s) — usable, but worth fixing.
```

!!! info "What counts as usage, and what does not"
    The checks that ask "does this project use X?" read the **code**, not the prose:
    comments are stripped before the search, so an `@example` showing
    `import "tempest-react-sdk/styles.css"` is not a second import, and a docstring with
    `<TrajectoryMap tileUrl=…>` does not start demanding `leaflet`. Test files are left
    out too — a test that renders a component precisely to prove how it degrades
    **without** an optional peer is not the project asking for that peer.

    A peer marked `optional` in `peerDependenciesMeta` is never reported as unmet: that
    is exactly what optional means.

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

**Stylesheets** — **syntax and semantic** analysis of every `.css` in the project (CSS Modules included): CSS the browser drops, dead declarations, names that do not exist, and a repeated block that wants to be one global class. Detailed in the next section — [CSS analysis](#css-analysis). Here `doctor` shows at most **6 findings per severity** and says how many it left out; the full list comes from `tempest fix --dry-run`.

**Design** — the limits and anti-patterns from [Software Design](./design/limits.md), measured against your code: files/functions/hooks over the limit, `<X>Props` with too many props, `any` and `@ts-ignore`, `fetch` inside a `.tsx`, an empty `catch`, and a literal colour in `style={{ … }}`. Shows **6 findings per severity** plus the project's median line count. Every finding is a `warn` — a limit is a heuristic with a written escape hatch (`@tempest-limits <rule> — <reason>`), so the section **never** fails the exit code. Skip it with `--no-design`.

**Tooling** — ESLint and Prettier config + binaries; **lockfile** present, single (mixed npm/yarn/pnpm drift out of sync) and **not stale** (`package.json` newer than the lock → `npm install`).

**Env & secrets** — **`.env` in `.gitignore`** (else secrets leak on commit); vars used via `import.meta.env.*` **without the `VITE_` prefix** (Vite won't expose them to the browser → `undefined` at runtime); `.env` vs `.env.example`.

## CSS analysis

ESLint does not read `.css` and Prettier only reformats it: between the two,
**broken CSS goes through untouched**. `tempest` analyzes every stylesheet in the
project — CSS Modules included — on two fronts, and both commands read the same
result: `doctor` shows the summary, `fix` removes the part that is provably dead.

```bash
npx tempest doctor                 # the summary, under Stylesheets
npx tempest fix --dry-run          # the full list, writing nothing
npx tempest fix                    # removes what is genuinely dead
npx tempest fix src/components     # a single path
npx tempest fix --no-css           # skip the CSS pass
```

### Syntax — what the browser drops

Errors (`✗`) are things the browser **discards silently**. None of them break the
Vite build, and that is exactly what makes them expensive:

| Finding | Example |
| -- | -- |
| missing `;` between declarations | `padding: 8px⏎margin: 0;` → **both** die |
| declaration without `:` | `color red;` |
| empty value | `color: ;` |
| block never closed / stray `}` | `.a { color: red;` |
| unterminated comment, string or `(` | `/* forever`, `content: "oops` |
| declaration outside any rule | `color: red;` at the top of the file |
| `{` with no selector before it | `{ color: red; }` |

!!! danger "The missing `;` is the worst of them"
    `padding: 8px` followed by `margin: 0;` with no semicolon between them is
    **one** syntactically valid declaration whose value is `8px margin: 0` — the
    browser drops both, says nothing in the console, and the layout is wrong in a
    place you did not write. It is the finding that pays for the whole analysis.

### Semantics — valid CSS that is still wrong

Warnings (`!`) are sheets the browser accepts that still do not do what the author
meant:

- **Duplicate declaration** — `color` twice with the **same** value: the first one
  is dead. Auto-fixable.
- **Overridden declaration** — `color` twice with **different** values in the same
  rule: one of them is a mistake. Not fixable — picking which value you meant is
  a guess inside somebody's design.
- **Selector declared twice** — in the same `@media` context; it names the
  properties the second rule kills and asks for the merge. When the two rules are
  identical declaration for declaration, it is auto-fixable.
- **Property that does not exist** — `bacground-color`, `dispaly`, `paddign`. Only
  reported when a real property is within **2 edits**, so a new property the table
  has never heard of is never accused.
- **Nonexistent `@at-rule`** — `@medai`, `@suports`: the browser skips the whole
  block.
- **A `--tempest-*` token that does not exist** — compared against the table read
  from the **installed** `styles.css`, never a copy hard-coded in the CLI.
- **`var(--x)` nobody defines** and has no fallback — resolves to nothing.
- **Empty rule** — dead code. In a `.module.css` it is reported and **never**
  removed: it may be the marker class your JS references via `styles.x`.

!!! info "A `var()` with a fallback is never reported"
    `var(--tempest-card-padding, var(--tempest-space-5))` is the SDK's own **knob
    idiom**: the name is not a token, it is a hook an app may override. The
    fallback guarantees it renders, so the check stays quiet. Without a fallback
    the same `var()` resolves to nothing — that is a defect, and it is reported.

    This rule removed 43 false positives when the analysis first ran over the
    SDK's own CSS — and left **4 real bugs** standing
    (`--tempest-duration-normal`, `--tempest-primary-solid`,
    `--tempest-primary-on`, `--tempest-danger-on` with no fallback), fixed in the
    same commit that brought the analysis.

### Suggestions (`i`) — when global beats repeated local

This is the check CSS Modules **cannot** do for you: scoping guarantees `.card` in
one module never collides with `.card` in another, and the price is that nothing
tells you the two are identical. The duplication is invisible by design.

```text
[i] src/br/MapLegend.module.css:32 — 39 rules in 31 file(s) re-implement
    `.tempest-stack` from utilities.css — import "tempest-react-sdk/utilities.css"
    once and use the class
[i] src/components/Row.module.css:4 — 7 rules in 6 file(s) declare the same 4
    properties (display: flex; align-items: center; gap: 8px; …+1) — one global
    class beats 7 local copies
```

Two shapes of the same finding:

- **`global-candidate`** — a block of **≥ 3 declarations** repeated across **≥ 3
  rules** and **≥ 2 files** (inside a single file it takes a 4th copy). It groups
  by declarations, not by class name: `.row`, `.line` and `.bar` with the same body
  count as three copies.
- **`utility-candidate`** — when the repeated block is an idiom
  [`utilities.css`](./styles.md) already ships: `.tempest-row`, `.tempest-stack`,
  `.tempest-center`, `.tempest-cluster`, `.tempest-spread`, `.tempest-truncate`,
  `.tempest-grid-auto`, `.tempest-card`. Matching ignores the `gap` value and
  tells neighbours apart (a column is a `stack`, not a `row`).

On top of that, `hardcoded-token-value` points at a literal that is **exactly** a
token's value (`gap: 8px` → `var(--tempest-space-2)`) — and only when **exactly
one** token has it, because `4px` is the value of several and telling you to use
`--tempest-space-1` where you meant a border is a guess delivered confidently.

!!! tip "A suggestion never fails the command"
    `i` is advice: it may not be worth it, and turning five identical blocks into
    one global class is a decision about **coupling between screens** that the CLI
    is not entitled to make. It shows the number and gets out of the way.

### What `fix` removes — and what it never touches

The CSS pass removes **three** things, all provably dead:

1. a declaration repeated with the identical value in the same rule;
2. a rule that repeats an earlier one declaration for declaration;
3. an empty rule in a plain stylesheet (**not** in a `.module.css`).

```console
$ npx tempest fix
→ css (dedupe declarations · drop dead rules)
  src/components/Card.module.css 2
    12: removed duplicate `color` — line 14 declares the same value
    31: removed `.title` — line 40 repeats it exactly
  ✓ removed 2 dead declaration(s)/rule(s) in 1 file(s)
```

!!! warning "Always the **earlier** copy, never the one below"
    CSS is last-wins: removing the later declaration would change the result
    whenever something between the two touches the same property. Removing the
    earlier one changes nothing the browser computes — that is what makes the
    operation safe.

!!! note "A sheet with a syntax error is not written"
    An offset taken from a sheet the parser had to guess its way through is not an
    offset worth splicing. `fix` reports the error, leaves the file intact and
    exits with code **1**: fix the syntax and run again.

    `fix` also does **not** rewrite a value into a token, does not merge a
    duplicated selector, and does not turn a repeated block into a global class.
    All of that is design editing, not cleanup.

### `--extract-css`: move the repeated block into a global class

Plain `fix` **reports** a repeated block and leaves it alone. With the flag it acts:
the block moves to the project's global stylesheet, the local rules go away, and
**the `styles.x` reads in your TSX start pointing at the new class**.

```bash
npx tempest fix --extract-css --dry-run          # review the plan, write nothing
npx tempest fix --extract-css                    # apply
npx tempest fix --extract-css --css-target src/styles/globals.css
npx tempest fix --extract-css --css-prefix shared-
```

```console
$ npx tempest fix --extract-css
→ css extract (bloco repetido → classe global)
  src/components/Card.module.css 1
    removida `.row` (linha 1) → `.u-row` em src/index.css
  src/components/Card.tsx 1
    `styles.row` → `"u-row"` (linha 5)
  src/components/List.module.css 1
    removida `.line` (linha 1) → `.u-row` em src/index.css
  src/components/List.tsx 1
    `styles.line` → `"u-row"` (linha 5)
  ✓ movidas 2 regra(s) local(is) para 1 classe(s) em src/index.css
```

What it rewrites in the TSX:

```tsx
// before                                   // after
<div className={styles.row} />              <div className="u-row" />
<li className={cn(styles.line, on && x)} /> <li className={cn("u-row", on && x)} />
<div className={styles["bar"]} />           <div className="u-row" />
```

!!! danger "It is opt-in because it is a design decision, not cleanup"
    The other passes remove what is **provably dead**. This one decides that N
    screens now share a class — and therefore **change together**. That is a call
    about coupling between screens; the CLI executes it, it does not make it. Which
    is why it never runs without the flag, and why `--dry-run` exists.

!!! check "It refuses anything it cannot prove safe — and says why"
    No refusal is silent. An occurrence moves only when **all** of these hold:

    | Condition | Why |
    | -- | -- |
    | the selector is a lone class (`.row`), outside `@media` | moving out of a `@media` would change **when** the rule applies |
    | no other rule in the sheet mentions the class | a `.row:hover` or `.row .child` would be left without its subject |
    | the module keeps at least one other rule | otherwise the import becomes dead code, ESLint removes it, and the remaining rules **stop loading** |
    | the class is only read as `styles.row` / `styles["row"]` | `styles[key]` or `Object.keys(styles)` make the module **opaque**: nothing in it is extracted |
    | the global sheet exists **and** something imports it | appending to a stylesheet nobody loads is a silent no-op |
    | the new name collides with nothing in the global sheet | use `--css-prefix` |

    ```console
    [!] src/components/Card.module.css:1 não extraído — outra regra na mesma folha
        usa `.row` (linha 12) e ficaria sem sujeito
    ```

!!! info "The call sites are found by **your** project's compiler"
    The sweep uses the `typescript` installed in the project, not a regex:
    `styles.row` inside a comment, a template literal or a string is not a use, and
    a regex cannot tell them apart. With no `typescript` installed the pass says so
    and writes nothing. The `tsconfig` alias is honored, so
    `@/components/Card.module.css` resolves the same way.

!!! tip "The name of the new class"
    It is the local name your code uses most (by module first, then by call-site
    count), with the `u-` prefix. A tie is the normal case — the copies live in
    different modules precisely because nobody agreed on a name — and then the
    order of the occurrences decides, which keeps runs reproducible. The chosen
    name is printed **before** anything is written, under `--dry-run`.

!!! info "What the analysis leaves out, on purpose"
    A **minified** sheet (`*.min.css`, or a high bytes-per-line density), a file
    over **512 KB**, and the `node_modules/`, `dist/`, `build/`, `coverage/`,
    `public/`, `vendor/` trees. Past **600 sheets** `doctor` says it hit the cap
    instead of truncating in silence. The sweep runs in ~0.3 s over the SDK's own
    200+ stylesheets.

## `tempest fix`

Cleans the code in one shot: **converts relative imports to `@/`**, **removes dead
CSS**, **organizes imports**, **removes unused imports**, **strips extra blank
lines and trailing spaces**, then runs **Prettier**.

```bash
npx tempest fix              # the whole project
npx tempest fix src/app      # a single path
npx tempest fix --dry-run    # show what would change, write nothing
npx tempest fix --no-alias   # skip the import conversion
npx tempest fix --no-css     # skip the CSS pass
npx tempest fix --extract-css  # opt-in: repeated block → one global class
```

Four passes, in this order: the alias conversion, the
[CSS analysis](#css-analysis), `eslint --fix` (with the `simple-import-sort`,
`unused-imports/no-unused-imports`, `no-multiple-empty-lines`,
`no-trailing-spaces`, `eol-last` rules), then `prettier --write`. The conversion
runs **first** on purpose: turning `../../services/api` into `@/services/api`
changes its `simple-import-sort` group, so running ESLint afterwards leaves
everything sorted in a single `fix`. CSS comes before Prettier for the same
reason: whatever the removal leaves crooked, Prettier straightens next.

!!! tip "`--dry-run` is the review surface for CSS"
    `doctor` shows 6 findings per severity; `--dry-run` lists **every** error and
    warning (only the suggestion tail is capped, at 10) and writes nothing. It is
    what you read before letting the tool edit.

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

!!! warning "TypeScript 7 does not have the API the codemods use"
    7 is the **native port**: it installs under the same package name but publishes the
    JS API only under `typescript/unstable/*`, in a different shape — the classic
    `ts.readConfigFile` / `ts.createSourceFile` are not there. Since both codemod passes
    (the alias conversion and `--extract-css`) need the AST, they **step aside** and say
    why:

    ```console
    ! alias pass skipped — typescript 7.0.2 não expõe a API clássica do compilador…
    ```

    Everything else still runs: the CSS analysis, the dedupe, ESLint, Prettier, and
    `doctor`'s tsconfig checks (which fall back to their own JSONC parser). To use the
    codemods, keep TypeScript 6 installed in the project.

    Before 0.29.1 this was not a warning: the CLI resolved the package, concluded it had
    TypeScript and called the API — `tempest doctor` died with
    `ts.readConfigFile is not a function`.

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
- **`fix`** converts relative imports to `@/` + removes dead CSS + organizes imports + removes dead imports + tidies whitespace + Prettier. `--dry-run` to review, `--no-alias`/`--no-css` to skip a pass.
- The **[CSS analysis](#css-analysis)** finds syntax the browser drops, duplicated declarations and rules, names that do not exist, and repeated blocks that want one global class. `doctor` summarizes, `--dry-run` lists everything, `fix` removes only what is dead.
- The **[design analysis](./design/limits.md)** measures file/function/hook size, prop counts, `any`, `fetch` in a component, empty `catch` and literal inline colours — always as a warning, with `@tempest-limits <rule> — <reason>` as the written escape hatch.
- **`lint`** reports; **`format`** only formats.
- See also: [Scaffold](./scaffold.md) · [Architecture](./architecture.md).
