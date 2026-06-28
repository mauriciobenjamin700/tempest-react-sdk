# Access Control (RBAC)

Checagens de **permissão e papel** para esconder ou bloquear ações que o usuário não pode executar. Enquanto o [`AuthGuard`](./auth.md) responde só "está logado?", o Access Control responde "esse usuário pode **excluir um post**?" — granularidade de `<resource>:<action>`.

!!! info "Por que isso existe além do `AuthGuard`?"
    `AuthGuard` é binário: autenticado ou não. Mas dentro de um app logado, um editor pode criar posts e um leitor não; um admin vê o botão de excluir e o resto não. Esconder esses controles na UI (e idealmente bloquear no backend) é trabalho de RBAC. O Access Control entrega um contrato plugável (`AccessControl`), uma estratégia pronta baseada em papéis, e os utilitários de UI (`useCan`, `<Can>`) para amarrar tudo.

!!! warning "RBAC no frontend é UX, não segurança"
    Esconder um botão **não** protege o endpoint. A decisão de permissão que importa acontece no backend (no `tempest-fastapi-sdk`). O Access Control aqui melhora a experiência — evita mostrar ações que vão falhar com 403 — mas o servidor continua sendo a fonte da verdade.

## Quando usar

- Esconder/desabilitar botões e links conforme a permissão (`<Can>`).
- Ramificar lógica por permissão dentro de um componente (`useCan`).
- Derivar o conjunto de permissões do usuário a partir do JWT (`permissionsFromToken`).

## Provider — `<AccessControlProvider>`

Envolva o app com `<AccessControlProvider control={…}>`, passando uma estratégia `AccessControl`. Toda checagem (`useCan`, `<Can>`) lê dessa estratégia via contexto:

```tsx
import { AccessControlProvider, createRoleAccessControl } from "tempest-react-sdk";
import { App } from "./App";

const accessControl = createRoleAccessControl({
  role: "editor",
  roles: {
    editor: ["posts:create", "posts:update", "comments:read"],
    admin: ["*"],
  },
});

export function Root() {
  return (
    <AccessControlProvider control={accessControl}>
      <App />
    </AccessControlProvider>
  );
}
```

!!! note "Sem provider → libera tudo"
    Se **nenhum** `<AccessControlProvider>` estiver acima na árvore, `useCan`/`<Can>` tratam toda checagem como **permitida**. Isso mantém o SDK opt-in: você liga a aplicação dropando um provider, e desliga removendo-o. Útil em dev ou em apps sem RBAC ainda — os componentes que usam `<Can>` continuam funcionando, só não bloqueiam nada.

## `createRoleAccessControl`

Constrói uma estratégia RBAC a partir de um conjunto estático de permissões. A assinatura é `createRoleAccessControl({ permissions?, roles?, role? })`:

- `permissions` — strings concedidas diretamente, independente de papel.
- `roles` — mapa `nome do papel → permissões` que aquele papel concede.
- `role` — o(s) papel(éis) ativo(s) (string ou array). As permissões deles (de `roles`) são mescladas.

O conjunto efetivo é `permissions` **mais**, para cada papel ativo em `role`, as permissões listadas em `roles[role]`.

### Regras de matching

Cada permissão é uma string `"<resource>:<action>"` (ex.: `"posts:create"`) ou um `"<action>"` sozinho. Os curingas:

| Permissão concedida | O que libera                                              |
| ------------------- | -------------------------------------------------------- |
| `"*"`               | **tudo** — qualquer action em qualquer resource          |
| `"posts:*"`         | qualquer action no resource `posts`                      |
| `"posts:create"`    | exatamente a action `create` no resource `posts`         |
| `"export"`          | a action global `export` (checagem **sem** `resource`)   |

```ts
import { createRoleAccessControl } from "tempest-react-sdk";

const ac = createRoleAccessControl({
  role: "editor",
  roles: { editor: ["posts:*", "comments:read"] },
});

ac.can({ action: "create", resource: "posts" }); // { can: true } — bate em "posts:*"
ac.can({ action: "read", resource: "comments" }); // { can: true } — bate exato
ac.can({ action: "delete", resource: "users" }); // { can: false, reason: "missing permission" }
```

!!! tip "Combine `permissions` e `roles`"
    `permissions` é para concessões diretas (um override pontual num usuário específico), `roles` + `role` é para o caso comum baseado em papel. Os dois se somam — uma permissão direta vale mesmo que nenhum papel a conceda.

## `permissionsFromToken` — permissões a partir do JWT

Em vez de manter a lista de permissões à mão, derive-a do JWT do usuário. `permissionsFromToken(token, { claim })`:

- Lê a claim configurada (default `"permissions"`).
- Se ausente, cai para as claims OAuth `"scopes"` e depois `"scope"`.
- Claim em array é usada como está; claim em string é quebrada por espaços (convenção de `scope` OAuth).
- Retorna `[]` em qualquer falha de decode ou quando nenhuma claim reconhecível existe.

```ts
import { createRoleAccessControl, permissionsFromToken } from "tempest-react-sdk";

const token = getAccessTokenFromSomewhere();

// Lê a claim "permissions" (default), caindo para "scopes"/"scope"
const permissions = permissionsFromToken(token);

const accessControl = createRoleAccessControl({ permissions });
```

!!! warning "`permissionsFromToken` não valida assinatura"
    Ele só decodifica o payload do JWT (via `decodeJWT`) para ler a claim — **não** verifica a assinatura. É leitura defensiva para UX, igual ao [`decodeJWT`](./auth.md). Confiar nessas permissões para segurança real é trabalho do backend.

Para uma claim custom (ex.: o backend emite `"perms"`):

```ts
const permissions = permissionsFromToken(token, { claim: "perms" });
```

## `useCan` — checagem programática

`useCan({ action, resource })` resolve a checagem contra a estratégia em contexto e devolve `{ allowed, isLoading, reason }`. Funciona com `can` síncrono (boolean ou `CanResult`) e com `Promise` (políticas remotas), re-rodando quando os params mudam:

```tsx
import { useCan } from "tempest-react-sdk";

export function PostActions({ postId }: { postId: string }) {
  const { allowed, isLoading } = useCan({ action: "update", resource: "posts" });

  if (isLoading) return null; // checagem assíncrona em andamento

  return (
    <button disabled={!allowed} onClick={() => editPost(postId)}>
      Editar
    </button>
  );
}
```

!!! note "`reason` explica o `false`"
    Quando `allowed` é `false`, `reason` costuma trazer o motivo (`"missing permission"` vindo do `createRoleAccessControl`, ou a mensagem de erro de uma política async que rejeitou). Útil para tooltip ("Você não tem permissão para X") em vez de só esconder.

## `<Can>` — render condicional

`<Can action resource fallback>` renderiza `children` quando a action é permitida, senão o `fallback` (ou nada). Enquanto uma checagem async está pendente, renderiza o `fallback` (ou nada):

```tsx
import { Can } from "tempest-react-sdk";

<Can action="create" resource="posts" fallback={<p>Sem permissão para criar.</p>}>
  <NewPostButton />
</Can>;
```

## Exemplo completo — botão "Excluir" protegido

Tudo junto: deriva permissões do JWT, configura a estratégia, e protege a ação de excluir tanto por render (`<Can>`) quanto por estado desabilitado (`useCan`):

```tsx
import {
  AccessControlProvider,
  Can,
  createRoleAccessControl,
  permissionsFromToken,
  useCan,
} from "tempest-react-sdk";

// 1. Estratégia derivada do JWT do usuário logado.
function buildAccessControl(token: string) {
  return createRoleAccessControl({
    // ex.: token com { permissions: ["posts:read", "posts:delete"] }
    permissions: permissionsFromToken(token),
  });
}

// 2. Provider no topo do app.
export function Root({ token }: { token: string }) {
  return (
    <AccessControlProvider control={buildAccessControl(token)}>
      <PostRow id="post-1" title="Olá mundo" />
    </AccessControlProvider>
  );
}

// 3a. Esconder a ação inteira com <Can>.
function PostRow({ id, title }: { id: string; title: string }) {
  return (
    <div>
      <span>{title}</span>
      <Can action="delete" resource="posts" fallback={null}>
        <DeleteButton id={id} />
      </Can>
    </div>
  );
}

// 3b. Mostrar sempre, mas desabilitar + explicar com useCan.
function DeleteButton({ id }: { id: string }) {
  const { allowed, isLoading, reason } = useCan({ action: "delete", resource: "posts" });

  return (
    <button
      disabled={!allowed || isLoading}
      title={allowed ? "Excluir post" : reason}
      onClick={() => deletePost(id)}
    >
      Excluir
    </button>
  );
}
```

!!! tip "`<Can>` esconde; `useCan` desabilita"
    Use `<Can>` quando a ação simplesmente não deve existir para quem não pode (limpa a UI). Use `useCan` quando você quer manter o controle visível mas inerte, com um `title`/tooltip explicando o porquê — útil para descoberta ("isso existe, mas precisa de outro papel").

## Recap

- `<AccessControlProvider control={…}>` injeta uma estratégia `AccessControl`; **sem provider, toda checagem libera** (opt-in).
- `createRoleAccessControl({ permissions, roles, role })` monta RBAC estático; matching por `"<resource>:<action>"`, com curingas `"*"` (tudo) e `"<resource>:*"` (resource inteiro).
- `permissionsFromToken(token, { claim })` lê permissões do JWT (claim default `"permissions"`, fallback `"scopes"`/`"scope"`); não valida assinatura.
- `useCan({ action, resource })` → `{ allowed, isLoading, reason }`, com suporte a checagens síncronas e assíncronas.
- `<Can action resource fallback>` esconde a UI; `useCan` desabilita e explica com `reason`.
- RBAC no frontend é UX — o backend continua sendo a fonte da verdade da autorização.

## Veja também

- [Auth + Guard](./auth.md) — `AuthGuard` (autenticado?) e `decodeJWT`/`isJWTExpired`
- [Data Provider](./data-provider.md) — proteja as ações de CRUD por papel/permissão
