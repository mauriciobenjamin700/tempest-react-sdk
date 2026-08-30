# Modules, npm and the bundler

!!! tip "Skip this page if you already know…"

    - the difference between `import`/`export` (ESM) and `require` (CommonJS);
    - what `dependencies`, `devDependencies` and `peerDependencies` mean;
    - what tree-shaking can prove and what it cannot;
    - why importing one thing can drag in eight kilobytes.

## The problem

You import **one** function:

```ts
import { cn } from "tempest-react-sdk";
```

And the bundle grows by 8 KB. You used no component, mounted no provider, and still
paid for things you did not know existed.

The reason is not that the package is big — it is that the bundler cannot **prove**
the rest is disposable. This page is about what it needs in order to prove it.

## ES modules

A module is a file with its own scope. What leaves it is what you export:

```ts
// math.ts
export function add(a: number, b: number): number {
    return a + b;
}

export const PI = 3.14159;
```

```ts
// app.ts
import { add, PI } from "./math";

console.log(add(PI, 1));
```

| Form                                 | What it does                                                     |
| ------------------------------------ | ---------------------------------------------------------------- |
| `export function x()`                | A **named** export. It is what the SDK uses, always.              |
| `export default x`                   | Default export, one per file. The importing name is free.         |
| `import { x } from "..."`            | Imports one named export.                                         |
| `import * as everything from "..."`  | Imports the whole namespace. **Kills tree-shaking.**              |
| `import type { X } from "..."`       | Imports the type only — it vanishes from the bundle.              |
| `await import("./x")`                | A **dynamic** import: becomes a separate chunk, loaded on demand. |

!!! info "ESM is static, and that is what enables the optimisation"

    `import` only exists at the top of a file, with a literal path. That lets the
    bundler read the dependency graph **without executing anything** — and that is
    what makes tree-shaking possible. CommonJS `require()` is an ordinary function
    call that could live inside an `if`; it cannot be analysed the same way.

## npm: the three dependency kinds

```json
{
    "dependencies": { "react-hook-form": "^7.76.0" },
    "devDependencies": { "vitest": "^4.0.0" },
    "peerDependencies": { "react": "^18 || ^19" }
}
```

| Field                | Who installs it                       | What for                                                  |
| -------------------- | ------------------------------------- | --------------------------------------------------------- |
| `dependencies`       | Comes along when someone installs you | Code that runs in production.                             |
| `devDependencies`    | Only whoever clones the repo          | Tests, lint, build. Never reaches the consumer.           |
| `peerDependencies`   | **The app** installs, you only declare | A library that must exist **exactly once** in the app.   |

!!! warning "A peer dependency is not about bytes — it is about correctness"

    Two copies of `zod` cost kilobytes. Two copies of **React** or **react-router**
    cost function: each copy has its own context, and a component reading copy B's
    context cannot see the provider mounted by copy A. The classic symptom is
    `useNavigate() may be used only in the context of a <Router>`.

    That is why `tempest-react-sdk` declares `react`, `react-dom` and `react-router`
    as peers and **everything else** as a direct dependency: the criterion is
    carrying React context, not popularity.

## Tree-shaking, and what it needs

Tree-shaking is the bundler removing what nobody imported. It can prove that when
three things hold:

1. **The module is ESM** (static graph).
2. **The import is named** — `import { cn }`, not `import * as sdk`.
3. **There are no side effects** in the module — nothing runs merely because it was
   loaded.

Item 3 is what the `package.json` `sideEffects` field declares:

```json
{ "sideEffects": ["**/*.css"] }
```

It says: "every file in this package is side-effect free, **except** the `.css`
ones" — and the `.css` files must be excluded because importing a stylesheet **is**
the intended side effect. Without that exception the bundler would drop the styles.

!!! danger "What breaks tree-shaking in your own code"

    - `import * as X from "..."` — the bundler cannot tell which member you use.
    - Module-top code with effects (`window.thing = ...`, registering a listener).
    - Re-exporting through a barrel that executes something when imported.

## Where it shows up in the SDK

`tempest-react-sdk` publishes `dist/` with the **module graph preserved**: one
output file per source module, instead of one bundle per entry.

The difference is measurable. With a bundle per entry, importing only `cn` dragged
in ~8.5 KB gzip — the bundler could not prove the rest of that single file was
side-effect free. With `preserveModules`, the floor dropped to hundreds of bytes.

The cost is that `dist/` holds thousands of files. That is expected, not a
regression — the tarball is the same size.

And it is why the CI's size budget is measured **per imported slice**, not on the
whole barrel:

```json
{
    "name": "slice: one component (`Button`)",
    "import": { "./dist/tempest-react-sdk.js": "{ Button }" },
    "limit": "1.5 KB"
}
```

Measuring the barrel would only say "the package grew", which it does with every
feature and which tells you nothing about what **you** pay. The barrel still has a
ceiling, but as an explicit whole-entry ceiling — not as a consumer budget.

!!! tip "Dynamic import is the other side of the coin"

    A route nobody opened does not need to be in the initial bundle. The SDK's
    `defineRoutes([...])` accepts `lazy: () => import("./Page")`, and `<AppRouter>`
    already sets up the `<Suspense>` — see [Routing](../routing.md).

## Recap

- ESM is static: `import` at the top, literal path — that is what allows analysing
  the graph without executing it. ✅
- `dependencies` ships along; `devDependencies` stays in the repo;
  `peerDependencies` is installed by the **app**.
- Peer deps exist for **correctness**, not bytes: two copies of a React-context
  library break at runtime.
- Tree-shaking needs ESM + named imports + no side effects; `sideEffects` is how a
  package declares that.
- `import * as X` kills tree-shaking; `import type` vanishes from the bundle.
- In the SDK, `dist/` preserves the module graph and the CI budget is measured per
  imported slice.

📚 **Canonical reference:** [MDN — JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

➡️ **Next page:** [TypeScript: the minimum the SDK uses](typescript.md)
