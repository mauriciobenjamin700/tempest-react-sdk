# TypeScript: the minimum the SDK uses

!!! tip "Skip this page if you already know…"

    - how to read a signature with a generic (`<T>`) without stalling;
    - the difference between `interface` and `type`, and between union and
      intersection;
    - what `Omit`, `Pick` and `Partial` do;
    - why `as` is not a conversion, and why `unknown` beats `any`.

## The problem

You see this in a component's documentation and stop reading:

```ts
export interface DatePickerProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "size"> {
    value: string;
    onChange: (value: string) => void;
}
```

It looks hostile. But the signature is saying something simple and useful: *"I take
every attribute of an HTML `<input>`, minus four that I redefine my own way."*
Without it you would have to discover by trial and error which props get through.

This page covers exactly what shows up in the SDK's public signatures — nothing
more.

## Type annotations

```ts
const name: string = "Ana";
const age: number = 34;
const active: boolean = true;
const tags: string[] = ["a", "b"];
const pair: [string, number] = ["age", 34];

function greet(name: string, formal: boolean = false): string {
    return formal ? `Dear ${name}` : `Hi ${name}`;
}
```

Most of the time you do **not** write the annotation: TypeScript infers it. Write it
where it matters — parameters, the return type of a public export, and wherever
inference gets it wrong.

## `interface` and `type`

```ts
interface User {
    id: string;
    name: string;
    email?: string; // optional
    readonly createdAt: Date; // cannot be reassigned
}

type Status = "active" | "inactive" | "blocked"; // union
type UserWithStatus = User & { status: Status }; // intersection
```

- **Union** (`|`) — "one **or** the other". `Status` accepts only those three
  strings, and the editor autocompletes them.
- **Intersection** (`&`) — "everything from both at once".

`interface` can be extended and reopened; `type` does unions, intersections and
computed types. In practice: `interface` for the shape of an object, `type` for
everything else.

## Generics

A generic is a **type parameter** — the type going in decides what comes out:

```ts
function first<T>(items: T[]): T | undefined {
    return items[0];
}

const n = first([1, 2, 3]); // number | undefined
const s = first(["a", "b"]); // string | undefined
```

Without a generic you would have `any[] → any`, losing the information exactly where
it was useful. That is why the SDK's HTTP client is `api.get<User[]>("/users")`: you
say what you expect, and the return type survives all the way out.

## Utility types

The four that show up in the SDK:

```ts
interface User {
    id: string;
    name: string;
    email: string;
    password: string;
}

type PublicUser = Omit<User, "password">; // everything but `password`
type Credentials = Pick<User, "email" | "password">; // only those two
type PartialUser = Partial<User>; // everything optional
type FullUser = Required<PartialUser>; // everything required again
```

Now the opening signature reads by itself: `Omit<InputHTMLAttributes<...>, "type" |
"value" | "onChange" | "size">` is "the attributes of an HTML input, without those
four".

!!! info "The `size` in that `Omit` fixes a real bug"

    `HTMLInputElement.size` is a `number` (the field's width in characters). The
    SDK's `<Input>` defines `size` as a union of sizes — `"sm" | "md" | "lg"`. A
    component forwarding `...InputHTMLAttributes` into `<Input>` would collide on
    both: the DOM's `number` against the SDK's union. That is why `DatePicker`
    removes `size` before extending. An `Omit` in a public signature is almost
    always recording a collision like this one.

## `unknown`, `any` and `as`

```ts
const data: unknown = JSON.parse(text);

// ❌ any turns checking off — and the error comes back at runtime
const u1 = data as any;
u1.anything.at.all; // compiles, breaks in the browser

// ✅ unknown forces you to narrow before use
if (typeof data === "object" && data !== null && "name" in data) {
    console.log(data.name);
}
```

!!! danger "`as` converts nothing"

    `value as User` does not check, validate or transform: it is you **asserting**
    to the compiler that you know better. If the assertion is false, the error
    surfaces at runtime, far from the `as`. Use it when you have a real external
    guarantee; for data coming off the network, validate with zod — which is
    exactly what the schema in [Forms (zod)](../forms.md) does.

## `import type`

```ts
import type { User } from "./types"; // vanishes at build time
import { createUser } from "./api"; // stays in the bundle
```

Types do not exist at runtime. Marking the import with `type` makes that explicit
and guarantees the bundler will not keep the module alive just because of it.

## Where it shows up in the SDK

Every public surface of `tempest-react-sdk` is typed, and the barrel re-exports
values and types side by side:

```ts
import { createApiClient, isApiError } from "tempest-react-sdk";
import type { ApiClientConfig, ApiError } from "tempest-react-sdk";

const config: ApiClientConfig = {
    baseURL: import.meta.env.VITE_API_URL,
    getToken: () => localStorage.getItem("token") ?? undefined,
};

const api = createApiClient(config);
const users = await api.get<User[]>("/users"); // User[], not any
```

!!! tip "A flag the SDK measured and decided **not** to turn on"

    `noUncheckedIndexedAccess` makes `array[0]` typed as `T | undefined`. It sounds
    correct, and in the SDK it produced 221 errors — almost all of them indexing
    inside a loop bounded by the very `length`, or guarded by an invariant already
    defended. Adopting it would trade 221 real guards for 221 `!`, which is exactly
    the operator the flag exists to avoid. The sweep was worth it as an **audit**
    (it found one real defect, which became a `throw`); turning the flag on was
    not. The typing criterion the SDK actually applies lives in
    [Strong typing](../design/typing.md).

## Recap

- Annotate where it matters: parameters, public return types, and where inference
  gets it wrong. ✅
- Union (`|`) is "one or the other"; intersection (`&`) is "both".
- A generic is a type parameter — `api.get<User[]>` is what makes the return arrive
  typed.
- `Omit`/`Pick`/`Partial` carve existing types; a public `Omit` usually records a
  real collision.
- `as` does not convert, it asserts; prefer `unknown` + narrowing, or zod for
  network data.
- `import type` vanishes from the bundle.

📚 **Canonical reference:** [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

➡️ **Next page:** [React: component, state, effect](react.md)
