# Review checklist

The whole section on one page. Use it before opening a PR and while reviewing someone
else's.

!!! tip "Copy it into your repository"
    It's worth pasting this list into `.github/pull_request_template.md`. A checklist
    that shows up by itself in the PR form gets used; one that lives in a wiki doesn't.

## Before opening the PR

### Layers

- [ ] No component calls `fetch`/`apiClient` directly.
- [ ] No import from an upper layer (UI doesn't import a feature, a feature doesn't
      import a page).
- [ ] A feature imported from outside comes only through its `index.ts`.
- [ ] No `../../../` — only `@/` or a sibling (`./`).
- [ ] The file is in the **feature** folder, not in a folder-per-file-type.

### State

- [ ] Nothing that can be computed sits in `useState`.
- [ ] No `useEffect` whose body only calls `setState`.
- [ ] Server data is in Query, not in `useState`/a store.
- [ ] Filter/page/tab live in the URL, not mirrored in `useState`.
- [ ] Form fields live in `useZodForm`, not in `useState`.

### Types

- [ ] Zero `any`. Zero `@ts-ignore`.
- [ ] No new `as` (other than `as const` and post-guard narrowing).
- [ ] Domain types derived from the schema (`z.infer`), not retyped.
- [ ] Network responses go through `parseResponse`/a schema.
- [ ] State with more than one case is a **discriminated union**, not boolean flags.
- [ ] Component variants are string `union`s, not booleans.
- [ ] An empty collection is `[]`, not `null`.
- [ ] `npx tsc -b --noEmit` passes.

### Size

- [ ] `.tsx` ≤ 150 lines of code — or a JSDoc explaining why it exceeds.
- [ ] Function/component ≤ 80 lines.
- [ ] Hook ≤ 100 lines.
- [ ] ≤ 7 props per component.
- [ ] JSX nesting ≤ 4.

### Component

- [ ] Before writing it, I searched the SDK's [catalogue](../components.md) and
      [hooks](../hooks.md).
- [ ] The presentational component knows no domain at all.
- [ ] `...rest` typed via `HTMLAttributes<T>`, and the caller's `className` comes last
      in `cn(...)`.
- [ ] Actions are `<button>`, navigation is `<a>` — never `<div onClick>`.
- [ ] Every field has an associated `label`.
- [ ] New overlay: `Esc` closes, focus trapped inside, focus returns to the trigger.

### Styling

- [ ] No hardcoded colour/spacing values — `--tempest-*` tokens.
- [ ] No `style={{...}}` holding what should be a CSS Module.
- [ ] Tested in **light and dark** theme.
- [ ] Tested at ≤ 430px and ≥ 1024px.
- [ ] Text on a tinted surface uses that surface's foreground (e.g.
      `--tempest-primary-on-soft`), not `--tempest-text-subtle`.

### Errors

- [ ] No empty `catch`, and none that only does `console.log`.
- [ ] An error the feature doesn't handle **rises** (doesn't become a generic toast).
- [ ] The screen has an error state and an empty state, not just the success one.

### Tests

- [ ] Every new test answers "which bug would this catch?".
- [ ] Queries by role (`getByRole`), not by CSS class.
- [ ] A new service has a test with an **invalid** payload, not just the happy one.
- [ ] No new big snapshots.
- [ ] `npm run test:run` and `npm run lint` pass.

### Visual

- [ ] A UI change was seen **in the browser**, not only in an `expect`.
- [ ] The browser console has no new errors.

## While reviewing someone else's PR

Five questions that catch most real problems:

1. **Where is this data born and where does it die?** If the answer crosses layers in
   the wrong order, that's it.
2. **Does this state have two sources?** Look for a `useState` mirroring the URL, a prop
   or an API response.
3. **What happens when the network fails?** If the diff has no answer, an error state is
   missing.
4. **Would this test fail if I broke the behaviour?** If it only fails on a CSS change,
   it isn't a test.
5. **Does this already exist in the SDK?** `Modal`, `useDebounce`, a document mask,
   currency formatting — almost always yes.

!!! warning "Review is not a `nit:` hunt"
    Formatting is Prettier's job; import order is ESLint's. If a review comment can be
    resolved by a tool, configure the tool instead of writing the comment. Human review
    is for what tools can't see: design, boundaries, duplicated state, unhandled cases.

## The commands

```bash
npx tsc -b --noEmit      # types, tests included
npx tempest lint         # ESLint
npx tempest fix          # imports (../ → @/), ordering, dead imports, dead CSS
npx tempest doctor       # config, env, deps, CSS analysis
npm run test:run         # the suite
npm run test:coverage    # coverage floors
```

Running that before pushing is faster than finding out in CI.

## Recap

- The checklist is the executable summary of the whole section: layers, state, types,
  size, components, styling, errors, tests, visuals.
- Paste it into the repository's PR template — that's where it gets read.
- When reviewing someone else, the five questions are worth more than the whole list.
- A formatting `nit:` is a tool-configuration bug, not a review finding.

Back to the start: [Frontend Software Design](index.md).
