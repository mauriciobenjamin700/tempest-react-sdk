# Offline (IndexedDB)

`createOfflineStore` empacota o Dexie com scoping opcional por owner. Use pra histórico de SSE/push, drafts e cache local que precisa sobreviver a reload.

!!! info "Por que IndexedDB e não `localStorage`?"
    `localStorage` é síncrono, limitado a ~5 MB e só guarda strings. IndexedDB é assíncrono, comporta MBs de dados estruturados e suporta índices/consultas. O `createOfflineStore` esconde a verbosidade do Dexie por trás de um CRUD tipado — e o `dexie` já vem como dependência direta do SDK (v0.2.0+), instalado junto com `npm install tempest-react-sdk`.

## Quando usar

- Mensagens recebidas via SSE/WebSocket que devem ficar visíveis offline.
- Drafts de formulários longos.
- Cache de dados raramente alterados (cidades, categorias) — combina com `initialData` do TanStack Query.

!!! warning "Não use pra estado de UI volátil"
    Toggle de menu, aba ativa, modal aberto — isso é estado de UI que morre no reload. Zustand (veja [State](./state.md)) é muito mais barato. Reserve o offline store pra dados que **precisam** persistir.

## Setup

```ts
import { createOfflineStore } from "tempest-react-sdk";

interface Notification {
  message_id: string;
  owner_id: string;
  type: "NOTIFY" | "PAYMENT-SUCCESS";
  message: string;
  created_at: string;
  read: boolean;
}

export const notificationsStore = createOfflineStore<Notification, string>({
  databaseName: "TempestNotifications",
  version: 1,
  tableName: "notifications",
  indexes: "&message_id, owner_id, read, created_at",
  keyPath: "message_id",
  ownerField: "owner_id",
});
```

Sintaxe do `indexes`: Dexie. `&` = primary key único, vírgulas separam indexes adicionais. `keyPath` aponta a propriedade usada como chave primária (default `"id"`). `ownerField` ativa o scoping multi-tenant — veja abaixo.

## Owner-scoping

Quando `ownerField` está configurado, todo método de leitura/escrita honra um argumento `owner` e persiste esse valor em cada registro. Isso isola os dados de cada usuário no mesmo banco — essencial quando duas contas usam o app no mesmo navegador:

```ts
const userId = "u-42";

// put carimba owner_id = "u-42" automaticamente
await notificationsStore.put(
  {
    message_id: "m-1",
    owner_id: "", // sobrescrito pelo owner
    type: "NOTIFY",
    message: "Bem-vindo",
    created_at: new Date().toISOString(),
    read: false,
  },
  userId,
);

// list só traz registros daquele owner
const mine = await notificationsStore.list(userId);

// count / clear / updateMany também ficam restritos ao owner
await notificationsStore.clear(userId); // não afeta outros usuários
```

!!! tip "Sem `ownerField`, o store vira global"
    Se você não configurar `ownerField`, os métodos ignoram o argumento `owner` e operam sobre a tabela inteira. Use o store global pra dados não associados a um usuário (catálogo de cidades, por exemplo).

## CRUD completo

```ts
const ownerId = "u-42";

// CREATE / UPDATE (upsert)
await notificationsStore.put(notification, ownerId);
await notificationsStore.bulkPut(notifications, ownerId); // uma transação

// READ
const one = await notificationsStore.get("m-1"); // por primary key
const recent = await notificationsStore.list(ownerId, {
  orderBy: "created_at",
  reverse: true,
  limit: 50,
  offset: 0,
  filter: (n) => !n.read, // predicate aplicado após o índice
});
const total = await notificationsStore.count(ownerId);

// UPDATE parcial
await notificationsStore.update("m-1", { read: true }); // por key
await notificationsStore.updateMany(ownerId, { read: true }); // todos do owner

// DELETE
await notificationsStore.delete("m-1"); // por key
await notificationsStore.clear(ownerId); // todos do owner
```

`raw` (a `Table` do Dexie) e `db` (a instância Dexie) ficam expostos pra queries avançadas — transações multi-tabela, `where().and()` complexos:

```ts
import { notificationsStore } from "./stores";

await notificationsStore.db.transaction("rw", notificationsStore.raw, async () => {
  const unread = await notificationsStore.raw
    .where("owner_id")
    .equals("u-42")
    .and((n) => !n.read)
    .toArray();
  console.log(`${unread.length} não lidas`);
});
```

## Combinando com SSE + TanStack Query

Padrão comum: receber por SSE, persistir offline, e usar o cache local como `initialData` pra a UI aparecer instantânea no reload:

```ts
import { notificationsStore } from "./stores";

useEventStream<Notification>(`${API}/notifications/stream`, {
  enabled: !!userId,
  onMessage: ({ data }) => {
    void notificationsStore.put(data, userId);
  },
});

useQuery({
  queryKey: ["notifications", userId],
  queryFn: () => notificationsStore.list(userId, { orderBy: "created_at", reverse: true }),
});
```

## `createOfflineDatabase` — várias tabelas numa base

`createOfflineStore` dá a cada store uma base só dela, que é a forma certa pra um cache isolado. Deixa de ser assim no instante em que as tabelas pertencem uma à outra: chats e suas mensagens, uma entidade e seus rascunhos, qualquer coisa que você leria ou limparia como uma unidade. Separá-las em bases diferentes custa a transação de verdade — o Dexie só roda uma atomicamente **dentro** de uma mesma base — e ainda espalha o bump de versão de uma mudança relacionada por dois lugares.

```ts
import { createOfflineDatabase } from "tempest-react-sdk";

type Chat = { id: string; service_id: string; updated_at: string };
type Message = { id: string; service_chat_id: string; created_at: string };

const database = createOfflineDatabase<{ chats: Chat; messages: Message }>({
  databaseName: "ChatDatabase",
  version: 1,
  tables: {
    chats: { indexes: "&id, service_id, updated_at" },
    messages: { indexes: "&id, service_chat_id, created_at" },
  },
});

const chats = database.store<Chat>("chats");
const messages = database.store<Message>("messages");

// As duas tabelas numa transação só — impossível entre bases separadas.
await database.db.transaction("rw", chats.raw, messages.raw, async () => {
  await chats.put(chat);
  await messages.bulkPut(pending);
});
```

Cada store tem exatamente a mesma superfície de `createOfflineStore` (`put`, `list`, `update`, `clear`, `count`, `raw`, …); só muda quem é dono da base. O `ownerField` é configurado **por tabela**, porque é comum uma base misturar dado por usuário com dado compartilhado.

!!! note "Por que o tipo vai na chamada, e não no schema"
    `database.store<Chat>("chats")` repete o tipo que o schema já declara. Não é gosto: o `Table<T>` do Dexie expande `UpdateSpec<T>` sobre as chaves de `T`, e derivar isso de um `TSchema[K]` ainda genérico faz o TypeScript desistir com `TS2589` ("excessively deep"). O **nome** continua checado contra o schema — errar a tabela é erro de tipo, e em runtime a chamada lança listando as disponíveis.

!!! warning "Uma base, uma versão"
    Mudou o índice de qualquer tabela, sobe o `version` da base inteira. É o preço de tê-las juntas — e é justamente o que evita duas bases relacionadas saírem de sincronia.

## Migrations

Bump `version` quando mudar `indexes`. Dexie roda migrações in-place. Pra rename de campo ou data shift, registre um upgrader via a instância Dexie exposta:

```ts
notificationsStore.db.version(2).upgrade(async (tx) => {
  await tx
    .table("notifications")
    .toCollection()
    .modify((n) => {
      n.read = n.read ?? false;
    });
});
```

!!! warning "Esquecer de bumpar a `version` quebra silenciosamente"
    Mudar `indexes` sem subir `version` faz o Dexie lançar `VersionError` na abertura do banco. Sempre incremente `version` junto com qualquer mudança de schema.

## Recap

- `createOfflineStore({ databaseName, version, tableName, indexes, keyPath, ownerField })` devolve um CRUD tipado sobre IndexedDB via Dexie (dependência direta do SDK).
- `ownerField` ativa scoping multi-tenant: `put`/`list`/`count`/`clear`/`updateMany` respeitam o `owner` e isolam dados por usuário.
- CRUD: `put`/`bulkPut`, `get`/`list` (com `orderBy`/`reverse`/`limit`/`offset`/`filter`), `update`/`updateMany`, `delete`/`clear`, `count`.
- `raw` e `db` abrem a porta pra queries Dexie avançadas.
- Bump `version` ao mudar `indexes`; use `db.version(N).upgrade(...)` pra migrações de dados.

## Veja também

- [SSE](./sse.md) — origem natural dos dados persistidos
- [Query](./query.md) — usar o store como `initialData`
- [Push](./push.md)
