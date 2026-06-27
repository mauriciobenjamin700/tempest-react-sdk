# Utilities

A collection of pure, React-free functions for the tedious everyday chores — grouping lists, merging objects, debouncing callbacks, formatting bytes. Everything is imported straight from `tempest-react-sdk` and runs in any JS environment (browser, Node, worker).

```ts
import { groupBy, pick, debounce, formatBytes } from "tempest-react-sdk";
```

!!! tip "Tree-shaking"
    Every function is an independent named export. Import only what you use — your app's bundler drops the rest.

---

## Arrays

Collection helpers that **never mutate** the input — they always return a new array (or object).

| Function                   | Signature                                                   | What it does                                                  |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| `groupBy(items, key)`      | `<T, K>(items: T[], key: (item: T) => K) => Record<K, T[]>` | Groups items into buckets keyed by the result of `key`.       |
| `uniqueBy(items, key)`     | `<T>(items: T[], key: (item: T) => unknown) => T[]`         | Removes duplicates, keeping the first occurrence of each key. |
| `chunk(items, size)`       | `<T>(items: T[], size: number) => T[][]`                    | Splits the list into chunks of at most `size` items.          |
| `range(start, end, step?)` | `(start: number, end: number, step?: number) => number[]`   | Builds a numeric range `[start, end)` with step `step` (1).   |

```ts
import { groupBy, uniqueBy, chunk, range } from "tempest-react-sdk";

groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? "even" : "odd"));
// { odd: [1, 3], even: [2, 4] }

uniqueBy(
  [
    { id: 1, v: "a" },
    { id: 1, v: "b" },
    { id: 2, v: "c" },
  ],
  (u) => u.id,
);
// [{ id: 1, v: "a" }, { id: 2, v: "c" }]

chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]

range(0, 5); // [0, 1, 2, 3, 4]
range(0, 10, 2); // [0, 2, 4, 6, 8]
range(5, 0, -1); // [5, 4, 3, 2, 1]
```

!!! warning "`chunk` requires `size >= 1`"
    Calling `chunk(items, 0)` throws `RangeError`. `range` with a wrong-direction (or `0`) step returns `[]` instead of throwing.

---

## Objects

Immutable copies and recursive merge. None of these functions mutate the input.

| Function                 | Signature                                                 | What it does                                                    |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------------------------- |
| `pick(obj, keys)`        | `<T, K extends keyof T>(obj: T, keys: K[]) => Pick<T, K>` | New object with only the requested keys (missing keys skipped). |
| `omit(obj, keys)`        | `<T, K extends keyof T>(obj: T, keys: K[]) => Omit<T, K>` | New object without the listed keys.                             |
| `deepMerge(target, src)` | `<T>(target: T, source: Partial<T>) => T`                 | Recursive merge of plain objects; arrays/instances replace.     |
| `isEmpty(value)`         | `(value: unknown) => boolean`                             | `true` for `null`, `""`, `[]`, `{}`, empty `Map`/`Set`.         |

```ts
import { pick, omit, deepMerge, isEmpty } from "tempest-react-sdk";

pick({ id: 1, name: "Ana", age: 30 }, ["id", "name"]);
// { id: 1, name: "Ana" }

omit({ id: 1, name: "Ana", age: 30 }, ["age"]);
// { id: 1, name: "Ana" }

deepMerge({ a: 1, nested: { x: 1, y: 2 } }, { nested: { y: 20, z: 30 } });
// { a: 1, nested: { x: 1, y: 20, z: 30 } }

isEmpty(0); // false — numbers are never "empty"
isEmpty(false); // false
isEmpty(""); // true
```

!!! info "`deepMerge` does not merge arrays"
    Arrays and non-plain values (dates, class instances, primitives) **replace** the whole `target` value — there is no element-by-element merge. `deepMerge({ tags: ["a", "b"] }, { tags: ["c"] })` yields `{ tags: ["c"] }`.

---

## Type guards

Safe type narrowing. They pair nicely with `Array.prototype.filter` and exhaustive `switch` statements.

| Function                       | Signature                                              | What it does                                                 |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------ |
| `isDefined(value)`             | `<T>(value: T \| null \| undefined) => value is T`     | `true` when the value is neither `null` nor `undefined`.     |
| `isString(value)`              | `(value: unknown) => value is string`                  | `true` for a string primitive.                               |
| `isNumber(value)`              | `(value: unknown) => value is number`                  | `true` for a number, **excluding** `NaN`.                    |
| `isPlainObject(value)`         | `(value: unknown) => value is Record<string, unknown>` | `true` only for an object literal (not array/date/instance). |
| `assertNever(value, message?)` | `(value: never, message?: string) => never`            | Always throws — marks unreachable code paths.                |

```ts
import { isDefined, isNumber, assertNever } from "tempest-react-sdk";

const xs: (number | null)[] = [1, null, 2];
const clean: number[] = xs.filter(isDefined); // [1, 2] — type already narrowed

isNumber(NaN); // false
isNumber("42"); // false

type Shape = "circle" | "square";
function area(shape: Shape): number {
  switch (shape) {
    case "circle":
      return 1;
    case "square":
      return 2;
    default:
      return assertNever(shape); // compile error if a case is forgotten
  }
}
```

!!! tip "`assertNever` is an exhaustiveness check"
    Use it in the `default` branch of a `switch`. If you add a new union member and forget to handle it, TypeScript complains at compile time — and the runtime fails loudly if something slips through.

---

## Functions

Execution-control wrappers. `debounce` and `throttle` expose `.cancel()`.

| Function             | Signature                                                                      | What it does                                                         |
| -------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `debounce(fn, wait)` | `<A>(fn: (...a: A) => void, wait: number) => ((...a: A) => void) & { cancel }` | Delays `fn` until `wait` ms with no new calls (trailing-edge).       |
| `throttle(fn, wait)` | `<A>(fn: (...a: A) => void, wait: number) => ((...a: A) => void) & { cancel }` | Runs at most once per `wait` ms (leading + trailing edge).           |
| `once(fn)`           | `<A, R>(fn: (...a: A) => R) => (...a: A) => R`                                 | Runs `fn` only on the first call; afterwards returns the cache.      |
| `memoizeOne(fn)`     | `<A, R>(fn: (...a: A) => R) => (...a: A) => R`                                 | Memoizes only the most recent call (args compared with `Object.is`). |

```ts
import { debounce, throttle, once, memoizeOne } from "tempest-react-sdk";

const save = debounce((q: string) => search(q), 300);
save("a");
save("ab");
save("abc"); // only "abc" runs after 300ms
save.cancel(); // cancels the pending call

const onScroll = throttle(() => render(), 200);
window.addEventListener("scroll", onScroll);

const init = once(() => expensiveSetup());
init(); // runs
init(); // returns the same result, no re-run

const select = memoizeOne((a: number, b: number) => a + b);
select(1, 2); // computes 3
select(1, 2); // cached 3
select(2, 2); // recomputes 4
```

!!! note "`memoizeOne` remembers only the last call"
    Unlike an LRU cache — any different argument list recomputes and replaces the cache. Ideal for selectors derived from props.

---

## Promises

| Function                         | Signature                                                              | What it does                                                    |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `sleep(ms)`                      | `(ms: number) => Promise<void>`                                        | Resolves after `ms` milliseconds.                               |
| `withTimeout(promise, ms, msg?)` | `<T>(promise: Promise<T>, ms: number, message?: string) => Promise<T>` | Races `promise` against a timeout; rejects with `TimeoutError`. |

```ts
import { sleep, withTimeout } from "tempest-react-sdk";

await sleep(500); // pauses for half a second

try {
  await withTimeout(fetch("/slow"), 3000, "request too slow");
} catch (error) {
  // error.name === "TimeoutError" when the 3s elapsed
}
```

---

## IDs

| Function            | Signature                     | What it does                                                         |
| ------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `randomId(prefix?)` | `(prefix?: string) => string` | Collision-resistant id (uses `crypto.randomUUID()` with a fallback). |

```ts
import { randomId } from "tempest-react-sdk";

randomId(); // "9f1c2b3a-..." (uuid) or "lq3f8k-4a9z1" (fallback)
randomId("user"); // "user-9f1c2b3a-..."
```

!!! tip "Great for UI keys"
    Use it for client-generated lists when there is no stable id from the server. For persisted ids, prefer the real backend id.

---

## Strings

| Function                          | Signature                                                      | What it does                                            |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| `capitalize(value)`               | `(value: string) => string`                                    | Uppercases only the first character.                    |
| `camelCase(value)`                | `(value: string) => string`                                    | Converts to `camelCase`.                                |
| `kebabCase(value)`                | `(value: string) => string`                                    | Converts to `kebab-case` (also splits `camelCase`).     |
| `pluralize(count, singular, pl?)` | `(count: number, singular: string, plural?: string) => string` | Picks singular/plural by count (returns the word only). |

```ts
import { capitalize, camelCase, kebabCase, pluralize } from "tempest-react-sdk";

capitalize("hello world"); // "Hello world"

camelCase("foo-bar_baz"); // "fooBarBaz"
camelCase("API response"); // "apiResponse"

kebabCase("helloWorld"); // "hello-world"
kebabCase("APIResponse"); // "api-response"

pluralize(1, "item"); // "item"
pluralize(3, "item"); // "items"
pluralize(2, "person", "people"); // "people"
```

!!! note "Pre-existing — `slugify` and `truncate`"
    Already in the strings module: `slugify(input)` builds a URL-safe slug (`"São Paulo / Centro"` → `"sao-paulo-centro"`), and `truncate(input, max, suffix?)` cuts text to `max` characters appending `…` (or the given `suffix`).

---

## Numbers

| Function                           | Signature                                      | What it does                                               |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `formatBytes(bytes, decimals?)`    | `(bytes: number, decimals?: number) => string` | Human-readable size in B/KB/MB/GB/TB (base 1024).          |
| `formatCompactNumber(value, loc?)` | `(value: number, locale?: string) => string`   | Compact notation (`1.2K`, `3.4M`) via `Intl.NumberFormat`. |

```ts
import { formatBytes, formatCompactNumber, clamp } from "tempest-react-sdk";

formatBytes(0); // "0 B"
formatBytes(1536); // "1.5 KB"
formatBytes(1536, 2); // "1.50 KB"

formatCompactNumber(1234); // "1.2K"
formatCompactNumber(5600000); // "5.6M"
formatCompactNumber(1234, "pt-BR"); // "1,2 mil"
```

!!! note "Pre-existing — `clamp`"
    `clamp(value, min, max)` pins a number to the `[min, max]` range (and tolerates `min > max`, swapping the bounds). `clamp(120, 0, 100)` → `100`.

---

## Recap

- Import any helper straight from `tempest-react-sdk` — they are all named, pure, tree-shakable exports.
- **Arrays/Objects**: `groupBy`, `uniqueBy`, `chunk`, `range`, `pick`, `omit`, `deepMerge`, `isEmpty` — always immutable; `deepMerge` replaces arrays instead of merging them.
- **Guards**: `isDefined`, `isString`, `isNumber`, `isPlainObject`, `assertNever` — safe narrowing + `switch` exhaustiveness.
- **Functions**: `debounce`/`throttle` (with `.cancel()`), `once`, `memoizeOne` to control execution.
- **Promises/IDs/Strings/Numbers**: `sleep`, `withTimeout`, `randomId`, `capitalize`/`camelCase`/`kebabCase`/`pluralize`, `formatBytes`/`formatCompactNumber`.

## See also

- [Utility hooks](./hooks.md) — `useDebounce` is the React flavor of `debounce`.
- [Utility & headless](./components/utility.md) — components that wrap some of these helpers (`Money`, `RelativeTime`).
