# Async: promise, await, fetch

!!! tip "Skip this page if you already know…"

    - what a Promise represents and what its three states are;
    - why `console.log` shows the data and the screen shows nothing;
    - that `fetch` does **not** reject on 404 or 500;
    - the difference between sequential `await` and `Promise.all`.

## The problem

This code prints `undefined`, and it is the most common async mistake there is:

```js
function fetchUser() {
    let user;
    fetch("/api/user")
        .then((r) => r.json())
        .then((data) => {
            user = data;
        });
    return user; // ← runs NOW; the fetch finishes later
}

console.log(fetchUser()); // undefined
```

`return` does not wait. The whole function runs to the end, returns `undefined`, and
only **afterwards** — milliseconds or seconds later — the response arrives and
writes into a variable nobody reads any more.

The fix is not waiting better. It is **returning the promise**:

```js
async function fetchUser() {
    const response = await fetch("/api/user");
    return response.json();
}

console.log(await fetchUser()); // the object
```

## What a Promise is

An object representing **a value that does not exist yet**. Three states, and the
transition is final:

- `pending` — in flight
- `fulfilled` — finished with a value
- `rejected` — finished with an error

`await` pauses the function until the promise leaves `pending`, and hands you the
value (or throws the error). `async` marks a function as "returns a promise" — which
is what allows `await` inside it.

## A complete example

Single file, against a real public endpoint. Open it in a browser:

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Async</title>
    </head>
    <body>
        <button type="button" id="load">Load</button>
        <pre id="output">click to load</pre>

        <script type="module">
            const output = document.querySelector("#output");

            async function loadPost(id) {
                const response = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return response.json();
            }

            document.querySelector("#load").addEventListener("click", async () => {
                output.textContent = "loading…";
                try {
                    const post = await loadPost(1);
                    output.textContent = post.title;
                } catch (error) {
                    output.textContent = `failed: ${error.message}`;
                } finally {
                    console.log("done, success or not");
                }
            });
        </script>
    </body>
</html>
```

### The `if (!response.ok)` is not optional

This is `fetch`'s trap number one:

!!! danger "`fetch` only rejects when the network fails"

    404, 401, 500 — all of them arrive as a **resolved** promise. Without
    `if (!response.ok)` you call `.json()` on an error page, and the symptom shows
    up as a parse `SyntaxError`, far from the cause. `response.ok` is `true` only
    for status 200–299.

## Sequential and parallel

Two `await`s in a row run **in sequence** — the second starts only after the first
finishes:

```js
const user = await fetchUser(); // 300ms
const orders = await fetchOrders(); // 300ms
// total: 600ms
```

When there is no dependency between them, fire both and wait together:

```js
const [user, orders] = await Promise.all([fetchUser(), fetchOrders()]);
// total: 300ms
```

| Combinator             | When to use it                                                     |
| ---------------------- | ------------------------------------------------------------------ |
| `Promise.all`          | You need all of them. Rejects on the first error.                   |
| `Promise.allSettled`   | You want every result, success or failure.                          |
| `Promise.race`         | Whichever finishes first. It is how a hand-rolled timeout is built. |
| `Promise.any`          | The first one that **succeeds**.                                    |

## Cancellation: `AbortController`

A request nobody wants any more keeps consuming the network and, worse, still
writes to state when it comes back:

```js
const controller = new AbortController();
fetch("/api/slow", { signal: controller.signal });
controller.abort(); // the promise rejects with an error named "AbortError"
```

In React that is the content of the cleanup function of a data-fetching effect:
without cancelling, the unmounted component still receives the response.

## Where it shows up in the SDK

You rarely write `fetch` in an app built on the SDK. `createApiClient` already does
the `response.ok`, the parse, the token, the timeout and the typed error:

```ts
import { createApiClient, isApiError } from "tempest-react-sdk";

export const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL,
    getToken: () => useAuthStore.getState().token,
});

try {
    const users = await api.get<User[]>("/users", { params: { active: true } });
} catch (error) {
    if (isApiError(error) && error.status === 403) {
        // error.detail, error.code, error.requestId — all typed
    }
}
```

Any non-2xx response becomes a `TempestApiError` carrying `status`, `detail`, `code`
and `requestId` — the opposite of raw `fetch`, where a 500 sails through.

For a one-off case inside a component, `useAsync` hands you the three states:

```tsx
import { useAsync } from "tempest-react-sdk";

function UserProfile({ id }: { id: string }) {
    const { data, status, error } = useAsync(() => api.get<User>(`/users/${id}`), [id], {
        immediate: true,
    });

    if (status === "pending") return <p>loading…</p>;
    if (status === "error") return <p>failed: {String(error)}</p>;
    return <p>{data?.name}</p>;
}
```

!!! info "An empty list is success, not an error"

    `GET /users?active=true` with no matches answers **200 with `[]`**, not 404. 404
    is for "this single resource does not exist", and it is what separates "the
    route does not exist" from "the query found nothing". On the client that means
    the empty state is an `if (list.length === 0)`, not a `catch` — the convention
    lives in [HTTP](../http.md).

## Recap

- A Promise is a future value in three states; `await` waits and `async` marks the
  function that returns one. ✅
- Returning from inside a `.then` to the outer function **does not work** — return
  the promise.
- `fetch` does **not** reject on 404/500: without `if (!response.ok)` you parse an
  error page.
- Sequential `await` is serial; use `Promise.all` when there is no dependency.
- `AbortController` cancels — it is the body of a data-fetching effect's cleanup.
- In the SDK, `createApiClient` covers ok/parse/token/timeout and throws a typed
  `TempestApiError`; `useAsync` hands you the three states.

📚 **Canonical reference:** [MDN — Asynchronous JavaScript](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous)

➡️ **Next page:** [Modules, npm and the bundler](js-modules.md)
