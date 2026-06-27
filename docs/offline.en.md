# Offline (IndexedDB)

`createOfflineStore` wraps Dexie with optional per-owner scoping. Use it for SSE/push history, drafts, and local cache that must survive a reload.

!!! info "Why IndexedDB and not `localStorage`?"
`localStorage` is synchronous, capped at ~5 MB, and only stores strings. IndexedDB is asynchronous, holds MBs of structured data, and supports indexes/queries. `createOfflineStore` hides Dexie's verbosity behind a typed CRUD — and `dexie` ships as a direct dependency of the SDK (v0.2.0+), installed alongside `npm install tempest-react-sdk`.

## When to use

- Messages received via SSE/WebSocket that must remain visible offline.
- Drafts of long forms.
- Cache of rarely changing data (cities, categories) — pairs with TanStack Query's `initialData`.

!!! warning "Do not use it for volatile UI state"
Menu toggle, active tab, open modal — that's UI state that dies on reload. Zustand (see [State](./state.md)) is far cheaper. Reserve the offline store for data that **must** persist.

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

`indexes` syntax: Dexie. `&` = unique primary key, commas separate additional indexes. `keyPath` points at the property used as the primary key (default `"id"`). `ownerField` enables multi-tenant scoping — see below.

## Owner-scoping

When `ownerField` is configured, every read/write method honors an `owner` argument and persists that value on each record. This isolates each user's data in the same database — essential when two accounts use the app in the same browser:

```ts
const userId = "u-42";

// put stamps owner_id = "u-42" automatically
await notificationsStore.put(
  {
    message_id: "m-1",
    owner_id: "", // overwritten by owner
    type: "NOTIFY",
    message: "Welcome",
    created_at: new Date().toISOString(),
    read: false,
  },
  userId,
);

// list only returns records for that owner
const mine = await notificationsStore.list(userId);

// count / clear / updateMany are also restricted to the owner
await notificationsStore.clear(userId); // does not affect other users
```

!!! tip "Without `ownerField`, the store is global"
If you don't configure `ownerField`, the methods ignore the `owner` argument and operate over the whole table. Use the global store for data not tied to a user (a cities catalog, for example).

## Full CRUD

```ts
const ownerId = "u-42";

// CREATE / UPDATE (upsert)
await notificationsStore.put(notification, ownerId);
await notificationsStore.bulkPut(notifications, ownerId); // single transaction

// READ
const one = await notificationsStore.get("m-1"); // by primary key
const recent = await notificationsStore.list(ownerId, {
  orderBy: "created_at",
  reverse: true,
  limit: 50,
  offset: 0,
  filter: (n) => !n.read, // predicate applied after the index
});
const total = await notificationsStore.count(ownerId);

// Partial UPDATE
await notificationsStore.update("m-1", { read: true }); // by key
await notificationsStore.updateMany(ownerId, { read: true }); // all of the owner

// DELETE
await notificationsStore.delete("m-1"); // by key
await notificationsStore.clear(ownerId); // all of the owner
```

`raw` (Dexie's `Table`) and `db` (the Dexie instance) are exposed for advanced queries — multi-table transactions, complex `where().and()`:

```ts
import { notificationsStore } from "./stores";

await notificationsStore.db.transaction("rw", notificationsStore.raw, async () => {
  const unread = await notificationsStore.raw
    .where("owner_id")
    .equals("u-42")
    .and((n) => !n.read)
    .toArray();
  console.log(`${unread.length} unread`);
});
```

## Combining with SSE + TanStack Query

A common pattern: receive over SSE, persist offline, and use the local cache as `initialData` so the UI appears instantly on reload:

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

## Migrations

Bump `version` when you change `indexes`. Dexie runs migrations in-place. For a field rename or data shift, register an upgrader via the exposed Dexie instance:

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

!!! warning "Forgetting to bump `version` breaks silently"
Changing `indexes` without bumping `version` makes Dexie throw `VersionError` when opening the database. Always increment `version` alongside any schema change.

## Recap

- `createOfflineStore({ databaseName, version, tableName, indexes, keyPath, ownerField })` returns a typed CRUD over IndexedDB via Dexie (a direct SDK dependency).
- `ownerField` enables multi-tenant scoping: `put`/`list`/`count`/`clear`/`updateMany` respect `owner` and isolate data per user.
- CRUD: `put`/`bulkPut`, `get`/`list` (with `orderBy`/`reverse`/`limit`/`offset`/`filter`), `update`/`updateMany`, `delete`/`clear`, `count`.
- `raw` and `db` open the door to advanced Dexie queries.
- Bump `version` when changing `indexes`; use `db.version(N).upgrade(...)` for data migrations.

## See also

- [SSE](./sse.md) — the natural source of the persisted data
- [Query](./query.md) — use the store as `initialData`
- [Push](./push.md)
