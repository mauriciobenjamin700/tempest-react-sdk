# Strong typing

TypeScript isn't "JavaScript with autocomplete". It's the only tool that checks your
app's design **without running the app**. The narrower the type, the more bugs it
catches for free.

The goal of this page: make the compiler refuse the wrong state, instead of you
reviewing the wrong state.

## Rule zero: zero `any`

```js
"@typescript-eslint/no-explicit-any": "error"
```

`any` turns the compiler off. Worse: it **leaks** — an `any` variable contaminates
everything it touches, and the error shows up three files later, at runtime.

There is no legitimate case. There are two replacements:

| Situation                                      | Use                                   |
| ---------------------------------------------- | ------------------------------------- |
| I don't know what it is (network response, `JSON.parse`) | **`unknown`** + validation   |
| I accept any object                            | `Record<string, unknown>`             |
| A real generic                                 | `<T>` with a constraint                |

```ts
// ❌ any: the error will show up in another file
function handle(payload: any) {
  return payload.user.name.toUpperCase();
}

// ✅ unknown: the compiler makes you prove the shape before using it
function handle(payload: unknown): string {
  const parsed = userSchema.parse(payload);
  return parsed.name.toUpperCase();
}
```

!!! danger "`as` is `any` under another name"
    `payload as User` checks nothing — it's you promising. `as` is only acceptable in
    three places: `as const`, narrowing `unknown` **after** a type guard, and working
    around a known library typing limitation (with a JSDoc explaining it). Outside
    that, `as` is where bugs get in.

## Types derived from the schema, never written twice

The most common mistake in a zod app: writing the `interface` and the schema
separately.

=== "❌ Wrong"

    ```ts
    interface Order {
      id: string;
      status: string;
      totalCents: number;
    }

    const orderSchema = z.object({
      id: z.string(),
      status: z.string(),
      total_cents: z.number(), // ⚠️ diverged and nobody noticed
    });
    ```

=== "✅ Right"

    ```ts
    export const orderSchema = z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]),
      totalCents: z.number().int().nonnegative(),
    });

    export type Order = z.infer<typeof orderSchema>;
    export type OrderStatus = Order["status"];
    ```

One source of truth. Changing the schema changes the type, and the compiler points at
every place that must follow. See [Data flow](data-flow.md).

!!! tip "`z.enum` instead of `z.string()`"
    `status: z.string()` accepts `"banana"`. `z.enum([...])` makes the component's
    `switch` exhaustive and turns a backend inventing a new value into an error at the
    edge, not a blank screen.

## Discriminated unions: the impossible state stops existing

This is the highest-value typing win in a React app, and the most ignored.

=== "❌ Wrong — 8 combinations, 5 invalid"

    ```ts
    interface OrderState {
      isLoading: boolean;
      data?: Order;
      error?: Error;
    }
    ```

    `{ isLoading: true, data: order, error: err }` compiles. What does the screen
    show?

=== "✅ Right — 3 states, all valid"

    ```ts
    type OrderState =
      | { status: "loading" }
      | { status: "success"; data: Order }
      | { status: "error"; error: Error };
    ```

    ```tsx
    switch (state.status) {
      case "loading":
        return <Spinner />;
      case "success":
        return <OrderCard order={state.data} />; // `data` exists here, guaranteed
      case "error":
        return <ErrorState message={state.error.message} />;
    }
    ```

Inside each `case`, TypeScript knows exactly which fields exist. No `state.data!`, no
defensive `if (!state.data) return null`.

### Exhaustiveness the compiler enforces

```ts
/** Fails to compile when a new OrderState variant is added and not handled. */
function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

switch (state.status) {
  case "loading":
    return <Spinner />;
  case "success":
    return <OrderCard order={state.data} />;
  case "error":
    return <ErrorState message={state.error.message} />;
  default:
    return assertNever(state);
}
```

Add `{ status: "empty" }` to the union and the build **breaks** at `assertNever`,
pointing at the exact spot. That's the difference between finding out at compile time
and finding out in production.

## Props: model what is valid

The same reasoning applies to component props:

```tsx
// ❌ allows `variant="link"` without href, and href together with onClick
interface ButtonProps {
  variant?: string;
  href?: string;
  onClick?: () => void;
}

// ✅ either a link with href, or a button with onClick — never both
type ButtonProps =
  | { as: "link"; href: string; children: ReactNode }
  | { as?: "button"; onClick: () => void; children: ReactNode };
```

And for variants, a string `union` instead of booleans — the pattern of every SDK
component:

```ts
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";
```

Autocomplete shows the options, a typo doesn't compile, and `primary danger` does not
exist.

## The utility types worth memorizing

```ts
type Order = { id: string; code: string; status: OrderStatus; totalCents: number };

type OrderPreview = Pick<Order, "id" | "code">;          // only those fields
type OrderDraft = Omit<Order, "id">;                      // everything but id
type OrderPatch = Partial<Order>;                         // everything optional
type FullOrder = Required<OrderDraft>;                    // everything required
type OrderReadonly = Readonly<Order>;                     // no mutation
type OrdersById = Record<string, Order>;                  // a map
type OrderStatus2 = Order["status"];                      // indexed access
type ListResult = Awaited<ReturnType<typeof listOrders>>; // async return type
```

The pattern: **derive**, don't retype. A hand-written `OrderDraft` goes out of sync
with `Order` on the first change; `Omit<Order, "id">` never does.

## `satisfies`: validates without widening {#satisfies}

```ts
// ❌ the const's type becomes Record<string, string> — exact keys are lost
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// ✅ validates that it covers every OrderStatus AND keeps the literal keys
const STATUS_LABEL = {
  pending: "Pending",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
} satisfies Record<OrderStatus, string>;
```

With `satisfies` you get both: if a status is missing, it's a compile error; and
`typeof STATUS_LABEL` still knows the exact keys for autocomplete and for deriving
types.

!!! tip "A lookup table kills a giant `switch`"
    `STATUS_LABEL[status]` replaces five `case` branches. And with `satisfies`, adding
    a new status to the union **forces** you to fill the table. That pair
    (`union` + `satisfies Record<>`) is the cheapest way to make the compiler enforce
    completeness.

## Generics with a constraint, not loose generics

```ts
// ❌ T guarantees nothing — `item.id` may not exist
function indexById<T>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((i) => [i.id, i])); // error or any
}

// ✅ the constraint documents the requirement and the compiler enforces it
function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}
```

A constraint is executable documentation: whoever calls it with `{ uuid: string }[]`
gets an error at the call site, with the right message.

## Explicit null

Implicit `undefined` is TypeScript's `NullPointerException`. Keep `strict` on (the
template already does) and handle it at the edge:

```ts
// ✅ the type says it may not find anything; the caller must handle it
export async function findOrder(id: string): Promise<Order | null> {
  const raw = await api.get<unknown>(`/orders/${id}`).catch(() => null);
  return raw === null ? null : parseResponse(orderSchema, raw, "findOrder");
}
```

And on the consuming side, prefer an early return over cascading `?.`:

```tsx
if (!order) return <EmptyState title="Order not found" />;
// from here down `order` is Order, with no `?.` on any line
```

!!! warning "`!` (non-null assertion) is a promise, not a check"
    `order!.code` is you guaranteeing the compiler something it couldn't prove. When
    you're right, it works; when you're wrong, it's `undefined` in production. Use an
    early return.

## An empty collection is `[]`, not `null`

```ts
// ✅
function listOrders(): Promise<Order[]>;          // no results → []
interface OrderResponse { items: Order[] }         // default: []

// ❌
function listOrders(): Promise<Order[] | null>;    // now every caller checks null
```

"No results" is a successful result. Returning `[]` makes the component's `.map()`
work without an `if`, and it's the convention the Tempest backend follows too.

## Where to check

```bash
npx tsc -b --noEmit     # includes the tests — a type bug in a test is a bug too
npx tempest lint
npx tempest doctor      # checks tsconfig strict, alias, env, CSS
```

`typecheck` is the cheapest CI gate: it runs in seconds and catches what no test
would catch without writing the case.

## Recap

- **Zero `any`.** `unknown` at the edge + validation; `as` only in three rare cases.
- Types **derived** from the zod schema (`z.infer`), never written twice.
- A **discriminated union** erases the impossible state; `assertNever` enforces
  exhaustiveness at build time.
- Props model what's valid: string `union`, not booleans; mutually exclusive variants
  as a union of objects.
- Derive with `Pick`/`Omit`/`Partial`/`ReturnType`; validate with `satisfies`.
- Generics with a **constraint**; explicit null with early returns; an empty
  collection is `[]`.

Next: [Testing strategy](testing.md).
