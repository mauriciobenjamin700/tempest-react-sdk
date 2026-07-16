# Offline Sync with `tempest-fastapi-sdk`

This recipe wires the **frontend** (`tempest-react-sdk`) to the **backend** (`tempest-fastapi-sdk`) into a complete offline-first flow: the app stays usable with no network, writes locally, and syncs with the server when connectivity returns — losing nothing and duplicating nothing.

It's the counterpart to the backend recipe: **[Offline-First Sync — tempest-fastapi-sdk](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/)**. Read both together: the contract (endpoints, watermark, tombstones) comes from the backend; here we build the browser side.

## The two halves

```text
┌─────────────── browser (tempest-react-sdk) ────────────────┐      ┌──────── server (tempest-fastapi-sdk) ──────────┐
│  createOfflineStore (IndexedDB)   ← local source of truth   │      │  GET /api/analyses/changes  → delta (since)     │
│  createApiClient                  → push (upsert by id)     │ ───► │  PUT /api/analyses/{id}     → idempotent upsert  │
│  installBackgroundSync (SW)       → queue + offline replay  │      │  soft delete (is_deleted/deleted_at)            │
└──────────────────────────────────────────────────────────────┘      └─────────────────────────────────────────────┘
```

- **Pull** (server → local): fetch only what changed since the last `server_time` (watermark), page until drained, apply upserts and tombstones into the local store.
- **Push** (local → server): every mutation uses a client-generated `id` and **upserts** — so repeating the call doesn't duplicate. The service worker queues whatever fails offline and **replays it automatically** when the network returns.

!!! info "Why automatic replay is safe here"
    The backend contract is **upsert by client `id`** (idempotent) + **last-write-wins by `updated_at`**. That's exactly what makes `installBackgroundSync` safe: replaying the same mutation N times converges to the same state.

## The fast path: `createOfflineSync`

`createOfflineSync` packs the whole engine — a durable **outbox** (IndexedDB), a **single-flight flush** (push → pull), an **offline guard**, the **pagination loop** and the **watermark** — behind three transport callbacks. You say *how* to deliver a mutation, *how* to fetch one delta page and *how* to apply an item; the SDK does the rest.

```ts
// src/sync/engine.ts
import { createOfflineSync } from "tempest-react-sdk";
import { api } from "@/lib/api";
import { analyses } from "./store"; // createOfflineStore
import { fromDto, toPayload, type Analysis, type AnalysisDto } from "./types";

export const sync = createOfflineSync<Analysis, AnalysisDto>({
  databaseName: "AnalysesOutbox",
  watermark: { storageKey: "analyses.watermark" },

  // push: deliver one queued mutation
  deliver: async (entry) => {
    if (entry.op === "delete") {
      await api.delete(`/api/analyses/${entry.recordId}`);
      return;
    }
    await api.put(`/api/analyses/${entry.recordId}`, { body: toPayload(entry.payload!) });
  },

  // pull: one delta page since the watermark
  pullPage: async (since, cursor) => {
    const page = await api.get<{ items: AnalysisDto[]; next_cursor: string | null; server_time: string }>(
      "/api/analyses/changes",
      { params: { since: since ?? undefined, cursor: cursor ?? undefined } },
    );
    return { items: page.items, nextCursor: page.next_cursor, serverTime: page.server_time };
  },

  // applyRemote: merge one server item into the local store (you own conflicts)
  applyRemote: async (dto) => {
    if (dto.is_deleted) {
      await analyses.delete(dto.id);
      return;
    }
    const local = await analyses.get(dto.id);
    // last-write-wins: keep a newer local pending edit
    if (local?.pending && local.updated_at > dto.updated_at) return;
    await analyses.put(fromDto(dto));
  },
});
```

Using it from the UI:

```ts
// write locally, queue, then flush
await analyses.put({ ...record, pending: true });
await sync.enqueue(record.createdOnServer ? "update" : "create", record.id, record);
await sync.flush("after-mutation");

sync.pendingCount(); // pending badge
sync.resetWatermark(); // on logout / account switch
sync.clearOutbox();
```

!!! tip "When to sync"
    Fire `sync.flush("boot")` at boot, `sync.flush("online-event")` when the network returns (see `useOnline`), and inside your web-push handler. The flush is single-flight — concurrent triggers collapse into one run — and is **skipped automatically** while offline (`summary.skipped`).

!!! info "Failed deliveries stay queued"
    If `deliver` throws, the entry **stays** in the outbox with its `attempts` bumped and `lastError` recorded — the next flush retries it. Pair it with `installBackgroundSync` in the service worker to replay even with the app closed.

The sections below show **what the engine does under the hood** (and how to wire it by hand when you need fine-grained control — multiple stores, per-field merges, etc.).

## Prerequisites

1. A backend running the `tempest-fastapi-sdk` offline-sync recipe (`GET /api/analyses/changes` + an upsert route).
2. `dexie` installed (peer of `createOfflineStore`): `npm i dexie`.
3. A PWA app — scaffold with `create-tempest-app --pwa` (ships the service worker). See [Scaffold › PWA](./scaffold.md#pwa-mode-pwa).

## 1. The model

Mirror the backend entity. The `id` is **client-generated** (UUID) and `updated_at` is the conflict key:

```ts
// src/sync/types.ts
export interface Analysis {
  id: string; // client-generated UUID (crypto.randomUUID)
  user_id: string;
  animal_id: string;
  notes: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601 — last-write-wins
  is_deleted: boolean;
  deleted_at: string | null;
}

/** Response of GET /api/analyses/changes (backend's SyncPaginationSchema). */
export interface ChangesResponse {
  items: Analysis[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  server_time: string; // watermark — keep it for the next `since`
}
```

## 2. The local store (IndexedDB)

```ts
// src/sync/store.ts
import { createOfflineStore } from "tempest-react-sdk";
import type { Analysis } from "./types";

/** Offline source of truth, scoped per user. */
export const analyses = createOfflineStore<Analysis, string>({
  databaseName: "FamachaOffline",
  version: 1,
  tableName: "analyses",
  indexes: "&id, user_id, updated_at",
  ownerField: "user_id",
});
```

## 3. Pull — download the delta

Drain every page since the watermark, apply upserts and remove tombstones, and **only then** persist the new `server_time`. The backend's golden rule: the next `since` is the response's `server_time`, **never** the client clock.

```ts
// src/sync/pull.ts
import { analyses } from "./store";
import { api } from "@/lib/api";
import type { Analysis, ChangesResponse } from "./types";

const sinceKey = (userId: string) => `sync:analyses:since:${userId}`;

/** Sync server → local. Idempotent: run it as many times as you like. */
export async function pullAnalyses(userId: string): Promise<void> {
  const since = localStorage.getItem(sinceKey(userId)) ?? undefined;
  let cursor: string | undefined;
  let serverTime: string | undefined;

  do {
    const page = await api.get<ChangesResponse>("/api/analyses/changes", {
      params: { since, cursor, limit: 100, include_deleted: true },
    });

    const live = page.items.filter((a) => !a.is_deleted);
    const tombstones = page.items.filter((a) => a.is_deleted);

    if (live.length) await analyses.bulkPut(live, userId);
    for (const dead of tombstones) await analyses.delete(dead.id);

    serverTime ??= page.server_time; // snapshot from the 1st page
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  if (serverTime) localStorage.setItem(sinceKey(userId), serverTime);
}
```

!!! warning "The first sync drains everything"
    With no `since`, the backend returns the full state, paginated. The loop above honors `has_more` and `next_cursor` until exhausted — don't stop at the first page.

## 4. Push — offline-first mutations

Write **to the local store first** (instant UI), then upsert to the server. Because the `id` is client-side and the route is an upsert, replay is safe:

```ts
// src/sync/push.ts
import { analyses } from "./store";
import { api } from "@/lib/api";
import type { Analysis } from "./types";

export async function saveAnalysis(
  userId: string,
  input: { animal_id: string; notes: string; id?: string },
): Promise<Analysis> {
  const now = new Date().toISOString();
  const existing = input.id ? await analyses.get(input.id) : undefined;

  const record: Analysis = {
    id: input.id ?? crypto.randomUUID(),
    user_id: userId,
    animal_id: input.animal_id,
    notes: input.notes,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    is_deleted: false,
    deleted_at: null,
  };

  // 1. Local first — the UI never waits on the network.
  await analyses.put(record, userId);

  // 2. Upsert on the server (idempotent by id). If it fails offline, the
  //    service worker queues and replays it for you (step 5).
  await api.put(`/api/analyses/${record.id}`, { body: record });

  return record;
}

/** Soft delete: mark a local tombstone + propagate. */
export async function deleteAnalysis(userId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await analyses.update(id, { is_deleted: true, deleted_at: now, updated_at: now });
  await api.put(`/api/analyses/${id}`, {
    body: { ...(await analyses.get(id)) },
  });
}
```

## 5. Background sync in the service worker

In `src/sw.ts` (generated by `--pwa`), queue `/api/analyses` mutations that fail offline — they're replayed when the network returns:

```ts
// src/sw.ts
import { installBackgroundSync } from "tempest-react-sdk/sw";

installBackgroundSync({
  match: (url) => url.pathname.startsWith("/api/analyses"),
});
```

This covers **PUT/POST/PATCH/DELETE**. `saveAnalysis` above already wrote locally, so the UI never blocks: the `await api.put(...)` rejects offline, the SW stores the request in an IndexedDB queue and replays it on the `sync` event (or on the next request, in browsers without the Background Sync API). Because the upsert is idempotent, the replay converges. Details in [Web Push & Service Worker](./push.md).

## 6. When to sync

Trigger `pullAnalyses` on boot, when coming back online, and periodically:

```ts
// src/sync/index.ts
import { pullAnalyses } from "./pull";
import { useAuth } from "@/stores/auth";

export function startSync(): void {
  const userId = useAuth.getState().user?.id;
  if (!userId) return;

  const run = () => void pullAnalyses(userId).catch(console.warn);

  run(); // boot
  window.addEventListener("online", run); // reconnected
  setInterval(run, 60_000); // light polling (or swap for web push)
}
```

!!! tip "Push instead of polling"
    If the backend fires a **web push** on change, swap the `setInterval` for a `pullAnalyses` inside the notification handler — near real-time sync, no polling. See [Web Push](./push.md) + `usePushSubscription`.

## Reactive UI and auto-flush

Don't wire sync state by hand: `useOfflineSync(sync, opts)` subscribes the component to the engine (via `subscribe`/`getState`) and exposes `{ phase, pending, syncing, lastSummary, lastError, flush, enqueue }`, with optional flush on mount, on the `online` event and on an interval. `useSyncStatus(sync)` returns a ready `{ tone, pending, syncing }` for `<SyncStatusBadge>`. For the offline bar and the SW update prompt, see **[PWA & Offline-First](./pwa.md)**.

```tsx
import { useOfflineSync, SyncStatusBadge, useSyncStatus } from "tempest-react-sdk";
import { sync } from "@/sync/engine";

function SyncBadge() {
  const { tone, pending } = useSyncStatus(sync);
  return <SyncStatusBadge tone={tone} pending={pending} />;
}
```

For optimistic mutations wired to TanStack Query, use `useOfflineMutation` — see [Query](./query.md#useofflinemutation).

## Conflicts: last-write-wins

The backend resolves by `updated_at` (the most recent write wins). On the client, the pull does `bulkPut`, which **overwrites** the local record with the server version — so an unconfirmed local edit can be replaced by a newer server version. If your domain needs finer merging (independent fields, CRDTs), handle it in the `saveAnalysis`/pull layer; the SDK gives you the blocks, it doesn't impose the policy.

For the two common cases, the SDK exports ready-made resolvers to use inside `applyRemote` (ties → remote wins):

```ts
import { lastWriteWins, higherVersionWins } from "tempest-react-sdk";

applyRemote: async (dto) => {
  const local = await analyses.get(dto.id);
  await analyses.save(lastWriteWins(local, dto, (r) => r.updatedAt));
  // or: higherVersionWins(local, dto, (r) => r.version)
};
```

## Recap

- **`createOfflineStore`** is the local source of truth (IndexedDB, scoped by `user_id`).
- **Pull** drains `GET /api/analyses/changes` by `has_more`, applies upserts/tombstones, and keeps `server_time` as the next `since`.
- **Push** writes locally first and **upserts by `id`** — idempotent.
- **`installBackgroundSync`** re-queues and replays offline mutations; idempotency makes replay safe.
- Conflict = **last-write-wins by `updated_at`**, defined by the backend.
- Matches the [`tempest-fastapi-sdk` offline-sync recipe](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/) 1:1. 🚀
