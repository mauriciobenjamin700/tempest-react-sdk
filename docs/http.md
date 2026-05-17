# HTTP

Camada de fetch tipada com tratamento de 401 + refresh, parse JSON automático e upload com progresso. Inspirada no `RequestHandler` do alofans-frontend, mas factory-based pra cada app instanciar o seu próprio cliente.

## Quando usar

- Toda chamada HTTP do app passa por `createApiClient`.
- Pra validar a resposta contra um schema, combine com `parseResponse`.
- Pra upload com barra de progresso, use `uploadWithProgress`.

![Request flow](./diagrams/request-flow.drawio)

## `createApiClient`

```ts
import { createApiClient } from "tempest-react-sdk";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().logout(),
  refresh: async () => {
    await AuthService.refresh(); // refresh seta novo token no store
  },
  withCredentials: true,
  headers: { "X-Client": "web" },
});
```

Métodos: `get`, `post`, `put`, `patch`, `delete`, `upload`, `request`.

Comportamento:

- `Content-Type: application/json` automático (exceto `FormData`).
- `Authorization: Bearer <token>` quando `getToken()` retorna string.
- Em 401 com `refresh` configurado: aguarda `refresh()`, repete o request 1x. Se falhar, chama `onUnauthorized` e lança `ApiError`.
- Em 401 sem `refresh`: chama `onUnauthorized` e lança `ApiError`.
- 204 retorna `undefined`.
- `Content-Type: application/json` na resposta → `JSON.parse`. Caso contrário, retorna texto cru.

## `parseResponse`

Valida payload com zod. Em dev, mostra exatamente qual campo divergiu. Em prod, mensagem genérica (não vaza estrutura interna).

```ts
import { parseResponse } from "tempest-react-sdk";
import { z } from "zod";

const userSchema = z.object({ id: z.string(), name: z.string() });

const raw = await api.get<unknown>("/users/me");
const user = parseResponse(userSchema, raw, "GET /users/me");
```

## `uploadWithProgress`

`fetch` não reporta upload progress no navegador — esse helper usa `XMLHttpRequest`.

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

`signal.aborted` rejeita com `DOMException("Aborted")`. Mesmo contrato de erro do `createApiClient`: lança `ApiError`.

## Erros

`ApiError = { status, detail, body }`. Sempre lance — não retorne resultado falsy. UIs podem reagir por `status`:

```ts
try {
  await api.get("/users/me");
} catch (err) {
  const error = err as ApiError;
  if (error.status === 403) toast.error("Sem permissão");
  else toast.error(error.detail);
}
```

## Veja também

- [Auth + Guard](./auth.md)
- [SSE](./sse.md) — usa `withCredentials` igual ao client
- Diagrama: [request-flow.drawio](./diagrams/request-flow.drawio)
