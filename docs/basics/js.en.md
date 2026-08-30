# JavaScript: value, reference, scope

!!! tip "Skip this page if you already know…"

    - that `{} === {}` is `false`, and why;
    - that `const` freezes the binding, not the contents;
    - what a closure captures;
    - why an inline object in a prop makes `useEffect` run again.

## The problem

This `useEffect` runs in an **infinite loop**, and the code looks spotless:

```jsx
function List({ status }) {
    const filter = { status, order: "desc" };

    useEffect(() => {
        fetchItems(filter);
    }, [filter]); // ← runs on every render, always

    return null;
}
```

The dependency array compares with `Object.is`, which for objects is **reference**
comparison. `filter` is a new object on every render, so it is never "the same", and
the effect fires — which causes a render — which creates another object — which
fires the effect.

Without understanding value vs. reference, `useMemo`, `useCallback` and
`React.memo` are superstition: you copy the pattern without knowing what it
prevents. That is what this page is about.

## Value and reference

JavaScript has two groups of types:

- **Primitives** — `number`, `string`, `boolean`, `null`, `undefined`, `symbol`,
  `bigint`. Copied **by value**.
- **Objects** — `{}`, `[]`, `function`, `Date`, `Map`. Copied **by reference** (the
  variable holds an address, not the contents).

Run this in the browser console:

```js
const a = 1;
const b = a;
console.log(a === b); // true — same value

const x = { n: 1 };
const y = { n: 1 };
console.log(x === y); // false — same contents, different addresses

const z = x;
console.log(x === z); // true — same address
z.n = 2;
console.log(x.n); // 2 — z and x are the SAME object
```

The third line is the one that breaks `useEffect`: two objects with identical
contents are **not** equal to `===`.

!!! warning "`const` is not immutability"

    ```js
    const config = { debug: false };
    config.debug = true; // ✅ allowed — the contents changed
    config = {}; // ❌ TypeError — the binding cannot be reassigned
    ```

    `const` forbids pointing at a different object. It says nothing about the
    object. To freeze the contents there is `Object.freeze`, and it is shallow.

## Shallow and deep copies

Spread copies **one level**:

```js
const original = { name: "Ana", address: { city: "Recife" } };
const copy = { ...original };

copy.name = "Bia";
console.log(original.name); // "Ana" — top level copied ✅

copy.address.city = "Olinda";
console.log(original.address.city); // "Olinda" — the nested object is the SAME ⚠️
```

For a deep copy of serialisable data, modern browsers have
`structuredClone(original)`.

## Scope and closures

A function "remembers" the variables of the place where it was **written**, not
where it was called from. That is a closure:

```js
function createCounter() {
    let n = 0;
    return {
        increment: () => ++n,
        read: () => n,
    };
}

const c = createCounter();
c.increment();
c.increment();
console.log(c.read()); // 2 — `n` outlived createCounter()
```

In React this becomes the **stale closure**: a `setTimeout` or a listener created
during one render captures **that** render's values, and unless you recreate it, it
keeps looking at the past.

```js
useEffect(() => {
    const id = setInterval(() => {
        console.log(counter); // always the value from the render the effect ran in
    }, 1000);
    return () => clearInterval(id);
}, []); // empty array: the effect is never recreated
```

!!! info "Every cleanup function exists because of this"

    `return () => clearInterval(id)` is not good manners: without it, every render
    that recreates the effect leaves a live interval capturing a different past.
    That is a leak **and** a logic bug at the same time.

## Equality: `===`, `Object.is` and deep equality

| Comparison         | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `==`               | Coerces types before comparing. Do not use it.                                 |
| `===`              | Compares value (primitives) or reference (objects).                            |
| `Object.is`        | Like `===`, but `NaN` equals `NaN` and `+0` differs from `-0`. React uses this. |
| Deep equality      | Walks the structure comparing leaf by leaf. Not built in — it is code.         |

## Where it shows up in the SDK

The fix for the opening example is pinning the reference:

```tsx
import { useMemo, useEffect } from "react";

function List({ status }: { status: string }) {
    const filter = useMemo(() => ({ status, order: "desc" }), [status]);

    useEffect(() => {
        fetchItems(filter);
    }, [filter]); // ✅ only when `status` actually changes
}
```

But the reference is not always yours to memoise — when the object **comes from
outside**, through a prop or an HTTP response, there is nowhere to put the
`useMemo`. For that case the SDK exports `useDeepMemo`:

```tsx
import { useEffect } from "react";
import { useDeepMemo } from "tempest-react-sdk";

function Report({ filters }: { filters: { status: string; tags: string[] } }) {
    const stable = useDeepMemo(filters);

    useEffect(() => {
        fetchReport(stable);
    }, [stable]); // fires only when the CONTENTS change
}
```

It keeps the last value and only swaps the reference when a deep comparison finds a
difference. The parent may recreate the object on every render all it likes — the
child only reacts when the data changed.

!!! tip "Choose by where the object comes from"

    An object **you** create in the component → `useMemo`, cheaper. An object that
    **arrives** ready-made and you do not control → `useDeepMemo`. Deep comparison
    is not free: use it when the alternative is redoing bigger work.

The full list of utility hooks is in [Hooks](../hooks.md).

## Recap

- Primitives copy by value; objects, arrays and functions copy by **reference**.
  `{} === {}` is `false`. ✅
- `const` freezes the binding, not the contents.
- Spread copies one level; for the rest there is `structuredClone`.
- A closure captures **where the function was written** — hence stale closures and
  the need for cleanup functions.
- React's dependency array compares with `Object.is`: an inline object always
  fires.
- `useMemo` for objects you create; the SDK's `useDeepMemo` for objects that arrive
  from outside.

📚 **Canonical reference:** [MDN — JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

➡️ **Next page:** [Async: promise, await, fetch](js-async.md)
