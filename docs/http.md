# HTTP

Camada de fetch tipada com tratamento de 401 + refresh, parse JSON automático e upload com progresso. Inspirada no `RequestHandler` do alofans-frontend, mas factory-based pra cada app instanciar o seu próprio cliente.

!!! info "Por que um factory em vez de um singleton global?"
    Cada app tem seu próprio `baseURL`, sua forma de guardar o token e sua estratégia de logout. Um factory deixa você criar o cliente uma vez, injetar essas dependências, e exportar uma instância pronta — sem `import` de estado global espalhado pelo código.

## Quando usar

- Toda chamada HTTP do app passa por `createApiClient`.
- Pra validar a resposta contra um schema, combine com `parseResponse`.
- Pra upload com barra de progresso, use `uploadWithProgress`.
- Pra retentar operações instáveis, use `retry`; pra acompanhar um job, `usePoll`.

> Diagrama editável: [request-flow.drawio](./diagrams/request-flow.drawio) (abra no [draw.io](https://app.diagrams.net)).

## `createApiClient`

Crie o cliente uma vez (ex.: `src/services/api.ts`) e exporte:

```ts
import { createApiClient } from "tempest-react-sdk";
import { useAuthStore } from "./auth-store";
import { AuthService } from "./auth-service";

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

Opções (todas exceto `baseURL` são opcionais):

- `baseURL` — prefixo de toda requisição. **Obrigatório.**
- `getToken()` — chamado a cada request; retornar string injeta `Authorization: Bearer <token>`.
- `onUnauthorized(response)` — disparado sempre que a requisição termina sem autorização: 401 sem `refresh`, `refresh()` que rejeitou, ou repetição que voltou 401 de novo. Use pra deslogar.
- `refresh()` — quando presente e o request der 401, o cliente aguarda `refresh()` e repete a requisição **uma vez**.
- `retry` — `true` ou `RetryOptions`. **Desligado por default.** Ver [Retentativa embutida](#retentativa-embutida).
- `withCredentials` — envia cookies em cross-origin (default `false`).
- `headers` — headers default mesclados em toda request.
- `fetcher` — implementação de `fetch` alternativa (default `globalThis.fetch`) — útil em testes.

Métodos: `get`, `post`, `put`, `patch`, `delete`, `upload`, `request`. Cada um aceita `RequestOptions` (`body`, `params`, e qualquer campo de `RequestInit` exceto `body`):

```ts
// GET com query params (serializados automaticamente)
const users = await api.get<User[]>("/users", {
  params: { page: 1, size: 20, active: true },
});

// POST com body JSON
const created = await api.post<User>("/users", {
  body: { name: "Ana", email: "ana@x.com" },
});

// DELETE
await api.delete<void>(`/users/${id}`);
```

Comportamento:

- `Content-Type: application/json` automático (exceto `FormData`).
- `Authorization: Bearer <token>` quando `getToken()` retorna string.
- Em 401 com `refresh` configurado: aguarda `refresh()`, repete o request 1x. Se falhar, chama `onUnauthorized` e lança `ApiError`.
- Em 401 sem `refresh`: chama `onUnauthorized` e lança `ApiError`.
- 204 retorna `undefined`.
- `Content-Type: application/json` na resposta → `JSON.parse`. Caso contrário, retorna texto cru.

!!! warning "`refresh` só repete uma vez"
    Se o `refresh()` rodar mas o retry ainda devolver 401, o cliente desiste, chama `onUnauthorized` e lança. Isso evita loop infinito de refresh quando a sessão realmente expirou.

    **Esse segundo 401 é o caso que importa.** Um `refresh()` que resolve não prova que a sessão está viva: o backend pode devolver um token que ele mesmo recusa — refresh token revogado, permissão retirada, corrida entre abas. Sem `onUnauthorized` aí, o app ficaria com um store dizendo "autenticado" enquanto toda requisição dá 401, e o usuário veria um erro genérico sem caminho de volta pro login.

## Retentativa embutida

`retry` liga a repetição automática dentro do próprio cliente, com o mesmo backoff exponencial do helper `retry()`:

```ts
const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  retry: true, // política embutida
});

const users = await api.get<User[]>("/users"); // repete sozinho se der 503
```

**Vem desligado**, e ligar não é obrigatório: sem `retry`, o cliente falha na primeira tentativa, exatamente como antes.

A política embutida é conservadora de propósito:

| Repete | Não repete |
| ------ | ---------- |
| `GET`, `HEAD`, `OPTIONS` | `POST`, `PUT`, `PATCH`, `DELETE` |
| Falha de rede (status `0`), `408`, `425`, `429`, qualquer `5xx` | `400`, `401`, `403`, `404`, `422` — qualquer outro `4xx` |

!!! danger "Escrita nunca repete sozinha"
    Um `POST` repetido pode cobrar duas vezes, criar dois pedidos, disparar dois webhooks. `PUT` e `DELETE` são idempotentes no papel, mas um backend que registra ou fatura por chamada ainda vê duas — por isso ficam de fora também.

    Para repetir uma escrita, torne-a idempotente com [`generateIdempotencyKey`](#generateidempotencykey) e passe seu próprio `shouldRetry`:

    ```ts
    const key = generateIdempotencyKey(); // uma vez, fora do loop

    const api = createApiClient({
      baseURL,
      headers: { "Idempotency-Key": key },
      retry: { shouldRetry: (error) => isApiError(error) && error.status >= 500 },
    });
    ```

    Um `shouldRetry` seu **substitui a política inteira**, checagem de método incluída — é esse o ponto de escape.

Repetir um `400` ou um `403` não conserta payload errado nem permissão que o usuário não tem: só gasta o tempo dele pra mostrar o mesmo erro. Por isso o corte é por status, não "qualquer erro".

Detalhes que valem saber:

- A retentativa envolve a requisição **inteira**, refresh incluído. Uma tentativa que gasta o ciclo de 401 → refresh → repetição conta como uma tentativa só.
- Cada tentativa carrega o seu próprio `X-Request-ID`, então o backend consegue distinguir as tentativas nos logs.
- `Retry-After` (em `429`/`503`) é respeitado e sobrepõe o backoff daquela tentativa.
- Precisa de retentativa em uma chamada específica, não no cliente todo? O helper [`retry`](#retry-backoff-exponencial) continua ali e não foi alterado.

## `parseResponse`

Valida payload com zod. Em dev/test, mostra exatamente qual campo divergiu (contract drift). Em prod, mensagem genérica (não vaza estrutura interna).

```ts
import { parseResponse } from "tempest-react-sdk";
import { z } from "zod";
import { api } from "./api";

const userSchema = z.object({ id: z.string(), name: z.string() });

const raw = await api.get<unknown>("/users/me");
const user = parseResponse(userSchema, raw, "GET /users/me");
// user: { id: string; name: string } — tipado a partir do schema
```

!!! tip "O 3º argumento é o contexto"
    Passe sempre um label como `"GET /users/me"`. Ele aparece na mensagem de erro de dev e torna trivial localizar qual endpoint quebrou o contrato.

## `uploadWithProgress`

`fetch` não reporta upload progress no navegador — esse helper usa `XMLHttpRequest` por baixo, mantendo o mesmo contrato de erro do `createApiClient` (lança `ApiError`).

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

    console.log("URL final:", result.url);
  }

  return (
    <label>
      <input type="file" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <progress value={progress} max={100} />
    </label>
  );
}
```

`onProgress` recebe `{ loaded, total, fraction, lengthComputable }`. `fraction` é `null` quando o tamanho total é desconhecido. Abortar via `signal` rejeita com `DOMException("Aborted")`.

## `retry` — backoff exponencial

Reexecuta uma factory async com delays crescentes (`initialDelay` dobrando a cada tentativa, limitado por `maxDelay`):

```ts
import { retry } from "tempest-react-sdk";
import { api } from "./api";
import type { ApiError } from "tempest-react-sdk";

const data = await retry(() => api.get("/flaky-endpoint"), {
  retries: 5,
  initialDelay: 300,
  maxDelay: 10_000,
  // Não retentar erros de cliente (4xx) — só falhas transitórias
  shouldRetry: (error) => (error as ApiError).status >= 500,
  onRetry: ({ attempt, delay }) => console.warn(`Tentativa ${attempt} em ${delay}ms`),
});
```

!!! note "`shouldRetry` evita retentar o que não vai melhorar"
    Um 403 ou 422 vai falhar igual na 5ª vez. Filtre por `status >= 500` (ou erros de rede) pra não desperdiçar tentativas em erros determinísticos.

## `usePoll` — polling com guarda de overlap

Chama uma factory async num intervalo fixo, pulando ticks enquanto a chamada anterior não terminou. Ideal pra acompanhar o status de um job:

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

  if (loading && !data) return <p>Verificando…</p>;
  if (error) return <p>Erro ao consultar job.</p>;
  return (
    <div>
      Status: {data?.status}
      <button onClick={stop}>Parar</button>
    </div>
  );
}
```

`usePoll` também devolve `start()` pra retomar manualmente, e aceita `disabled` pra pausar sem desmontar.

## `generateIdempotencyKey`

Gera um UUID v4 pra usar no header `Idempotency-Key`. Mande o **mesmo** valor em retries de uma operação que não pode rodar duas vezes (cobrança, criação de pedido):

```ts
import { generateIdempotencyKey } from "tempest-react-sdk";
import { api } from "./api";

const key = generateIdempotencyKey();

await api.post("/orders", {
  body: { items },
  headers: { "Idempotency-Key": key },
});
```

!!! warning "Gere a key uma vez por operação, não por tentativa"
    Se você gerar uma key nova a cada retry, o servidor trata cada chamada como nova e a proteção some. Crie a key **antes** do loop de retry e reutilize.

## Erros

`ApiError = { status, detail, body }`. Sempre lance — não retorne resultado falsy. UIs podem reagir por `status`:

```ts
import type { ApiError } from "tempest-react-sdk";
import { api } from "./api";

try {
  await api.get("/users/me");
} catch (err) {
  const error = err as ApiError;
  if (error.status === 403) toast.error("Sem permissão");
  else toast.error(error.detail);
}
```

### Do erro tipado para a frase na tela — `describeApiError`

O `try/catch` acima escreve a frase à mão, e todo app escreve o mesmo funil — errando sempre no mesmo lugar: a requisição que **não chegou** ao servidor tem `status === 0`, e sem tratamento ela vira "erro 0" na tela.

```ts
import { describeApiError } from "tempest-react-sdk";

try {
  await api.get("/pedidos");
} catch (error) {
  toast.error(describeApiError(error, "Não foi possível carregar os pedidos"));
}
```

A ordem do funil:

1. **Requisição que não chegou** — `status === 0`, ou um erro qualquer com o browser se declarando offline → frase de offline.
2. **`detail` do backend** — o texto mais específico disponível, e já escrito para uma pessoa.
3. **`fallback`**, com `(HTTP <status>)` anexado quando há status — o print no chamado de suporte carrega o único dado que o dev precisa.

Duas superfícies, mesmo funil:

| | Quando usar |
| --- | --- |
| `describeApiError(error, fallback, strings?)` | Função pura. Roda em interceptor, logger, qualquer lugar fora da árvore React. |
| `useDescribeApiError()` | Hook. Resolve a frase fixa pelo `I18nProvider` ativo; devolve `(error, fallback) => string`. |

```tsx
import { useDescribeApiError } from "tempest-react-sdk";

const describe = useDescribeApiError();
const { mutate } = useMutation({
  mutationFn: salvar,
  onError: (error) => toast.error(describe(error, "Não foi possível salvar")),
});
```

!!! info "O hook não duplica o funil — ele só entrega as strings"
    `useDescribeApiError` chama a função pura. Existir nos dois formatos é sobre **onde** o código roda: contexto React não é alcançável de um interceptor, e passar tradução na mão em todo componente é o que o hook evita.

!!! check "Funciona sem `I18nProvider`, e sem a chave no catálogo"
    i18n é opt-in no SDK. Sem provider, ou com um catálogo que nunca definiu `tempest.error.offline`, a frase cai no default em pt-BR — em vez de estourar ou de imprimir a chave crua na cara do usuário (que é o que `t` devolve quando não encontra).

!!! note "As duas constantes que acompanham"
    `DEFAULT_API_ERROR_STRINGS` é a frase pt-BR usada quando nada mais responde — útil
    pra escrever a sua a partir dela. `API_ERROR_OFFLINE_KEY` é a chave
    (`"tempest.error.offline"`) que o hook procura no catálogo; defina-a no seu
    `messages` para traduzir a frase de offline.

!!! warning "`detail` sintético não vence o seu `fallback`"
    Quando a resposta não traz corpo, `buildApiError` sintetiza `Erro <status>`. `describeApiError` reconhece esse texto e prefere o seu `fallback` — "Erro 500" diz estritamente menos que "Não foi possível carregar os pedidos".

## Recap

- `createApiClient({ baseURL, getToken, onUnauthorized, refresh, ... })` cria um cliente tipado; instancie uma vez e exporte.
- 401 com `refresh` → tenta renovar e repete 1x. `onUnauthorized` dispara em todo desfecho sem autorização — sem refresh, refresh que rejeitou, ou repetição que voltou 401.
- `retry: true` liga a retentativa dentro do cliente: só método idempotente, só falha de rede/`408`/`425`/`429`/`5xx`. Escrita nunca repete sozinha.
- `parseResponse(schema, raw, context)` valida o payload com zod e aponta o campo divergente em dev.
- `uploadWithProgress` usa XHR pra reportar progresso byte a byte; para arquivo grande, `createResumableUpload` divide em chunks e retoma — veja [Upload resumível](./resumable-upload.md).
- `retry` (backoff exponencial + `shouldRetry`) e `usePoll` (intervalo com guarda de overlap) cobrem operações instáveis e acompanhamento de jobs.
- `generateIdempotencyKey` — gere uma vez por operação, reutilize nos retries.
- `describeApiError(error, fallback)` (puro) e `useDescribeApiError()` (com i18n) transformam o erro tipado na frase da tela, tratando `status === 0` como offline em vez de "erro 0".

## Veja também

- [Auth + Guard](./auth.md)
- [Passkeys](./passkeys.md) — login sem senha em cima do mesmo client
- [Upload resumível (tus)](./resumable-upload.md) — quando uma request só não basta
- [Query](./query.md) — alimenta as `queryFn`
- [SSE](./sse.md) — usa `withCredentials` igual ao client
- Diagrama: [request-flow.drawio](./diagrams/request-flow.drawio)
