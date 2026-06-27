# Testing helpers (`tempest-react-sdk/testing`)

A separate subpath bundle, opt-in via `tempest-react-sdk/testing`. No MSW peer
dep — the output is pure data-shape.

## Why a testing subpath?

Mocking HTTP responses is the most common testing need in an app that consumes
the SDK (testing `createApiClient`, screens that fetch, etc.). The catch is that
every team picks a different harness — `msw`, a vitest `fetch` stub, `nock`. If
the SDK declared `msw` as a peer dep, it would force that choice on everyone.

The fix is a **data-shape** helper: you describe your fixtures once
(`{ method, path, status, body }`) and convert them to your harness with a
few-line `map`. Because it's just data, it lives in a separate subpath
(`tempest-react-sdk/testing`) that **never lands in the app's production bundle**.

!!! tip "Import from the subpath, not the root barrel"
    `createMockHandlers` only exists in `tempest-react-sdk/testing`. It is never
    re-exported from the main `tempest-react-sdk` — so test code never leaks into
    your production bundle.

## `createMockHandlers`

An MSW-shaped factory. Define fixtures in one place, feed them to
`msw`/`vi.fn`/a custom harness.

```ts
import { createMockHandlers } from "tempest-react-sdk/testing";

const fixtures = createMockHandlers([
  { method: "GET", path: "/users/me", status: 200, body: { id: "u1", name: "Mauricio" } },
  { method: "POST", path: "/orders", status: 201, body: { id: "o1" } },
  { method: "GET", path: "/explode", status: 500, body: { detail: "kaboom" } },
  { method: "GET", path: "/slow", body: { ok: true }, delayMs: 300 },
]);
```

### Type

```ts
type MockHandlerMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface MockHandlerInput {
  method: MockHandlerMethod;
  path: string;
  status?: number; // default 200
  body?: unknown; // default null
  headers?: Record<string, string>; // default { "Content-Type": "application/json" }
  delayMs?: number; // default 0
}

interface MockHandler {
  method: MockHandlerMethod;
  path: string;
  status: number;
  body: unknown;
  headers: Record<string, string>;
  delayMs: number;
}
```

### Integrating with MSW

```ts
import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import { createMockHandlers } from "tempest-react-sdk/testing";

const fixtures = createMockHandlers([{ method: "GET", path: "/users/me", body: { id: "u1" } }]);

const handlers = fixtures.map((f) => {
  const httpMethod = f.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
  return http[httpMethod](f.path, async () => {
    if (f.delayMs > 0) await delay(f.delayMs);
    return HttpResponse.json(f.body, { status: f.status, headers: f.headers });
  });
});

export const server = setupServer(...handlers);
```

### Integrating with a vitest fetch stub

```ts
import { vi } from "vitest";
import { createMockHandlers } from "tempest-react-sdk/testing";

const fixtures = createMockHandlers([
  { method: "POST", path: "/login", status: 401, body: { detail: "bad creds" } },
]);

global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const match = fixtures.find((f) => url.endsWith(f.path) && f.method === method);
  if (!match) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(match.body), {
    status: match.status,
    headers: match.headers,
  });
});
```

!!! tip "Restore `fetch` between tests"
    Under `vitest + jsdom`, overriding `global.fetch` in one test leaks into the
    next ones. Put `vi.restoreAllMocks()` (or reassign the original `fetch`) in an
    `afterEach` to isolate each case.

!!! note "`delayMs` tests loading states"
    The `delayMs` field (default `0`) exists so you can exercise spinners and
    skeletons. In the MSW example, `await delay(f.delayMs)` applies that delay; in
    the `fetch` stub, wrap the return in an equivalent `setTimeout`/`await`.

## Complete example — testing `createApiClient`

A copy-pasteable end-to-end program: fixtures → MSW server → assertion against
the SDK client.

```ts
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import { createMockHandlers } from "tempest-react-sdk/testing";
import { createApiClient } from "tempest-react-sdk";

const fixtures = createMockHandlers([
  { method: "GET", path: "/users/me", body: { id: "u1", name: "Mauricio" } },
  { method: "GET", path: "/explode", status: 500, body: { detail: "kaboom" } },
]);

const server = setupServer(
  ...fixtures.map((f) => {
    const method = f.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
    return http[method](`https://api.test${f.path}`, async () => {
      if (f.delayMs > 0) await delay(f.delayMs);
      return HttpResponse.json(f.body, { status: f.status, headers: f.headers });
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApiClient({ baseUrl: "https://api.test" });

it("resolves the happy path", async () => {
  const me = await api.get("/users/me");
  expect(me).toEqual({ id: "u1", name: "Mauricio" });
});

it("surfaces the error path", async () => {
  await expect(api.get("/explode")).rejects.toThrow();
});
```

## Why `msw` is not declared as a peer

- Apps using a vitest fetch stub / nock / others don't need msw.
- Apps using msw already pin their version — declaring a peer would add a conflict with no benefit.
- The helper's output is trivially convertible to any harness — 5 lines of map.

## Recap

- `createMockHandlers` is a **data-shape** helper in a separate subpath
  (`tempest-react-sdk/testing`) — outside the production bundle.
- You describe fixtures once (`{ method, path, status, body, headers, delayMs }`)
  and convert them to your harness (MSW, `fetch` stub, nock) with a short `map`.
- Defaults: `status` 200, `body` `null`, `headers` `Content-Type: application/json`,
  `delayMs` 0.
- `msw` is **not** a peer dep — the caller pins its own version; restore `fetch`
  between tests; use `delayMs` to exercise loading states.

## See also

- [HTTP client](./http.md) — testing `createApiClient` is the most common use case.
