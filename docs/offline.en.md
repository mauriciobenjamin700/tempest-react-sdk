# Offline (IndexedDB)

`createOfflineStore` wraps Dexie with optional per-owner scoping. Use it for
SSE/push history, drafts, and local cache that must survive a reload.

## When to use

- Messages received via SSE/WebSocket that must remain visible offline.
- Drafts of long forms.
- Cache of rarely changing data (cities, categories) — pairs with TanStack Query's `initialData`.

DO NOT use it for volatile UI state — zustand is cheaper.

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

`indexes` syntax: Dexie. `&` = unique primary key, commas separate additional
indexes.

## Operations

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

`raw` and `db` are exposed for advanced Dexie queries (transactions, complex
`where().and()`).

## Migrations

Bump `version` when you change `indexes`. Dexie runs migrations in-place; for a
rename/data shift, register an upgrader via `store.db.version(N).upgrade(...)`.

## See also

- [SSE](./sse.md) — the natural source of the persisted data
- [Push](./push.md)
