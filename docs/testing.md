# Testing helpers (`tempest-react-sdk/testing`)

Subpath bundle separado, opt-in via `tempest-react-sdk/testing`. Sem peer dep MSW — output é puro data-shape.

## Por que um subpath de testes?

Mockar respostas HTTP é o caso de teste mais comum num app que consome o SDK
(testar `createApiClient`, telas que fazem fetch, etc.). O problema é que cada
time escolhe um harness diferente — `msw`, stub de `fetch` no vitest, `nock`. Se
o SDK declarasse `msw` como peer dep, forçaria essa escolha em todo mundo.

A solução é um helper **data-shape**: você descreve os fixtures uma vez
(`{ method, path, status, body }`) e converte pro seu harness com um `map` de
poucas linhas. Por ser só dado, ele vive num subpath separado
(`tempest-react-sdk/testing`) que **não entra no bundle de produção** do app.

!!! tip "Importe do subpath, não do barrel raiz"
    `createMockHandlers` só existe em `tempest-react-sdk/testing`. Ele nunca é
    re-exportado do `tempest-react-sdk` principal — assim código de teste jamais
    vaza pro bundle de produção.

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

!!! tip "Restaure o `fetch` entre testes"
    Sob `vitest + jsdom`, sobrescrever `global.fetch` num teste vaza pros
    seguintes. Coloque `vi.restoreAllMocks()` (ou reatribua o `fetch` original)
    num `afterEach` para isolar cada caso.

!!! note "`delayMs` testa estados de loading"
    O campo `delayMs` (default `0`) existe pra você exercitar spinners e
    skeletons. No exemplo MSW, o `await delay(f.delayMs)` aplica esse atraso;
    no stub de `fetch`, envolva o retorno num `setTimeout`/`await` equivalente.

## Exemplo completo — testando `createApiClient`

Programa copiável de ponta a ponta: fixtures → MSW server → asserção sobre o
client do SDK.

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

## Por que não declarar `msw` como peer

- Apps que usam vitest fetch stub / nock / outros não precisam de msw.
- Apps que usam msw já têm a versão fixada — declarar peer adicionaria conflito sem benefício.
- O output do helper é trivialmente convertível pra qualquer harness — 5 linhas de map.

## Recap

- `createMockHandlers` é um helper **data-shape** num subpath separado
  (`tempest-react-sdk/testing`) — fora do bundle de produção.
- Você descreve fixtures uma vez (`{ method, path, status, body, headers, delayMs }`)
  e converte pro seu harness (MSW, stub de `fetch`, nock) com um `map` curto.
- Defaults: `status` 200, `body` `null`, `headers` `Content-Type: application/json`,
  `delayMs` 0.
- `msw` **não** é peer dep — o caller fixa a própria versão; restaure o `fetch`
  entre testes; use `delayMs` pra exercitar estados de loading.

## Veja também

- [HTTP client](./http.md) — testar `createApiClient` é o caso de uso mais comum.
