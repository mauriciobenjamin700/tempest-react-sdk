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

### Listing by another index: `listBy`

`list` filters by owner. To list by **another** indexed field — a visit's photos, a chat's messages — use `listBy(index, value, owner?, options?)`. It goes through the IndexedDB index and still honors the owner:

```ts
import { createOfflineStore } from "tempest-react-sdk";

interface VisitPhoto {
  id: string;
  technician_id: string;
  visit_id: string;
  taken_at: string;
}

const photos = createOfflineStore<VisitPhoto, string>({
  databaseName: "FieldPhotos",
  version: 1,
  tableName: "photos",
  indexes: "&id, technician_id, visit_id, taken_at",
  ownerField: "technician_id",
});

const visitPhotos = await photos.listBy("visit_id", "visit-7", "tech-ana", {
  orderBy: "taken_at",
});
```

The two shortcuts it replaces each get one thing wrong:

| Call | Uses the index? | Honors the owner? |
| --- | --- | --- |
| `list(owner, { filter: (p) => p.visit_id === id })` | no — reads **every** record of the owner | yes |
| `raw.where("visit_id").equals(id)` | yes | **no** — returns another technician's photos |
| `listBy("visit_id", id, owner)` | yes | yes |

Measured in the `create-offline-store.list-by.test.ts` test (`npx vitest run src/offline/create-offline-store.list-by.test.ts`): two owners, 20 photos each, 4 per visit — the `list` `filter` runs 20 times to find 4; the `listBy` one only sees the 4 the index and the owner already selected. The index must be declared in `indexes`; an unindexed field rejects with Dexie's `SchemaError` instead of scanning the table. Without `owner` (or without `ownerField`), every owner's matches come back, as with `list`.

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

## Storage full: `StorageFullError`

Every write of the store — `put`, `bulkPut`, `update`, `updateMany`, `delete` and `clear` — rejects with `StorageFullError` when the browser refuses it for lack of space. It is the signal for the app to say "storage full, sync before going on", instead of showing Dexie's error:

```ts
import { StorageFullError, createOfflineStore } from "tempest-react-sdk";

interface Visit {
  id: string;
  technician_id: string;
  notes: string;
}

const visits = createOfflineStore<Visit, string>({
  databaseName: "FieldVisits",
  version: 1,
  tableName: "visits",
  indexes: "&id, technician_id",
  ownerField: "technician_id",
});

export async function saveVisit(visit: Visit, owner: string): Promise<"saved" | "full"> {
  try {
    await visits.put(visit, owner);
    return "saved";
  } catch (error) {
    if (error instanceof StorageFullError) return "full";
    throw error;
  }
}
```

Checking `error.name === "QuotaExceededError"` is not enough, because that is not the error that arrives. Measured in Chromium 159, with the origin's quota at 1 MiB (DevTools Protocol `Storage.overrideQuotaForOrigin`) and a 4 MiB record: all four writes rejected with Dexie's **`AbortError`**. The request itself succeeds; the quota is enforced when the transaction commits, and the `QuotaExceededError` only shows up as the abort's `inner`. The store recognises that shape and the others:

| What Dexie hands over | When |
| --- | --- |
| `AbortError` with `inner` `QuotaExceededError` | quota enforced at commit — the case measured in Chromium |
| Dexie's `QuotaExceededError` | the request itself refused |
| `BulkError` / `ModifyError` with the quota in `failures` | `bulkPut` / `updateMany` with records refused one by one |

The original error is kept in `cause`. After a `bulkPut`, `cause` may be Dexie's `BulkError`, whose `failuresByPos` tells which records failed — the others may have been written. Any other error passes through unchanged. [`createOfflineSync`](./offline-sync.md)'s `enqueue` inherits the behavior, because the outbox is an `OfflineStore`.

The browserless reproduction (`npx vitest run src/offline/create-offline-store.quota.test.ts`) aborts the commit with `QuotaExceededError` in fake-indexeddb, the way Chromium does, and covers every write.

`raw` and `db` are Dexie itself and do **not** convert. In a transaction of your own, the quota is enforced when **the transaction** commits, so test its error with `isQuotaExceededError`, which recognises the same shapes:

```ts
import { createOfflineStore, isQuotaExceededError } from "tempest-react-sdk";

interface Draft {
  id: string;
  body: string;
}

const drafts = createOfflineStore<Draft, string>({
  databaseName: "Drafts",
  version: 1,
  tableName: "drafts",
  indexes: "&id",
});

export async function saveAll(items: Draft[]): Promise<boolean> {
  try {
    await drafts.db.transaction("rw", drafts.raw, async () => {
      await drafts.raw.clear();
      await drafts.raw.bulkAdd(items);
    });
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) return false;
    throw error;
  }
}
```

The SDK does **not** refuse writes by looking at `navigator.storage.estimate()`: the number is approximate, and the browser's refusal is the exact signal. To warn before it fills up, use [`useStorageEstimate`](./pwa.md#4-durability-request-persistent-storage).

## `createOfflineDatabase` — several tables in one database

`createOfflineStore` gives each store a database of its own, which is the right shape for one isolated cache. It stops being right the moment the tables belong together: chats and their messages, an entity and its drafts, anything you would read or clear as a unit. Splitting those across databases costs the real transaction — Dexie runs one atomically only **within** a single database — and it scatters the version bump for a related change across two places.

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

// Both tables in one transaction — impossible across separate databases.
await database.db.transaction("rw", chats.raw, messages.raw, async () => {
  await chats.put(chat);
  await messages.bulkPut(pending);
});
```

Each store has exactly the surface of `createOfflineStore` (`put`, `list`, `update`, `clear`, `count`, `raw`, …); only ownership of the database changes. `ownerField` is configured **per table**, because a database commonly mixes per-user data with shared data.

!!! note "Why the type goes on the call, not the schema"
    `database.store<Chat>("chats")` repeats a type the schema already declares. That is not a preference: Dexie's `Table<T>` expands `UpdateSpec<T>` over the keys of `T`, and deriving that from a still-generic `TSchema[K]` makes TypeScript give up with `TS2589` ("excessively deep"). The **name** is still checked against the schema — a wrong table is a type error, and at runtime the call throws listing the available ones.

!!! warning "One database, one version"
    Change any table's indexes and you bump the version of the whole database. That is the cost of keeping them together — and precisely what stops two related databases from drifting apart.

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
- `listBy(index, value, owner)` lists by another indexed field through the index, keeping the owner scope.
- A write refused for lack of space rejects with `StorageFullError` (original in `cause`); on `raw`/`db`, use `isQuotaExceededError`.
- `raw` and `db` open the door to advanced Dexie queries.
- Bump `version` when changing `indexes`; use `db.version(N).upgrade(...)` for data migrations.

## See also

- [SSE](./sse.md) — the natural source of the persisted data
- [Query](./query.md) — use the store as `initialData`
- [Push](./push.md)
