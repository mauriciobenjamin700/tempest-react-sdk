# Full-stack Tempest integration (React ⇄ FastAPI)

You have a backend built with the [`tempest-fastapi-sdk`](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/) and a frontend built with this SDK. This page shows how the two **speak the same contract with no manual glue**: typed errors, `request_id` correlation, pagination, authentication, and service generation from the OpenAPI spec.

!!! info "What you'll learn"
    - How a backend error becomes a typed `TempestApiError` on the frontend (`err.code`, `err.requestId`).
    - How to propagate `X-Request-ID` to correlate logs across both sides.
    - How to honor `Retry-After` on `429`/`503`.
    - How to consume **offset** and **cursor** pagination with ready-made hooks.
    - How to wire turn-key JWT auth with `createTempestAuth`.
    - How to generate typed services from `/openapi.json`.

---

## The contract both sides share

The `tempest-fastapi-sdk` standardizes a few shapes. This SDK is aligned to them:

| Concept | Backend shape |
| --- | --- |
| **Error** | `{ "detail": str, "code": "ERROR_CODE", "details": { "request_id": str } }` |
| **Offset pagination** | `{ items, total, page, size, pages }` · query `?page&size` (`fastapi-pagination` convention) |
| **Cursor pagination** | `{ items, next_cursor, has_more, limit }` · query `?cursor&limit&order_by&ascending` |
| **Login** | `{ access_token, token_type: "bearer" }` · header `Authorization: Bearer <token>` |
| **Correlation** | middleware reads/generates `X-Request-ID`; echoes it in `details.request_id` on errors |
| **Rate limit** | `429 Too Many Requests` + `Retry-After: <seconds>` |

---

## 1. Typed errors (`TempestApiError`)

Every non-2xx response from `createApiClient` (and `uploadWithProgress`) becomes a `TempestApiError` — a real `Error` carrying the envelope fields.

```tsx
import { createApiClient, isApiError } from "tempest-react-sdk";

const api = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

try {
    await api.post("/api/users", { body: { email } });
} catch (err) {
    if (isApiError(err) && err.code === "EMAIL_TAKEN") {
        setFieldError("email", err.detail); // human message from the backend
        console.warn("failed", err.requestId); // same id as the backend log line
    } else {
        throw err;
    }
}
```

`err` looks like this:

```ts
interface ApiError {
    status: number; // 409
    detail: string; // "Email already taken"
    code?: string; // "EMAIL_TAKEN"  (from the `code` field)
    requestId?: string; // "req-abc"      (from details.request_id)
    retryAfter?: number; // seconds, when Retry-After is present
    body?: unknown; // raw body
}
```

!!! tip "Branch on `code`, not `detail`"
    `detail` is human text and may be translated/changed. `code` is stable — use it for logic (`if (err.code === "INSUFFICIENT_FUNDS")`).

!!! check "Nothing to configure"
    This is the default behavior. Any call through `createApiClient` or the codegen-generated class (which uses `ApiClient` under the hood) delivers the error in this shape.

---

## 2. Correlation with `X-Request-ID`

`createApiClient` sends a unique `X-Request-ID` header per request. The backend's `RequestIDMiddleware` reuses it (instead of generating another) and echoes it back in the error's `details.request_id` — so a click on the frontend and the backend log line share the same id.

```tsx
import { createApiClient, createLogger } from "tempest-react-sdk";

const log = createLogger({ name: "app" });

const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL,
    // Optional: bring your own generator (e.g. derived from a browser trace).
    requestId: () => crypto.randomUUID(),
});
```

When something fails, log the `requestId` to match the backend:

```tsx
catch (err) {
    if (isApiError(err)) log.error("request failed", { requestId: err.requestId });
}
```

!!! note "Disabling the header"
    Pass `requestId: () => ""` to skip the header (e.g. if a proxy already injects yours).

---

## 3. Honoring `Retry-After`

When the backend returns `429`/`503` with `Retry-After`, the `TempestApiError` already carries `retryAfter` (seconds). The `retry()` helper honors it automatically, overriding the exponential backoff.

```tsx
import { retry, isApiError } from "tempest-react-sdk";

const data = await retry(() => api.get("/api/reports"), {
    retries: 5,
    // only retry on rate-limit / unavailability
    shouldRetry: (err) => isApiError(err) && [429, 503].includes(err.status),
});
```

!!! warning "The hint is capped by `maxDelay`"
    If the server asks for 300s but your `maxDelay` is 10s, the wait stays at 10s. Raise `maxDelay` to obey long waits. To ignore the header, pass `respectRetryAfter: false`.

---

## 4. Pagination

### Offset — `usePaginatedQuery`

For routes returning `{ items, total, page, size, pages }`:

```tsx
import { usePaginatedQuery } from "tempest-react-sdk";

function UsersTable() {
    const users = usePaginatedQuery<User>({
        queryKey: ["users"],
        pageSize: 25,
        queryFn: (params) => api.get<OffsetPage<User>>("/api/users", { params }),
    });

    if (users.isLoading) return <Spinner />;

    return (
        <>
            <ul>
                {users.items.map((u) => (
                    <li key={u.id}>{u.email}</li>
                ))}
            </ul>
            <button onClick={users.prev} disabled={!users.hasPrev}>
                Previous
            </button>
            <span>
                {users.pageNumber} / {users.pageCount} · {users.total} total
            </span>
            <button onClick={users.next} disabled={!users.hasNext}>
                Next
            </button>
        </>
    );
}
```

The hook **owns the page state**, sends `page` + `size` to your `queryFn`, keeps the previous page visible while the next loads (`keepPreviousData`), and derives `hasNext`/`hasPrev`/`pageCount`.

!!! tip "`size` vs `page_size`"
    The default follows `fastapi-pagination` (`?size=`). If your backend uses `page_size`, pass `sizeParam: "page_size"`. `order_by`/`ascending` are only sent when you set `orderBy`.

### Cursor — `useCursorQuery`

For infinite-feed routes returning `{ items, next_cursor, has_more, limit }`:

```tsx
import { useCursorQuery } from "tempest-react-sdk";

function Feed() {
    const feed = useCursorQuery<Post>({
        queryKey: ["feed"],
        limit: 30,
        queryFn: (params) => api.get<CursorPage<Post>>("/api/feed", { params }),
    });

    return (
        <>
            {feed.items.map((p) => (
                <Card key={p.id} post={p} />
            ))}
            {feed.hasNextPage && (
                <button onClick={feed.fetchNextPage} disabled={feed.isFetchingNextPage}>
                    Load more
                </button>
            )}
        </>
    );
}
```

The opaque `next_cursor` is fed straight back as the next cursor; the loop stops when `has_more` becomes `false`.

!!! tip "The cursor is opaque"
    Never try to interpret `next_cursor` — it's the backend's base64/JSON. Just return the value you received.

---

## 5. Turn-key authentication — `createTempestAuth`

Instead of wiring `createAuthStore` + `createRefreshQueue` + `createApiClient` by hand, the preset connects everything to the real contract: login `{ access_token }`, `Bearer` header, and deduplicated `401 → refresh → retry`.

```tsx
import { createTempestAuth } from "tempest-react-sdk";

export const auth = createTempestAuth<User, { email: string; password: string }>({
    baseURL: import.meta.env.VITE_API_URL,
    loginPath: "/api/auth/login", // default
    refreshPath: "/api/auth/refresh", // default
    mePath: "/api/auth/me", // optional: fetch the user after login
});
```

Use it anywhere:

```tsx
// Login (stores the session and resolves the user)
const user = await auth.login({ email, password });

// Authenticated requests — the Bearer token is injected, and a 401 triggers a
// single refresh and retries the original call
const orders = await auth.api.get("/api/orders");

// Logout (clears the session + stored refresh token)
auth.logout();
```

The store is the same persisted `createAuthStore`, so it works with `<AuthGuard>`:

```tsx
import { AuthGuard } from "tempest-react-sdk";

<AuthGuard store={auth.useAuthStore} fallback={<Navigate to="/login" />}>
    <Dashboard />
</AuthGuard>;
```

!!! info "Refresh token: body or cookie"
    By default, if login returns `refresh_token`, it's stored and sent as `{ refresh_token }` on refresh. If your backend uses an httpOnly cookie, pass `withCredentials: true` and refresh goes body-less, relying on the cookie.

!!! danger "Where to store the token"
    The preset persists to `localStorage` by default (DX). For sensitive apps, prefer the refresh token in an **httpOnly cookie** (`withCredentials: true`) — that way JS never touches it.

---

## 6. Generating services from OpenAPI

The `tempest gen api` command reads the FastAPI `/openapi.json` and generates a typed `service.ts` per route group (see [OpenAPI (codegen)](openapi.md) for the full detail). Integration with everything above is automatic:

```bash
npx tempest gen api http://localhost:8000/openapi.json --out src/api
```

- The methods call `ApiClient` under the hood → **errors are already `TempestApiError`**.
- Routes returning the pagination envelopes generate `OffsetPage<T>` / `CursorPage<T>` return types automatically — ready for `usePaginatedQuery`/`useCursorQuery`.

```ts
// generated in src/api/users/service.ts
import type { ApiClient, OffsetPage } from "tempest-react-sdk";

export class UsersService {
    constructor(private readonly api: ApiClient) {}

    /** `GET /api/users` */
    async listUsers(params: { page?: number; page_size?: number }): Promise<OffsetPage<User>> {
        return this.api.get<OffsetPage<User>>("/api/users", { params });
    }
}
```

Wire the generated service to the authenticated client:

```tsx
import { UsersService } from "./api/users";

const usersService = new UsersService(auth.api);

const users = usePaginatedQuery<User>({
    queryKey: ["users"],
    queryFn: (params) => usersService.listUsers(params),
});
```

---

## The full loop

```text
backend (tempest-fastapi-sdk)
   │  exposes /openapi.json + contracts (error, pagination, JWT, X-Request-ID)
   ▼
tempest gen api  ──►  src/api/<group>/{schemas,types,service}.ts
   │
   ▼
createTempestAuth  ──►  auth.api (Bearer + refresh + TempestApiError errors)
   │
   ▼
usePaginatedQuery / useCursorQuery  ──►  typed UI, request_id correlation
```

## Paired features that already exist on both sides

| Frontend (this SDK) | Backend (`tempest-fastapi-sdk`) |
| --- | --- |
| `createEventStream` / `useEventStream` | SSE (Real-time) |
| `WebPushClient` / `usePushSubscription` | Web Push (VAPID) |
| `validateCPF` / `validateCNPJ` / `useViaCEP` | Brazilian Helpers |
| `createApiClient` (retry, idempotency) | HTTP Client (retry/backoff) |

## Recap

- Backend errors arrive as **`TempestApiError`** with `code` + `requestId` — use `isApiError` and branch on `code`. ✅
- **`X-Request-ID`** is sent automatically and correlates frontend ↔ backend. ✅
- **`Retry-After`** is honored by `retry()` on `429`/`503`. ✅
- **`usePaginatedQuery`** (offset) and **`useCursorQuery`** (cursor) consume the backend envelopes with no manual mapping. ✅
- **`createTempestAuth`** delivers login + Bearer + refresh/retry in one call. ✅
- **`tempest gen api`** generates typed services that already speak all these contracts. ✅
