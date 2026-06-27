# Integração full-stack Tempest (React ⇄ FastAPI)

Você tem um backend feito com o [`tempest-fastapi-sdk`](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/) e um frontend feito com este SDK. Esta página mostra como os dois **falam o mesmo contrato sem cola manual**: erros tipados, correlação por `request_id`, paginação, autenticação e geração de serviços a partir do OpenAPI.

!!! info "O que você vai aprender"
    - Como um erro do backend vira um `TempestApiError` tipado no front (`err.code`, `err.requestId`).
    - Como propagar o `X-Request-ID` para correlacionar logs dos dois lados.
    - Como respeitar `Retry-After` em `429`/`503`.
    - Como consumir paginação **offset** e **cursor** com hooks prontos.
    - Como montar autenticação JWT turn-key com `createTempestAuth`.
    - Como gerar serviços tipados a partir do `/openapi.json`.

---

## O contrato que os dois lados compartilham

O `tempest-fastapi-sdk` padroniza alguns formatos. Este SDK foi alinhado a eles:

| Conceito | Formato do backend |
| --- | --- |
| **Erro** | `{ "detail": str, "code": "ERROR_CODE", "details": { "request_id": str } }` |
| **Paginação offset** | `{ items, total, page, size, pages }` · query `?page&size` (convenção `fastapi-pagination`) |
| **Paginação cursor** | `{ items, next_cursor, has_more, limit }` · query `?cursor&limit&order_by&ascending` |
| **Login** | `{ access_token, token_type: "bearer" }` · header `Authorization: Bearer <token>` |
| **Correlação** | middleware lê/gera `X-Request-ID`; ecoa em `details.request_id` no erro |
| **Rate limit** | `429 Too Many Requests` + `Retry-After: <segundos>` |

---

## 1. Erros tipados (`TempestApiError`)

Toda resposta não-2xx do `createApiClient` (e do `uploadWithProgress`) vira um `TempestApiError` — um `Error` de verdade que carrega os campos do envelope.

```tsx
import { createApiClient, isApiError } from "tempest-react-sdk";

const api = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

try {
    await api.post("/api/users", { body: { email } });
} catch (err) {
    if (isApiError(err) && err.code === "EMAIL_TAKEN") {
        setFieldError("email", err.detail); // mensagem humana do backend
        console.warn("falhou", err.requestId); // mesmo id que está no log do backend
    } else {
        throw err;
    }
}
```

O `err` tem este formato:

```ts
interface ApiError {
    status: number; // 409
    detail: string; // "Email já cadastrado"
    code?: string; // "EMAIL_TAKEN"  (do campo `code`)
    requestId?: string; // "req-abc"      (de details.request_id)
    retryAfter?: number; // segundos, quando houver Retry-After
    body?: unknown; // corpo cru
}
```

!!! tip "Branch por `code`, não por `detail`"
    O `detail` é texto para humanos e pode ser traduzido/mudar. O `code` é estável — use-o para lógica (`if (err.code === "INSUFFICIENT_FUNDS")`).

!!! check "Nada para configurar"
    Isso já é o comportamento padrão. Qualquer chamada via `createApiClient` ou pela classe gerada pelo codegen (que usa o `ApiClient` por baixo) entrega o erro nesse formato.

---

## 2. Correlação com `X-Request-ID`

O `createApiClient` envia um header `X-Request-ID` único por requisição. O `RequestIDMiddleware` do backend o reutiliza (em vez de gerar outro) e o ecoa de volta no `details.request_id` do erro — então um clique no front e a linha de log no backend compartilham o mesmo id.

```tsx
import { createApiClient, createLogger } from "tempest-react-sdk";

const log = createLogger({ name: "app" });

const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL,
    // Opcional: use seu próprio gerador (ex.: derivado do trace do navegador).
    requestId: () => crypto.randomUUID(),
});
```

Quando algo falha, logue o `requestId` para casar com o backend:

```tsx
catch (err) {
    if (isApiError(err)) log.error("request failed", { requestId: err.requestId });
}
```

!!! note "Desligando o header"
    Passe `requestId: () => ""` para não enviar o header (ex.: se um proxy já injeta o seu).

---

## 3. Respeitando `Retry-After`

Quando o backend devolve `429`/`503` com `Retry-After`, o `TempestApiError` já traz `retryAfter` (segundos). O helper `retry()` honra isso automaticamente, sobrepondo o backoff exponencial.

```tsx
import { retry, isApiError } from "tempest-react-sdk";

const data = await retry(() => api.get("/api/reports"), {
    retries: 5,
    // só re-tenta em rate limit / indisponibilidade
    shouldRetry: (err) => isApiError(err) && [429, 503].includes(err.status),
});
```

!!! warning "O hint é limitado pelo `maxDelay`"
    Se o servidor pedir 300 s mas seu `maxDelay` for 10 s, a espera fica em 10 s. Ajuste `maxDelay` se quiser obedecer esperas longas. Para ignorar o header, passe `respectRetryAfter: false`.

---

## 4. Paginação

### Offset — `usePaginatedQuery`

Para rotas que devolvem `{ items, total, page, size, pages }`:

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
                Anterior
            </button>
            <span>
                {users.pageNumber} / {users.pageCount} · {users.total} no total
            </span>
            <button onClick={users.next} disabled={!users.hasNext}>
                Próxima
            </button>
        </>
    );
}
```

O hook **controla o estado de página** internamente, envia `page` + `size` para o `queryFn`, mantém a página anterior visível enquanto a próxima carrega (`keepPreviousData`) e deriva `hasNext`/`hasPrev`/`pageCount`.

!!! tip "`size` vs `page_size`"
    O default segue o `fastapi-pagination` (`?size=`). Se o seu backend usa `page_size`, passe `sizeParam: "page_size"`. O `order_by`/`ascending` só são enviados quando você define `orderBy`.

### Cursor — `useCursorQuery`

Para rotas de feed infinito que devolvem `{ items, next_cursor, has_more, limit }`:

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
                    Carregar mais
                </button>
            )}
        </>
    );
}
```

O `next_cursor` opaco é repassado literalmente como próximo cursor; o loop para quando `has_more` vira `false`.

!!! tip "Cursor é opaco"
    Nunca tente interpretar o `next_cursor` — ele é base64/JSON do backend. Só devolva o valor recebido.

---

## 5. Autenticação turn-key — `createTempestAuth`

Em vez de montar `createAuthStore` + `createRefreshQueue` + `createApiClient` na mão, o preset conecta tudo ao contrato real: login `{ access_token }`, header `Bearer`, e `401 → refresh → retry` deduplicado.

```tsx
import { createTempestAuth } from "tempest-react-sdk";

export const auth = createTempestAuth<User, { email: string; password: string }>({
    baseURL: import.meta.env.VITE_API_URL,
    loginPath: "/api/auth/login", // default
    refreshPath: "/api/auth/refresh", // default
    mePath: "/api/auth/me", // opcional: busca o usuário após o login
});
```

Use em qualquer lugar:

```tsx
// Login (armazena a sessão e resolve o usuário)
const user = await auth.login({ email, password });

// Requisições autenticadas — o token Bearer é injetado, e um 401 dispara
// um refresh único e re-tenta a chamada original
const orders = await auth.api.get("/api/orders");

// Logout (limpa sessão + refresh token guardado)
auth.logout();
```

O store é o mesmo `createAuthStore` (persistido), então funciona com o `<AuthGuard>`:

```tsx
import { AuthGuard } from "tempest-react-sdk";

<AuthGuard store={auth.useAuthStore} fallback={<Navigate to="/login" />}>
    <Dashboard />
</AuthGuard>;
```

!!! info "Refresh token: corpo ou cookie"
    Por padrão, se o login devolver `refresh_token`, ele é guardado e enviado como `{ refresh_token }` no refresh. Se o seu backend usa cookie httpOnly, passe `withCredentials: true` e o refresh vai sem corpo, confiando no cookie.

!!! danger "Onde guardar o token"
    O preset persiste no `localStorage` por padrão (DX). Para apps sensíveis, prefira refresh token em **cookie httpOnly** (`withCredentials: true`) — assim o JS nunca toca o refresh token.

---

## 6. Gerando serviços do OpenAPI

O comando `tempest gen api` lê o `/openapi.json` do FastAPI e gera, por grupo de rotas, um `service.ts` tipado (veja [OpenAPI (codegen)](openapi.md) para o detalhe completo). A integração com tudo acima é automática:

```bash
npx tempest gen api http://localhost:8000/openapi.json --out src/api
```

- Os métodos chamam o `ApiClient` por baixo → **erros já viram `TempestApiError`**.
- Rotas que devolvem os envelopes de paginação geram retornos `OffsetPage<T>` / `CursorPage<T>` automaticamente — prontos para `usePaginatedQuery`/`useCursorQuery`.

```ts
// gerado em src/api/users/service.ts
import type { ApiClient, OffsetPage } from "tempest-react-sdk";

export class UsersService {
    constructor(private readonly api: ApiClient) {}

    /** `GET /api/users` */
    async listUsers(params: { page?: number; page_size?: number }): Promise<OffsetPage<User>> {
        return this.api.get<OffsetPage<User>>("/api/users", { params });
    }
}
```

Ligue o serviço gerado ao client autenticado:

```tsx
import { UsersService } from "./api/users";

const usersService = new UsersService(auth.api);

const users = usePaginatedQuery<User>({
    queryKey: ["users"],
    queryFn: (params) => usersService.listUsers(params),
});
```

---

## O loop completo

```text
backend (tempest-fastapi-sdk)
   │  expõe /openapi.json + contratos (erro, paginação, JWT, X-Request-ID)
   ▼
tempest gen api  ──►  src/api/<grupo>/{schemas,types,service}.ts
   │
   ▼
createTempestAuth  ──►  auth.api (Bearer + refresh + erros TempestApiError)
   │
   ▼
usePaginatedQuery / useCursorQuery  ──►  UI tipada, correlação por request_id
```

## Recursos pareados que já existem dos dois lados

| Frontend (este SDK) | Backend (`tempest-fastapi-sdk`) |
| --- | --- |
| `createEventStream` / `useEventStream` | SSE (Real-time) |
| `WebPushClient` / `usePushSubscription` | Web Push (VAPID) |
| `validateCPF` / `validateCNPJ` / `useViaCEP` | Brazilian Helpers |
| `createApiClient` (retry, idempotency) | HTTP Client (retry/backoff) |

## Recap

- Erros do backend chegam como **`TempestApiError`** com `code` + `requestId` — use `isApiError` e faça branch por `code`. ✅
- O **`X-Request-ID`** é enviado automaticamente e correlaciona front ↔ backend. ✅
- **`Retry-After`** é respeitado pelo `retry()` em `429`/`503`. ✅
- **`usePaginatedQuery`** (offset) e **`useCursorQuery`** (cursor) consomem os envelopes do backend sem mapeamento manual. ✅
- **`createTempestAuth`** entrega login + Bearer + refresh/retry em uma chamada. ✅
- **`tempest gen api`** gera serviços tipados que já falam todos esses contratos. ✅
