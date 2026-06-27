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
import * as S from "./schemas";

export type User = z.infer<typeof S.UserSchema>;
export type UserCreate = z.infer<typeof S.UserCreateSchema>;
```

### `service.ts` — one class per group, with validation

```ts
import type { ApiClient } from "tempest-react-sdk";
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
    return this.api.get<User>(`/users/${id}`);
  }
}
```

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

!!! note "Validates **input**, types the **output**"
    The method validates the **body** with `Schema.parse(...)` (fails early on
    invalid data) and **types** the response. The response is not validated at
    runtime by default — trust the backend contract, or validate manually with
    the matching schema if you need a guarantee.

!!! warning "Current support"
    v1 covers the common FastAPI spec: `components.schemas` (object, enum, array,
    `$ref`, nullable, anyOf/oneOf/allOf), path/query params, JSON body and
    response, grouped by the first `tag`. YAML and multiple content-types are not
    supported yet — point at the `/openapi.json` (JSON).

## Recap

- `tempest gen api <url|file> --out src/api` generates, **per route group**, three files: `schemas.ts` (Zod), `types.ts` (`z.infer`) and `service.ts` (class).
- The service class takes an injected `ApiClient` and **validates the body with Zod** before calling the API.
- Treat `src/api/` as a generated artifact — **regenerate** when the contract changes.
- See also: [HTTP / `createApiClient`](./http.md) · [Query](./query.md) · [`tempest` CLI](./cli.md).
