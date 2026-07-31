# Anti-patterns

The previous pages say what to do. This one says what you will **find** — in an
existing app, or in your own Friday-night PR.

Every entry has the same shape: how to spot it, why it hurts, and the refactor.

## 1. The God component

**Spot it:** a `.tsx` with 400+ lines, `useState` mixed with `fetch`, formatting,
validation and JSX.

**It hurts because:** five reasons to change in one file — every edit has a chance of
breaking something unrelated, and nobody reads the whole file before editing.

**Refactor:** three cuts, in this order.

1. `fetch` → [service](data-flow.md).
2. State + handlers → [hook](components.md#logic-to-hook).
3. JSX blocks → sub-components.

Always in that order: removing the network first is what makes the rest testable.

## 2. `fetch` inside the component

**Spot it:**

```tsx
useEffect(() => {
  fetch(`/api/orders?page=${page}`)
    .then((r) => r.json())
    .then(setOrders);
}, [page]);
```

**It hurts because:** untestable without a server, no cache, no dedupe, no error
handling, no cancellation — and the same endpoint called on two screens fires two
requests.

**Refactor:** service + `useQuery`. It becomes one line in the component:

```tsx
const { data = [], isLoading } = useOrders(page);
```

See [Data flow](data-flow.md).

## 3. The syncing `useEffect`

**Spot it:** a `useEffect` whose body only calls `setState` from another piece of state
or a prop.

```tsx
useEffect(() => {
  setFullName(`${first} ${last}`);
}, [first, last]);
```

**It hurts because:** an extra render, a window where the value is stale, and a second
source of truth.

**Refactor:** compute it.

```tsx
const fullName = `${first} ${last}`;
```

See [Where each state lives](state.md#derived).

## 4. Server state duplicated in a store

**Spot it:** a `useOrdersStore` holding an array of orders that came from the API, plus
a `fetchOrders()` that fills the array.

**It hurts because:** you re-implemented a cache — but without invalidation, without
revalidation, without `staleTime`. The symptom is always "the screen doesn't update
after the POST".

**Refactor:** server data → [Query](../query.md). The store keeps only what is client
state (session, theme, cart).

## 5. Prop drilling 4 levels deep

**Spot it:** the same prop crossing components that don't use it, just to reach a
grandchild's grandchild.

**It hurts because:** every component on the path knows a piece of data that isn't
theirs, and adding one field touches five files.

**Refactor:** three options, in order:

1. **Composition** — pass `children` already assembled, instead of data for the child
   to assemble.
2. **Context** — when it's genuinely global (theme, session, i18n).
3. **Store** — when it's global **and** changes often.

!!! warning "Context is not the first answer"
    Context re-renders every consumer when the value changes. Composition solves most
    drilling cases at zero render cost.

## 6. Pass-through {#passthrough}

**Spot it:** a function, hook or component whose body only forwards its arguments.

```ts
// ❌ a layer with no logic at all
export async function listCustomers(params: GetListParams) {
  return dataProvider.getList<Customer>("customers", params);
}
```

**It hurts because:** it's one more indirection to read, one more file to open, and
zero behaviour added. And when the signature below changes, you edit two places.

**Refactor:** delete it and call directly — `useList<Customer>("customers", params)`.

Legitimate exceptions: an intentional abstraction boundary (a public facade over a
private implementation, a framework hook, an interface implementation). When that's the
case, the JSDoc says so.

## 7. Ceremony {#cerimonia}

**Spot it:** a layer created out of symmetry, not need — `types/`, `constants/`,
`mappers/` with one two-line file each, a `mapper` that copies field by field without
transforming anything.

```ts
// ❌ maps A to A
export function toOrder(dto: OrderDto): Order {
  return { id: dto.id, code: dto.code, status: dto.status };
}
```

**It hurts because:** every empty layer is one more place to search and one more to keep
in sync, in exchange for nothing.

**Refactor:** delete it. Structure gets added when the second case shows up, not before.

## 8. A giant barrel in the app

**Spot it:** a `src/index.ts` (or `components/index.ts`) re-exporting everything, and
imports like `import { X } from "@/components"`.

**It hurts because:** import cycles (A → barrel → B → barrel → A), and Vite reprocesses
the whole tree on every edit — the dev server gets slow for no visible reason.

**Refactor:** a barrel only at the **feature boundary** (`features/orders/index.ts`).
Inside the feature and inside `components/`, use direct paths.

!!! note "In the SDK it's different — on purpose"
    A published package needs the barrel: it's the consumer's import contract. The cost
    is paid with `preserveModules` at build time, which preserves the module graph so the
    app's bundler can tree-shake. An app publishes nothing, so it has no such problem to
    solve.

## 9. `any` and `as` to silence the compiler

**Spot it:** `as any`, `@ts-ignore`, `props: any`, `!` scattered around.

**It hurts because:** the error doesn't disappear — it moves, to runtime, far from the
cause.

**Refactor:** `unknown` + validation at the edge, discriminated unions, early returns.
See [Strong typing](typing.md).

## 10. Booleans as variants

**Spot it:** `<Alert error warning info small />`.

**It hurts because:** it represents impossible states (`error warning` together) and the
precedence hides in the CSS.

**Refactor:** a string `union` — `<Alert variant="error" size="sm" />`.

## 11. Tests coupled to implementation

**Spot it:** `container.querySelector(".tempest_card_1a2b")`, a 400-line snapshot, an
assertion that `useState` was called.

**It hurts because:** it fails when the CSS changes and passes when the behaviour
breaks. False confidence is worse than no test.

**Refactor:** query by role (`getByRole`) and check observable behaviour. See
[Testing strategy](testing.md).

## 12. The silent `catch`

**Spot it:**

```ts
try {
  await payOrder(id);
} catch {
  // ignore
}
```

**It hurts because:** it trades a visible error for invisible wrong behaviour. The user
clicks, nothing happens, and there is no log.

**Refactor:** handle it (specific message), or **don't catch** — let it rise to the
[ErrorBoundary](../error-boundary.md) and record it in the [logger](../logger.md).

## 13. Hardcoded magic strings

**Spot it:** `if (status === "paid")` in seven files; `["orders", "list", page]` built by
hand in the query and in the invalidation.

**It hurts because:** the typo isn't a compile error. `"payed"` in one of the seven files
is an `if` that never fires.

**Refactor:** a union plus a derived constant. Query keys via
[`createQueryKeys`](../query.md); labels via a `satisfies Record<Status, string>` table
([Typing](typing.md#satisfies)).

## 14. Inline styles instead of tokens

**Spot it:** `style={{ color: "#2563eb", padding: 12 }}`.

**It hurts because:** it ignores dark theme, ignores density, has no states
(`:hover`/`:focus-visible`) and turns into 40 different shades of blue across the app.

**Refactor:** CSS Module + `--tempest-*` tokens:

```css
.card {
  color: var(--tempest-text);
  background: var(--tempest-surface);
  padding: var(--tempest-space-3);
}
```

See [Styles & Design Tokens](../styles.md).

!!! tip "`tempest doctor` finds part of this"
    The CLI analyses the project's CSS: non-existent properties and tokens, duplicate
    declarations, syntax the browser drops, repeated blocks that want a utility class.

    ```bash
    npx tempest doctor
    npx tempest fix --dry-run
    ```

## 15. Re-implementing what the SDK already has

**Spot it:** your own `Modal`, your own `useDebounce`, your own `formatCurrency`, your own
document-number mask.

**It hurts because:** focus trap, `Esc`, focus restoration, `aria-modal`, scroll lock and
portal are six details the homemade version doesn't have — and each one is an
accessibility bug.

**Refactor:** search first. There are 117 components, 46 hooks, Brazilian utilities
(CPF/CNPJ/postal code/phone/currency) and 384 root exports. See the
[components catalogue](../components.md), [hooks](../hooks.md), and
[utilities](../utilities.md).

## The ranking, if you can only attack three

| Priority | Anti-pattern                      | Why                                              |
| -------- | --------------------------------- | ------------------------------------------------ |
| 🔴 1     | `fetch` in the component          | blocks testing, caching and reuse at once        |
| 🔴 2     | Server state duplicated           | direct cause of "screen shows stale data"        |
| 🔴 3     | `any` / `as` to silence an error  | moves the bug into production                    |
| 🟡 4     | God component                     | painful, but incremental improvement works       |
| 🟡 5     | Silent `catch`                    | cheap to fix, high payoff                        |
| 🟢 6     | Ceremony / pass-through           | annoying, not dangerous                          |

## Recap

- The three expensive ones: **`fetch` in the component**, **duplicated server state**,
  **`any` to silence the compiler**.
- The God component is fixed in order: network → logic → JSX.
- A `useEffect` that only calls `setState` is derived state in disguise.
- Pass-through and ceremony are cost without return — delete them.
- Before writing a primitive, search the SDK.

Next: [Review checklist](checklist.md) — the one-page version.
