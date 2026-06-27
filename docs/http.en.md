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

- `baseURL` — prefix for every request. **Required.**
- `getToken()` — called per request; returning a string injects `Authorization: Bearer <token>`.
- `onUnauthorized(response)` — fired on 401. Use it to log out.
- `refresh()` — when present and the request returns 401, the client awaits `refresh()` and retries the request **once**.
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

## Recap

- `createApiClient({ baseURL, getToken, onUnauthorized, refresh, ... })` creates a typed client; instantiate it once and export it.
- 401 with `refresh` → tries to renew and retries once; without refresh or on failure → `onUnauthorized` + `ApiError`.
- `parseResponse(schema, raw, context)` validates the payload with zod and points at the divergent field in dev.
- `uploadWithProgress` uses XHR to report byte-level progress.
- `retry` (exponential backoff + `shouldRetry`) and `usePoll` (interval with overlap guard) cover flaky operations and job tracking.
- `generateIdempotencyKey` — generate once per operation, reuse across retries.

## See also

- [Auth + Guard](./auth.md)
- [Query](./query.md) — powers your `queryFn`s
- [SSE](./sse.md) — uses `withCredentials` just like the client
- Diagram: [request-flow.drawio](./diagrams/request-flow.drawio)
