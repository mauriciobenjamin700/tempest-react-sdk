# Generate services from OpenAPI (`tempest gen api`)

If your backend is FastAPI (or anything exposing an **OpenAPI 3.x** spec),
`tempest gen api` reads it and **generates a typed client** for you — the
Tempest way: **Zod schemas**, **TS types** and a **service class per route
group** (tag), with **Zod input validation**.

No hand-written `fetch`, no keeping types in sync with the backend by hand.

```bash
npx tempest gen api http://127.0.0.1:8000/openapi.json --out src/api
# or from a file:
npx tempest gen api ./openapi.json --out src/api
```

## What it generates

For each **route group** (the operation's `tag` in OpenAPI) you get a folder
with three files:

```text
src/api/
├── index.ts            # re-exports everything
├── users/
│   ├── schemas.ts      # Zod schemas (z.object…) for the group's models
│   ├── types.ts        # TS types (z.infer of the schemas)
│   └── service.ts      # UsersService class with one method per route
└── products/
    ├── schemas.ts
    ├── types.ts
    └── service.ts
```

### `schemas.ts` — Zod per model

```ts
import { z } from "zod";

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  role: z.enum(["admin", "member"]).optional(),
  bio: z.string().nullable().optional(),
});

export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});
```

### `types.ts` — inferred types

```ts
import type { z } from "zod";

import type * as S from "./schemas";

export type User = z.infer<typeof S.UserSchema>;
export type UserCreate = z.infer<typeof S.UserCreateSchema>;
```

### `service.ts` — one class per group, with validation

```ts
import type { ApiClient } from "tempest-react-sdk";
import { encodeIdSegment } from "tempest-react-sdk";

import * as S from "./schemas";
import type { User, UserCreate } from "./types";

export class UsersService {
  constructor(private readonly api: ApiClient) {}

  /** `GET /users` */
  async listUsers(params: { limit?: number }): Promise<User[]> {
    return this.api.get<User[]>("/users", { params });
  }

  /** `POST /users` */
  async createUser(body: UserCreate): Promise<User> {
    S.UserCreateSchema.parse(body); // validate the input at runtime
    return this.api.post<User>("/users", { body });
  }

  /** `GET /users/{id}` */
  async getUser(id: number): Promise<User> {
    return this.api.get<User>(`/users/${encodeIdSegment(id)}`);
  }
}
```

### A path parameter becomes **exactly one segment**

Note the `encodeIdSegment(id)` above: every path parameter goes through it
before reaching the URL. The `id` value often comes from outside the app — a
React Router param, a search param, a value another user stored. Left raw,
`"../../account"` would send `DELETE /users/{id}` to `DELETE /account`, **with
the signed-in user's Bearer**, and `"7?role=admin"` would inject a query string.
It is the same protection [`createDataProvider`](./data-provider.md) has applied
since 0.77.0:

| Value passed | Request sent |
| --- | --- |
| `7` | `GET /users/7` |
| `"../../account"` | `GET /users/..%2F..%2Faccount` |
| `"7?role=admin"` | `GET /users/7%3Frole%3Dadmin` |
| `"7#x"` | `GET /users/7%23x` |
| `""`, `"."`, `".."`, `null`, `undefined` | none — throws `TypeError` before the `fetch` |

A parameter typed as `boolean`, array or object goes through `encodeIdSegment`
too (with a type assertion, since it accepts `string | number`): `true` becomes
`true`, `["a", "b"]` becomes `a%2Cb`.

!!! tip "Regenerate to get the protection"
    Services generated before this version interpolate the parameter raw. Run
    `tempest gen api` again — no method signature changes.

### Header, path-item and `$ref` parameters

OpenAPI lets a parameter be declared at two levels: inside the operation and on
the **path item** (`paths["/items/{id}"].parameters`), applying to every
operation on that path. The generator reads both and merges them: when the two
levels declare the same (`name`, `in`) pair, **the operation wins**, as the spec
says. A parameter written as a `$ref` into `components/parameters` is resolved
too.

An `in: "header"` parameter becomes the last argument, `headers`, typed like the
query ones, and goes out in the request's `headers`:

```ts
import type { ApiClient } from "tempest-react-sdk";
import { encodeIdSegment } from "tempest-react-sdk";

/** Header parameters as strings, without the ones left out (`fetch` would send `undefined` as text). */
function headerRecord(
  values: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) out[name] = String(value);
  }
  return out;
}

export class ItemsService {
  constructor(private readonly api: ApiClient) {}

  /** `GET /items/{id}` */
  async getItem(
    id: string,
    headers: { "X-Tenant-Id": string; "Retry-Count"?: number },
  ): Promise<void> {
    return this.api.get(`/items/${encodeIdSegment(id)}`, { headers: headerRecord(headers) });
  }

  /** `POST /items` */
  async createItem(headers: { "Idempotency-Key"?: string } = {}): Promise<void> {
    return this.api.post("/items", { headers: headerRecord(headers) });
  }
}
```

- **A required header makes the argument required.** When every header is
  optional, `headers` defaults to `{}` — a new optional header on the backend
  does not break existing callers.
- **A header left out is not sent.** `fetch` would send `undefined` as text;
  `headerRecord` drops what was left out and passes the rest through `String()`.
- **`Accept`, `Content-Type` and `Authorization` are ignored**, as the spec
  requires: the client already builds them (`Authorization` comes from
  `getToken`).
- **`in: "cookie"` is not generated.** The browser does not let `fetch` set the
  `Cookie` header — the cookie reaches the server through the browser itself,
  with `withCredentials` on [`createApiClient`](./http.md).

A path parameter declared only on the path item goes through the same
`encodeIdSegment` as the others.

!!! tip "Regenerate if the backend declares headers or path-item parameters"
    Before, an `{id}` declared only on the path item was sent **literally** in
    the URL (`"/items/{id}"`), and a required header was simply not sent. Run
    `tempest gen api` again: the method gains the argument it was missing.

### A schema no route uses is left out

Each group only emits the schemas its routes reach (body, response and
parameters, following `$ref` chains). A schema no `$ref` reaches does not become
code — the case of the orphan enum FastAPI publishes for every `Enum`-annotated
field (`ImageMediaType`), even when the field carries a narrower inline enum. Its
name is not checked either: an orphan whose name collides with another schema
(`ImageMediaType` and `Image-Media-Type`) does not abort generation.

### Passes the template's lint and `tsc` as generated

The generated code drops into a `create-tempest-app` app with no error from
`npm run lint` or `tsc --noEmit`: it compiles under the template's strict
`tsconfig` (`noUnusedLocals`, `verbatimModuleSyntax`) and passes its
`eslint.config.js`, warnings included. In practice:

- **Only the imports that are used.** `service.ts` imports the types its
  signatures name, `S` only when a body is validated, and
  `OffsetPage`/`CursorPage`/`encodeIdSegment` only when they appear. A group
  with no schema at all gets `schemas.ts` and `types.ts` holding `export {};`.
- **A parameter typed by a `$ref` keeps its name.** An enum from
  `components/schemas` used in a path or query parameter becomes `kind: Kind` —
  and `Kind` is declared in `types.ts` and imported into `service.ts`. In the
  query, the type is only narrowed to `string` when the value is not a scalar
  (object, array).
- **Imports and re-exports in `simple-import-sort` order**, with one blank line
  between the package imports and the local ones, and never a double blank line.

!!! tip "Regenerate to clear the lint"
    Clients generated before this version can report `Cannot find name` (#504) or
    lint errors in generated files (#505). Run `tempest gen api` again.

## How to use it

The class **takes an `ApiClient`** (from [`createApiClient`](./http.md)) in its
constructor — you inject yours, with the base URL and token:

```ts
import { createApiClient } from "tempest-react-sdk";
import { UsersService } from "@/api/users";
import { useAuth } from "@/stores/auth";

const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuth.getState().token,
});

export const users = new UsersService(api);

// users.listUsers({ limit: 20 })  →  Promise<User[]>
// users.createUser({ email: "a@b.c" })  →  Zod-validates, then POST
```

With TanStack Query (already mounted by [`AppProviders`](./app-providers.md)):

```ts
import { useQuery } from "@tanstack/react-query";
import { users } from "@/api";

function UserList() {
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => users.listUsers({}) });
  // data: User[] | undefined
}
```

!!! tip "Re-generate when the backend changes"
    Run `tempest gen api` again after changing the backend — the files under
    `src/api/` are **generated**, so treat them as a build artifact (don't edit
    by hand; commit them if you like, but regenerate when the contract changes).

!!! note "The output stays inside the project"
    Before the first write, `gen api` checks the `--out`, every route-group folder
    and every file: a symlink (dangling included) in place of any of them, a path
    outside the project and an ancestor that is a symlink leading out are refused,
    and nothing is written. A `src/api` that is a link in a cloned repository does
    not carry the generated files somewhere else on disk.

!!! note "Validates **input**, types the **output**"
    The method validates the **body** with `Schema.parse(...)` (fails early on
    invalid data) and **types** the response. The response is not validated at
    runtime by default — trust the backend contract, or validate manually with
    the matching schema if you need a guarantee.

!!! warning "Current support"
    v1 covers the common FastAPI spec: `components.schemas` (object, enum, array,
    `$ref`, nullable, anyOf/oneOf/allOf), path/query/header params (from the
    operation and the path item), JSON body and response, grouped by the first `tag`. YAML and multiple content-types are not
    supported yet — point at the `/openapi.json` (JSON).

!!! info "Third-party spec text never becomes code"
    Every string from the spec reaches the generated TypeScript escaped for the
    position it lands in: a tag, `summary` or path inside a comment cannot close
    the `/** */`, path segments become template-literal text, and `pattern`
    becomes `new RegExp("...")`. A name that must be an **identifier** and is
    not — `{user-id}`, `user.Response`, `User-Out` — becomes a valid one:
    camelCase for a parameter (`userId`), PascalCase for a schema or type
    (`UserResponse`), a `_` prefix for a reserved word or a leading digit
    (`_string`, `_2fa`). Wherever the name matters at runtime the original wins:
    the URL fills `{user-id}` with the value of `userId`, and an object key is an
    escaped string (`"display-name"`). A name that already is an identifier is
    kept. Two schemas emitted in the same group that map to the same identifier
    (`User-Out` and `user.Out`) are refused with an error naming both, and so is a path `{placeholder}` that
    is not a declared parameter — there is no safe variable for it.

    The same goes for names the generator itself uses. A path parameter that
    would land on `body`, `params`, `headers`, `S`, `encodeIdSegment` or
    `headerRecord` becomes `bodyParam`/`paramsParam`/`headersParam`/`SParam`/
    `encodeIdSegmentParam`/`headerRecordParam`; an `operationId`
    of `constructor` or `api` becomes `constructor2`/`api2`; a schema named
    `ApiClient`, `OffsetPage`, `CursorPage`, `Promise`, `Record`, `z`, `S`,
    `encodeIdSegment` or `headerRecord` gets a `_` prefix; and two tags whose barrel
    names coincide (`user 1` and `user1`) are refused, naming both. A `pattern`
    that does not compile as a JavaScript regex fails **generation**, naming the
    schema and the property path — instead of breaking the app on import.

## Recap

- `tempest gen api <url|file> --out src/api` generates, **per route group**, three files: `schemas.ts` (Zod), `types.ts` (`z.infer`) and `service.ts` (class).
- The service class takes an injected `ApiClient` and **validates the body with Zod** before calling the API.
- Every path parameter goes through `encodeIdSegment`: it stays in one segment, and `""`/`"."`/`".."` throw before the request.
- Path-item parameters join the operation's (the operation wins on the same `name` + `in`); headers become the `headers` argument, and cookies stay with the browser.
- A schema no route reaches, such as FastAPI's orphan enum, is not generated.
- Treat `src/api/` as a generated artifact — **regenerate** when the contract changes.
- See also: [HTTP / `createApiClient`](./http.md) · [Query](./query.md) · [`tempest` CLI](./cli.md).
