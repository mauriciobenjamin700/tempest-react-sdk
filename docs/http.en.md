# HTTP

Typed fetch layer with 401 + refresh handling, automatic JSON parsing, and
upload with progress. Inspired by the `RequestHandler` from alofans-frontend,
but factory-based so each app instantiates its own client.

## When to use

- Every HTTP call in the app goes through `createApiClient`.
- To validate the response against a schema, combine it with `parseResponse`.
- For uploads with a progress bar, use `uploadWithProgress`.

> Editable diagram: [request-flow.drawio](./diagrams/request-flow.drawio) (open it in [draw.io](https://app.diagrams.net)).

## `createApiClient`

```ts
import { createApiClient } from "tempest-react-sdk";

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

Methods: `get`, `post`, `put`, `patch`, `delete`, `upload`, `request`.

Behavior:

- Automatic `Content-Type: application/json` (except for `FormData`).
- `Authorization: Bearer <token>` when `getToken()` returns a string.
- On a 401 with `refresh` configured: awaits `refresh()`, retries the request once. If it fails, calls `onUnauthorized` and throws `ApiError`.
- On a 401 without `refresh`: calls `onUnauthorized` and throws `ApiError`.
- 204 returns `undefined`.
- `Content-Type: application/json` in the response → `JSON.parse`. Otherwise, returns the raw text.

## `parseResponse`

Validates the payload with zod. In dev, it shows exactly which field diverged.
In prod, a generic message (does not leak internal structure).

```ts
import { parseResponse } from "tempest-react-sdk";
import { z } from "zod";

const userSchema = z.object({ id: z.string(), name: z.string() });

const raw = await api.get<unknown>("/users/me");
const user = parseResponse(userSchema, raw, "GET /users/me");
```

## `uploadWithProgress`

`fetch` does not report upload progress in the browser — this helper uses
`XMLHttpRequest`.

```ts
import { uploadWithProgress } from "tempest-react-sdk";

const controller = new AbortController();

await uploadWithProgress<{ url: string }>({
  url: `${API}/uploads`,
  method: "POST",
  body: formData,
  getToken: () => useAuthStore.getState().token,
  onProgress: ({ fraction }) => fraction && setProgress(Math.round(fraction * 100)),
  signal: controller.signal,
});
```

`signal.aborted` rejects with `DOMException("Aborted")`. Same error contract as
`createApiClient`: it throws `ApiError`.

## Errors

`ApiError = { status, detail, body }`. Always throw — never return a falsy
result. UIs can react by `status`:

```ts
try {
  await api.get("/users/me");
} catch (err) {
  const error = err as ApiError;
  if (error.status === 403) toast.error("No permission");
  else toast.error(error.detail);
}
```

## See also

- [Auth + Guard](./auth.md)
- [SSE](./sse.md) — uses `withCredentials` just like the client
- Diagram: [request-flow.drawio](./diagrams/request-flow.drawio)
