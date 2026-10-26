# Gerar serviços do OpenAPI (`tempest gen api`)

Se o seu backend é FastAPI (ou qualquer API que exponha um **OpenAPI 3.x**), o
`tempest gen api` lê o spec e **gera o cliente tipado** pra você — no padrão da
Tempest: **schemas Zod**, **tipos TS** e uma **classe de serviço por grupo de
rotas** (tag), com **validação de entrada via Zod**.

Nada de escrever `fetch` na mão nem manter tipos sincronizados com o backend.

```bash
npx tempest gen api http://127.0.0.1:8000/openapi.json --out src/api
# ou a partir de um arquivo:
npx tempest gen api ./openapi.json --out src/api
```

## O que é gerado

Para cada **grupo de rotas** (a `tag` da operação no OpenAPI) sai uma pasta com
três arquivos:

```text
src/api/
├── index.ts            # re-exporta tudo
├── users/
│   ├── schemas.ts      # schemas Zod (z.object…) de cada model do grupo
│   ├── types.ts        # tipos TS (z.infer dos schemas)
│   └── service.ts      # classe UsersService com 1 método por rota
└── products/
    ├── schemas.ts
    ├── types.ts
    └── service.ts
```

### `schemas.ts` — Zod por model

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

### `types.ts` — tipos inferidos

```ts
import type { z } from "zod";

import type * as S from "./schemas";

export type User = z.infer<typeof S.UserSchema>;
export type UserCreate = z.infer<typeof S.UserCreateSchema>;
```

### `service.ts` — classe por grupo, com validação

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
    S.UserCreateSchema.parse(body); // valida a entrada em runtime
    return this.api.post<User>("/users", { body });
  }

  /** `GET /users/{id}` */
  async getUser(id: number): Promise<User> {
    return this.api.get<User>(`/users/${encodeIdSegment(id)}`);
  }
}
```

### Parâmetro de path vira **um segmento só**

Repare no `encodeIdSegment(id)` acima: todo parâmetro de path passa por ele
antes de entrar na URL. O valor do `id` costuma vir de fora do app — um param do
React Router, um search param, um valor que outro usuário gravou. Se ele
entrasse cru, `"../../account"` levaria o `DELETE /users/{id}` para
`DELETE /account`, **com o Bearer do usuário logado**, e `"7?role=admin"`
injetaria query string. É a mesma proteção que o
[`createDataProvider`](./data-provider.md) aplica desde a 0.77.0:

| Valor passado | Requisição enviada |
| --- | --- |
| `7` | `GET /users/7` |
| `"../../account"` | `GET /users/..%2F..%2Faccount` |
| `"7?role=admin"` | `GET /users/7%3Frole%3Dadmin` |
| `"7#x"` | `GET /users/7%23x` |
| `""`, `"."`, `".."`, `null`, `undefined` | nenhuma — lança `TypeError` antes do `fetch` |

Parâmetro tipado como `boolean`, array ou objeto também passa pelo
`encodeIdSegment` (com uma asserção de tipo, já que ele aceita
`string | number`): `true` vira `true`, `["a", "b"]` vira `a%2Cb`.

!!! tip "Regenere para receber a proteção"
    Serviços gerados antes desta versão interpolam o parâmetro cru. Rode
    `tempest gen api` de novo — nenhuma assinatura de método muda.

### Parâmetros de header, do path item e por `$ref`

O OpenAPI deixa declarar parâmetro em dois níveis: dentro da operação e no
**path item** (`paths["/items/{id}"].parameters`), valendo para todas as
operações daquele path. O gerador lê os dois e junta: quando os dois níveis
declaram o mesmo par (`name`, `in`), **a operação vence**, como manda a spec. Um
parâmetro escrito como `$ref` para `components/parameters` também é resolvido.

Parâmetro `in: "header"` vira o último argumento, `headers`, tipado como os de
query, e vai no `headers` da requisição:

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

- **Header obrigatório deixa o argumento obrigatório.** Quando todos são
  opcionais, `headers` tem default `{}` — um header opcional novo no backend
  não quebra quem já chamava o método.
- **Header omitido não é enviado.** O `fetch` mandaria `undefined` como texto;
  o `headerRecord` descarta o que ficou de fora e passa o resto por `String()`.
- **`Accept`, `Content-Type` e `Authorization` são ignorados**, como a spec
  manda: o client já os monta (o `Authorization` vem do `getToken`).
- **`in: "cookie"` não é gerado.** O browser não deixa o `fetch` definir o
  header `Cookie` — o cookie chega ao servidor pelo próprio browser, com
  `withCredentials` no [`createApiClient`](./http.md).

Path param declarado só no path item passa pelo mesmo `encodeIdSegment` dos
demais.

!!! tip "Regenere se o backend declara header ou parâmetro no path item"
    Antes, o `{id}` declarado só no path item saía **literal** na URL
    (`"/items/{id}"`), e o header obrigatório simplesmente não era enviado. Rode
    `tempest gen api` de novo: o método ganha o argumento que faltava.

### Schema que nenhuma rota usa fica de fora

Cada grupo só emite os schemas que as rotas dele alcançam (body, resposta e
parâmetros, seguindo os `$ref` em cadeia). Um schema que nenhum `$ref` alcança
não vira código — caso do enum órfão que o FastAPI publica para todo campo
anotado com `Enum` (`ImageMediaType`), mesmo quando o campo traz um enum inline
mais restrito. O nome dele também não é conferido: um órfão cujo nome colide com
outro schema (`ImageMediaType` e `Image-Media-Type`) não derruba a geração.

### Passa no lint e no `tsc` do template como saiu

O código gerado entra num app do `create-tempest-app` sem erro no
`npm run lint` nem no `tsc --noEmit`: compila no `tsconfig` estrito do template
(`noUnusedLocals`, `verbatimModuleSyntax`) e passa no `eslint.config.js` dele,
com aviso e tudo. Na prática:

- **Só entra o import que é usado.** O `service.ts` importa os tipos que as
  assinaturas citam, o `S` só quando algum body é validado e
  `OffsetPage`/`CursorPage`/`encodeIdSegment` só quando aparecem. Grupo sem
  nenhum schema ganha `schemas.ts` e `types.ts` com `export {};`.
- **Parâmetro tipado por `$ref` mantém o nome.** Um enum de
  `components/schemas` usado num parâmetro de path ou de query vira
  `kind: Kind` — e o `Kind` é declarado no `types.ts` e importado no
  `service.ts`. Na query, o tipo só é estreitado para `string` quando o valor
  não é escalar (objeto, array).
- **Imports e re-exports na ordem do `simple-import-sort`**, com uma linha em
  branco entre os do pacote e os locais, e nenhuma linha em branco dupla.

!!! tip "Regenere para limpar o lint"
    Clients gerados antes desta versão podem acusar `Cannot find name` (#504) ou
    erro de lint em arquivo gerado (#505). Rode `tempest gen api` de novo.

## Como usar

A classe **recebe um `ApiClient`** (do [`createApiClient`](./http.md)) no
construtor — você injeta o seu, com a base URL e o token:

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
// users.createUser({ email: "a@b.c" })  →  valida com Zod, depois POST
```

Com o TanStack Query (já montado pelo [`AppProviders`](./app-providers.md)):

```ts
import { useQuery } from "@tanstack/react-query";
import { users } from "@/api";

function UserList() {
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => users.listUsers({}) });
  // data: User[] | undefined
}
```

!!! tip "Re-gere quando o backend mudar"
    Rode `tempest gen api` de novo após mexer no backend — os arquivos em
    `src/api/` são **gerados**, então trate-os como build artifact (não edite à
    mão; versione se quiser, mas regenere ao mudar o contrato).

!!! note "A saída fica dentro do projeto"
    Antes da primeira escrita, o `gen api` confere o `--out`, cada pasta de grupo
    e cada arquivo: symlink (inclusive pendente) no lugar de qualquer um deles,
    caminho fora do projeto e ancestral que é symlink para fora são recusados, e
    nada é escrito. Um `src/api` que é link num repo clonado não leva os arquivos
    gerados para outro lugar do disco.

!!! note "Validação de **entrada**, tipagem na **saída**"
    O método valida o **body** com `Schema.parse(...)` (erro cedo se você mandar
    dado inválido) e **tipa** a resposta. A resposta não é validada em runtime
    por padrão — confie no contrato do backend, ou valide manualmente com o
    schema correspondente se precisar de garantia.

!!! warning "Suporte atual"
    v1 cobre o comum de specs FastAPI: `components.schemas` (object, enum, array,
    `$ref`, nullable, anyOf/oneOf/allOf), parâmetros de path/query/header (da
    operação e do path item), body e resposta JSON, agrupados pela primeira `tag`. YAML e múltiplos content-types
    ainda não — aponte para o `/openapi.json` (JSON).

!!! info "Spec de terceiro não vira código"
    Todo texto do spec entra no TypeScript gerado escapado pela posição onde cai:
    tag, `summary` e path em comentário não fecham o `/** */`, segmentos do path
    viram texto do template literal, `pattern` vira `new RegExp("...")`. Nome que
    precisa ser **identificador** e não é — `{user-id}`, `user.Response`,
    `User-Out` — vira um identificador válido: camelCase para parâmetro
    (`userId`), PascalCase para schema e tipo (`UserResponse`), prefixo `_` para
    palavra reservada ou dígito inicial (`_string`, `_2fa`). Onde o nome importa
    em runtime, vale o original: a URL monta `{user-id}` com o valor de `userId`,
    e chave de objeto sai como string escapada (`"display-name"`). Nome que já é
    identificador fica como está. Dois schemas emitidos no mesmo grupo que viram
    o mesmo identificador (`User-Out` e `user.Out`) são recusados com erro que
    cita os dois, e um
    `{placeholder}` do path que não é parâmetro declarado também — não há
    variável segura para ele.

    O mesmo vale para nomes que o próprio gerador já usa. Parâmetro de path que
    cairia em `body`, `params`, `headers`, `S`, `encodeIdSegment` ou
    `headerRecord` vira `bodyParam`/`paramsParam`/`headersParam`/`SParam`/
    `encodeIdSegmentParam`/`headerRecordParam`; `operationId`
    `constructor` ou `api` vira `constructor2`/`api2`; schema chamado
    `ApiClient`, `OffsetPage`, `CursorPage`, `Promise`, `Record`, `z`, `S`,
    `encodeIdSegment` ou `headerRecord` ganha prefixo `_`; e duas tags cujo nome no barrel coincide (`user 1` e
    `user1`) são recusadas citando as duas. Um `pattern` que não compila como
    regex JavaScript falha a **geração**, citando o schema e o caminho da
    propriedade — em vez de quebrar o app no import.

## Recap

- `tempest gen api <url|file> --out src/api` gera, **por grupo de rotas**, três arquivos: `schemas.ts` (Zod), `types.ts` (`z.infer`) e `service.ts` (classe).
- A classe de serviço recebe um `ApiClient` injetado e **valida o body com Zod** antes de chamar a API.
- Todo parâmetro de path passa por `encodeIdSegment`: fica num segmento só, e `""`/`"."`/`".."` lançam antes da requisição.
- Parâmetros do path item entram junto com os da operação (a operação vence no mesmo `name` + `in`); header vira o argumento `headers`, e cookie fica com o browser.
- Schema que nenhuma rota alcança, como o enum órfão do FastAPI, não é gerado.
- Trate `src/api/` como artefato gerado — **regenere** quando o contrato mudar.
- Veja também: [HTTP / `createApiClient`](./http.md) · [Query](./query.md) · [CLI `tempest`](./cli.md).
