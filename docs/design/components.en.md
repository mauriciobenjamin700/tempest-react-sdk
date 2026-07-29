# Thinking in components

The component is React's unit of reuse, and it's where most apps accumulate debt.
Not because people write bad components — because they write **one** component
where there were three.

This page is about finding the joints.

## Two species, and don't mix them

| Species            | Knows what                          | Receives                  | Tested how            |
| ------------------ | ----------------------------------- | ------------------------- | --------------------- |
| **Presentational** | how something **looks**              | props                     | render + props        |
| **Domain**         | what an "order" is                   | props + feature hooks     | render + mocked hook   |

The presentational component doesn't know where the data comes from. The domain one
knows the domain, but doesn't know HTTP (that's the [service](data-flow.md)).

```tsx
// Presentational: reusable in any app, any domain.
export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <Badge variant={tone}>{children}</Badge>;
}

// Domain: translates "order" into "appearance".
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
}
```

The presentational one is a candidate to move up into the SDK. The domain one never
moves up — it belongs to your app, and that's correct.

!!! tip "Before writing a presentational component, search the SDK"
    There are 117 components. `Badge`, `DataTable`, `Modal`, `Combobox`, `Stepper`,
    `EmptyState`, `Skeleton`, `Toast`… See the
    [catalogue](../components.md). Rewriting `Modal` with a correct focus trap is a
    week you don't need to spend.

## When to split a component

Don't split by size — split by **reason to change**. The four signals:

### 1. The name has "and" in it

`UserCardAndActions`, `TableWithFilters`, `FormAndPreview`. The name is telling you
there are two.

### 2. One piece changes for a different reason

If the screen's `<header>` changes when design changes and the `<table>` changes
when the API changes, that's two responsibilities in one file.

### 3. A piece repeats

Twice: maybe coincidence. Three times: extract.

### 4. You need a big `if` in the JSX

```tsx
// ❌ three screens in one component
{isLoading ? <Spinner /> : error ? <ErrorState … /> : orders.length === 0 ? <EmptyState … /> : <table>…</table>}
```

That asks for a state component or a `switch` in a sub-component.

!!! warning "Splitting too early also costs"
    A 6-line component used in one place, with 5 props, is indirection with no
    payoff. The question isn't "can this be split?" — it's "**does this piece have a
    life of its own?**".

## Props: design the interface, not the data hand-off

Props are the component's public API. The rules that save the most pain:

### At most 7 props — and count honestly

Going past 7 is the most reliable signal that there are two components in there.
The way out isn't "group them into an object" (that only hides it), it's splitting.

### Boolean props don't scale

=== "❌ Wrong"

    ```tsx
    <Button primary secondary danger small large />
    ```

    Eight representable invalid combinations. What happens with `primary danger`?

=== "✅ Right"

    ```tsx
    <Button variant="danger" size="sm" />
    ```

    A string union: the compiler only accepts what exists. It's how every SDK
    component is designed.

Rule: **three or more mutually exclusive booleans → make it a `union`.**

### Pass `children`, not `content`

```tsx
// ✅ composition: the caller decides what goes inside
<Card>
  <OrderSummary order={order} />
</Card>

// ❌ configuration: Card must know every case
<Card contentType="order-summary" order={order} />
```

Composition is what prevents the component that grows one prop per use case.

### Slots when you need more than one spot

```tsx
interface PageProps {
  title: ReactNode;
  actions?: ReactNode; // slot: a button, a menu, whatever the caller wants
  toolbar?: ReactNode;
  children: ReactNode;
}
```

`ReactNode` in a slot beats `string`: the caller can pass text, an icon, or a whole
component, without `Page` changing.

### Never `...props` untyped

```tsx
// ✅ extends the native element — inherits aria-*, data-*, onClick, className
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function Card({ elevated, className, ...rest }: CardProps) {
  return <div className={cn(styles.card, elevated && styles.elevated, className)} {...rest} />;
}
```

Extending `HTMLAttributes<T>` gives you accessibility and composition for free,
with autocomplete. `props: any` gives you nothing.

!!! info "`cn` is the utility for this"
    The SDK's `cn(...)` joins classes ignoring `false`/`undefined`, and the caller's
    `className` comes **last** — so consumers can override. See
    [Utilities](../utilities.md).

## Extract logic into a hook, not another component {#logic-to-hook}

When the component is big because of **logic**, the cut isn't vertical (two
components) — it's horizontal (component + hook):

=== "Before — 180 lines"

    ```tsx
    export function OrderTable({ orders }: OrderTableProps) {
      const [sort, setSort] = useState<Sort>({ field: "code", order: "asc" });
      const [selected, setSelected] = useState<Set<string>>(new Set());
      const [page, setPage] = useState(1);

      const toggle = (id: string) => { /* 12 lines */ };
      const sorted = /* 20 lines */;
      const paged = /* 8 lines */;

      return <table>{/* 110 lines of JSX */}</table>;
    }
    ```

=== "After — 40 + 60 lines"

    ```tsx
    // use-order-table.ts — the logic, testable without a DOM
    export function useOrderTable(orders: Order[]) {
      const [sort, setSort] = useState<Sort>({ field: "code", order: "asc" });
      const [selected, setSelected] = useState<Set<string>>(new Set());
      const [page, setPage] = useState(1);

      const rows = useMemo(() => paginate(sortBy(orders, sort), page), [orders, sort, page]);

      return { rows, sort, setSort, selected, toggle, page, setPage };
    }

    // OrderTable.tsx — markup only
    export function OrderTable({ orders }: OrderTableProps) {
      const { rows, sort, setSort, selected, toggle } = useOrderTable(orders);
      return <table>{/* lean JSX */}</table>;
    }
    ```

The hook tests with `renderHook` — no DOM, no `screen.getByRole`, fast. The
component tests what actually matters in it: what appears on screen.

!!! tip "The custom hook is the frontend's 'service'"
    It's where screen logic lives. But it has a [limit](limits.md) too: a 250-line
    hook is a service in disguise — split it into smaller hooks or move the pure part
    into a function in `lib/`.

## `React.memo`, `useMemo`, `useCallback`: by measurement

React re-renders fast. `memo` everywhere costs a prop comparison on every render and
complicates the code with cascading `useCallback`.

Use it when:

- The component renders **large lists** (hundreds of items).
- The profiler shows an expensive render — not "looks expensive".
- The prop is an object/array recreated every render **and** the child is `memo`.

!!! note "Before optimizing renders, look at the design"
    A 5,000-item list doesn't need `memo` — it needs
    [`VirtualList`/`VirtualTable`](../components/data.md). The win from virtualizing
    is orders of magnitude bigger than any memoization.

## Accessibility is part of the component, not polish

An interactive component without these is incomplete:

- The right element: `<button>` for an action, `<a>` for navigation. `<div onClick>`
  can't be focused and doesn't respond to Enter.
- A `label` associated with every field (`<Label htmlFor>` or `aria-label`).
- Visible focus — never `outline: none` without a replacement.
- Overlays (modal, drawer, popover): focus trapped inside, `Esc` closes, focus
  returns to the trigger on exit.

The SDK components already implement this; what you write on top is what needs
attention. CI runs `axe` against the gallery — see
[Testing strategy](testing.md).

## Recap

- Two species: **presentational** (no domain) and **domain** (no HTTP).
- Split by **reason to change**, not by line count: a name with "and", a repeated
  piece, a big `if` in the JSX.
- ≤ 7 props; mutually exclusive booleans become a `union`; `children` and slots
  before configuration.
- `...rest` typed via `HTMLAttributes<T>` — accessibility and composition for free.
- A component that's big because of **logic** → extract a **hook**, not another
  component.
- Memoize by measurement; a large list wants virtualization, not `memo`.

Next: [Hard limits](limits.md) — the numbers.
