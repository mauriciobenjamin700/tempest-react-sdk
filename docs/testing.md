# Testing helpers (`tempest-react-sdk/testing`)

Subpath bundle separado, opt-in via `tempest-react-sdk/testing`. Sem peer dep MSW — output é puro data-shape.

## `createMockHandlers`

Factory MSW-shaped. Define fixtures em um lugar só, alimente em `msw`/`vi.fn`/custom harness.

```ts
import { createMockHandlers } from "tempest-react-sdk/testing";

const fixtures = createMockHandlers([
  { method: "GET", path: "/users/me", status: 200, body: { id: "u1", name: "Mauricio" } },
  { method: "POST", path: "/orders", status: 201, body: { id: "o1" } },
  { method: "GET", path: "/explode", status: 500, body: { detail: "kaboom" } },
  { method: "GET", path: "/slow", body: { ok: true }, delayMs: 300 },
]);
```

### Tipo

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

### Integrando com MSW

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

### Integrando com vitest fetch stub

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

## Por que não declarar `msw` como peer

- Apps que usam vitest fetch stub / nock / outros não precisam de msw.
- Apps que usam msw já têm a versão fixada — declarar peer adicionaria conflito sem benefício.
- O output do helper é trivialmente convertível pra qualquer harness — 5 linhas de map.

## Veja também

- [HTTP client](./http.md) — testar `createApiClient` é o caso de uso mais comum.
