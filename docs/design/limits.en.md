# Hard limits

"Keep components small" is advice nobody can apply, because it isn't checkable. Two
people disagree on "small" and the discussion dies on taste.

A limit with a **number** fixes that. The number doesn't have to be perfect — it has
to be agreed on.

## The table

| What                             | Limit       | Action when exceeded                         |
| -------------------------------- | ----------- | -------------------------------------------- |
| Component `.tsx` file            | **150**     | extract a sub-component or a hook            |
| Body of a function/component     | **80**      | extract a pure function or a hook            |
| Custom hook                      | **100**     | split into smaller hooks                     |
| Props on a component             | **7**       | it's probably two components                 |
| JSX nesting depth                | **4**       | extract a sub-component                      |
| Cyclomatic complexity            | **10**      | lookup table or early return                 |
| Function parameters              | **3**       | make it one named object                     |
| Service/util `.ts` file          | **200**     | split by responsibility                      |

!!! info "Why 150 and not 200 or 100?"
    150 lines is what fits in two editor screens. It's the point where you can still
    **read the whole file** before changing one line — and reading the whole file is
    what prevents the change that breaks another part of it. Past that you start
    editing by search, not by understanding.

## What the number actually measures

Lines are a **proxy**. What you're really limiting is:

| Symptom                          | Real consequence                                     |
| -------------------------------- | ---------------------------------------------------- |
| Long file                        | nobody reads it whole → change with surprise effects |
| Long function                    | doesn't fit in your head → intermediate-state bug     |
| Many props                       | many cases → invalid combination representable        |
| Deep JSX                         | structure invisible → CSS/layout breaks               |
| High complexity                  | untested paths → bug in a rare branch                |

That's why it's worth counting **lines of code**, not lines of file: JSDoc and the
props `interface` don't add cognitive load — they reduce it.

## Dogfood: where the SDK itself lands

Real numbers from this repository (157 production `.tsx` files, counting code lines
only):

| Metric                     | Value    |
| -------------------------- | -------- |
| Median lines per file       | **65**   |
| Files above 150             | **28**   |
| Largest file                | `FilterBar.tsx` — 279 |

In other words: **the limit is not honored in 100% of cases, on purpose.** The median
is 65 because the rule works; the 28 that exceed it are widgets with irreducible
behaviour — `ImageCropper` (drag + zoom + canvas crop), `Calendar` (grid + keyboard
+ range), `BrazilMap` (SVG + hit-testing).

## The escape hatch: `@tempest-limits`

Exceeding a limit is acceptable when you **write the reason**. The marker is
`@tempest-limits <rule> — <reason>` in a comment in the file:

```tsx
/**
 * Interactive image cropper.
 *
 * @tempest-limits file-lines — pointer drag, wheel zoom, aspect-ratio clamping
 * and canvas export share one piece of geometry state. Splitting them would mean
 * threading that state through props and duplicating the clamp maths.
 */
```

- The **rule** is an id from the table below (`file-lines`, `props-count`, …),
  several separated by commas, or `*` for all of them.
- The **reason** comes after `—`, `-` or `:`. Fewer than 12 characters does not
  count as a reason: `tempest doctor` reports the empty marker, because an
  unexplained waiver is exactly what it exists to prevent.

!!! tip "What is not acceptable is exceeding it without noticing"
    The marker isn't bureaucracy — it's what turns "this file is big" from an
    accident into a decision. Whoever reads it in six months knows whether they may
    split it.

!!! info "`eslint-disable` counts too"
    An existing `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
    already silences that line's `any` in `doctor` — the standard mechanism wins,
    no second marker needed.

## `tempest doctor` already enforces this

The [CLI](../cli.md) has a **Design** section that measures the project and
reports each violation with a file and a line:

```bash
npx tempest doctor              # includes the design analysis
npx tempest doctor --no-design  # skips the section
```

```text
Design
  [i] 42 source file(s) · 1830 lines of code · median 38 — largest: src/pages/Orders.tsx (204)
  [!] src/pages/Orders.tsx:1 — 204 lines of code (limit 150) — extract a sub-component, a hook or a pure function
  [!] src/pages/Orders.tsx:31 — a component must not call the network — move it to a service and read it with useQuery
  [!] src/features/orders/OrderTable.tsx:12 — OrderTableProps has 9 props (limit 7) — likely two components in one
  [i] 2 limit(s) waived with a written reason — @tempest-limits markers — nothing to do
```

The rules, and each one's id for the marker:

| Id                     | What it measures                                                 |
| ---------------------- | ---------------------------------------------------------------- |
| `file-lines`           | lines of code in the file (150 `.tsx` / 200 `.ts`)               |
| `function-lines`       | function/component body (80)                                     |
| `hook-lines`           | `use*` hook body (100)                                           |
| `props-count`          | members of `<X>Props`, or destructured props (7)                 |
| `param-count`          | parameters of an **exported** function (3)                       |
| `explicit-any`         | `any` in a type position, `as any`                               |
| `ts-ignore`            | `@ts-ignore` / `@ts-nocheck`                                     |
| `fetch-in-component`   | `fetch(`/`axios` in a `.tsx`                                     |
| `empty-catch`          | a `catch` with an empty body                                     |
| `inline-style-literal` | a literal colour inside `style={{ … }}`                          |

!!! note "The Design section never fails the exit code"
    Every finding is a `warn` or a note. A limit is a heuristic with a written
    escape hatch — failing CI on a heuristic is the fastest way to get the tool
    silenced. The hard gates stay where they belong: `no-explicit-any` as an ESLint
    `error` and `tsc --noEmit`.

!!! info "What doctor does **not** measure"
    JSX nesting depth and cyclomatic complexity. Both need a real parser to avoid
    false positives on Prettier line wrapping — they stay with ESLint (`max-depth`,
    `complexity`) and with review.

## Making the linter enforce it too

Add this to your app's `eslint.config.js` (the
[scaffold template](../scaffold.md) ships the base; this is the design layer):

```js
{
    files: ["**/*.{ts,tsx}"],
    rules: {
        "max-lines": [
            "warn",
            { max: 150, skipBlankLines: true, skipComments: true },
        ],
        "max-lines-per-function": [
            "warn",
            { max: 80, skipBlankLines: true, skipComments: true },
        ],
        "max-depth": ["warn", 4],
        "max-params": ["warn", 3],
        complexity: ["warn", 10],
        "@typescript-eslint/no-explicit-any": "error",
    },
},
{
    // Tests describe scenarios; counting them as production code only produces
    // noise and encourages less readable tests.
    files: ["**/*.test.{ts,tsx}"],
    rules: {
        "max-lines": "off",
        "max-lines-per-function": "off",
    },
},
```

!!! warning "`warn` on size, `error` on typing"
    A size limit is a heuristic — `error` turns every legitimate exception into an
    `eslint-disable`, and scattered `eslint-disable` is worse than a big file. `warn`
    shows up in the PR and someone decides. `no-explicit-any`, on the other hand, is
    `error`: there is no legitimate case worth the silence (see
    [Strong typing](typing.md)).

Running it:

```bash
npx tempest lint                      # ESLint with the project config
npx tempest lint --max-warnings 0     # in CI, when you want the limit to be hard
```

CLI details in [tempest CLI](../cli.md).

## Finding today's violations

Before turning the rule on, size up the problem:

```bash
# Top 15 files by lines of code (ignores blank, // and /* */ blocks)
find src -name "*.tsx" ! -name "*.test.tsx" | while read -r f; do
  n=$(grep -vcE '^\s*($|//|/\*|\*|\*/)' "$f")
  echo "$n $f"
done | sort -rn | head -15
```

If 3 files show up above the limit, fix them today. If 60 do, turn the rule on as
`warn` and fix what you were already going to touch — a mass refactor produces an
unreviewable PR and no immediate gain.

## The three cuts that solve 90% of cases

### 1. A sub-component per JSX block

The 300-line `.tsx` is almost always 4 visual blocks in one file. Give each block a
name:

```text
OrderDetail.tsx (300)
└── OrderDetail.tsx (60) + OrderHeader.tsx (50) + OrderItems.tsx (70) + OrderTotals.tsx (40)
```

### 2. A hook for the logic

State + effects + handlers move to `use-<thing>.ts`. The `.tsx` keeps only markup.
Full example in
[Thinking in components](components.md#logic-to-hook).

### 3. A pure function outside React

`sortBy`, `paginate`, `formatInvoice`, `buildQuery` don't need React — they go to
`lib/` or the feature file, and get a cheap unit test.

!!! danger "A cut that isn't worth it: moving JSX into a function in the same file"
    ```tsx
    function renderHeader() { … }   // ❌ not a component, not reusable
    ```
    That lowers the function's line count and lowers nothing that matters: the file is
    still the same size, and the "inner component" can't be memoized, tested or
    reused. Extract it for real.

## Recap

- Limits become numbers so they stop being a matter of taste: **150** file, **80**
  function, **100** hook, **7** props, **4** nesting, **10** complexity.
- Lines are a proxy for **cognitive load** — count code lines, not JSDoc.
- The SDK's median is 65 with 28 deliberate violations; the escape hatch is
  `@tempest-limits <rule> — <reason>`, never silence.
- `npx tempest doctor` measures and reports with file and line (always `warn`);
  ESLint enforces with `max-lines` and `no-explicit-any` as `error`.
- Three cuts solve nearly everything: sub-component, hook, pure function.

Next: [Strong typing](typing.md).
