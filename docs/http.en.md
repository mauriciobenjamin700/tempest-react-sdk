# HTTP

Typed fetch layer with 401 + refresh handling, automatic JSON parsing, and upload with progress. Inspired by the `RequestHandler` from alofans-frontend, but factory-based so each app instantiates its own client.

!!! info "Why a factory instead of a global singleton?"
    Each app has its own `baseURL`, its own way to store the token, and its own logout strategy. A factory lets you create the client once, inject those dependencies, and export a ready instance — no global-state imports scattered across the code.

## When to use

- Every HTTP call in the app goes through `createApiClient`.
- To validate the response against a schema, combine it with `parseResponse`.
- For uploads with a progress bar, use `uploadWithProgress`.
- To retry flaky operations use `retry`; to track a job, `usePoll`.

> Editable diagram: [request-flow.drawio](./diagrams/request-flow.drawio) (open it in [draw.io](https://app.diagrams.net)).

## `createApiClient`

Create the client once (e.g. `src/services/api.ts`) and export it:

```ts
import { createApiClient } from "tempest-react-sdk";
import { useAuthStore } from "./auth-store";
import { AuthService } from "./auth-service";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().logout(),
  refresh: async () => {
    await AuthService.refresh(); // refresh sets a new token in the store
  },
  withCredentials: true,
  headers: { "X-Client": "web" },
});
```

Options (everything except `baseURL` is optional):

- `baseURL` — prefix for every request. **Required.** May carry a path (`https://api.example.com/api`) and may be relative (`"/api"`, resolved against the current origin). See [Base URL and prefix](#base-url-and-prefix).
- `prefix` — path segment every request is nested under, such as `"/api"`. See [Base URL and prefix](#base-url-and-prefix).
- `getToken()` — called per request; returning a string injects `Authorization: Bearer <token>`.
- `onUnauthorized(response)` — fired whenever the request ends up unauthorized: a 401 with no `refresh`, a `refresh()` that rejected, or a replay that came back 401 again. Use it to log out.
- `refresh()` — when present and the request returns 401, the client awaits `refresh()` and retries the request **once**.
- `retry` — `true` or `RetryOptions`. **Off by default.** See [Built-in retries](#built-in-retries).
- `logger` — where the client reports every request it finished. **Off by default.** See [Request logging](#request-logging).
- `withCredentials` — send cookies on cross-origin requests (default `false`).
- `headers` — default headers merged into every request.
- `fetcher` — alternative `fetch` implementation (default `globalThis.fetch`) — handy in tests.

Methods: `get`, `post`, `put`, `patch`, `delete`, `upload`, `request`. Each accepts `RequestOptions` (`body`, `params`, and any `RequestInit` field except `body`):

```ts
// GET with query params (serialized automatically)
const users = await api.get<User[]>("/users", {
  params: { page: 1, size: 20, active: true },
});

// POST with a JSON body
const created = await api.post<User>("/users", {
  body: { name: "Ana", email: "ana@x.com" },
});

// DELETE
await api.delete<void>(`/users/${id}`);
```

Behavior:

- Automatic `Content-Type: application/json` (except for `FormData`).
- `Authorization: Bearer <token>` when `getToken()` returns a string.
- On a 401 with `refresh` configured: awaits `refresh()`, retries the request once. If it fails, calls `onUnauthorized` and throws `ApiError`.
- On a 401 without `refresh`: calls `onUnauthorized` and throws `ApiError`.
- 204 returns `undefined`.
- `Content-Type: application/json` in the response → `JSON.parse`. Otherwise, returns the raw text.

!!! warning "`refresh` retries only once"
    If `refresh()` runs but the retry still returns 401, the client gives up, calls `onUnauthorized` and throws. This avoids an infinite refresh loop when the session has truly expired.

    **That second 401 is the case that matters.** A `refresh()` that resolves is no proof the session is alive: the backend can hand back a token it then refuses — a revoked refresh token, a permission taken away, a race between tabs. Without `onUnauthorized` firing there, the app would sit on a store claiming "authenticated" while every request 401s, and the user would see a generic error with no way back to the login screen.

!!! warning "`onUnauthorized` should make no request"
    The hook's job is **local**: clear the store, the storage, the cache. `POST /auth/logout` belongs to the user's explicit logout, while the token is still valid — calling it from inside `onUnauthorized` sends the request with the very token the backend just refused, and it comes back 401/422.

    **A throwing hook no longer leaks.** The client awaits `onUnauthorized` and catches whatever it throws, so the caller still receives the original request's `ApiError` — before v0.48.0 the hook's throw took the place of the 401, and the console showed two errors where there was one, the second unrelated to the request that failed. With a `logger` configured, the hook's failure surfaces as a `warn` instead of vanishing.

## Base URL and prefix

A Tempest FastAPI service almost never sits at the root of its host: it is mounted under a `root_path`, typically `/api`. You tell the client about it in either of two equivalent ways — write the path into `baseURL`, or pass `prefix`:

```ts
// both reach https://api.example.com/api/auth/login
createApiClient({ baseURL: "https://api.example.com/api" });
createApiClient({ baseURL: "https://api.example.com", prefix: "/api" });

await api.post("/auth/login", { body: credentials });
```

!!! tip "When to prefer `prefix`"
    When the environment variable is used by more than the HTTP client — an SSE endpoint, a media host, a link you render. Keep `VITE_API_URL` a bare origin and put the prefix on the client alone; nothing else has to know about it.

The leading slash on a call-site path makes no difference — `"/auth/login"` and `"auth/login"` land in the same place:

```ts
const api = createApiClient({ baseURL: "https://api.example.com", prefix: "/api" });

await api.get("/orders"); // https://api.example.com/api/orders
await api.get("orders"); //  https://api.example.com/api/orders
```

!!! warning "This changed in v0.45.0"
    Through v0.44.0 the client resolved paths with `new URL(path, baseURL)`. Per the URL spec a path starting with `/` is absolute **against the origin**, so it silently dropped the path the `baseURL` carried: a client on `https://api.example.com/api` asking for `"/auth/login"` hit `https://api.example.com/auth/login` and 404'd on every request, with nothing in the config that looked wrong. The only way through was writing every path without its leading slash.

    If your app did that — relative paths because of the bug — nothing breaks: they still resolve identically. You can go back to writing `/auth/login` whenever you like.

The prefix is applied **at most once**. A path that already opens with it passes straight through, so call sites can migrate one at a time:

```ts
const api = createApiClient({ baseURL: "https://api.example.com", prefix: "/api" });

await api.get("/api/orders"); // https://api.example.com/api/orders — not /api/api
await api.get("/api-keys"); //  https://api.example.com/api/api-keys — compared per segment
```

Two useful escape hatches:

- **An absolute path wins over everything.** `api.get("https://cdn.example.com/file")` ignores `baseURL` and `prefix` — that is how you reach a second host (a signed upload, a CDN) without a second client.
- **A relative `baseURL`** (`"/api"`) resolves against the current origin, which is the right shape behind a dev-server proxy or a reverse proxy serving app and API from one host. Outside the browser (no `location`) it throws a `TypeError` naming the config to fix, rather than a bare `Invalid base URL`.

To build the same URL outside the client — an SSE `EventSource`, an `<img>` — the helper is exported:

```ts
import { buildApiUrl } from "tempest-react-sdk";

const stream = new EventSource(
  buildApiUrl(import.meta.env.VITE_API_URL, "/sse/events", {
    prefix: "/api",
    params: { access_token: token },
  }),
);
```

## Request logging

The client writes to no console of its own. Pass a `logger` and every finished attempt becomes one line:

```ts
import { createApiClient, createLogger } from "tempest-react-sdk";

const log = createLogger({ level: import.meta.env.DEV ? "debug" : "warn" });

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  logger: log.child("http"),
});

await api.get("/orders");
// [http] GET /orders → 200  { requestId: "8f2c…", status: 200, ms: 143 }
```

What comes out:

| Event | Level | Line |
| --- | --- | --- |
| Response under 400 | `debug` | `GET /orders → 200` |
| Response 400 or above | `warn` | `GET /admin → 403` |
| Request that got no response | `warn` | `GET /orders → no response` (the context carries the `error`) |
| `onUnauthorized` firing | `warn` | `unauthorized — calling onUnauthorized` |
| `onUnauthorized` throwing | `warn` | `onUnauthorized threw — keeping the original response error` (the context carries the `error`) |

Each line's context carries `requestId`, `status` and the elapsed `ms`. It is **one line per attempt**, so the replay after a `refresh` and every retry show up — that is how you read "401, refreshed, 200" off the log.

!!! info "It is `logger`, not `debug: true`"
    A boolean flag would be a single switch for the whole SDK: all or nothing, always on `console`, and the strings would sit in the bundle even when it is off. With `logger` the **level** lives in the logger (`createLogger({ level })`), the **destination** lives in the sink (console in dev, Sentry in production, an array in a test) and the **scope** lives in the namespace — `log.child("http")` keeps two clients in the same app apart.

    Any object with `debug` and `warn` works (the exported type is `ApiClientLogger`), so it does not have to be the SDK logger.

!!! warning "What the log never carries"
    Body, headers and query string are left out on purpose: `Authorization` is a bearer token, a login body is a password, and an `access_token` query param would end up written to the sink alongside. What is logged is the method, the path as the call site wrote it, and the numbers.

    If you need the payload to debug, wrap the `fetcher` in your app — then logging a secret is your call, explicitly, and it does not reach production by accident.

## Built-in retries

`retry` turns on automatic replays inside the client itself, using the same exponential backoff as the standalone `retry()` helper:

```ts
const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  retry: true, // built-in policy
});

const users = await api.get<User[]>("/users"); // replays itself on a 503
```

**It ships off**, and turning it on is not required: without `retry`, the client fails on the first attempt, exactly as before.

The built-in policy is conservative on purpose:

| Replays | Does not replay |
| ------- | --------------- |
| `GET`, `HEAD`, `OPTIONS` | `POST`, `PUT`, `PATCH`, `DELETE` |
| Network failure (status `0`), `408`, `425`, `429`, any `5xx` | `400`, `401`, `403`, `404`, `422` — any other `4xx` |

!!! danger "Writes never replay on their own"
    A replayed `POST` can charge twice, create two orders, fire two webhooks. `PUT` and `DELETE` are idempotent on paper, but a backend that logs or bills per call still sees two — so they stay out as well.

    To replay a write, make it idempotent with [`generateIdempotencyKey`](#generateidempotencykey) and pass your own `shouldRetry`:

    ```ts
    const key = generateIdempotencyKey(); // once, outside the loop

    const api = createApiClient({
      baseURL,
      headers: { "Idempotency-Key": key },
      retry: { shouldRetry: (error) => isApiError(error) && error.status >= 500 },
    });
    ```

    Your `shouldRetry` **replaces the whole policy**, method check included — that is the escape hatch.

Replaying a `400` or a `403` cannot fix a bad payload or a permission the user does not have; it only spends their time before showing the same error. That is why the cut is by status rather than "any thrown error".

Worth knowing:

- A retry wraps the **whole** request, refresh included. One attempt that spends the full 401 → refresh → replay cycle counts as a single attempt.
- Each attempt carries its own `X-Request-ID`, so the backend can tell the attempts apart in its logs.
- `Retry-After` (on `429`/`503`) is honoured and overrides the backoff for that attempt.
- Need retries on one specific call rather than the whole client? The [`retry`](#retry-exponential-backoff) helper is still there and unchanged.

## `parseResponse`

Validates the payload with zod. In dev/test it shows exactly which field diverged (contract drift). In prod, a generic message (does not leak internal structure).

```ts
import { parseResponse } from "tempest-react-sdk";
import { z } from "zod";
import { api } from "./api";

const userSchema = z.object({ id: z.string(), name: z.string() });

const raw = await api.get<unknown>("/users/me");
const user = parseResponse(userSchema, raw, "GET /users/me");
// user: { id: string; name: string } — typed from the schema
```

!!! tip "The 3rd argument is the context"
    Always pass a label like `"GET /users/me"`. It shows up in the dev error message and makes it trivial to pinpoint which endpoint broke the contract.

## `uploadWithProgress`

`fetch` does not report upload progress in the browser — this helper uses `XMLHttpRequest` underneath, keeping the same error contract as `createApiClient` (throws `ApiError`).

```tsx
import { useState } from "react";
import { uploadWithProgress } from "tempest-react-sdk";
import { useAuthStore } from "./auth-store";

export function AvatarUpload() {
  const [progress, setProgress] = useState(0);

  async function handleFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const controller = new AbortController();

    const result = await uploadWithProgress<{ url: string }>({
      url: `${import.meta.env.VITE_API_URL}/uploads`,
      method: "POST",
      body: formData,
      getToken: () => useAuthStore.getState().token,
      onProgress: ({ fraction }) => fraction !== null && setProgress(Math.round(fraction * 100)),
      signal: controller.signal,
    });

    console.log("Final URL:", result.url);
  }

  return (
    <label>
      <input type="file" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <progress value={progress} max={100} />
    </label>
  );
}
```

`onProgress` receives `{ loaded, total, fraction, lengthComputable }`. `fraction` is `null` when the total size is unknown. Aborting via `signal` rejects with `DOMException("Aborted")`.

## `retry` — exponential backoff

Re-runs an async factory with increasing delays (`initialDelay` doubling each attempt, capped by `maxDelay`):

```ts
import { retry } from "tempest-react-sdk";
import { api } from "./api";
import type { ApiError } from "tempest-react-sdk";

const data = await retry(() => api.get("/flaky-endpoint"), {
  retries: 5,
  initialDelay: 300,
  maxDelay: 10_000,
  // Do not retry client errors (4xx) — only transient failures
  shouldRetry: (error) => (error as ApiError).status >= 500,
  onRetry: ({ attempt, delay }) => console.warn(`Attempt ${attempt} in ${delay}ms`),
});
```

!!! note "`shouldRetry` avoids retrying what won't improve"
    A 403 or 422 will fail the same way on the 5th try. Filter by `status >= 500` (or network errors) so you don't waste attempts on deterministic errors.

## `usePoll` — polling with overlap guard

Calls an async factory on a fixed interval, skipping ticks while the previous call hasn't finished. Ideal for tracking a job's status:

```tsx
import { usePoll } from "tempest-react-sdk";
import { api } from "./api";

interface Job {
  id: string;
  status: "pending" | "done" | "failed";
}

export function JobStatus({ jobId }: { jobId: string }) {
  const { data, loading, error, stop } = usePoll<Job>(() => api.get<Job>(`/jobs/${jobId}`), {
    interval: 3000,
    stopWhen: (job) => job.status !== "pending",
    onError: (err) => console.error(err),
  });

  if (loading && !data) return <p>Checking…</p>;
  if (error) return <p>Failed to query the job.</p>;
  return (
    <div>
      Status: {data?.status}
      <button onClick={stop}>Stop</button>
    </div>
  );
}
```

`usePoll` also returns `start()` to resume manually, and accepts `disabled` to pause without unmounting.

## `generateIdempotencyKey`

Generates a v4 UUID for the `Idempotency-Key` header. Send the **same** value across retries of an operation that must not run twice (a charge, an order creation):

```ts
import { generateIdempotencyKey } from "tempest-react-sdk";
import { api } from "./api";

const key = generateIdempotencyKey();

await api.post("/orders", {
  body: { items },
  headers: { "Idempotency-Key": key },
});
```

!!! warning "Generate the key once per operation, not per attempt"
    If you generate a new key on each retry, the server treats every call as new and the protection is gone. Create the key **before** the retry loop and reuse it.

## Errors

`ApiError = { status, detail, body }`. Always throw — never return a falsy result. UIs can react by `status`:

```ts
import type { ApiError } from "tempest-react-sdk";
import { api } from "./api";

try {
  await api.get("/users/me");
} catch (err) {
  const error = err as ApiError;
  if (error.status === 403) toast.error("No permission");
  else toast.error(error.detail);
}
```

!!! info "FastAPI 422: `detail` is a list, not text"
    A FastAPI validation error arrives as `detail: [{ loc, msg, type }]`. The client flattens that into one readable line — `"email: Field required; items.0.price: Input should be greater than 0"` — instead of letting `String()` turn the list into `[object Object]`, which is what used to reach the screen and the log. The `loc` prefix that only names the request part (`body`, `query`, `path`, `header`, `cookie`) is dropped, so the path you read is the field's.

    The raw list stays on `error.body` — that is where you map per-field form errors from:

    ```ts
    import { isApiError } from "tempest-react-sdk";

    try {
      await api.post("/users", { body: form });
    } catch (err) {
      if (isApiError(err) && err.status === 422) {
        const entries = (err.body as { detail?: { loc?: unknown[]; msg?: string }[] }).detail ?? [];
        for (const entry of entries) {
          const field = String(entry.loc?.at(-1) ?? "");
          if (field) setError(field, { message: entry.msg });
        }
      }
    }
    ```

### From a typed error to the sentence on screen — `describeApiError`

The `try/catch` above writes the sentence by hand, and every app writes the same funnel — getting the same step wrong: a request that **never reached** the server has `status === 0`, and without special handling it renders as "erro 0".

```ts
import { describeApiError } from "tempest-react-sdk";

try {
  await api.get("/orders");
} catch (error) {
  toast.error(describeApiError(error, "Could not load the orders"));
}
```

The funnel, in order:

1. **A request that never left** — `status === 0`, or any error while the browser reports itself offline → the offline sentence.
2. **The backend's `detail`** — the most specific text available, already written for a person.
3. **`fallback`**, with `(HTTP <status>)` appended when a status is known — the screenshot in the support ticket then carries the one fact a developer needs.

Two surfaces, one funnel:

| | When to use |
| --- | --- |
| `describeApiError(error, fallback, strings?)` | Pure function. Runs in an interceptor, a logger, anywhere outside the React tree. |
| `useDescribeApiError()` | Hook. Resolves the fixed sentence through the active `I18nProvider`; returns `(error, fallback) => string`. |

```tsx
import { useDescribeApiError } from "tempest-react-sdk";

const describe = useDescribeApiError();
const { mutate } = useMutation({
  mutationFn: save,
  onError: (error) => toast.error(describe(error, "Could not save")),
});
```

!!! info "The hook does not duplicate the funnel — it only supplies the strings"
    `useDescribeApiError` calls the pure function. Both exist because of **where** the code runs: React context is unreachable from an interceptor, and passing translations by hand through every component is what the hook avoids.

!!! check "Works with no `I18nProvider`, and with no key in the catalog"
    i18n is opt-in in this SDK. With no provider — or a catalog that never defined `tempest.error.offline` — the sentence falls back to the pt-BR default, instead of crashing or printing the raw key at the user (which is what `t` returns on a miss).

!!! note "The two constants that come with it"
    `DEFAULT_API_ERROR_STRINGS` is the pt-BR sentence used when nothing else answers —
    handy as the base for your own. `API_ERROR_OFFLINE_KEY` is the key
    (`"tempest.error.offline"`) the hook looks up; define it in your `messages` to
    translate the offline sentence.

!!! warning "A synthetic `detail` does not beat your `fallback`"
    When the response carries no body, `buildApiError` synthesises `Erro <status>`. `describeApiError` recognises that text and prefers your `fallback` — "Erro 500" says strictly less than "Could not load the orders".

## Recap

- `createApiClient({ baseURL, getToken, onUnauthorized, refresh, ... })` creates a typed client; instantiate it once and export it.
- `baseURL` may carry a path (`https://host/api`) or be relative (`"/api"`), and `prefix: "/api"` says the same thing while leaving the env var a bare origin. The leading slash at the call site makes no difference, and the prefix is never applied twice. `buildApiUrl` builds the same URL outside the client.
- 401 with `refresh` → tries to renew and retries once. `onUnauthorized` fires on every unauthorized outcome — no refresh, a refresh that rejected, or a replay that came back 401.
- `retry: true` turns on replays inside the client: idempotent methods only, network/`408`/`425`/`429`/`5xx` only. Writes never replay on their own.
- `logger` is opt-in and the client writes to no console without it: one line per attempt (`debug` under 400, `warn` from 400 up) carrying `requestId`, `status` and `ms`, never a body/header/query string.
- `parseResponse(schema, raw, context)` validates the payload with zod and points at the divergent field in dev.
- `uploadWithProgress` uses XHR to report byte-level progress; for a large file, `createResumableUpload` chunks and resumes — see [Resumable upload](./resumable-upload.md).
- `retry` (exponential backoff + `shouldRetry`) and `usePoll` (interval with overlap guard) cover flaky operations and job tracking.
- `generateIdempotencyKey` — generate once per operation, reuse across retries.
- `describeApiError(error, fallback)` (pure) and `useDescribeApiError()` (i18n-aware) turn the typed error into the sentence on screen, treating `status === 0` as offline instead of "erro 0".

## See also

- [Auth + Guard](./auth.md)
- [Passkeys](./passkeys.md) — passwordless sign-in on top of the same client
- [Resumable upload (tus)](./resumable-upload.md) — when one request is not enough
- [Logger](./logger.md) — the `logger` the client accepts
- [Query](./query.md) — powers your `queryFn`s
- [SSE](./sse.md) — uses `withCredentials` just like the client
- Diagram: [request-flow.drawio](./diagrams/request-flow.drawio)
