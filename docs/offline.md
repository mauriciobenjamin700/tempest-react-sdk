# Offline (IndexedDB)

`createOfflineStore` empacota Dexie com scoping opcional por owner. Use pra histórico de SSE/push, drafts, cache local que precisa sobreviver a reload.

## Quando usar

- Mensagens recebidas via SSE/WebSocket que devem ficar visíveis offline.
- Drafts de formulários longos.
- Cache de dados raramente alterados (cidades, categorias) — combina com `initialData` do TanStack Query.

NÃO use pra estado de UI volátil — zustand é mais barato.

## Setup

```ts
import { createOfflineStore } from "tempest-react-sdk";

type Notification = {
    message_id: string;
    owner_id: string;
    type: "NOTIFY" | "PAYMENT-SUCCESS";
    message: string;
    created_at: string;
    read: boolean;
};

export const notificationsStore = createOfflineStore<Notification, string>({
    databaseName: "TempestNotifications",
    version: 1,
    tableName: "notifications",
    indexes: "&message_id, owner_id, read, created_at",
    keyPath: "message_id",
    ownerField: "owner_id",
});
```

Sintaxe do `indexes`: Dexie. `&` = primary key único, vírgulas separam indexes adicionais.

## Operações

```ts
await notificationsStore.put(notification, ownerId);
await notificationsStore.bulkPut(notifications, ownerId);
const items = await notificationsStore.list(ownerId, {
    orderBy: "created_at",
    reverse: true,
    limit: 50,
});
await notificationsStore.updateMany(ownerId, { read: true });
await notificationsStore.clear(ownerId);
const total = await notificationsStore.count(ownerId);
```

`raw` e `db` expostos pra queries Dexie avançadas (transações, `where().and()` complexos).

## Migrations

Bump `version` quando mudar `indexes`. Dexie roda migrações in-place; pra rename/data shift, registre um upgrader via `store.db.version(N).upgrade(...)`.

## Veja também

- [SSE](./sse.md) — origem natural dos dados persistidos
- [Push](./push.md)
