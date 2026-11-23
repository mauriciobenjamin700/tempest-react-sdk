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
import { encodeIdSegment, createOfflineSync } from "tempest-react-sdk";
import { api } from "@/lib/api";
import { analyses } from "./store"; // createOfflineStore
import { fromDto, toPayload, type Analysis, type AnalysisDto } from "./types";

export const sync = createOfflineSync<Analysis, AnalysisDto>({
  databaseName: "AnalysesOutbox",
  watermark: { storageKey: "analyses.watermark" },

  // push: deliver one queued mutation
  deliver: async (entry) => {
    if (entry.op === "delete") {
      await api.delete(`/api/analyses/${encodeIdSegment(entry.recordId)}`);
      return;
    }
    await api.put(`/api/analyses/${encodeIdSegment(entry.recordId)}`, { body: toPayload(entry.payload!) });
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

!!! info "Logout ends the flush that is in flight"
    `resetWatermark()` and `clearOutbox()` also end the session for a flush that
    has already started. From that point the run **delivers** no further entry,
    **requests** no next page, **applies** no pulled item and **writes** no
    watermark — nothing of the user who left crosses into the next one. The run
    resolves with `summary.interrupted: true`, and a `sync.flush()` called after
    logout starts a new run instead of waiting on the abandoned one.

    What cannot be undone is the `deliver` that was **already on the wire** at
    logout: it was issued under the previous session. Its row leaves the queue (or
    gets its `attempts` bumped), but `onEntryDelivered`/`onEntryFailed` do not
    fire, because they would act on the next user's local state.

    Scope: the fence is per tab. With `crossTab`, an entry another tab removed from
    the shared outbox is not delivered, but a pull in flight in another tab only
    stops when that tab also calls `resetWatermark()`/`clearOutbox()`.

!!! tip "Every entry has an owner: `getPrincipal`"
    `clearOutbox()` on logout empties the queue. For the app that forgets it — or a session that ends without a logout (expired token, closed tab) — pass `getPrincipal`: each entry is stamped with a fingerprint of whoever was signed in when it was queued (`entry.owner`, never the id), and the flush checks again before every `deliver`:

    | Signed in now | What happens to the entry |
    | --- | --- |
    | the same owner | delivered |
    | nobody | stays queued (`summary.held`) and goes out when its owner is back |
    | somebody else | deleted unsent (`summary.dropped`) — or, with `foreignEntries: "hold"`, stays queued (`summary.held`) |

    ```ts
    import { createOfflineSync } from "tempest-react-sdk";

    let currentUserId: string | null = "user-a";

    const sync = createOfflineSync<{ text: string }, { id: string }>({
        databaseName: "NotesOutbox",
        watermark: { storageKey: "notes.watermark" },
        deliver: async (entry) => {
            await fetch(`/api/notes/${entry.recordId}`, {
                method: "PUT",
                body: JSON.stringify(entry.payload),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
        getPrincipal: () => currentUserId,
    });

    await sync.enqueue("update", "n1", { text: "A's draft" });
    currentUserId = "user-b";
    const summary = await sync.flush();
    console.log(summary.dropped); // 1 — A's edit does not go out under B's session
    ```

    An entry queued before you turned the option on carries no stamp and is delivered as before: it is the user's own edit, and holding it would strand every queue on upgrade.

!!! tip "Shared device: `foreignEntries: \"hold\"`"
    The `"drop"` default suits a personal device: the previous account's queue would only pile up. On a **shared tablet** it deletes work — Carlos signs out with no signal and three inspections queued, Ana signs in, syncs, and the three are gone unsent (#724). With `foreignEntries: "hold"`, somebody else's entry **stays queued** and goes out when its owner signs back in, under their own session:

    ```ts
    import { createOfflineSync } from "tempest-react-sdk";

    let technicianId: string | null = "carlos";

    const sync = createOfflineSync<{ text: string }, { id: string }>({
        databaseName: "VisitsOutbox",
        watermark: { storageKey: "visits.watermark" },
        deliver: async (entry) => {
            await fetch(`/api/visits/${entry.recordId}`, {
                method: "PUT",
                body: JSON.stringify(entry.payload),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
        getPrincipal: () => technicianId,
        foreignEntries: "hold",
    });

    await sync.enqueue("update", "v1", { text: "Carlos's inspection" });
    technicianId = "ana";
    console.log((await sync.flush()).held); // 1 — stays queued, never goes out under Ana's session
    technicianId = "carlos";
    console.log((await sync.flush()).succeeded); // 1 — goes out when Carlos is back
    ```

    Under neither policy does an entry go out under somebody else's session. What changes:

    - **Per-record order still holds.** A held entry also holds back the later entries **of the same record** (`summary.deferred`), like a failure: if Ana's newer edit went out first, Carlos's older one would overwrite it when he returns. This applies to the default too: an edit made while signed out no longer jumps ahead of the owner's held edit.
    - **`pendingCount()` and `useOfflineSync`'s `pending` count held entries** — Ana's badge shows that Carlos's work is on the device. `clearOutbox()` is still what empties the queue.
    - With `"hold"`, an entry queued **while signed out** is held as well (the default deletes it), and goes out only while nobody is signed in again.

!!! danger "Per-record order survives a failure — it did not before"
    When an entry fails, the **remaining entries for that same record** are left
    untried for this pass and come back in their original order on the next one.
    They show up as `summary.deferred`, counted apart from `summary.failed`,
    because they were never sent.

    This matters because `deliver` is usually a `PUT` upsert. Without the rule, a
    failing `create` followed by an `update` for the same record delivered the
    **update first**: the server created the record from the update payload, and
    the replayed `create` then overwrote it with the **older** snapshot. The user's
    edit vanished with nothing reported.

    The block is **per record, not per pass**: a record the server keeps rejecting
    does not hold up any other record's changes.

!!! tip "Ten edits, one request: `coalesce`"
    Offline, the technician edits the same visit ten times. By default that is
    **ten** `deliver` calls when the signal comes back — nine of them sending a
    snapshot the tenth overwrites. With `coalesce: true`, each run of
    `create`/`update` entries of a record becomes **one** `deliver`:

    | What `deliver` receives | Where it comes from |
    | --- | --- |
    | `op` | the **oldest** entry — `create` followed by `update`s is still `create` |
    | `payload` | the **newest** one (`true`) or the fold of all of them, oldest first (function) |
    | `id`, `attempts`, `lastError` | the oldest entry — an idempotency key taken from `entry.id` does not change between retries |

    ```ts
    import { createOfflineSync } from "tempest-react-sdk";

    interface Note {
        id: string;
        text?: string;
        pinned?: boolean;
    }

    const sync = createOfflineSync<Note, never>({
        databaseName: "NotesOutbox",
        watermark: { storageKey: "notes.watermark" },
        deliver: async (entry) => {
            await fetch(`/api/notes/${entry.recordId}`, {
                method: entry.op === "delete" ? "DELETE" : "PUT",
                body: JSON.stringify(entry.payload),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
        coalesce: true,
    });

    await sync.enqueue("create", "n1", { id: "n1", text: "a" });
    await sync.enqueue("update", "n1", { id: "n1", text: "b" });
    await sync.enqueue("update", "n1", { id: "n1", text: "c" });
    const summary = await sync.flush();
    console.log(summary.succeeded, summary.coalesced); // 1 2 — one PUT with text "c"
    ```

    If the queue holds **patches** instead of snapshots, pass a merge function:
    `coalesce: (folded, next) => ({ ...folded, ...next })`.

    What is **not** folded, on purpose:

    - **A `delete` never joins the fold** and closes the run: `create`, `update`,
      `delete` becomes `create` (newest payload) then `delete`, two requests in
      order. Dropping the pair would orphan the record on the server whenever the
      `create` had landed and only its response was lost.
    - **Entries of different owners** (`getPrincipal`) are not folded together.
    - **Whatever is queued during the delivery** waits for the next flush. Folding
      happens when the run delivers, not when `enqueue` writes — so
      `pendingCount()` still counts every entry until the flush. Rewriting the
      entry in `enqueue` would risk deleting, along with the rest, an edit that
      arrived while that record was in flight.

    On failure the folded entries stay queued: only the oldest one gets `attempts`
    bumped, and the rest count in `summary.deferred`. On success they all leave,
    and the absorbed ones count in `summary.coalesced`.

    The folded delivery goes out **at the oldest entry's position**, carrying the
    newest state. If a recent edit of record A points at a record B created
    **after** A was queued, A may reach the server before B. Leave the option off
    when the server validates that kind of reference on write.

!!! tip "Files with the record: `attachments`"
    The inspection has photos, and the visit's `PUT` carries their URLs. Queueing each
    photo as an **entry of its own** breaks the order: the engine only orders entries
    of the **same record**, and a failing record never holds up the others — the visit
    reaches the server pointing at a photo that never arrived. With `attachments`, the
    engine uploads the files with [`createResumableUpload`](./resumable-upload.md)
    **before** the entry's `deliver`, and hands the URLs in `entry.attachments`:

    | Hook | What it does |
    | --- | --- |
    | `list(entry)` | reads the entry's attachments from the **app's store**: `{ id, blob, uploadedUrl }[]`. One that has `uploadedUrl` is not sent again |
    | `upload(attachment)` | returns the `createResumableUpload` options (`endpoint`, `getToken`, `chunkSize`…). `file` is the blob; `key` defaults to `outbox-attachment:<id>` |
    | `onUploaded(attachment, url)` | stores the URL in the app's store — and is where you release the blob, or keep only a thumbnail |

    ```ts
    import { createOfflineSync, createOfflineStore } from "tempest-react-sdk";

    interface Visit {
        id: string;
        photoIds: string[];
    }

    interface Photo {
        id: string;
        blob: Blob | null;
        uploadUrl: string | null;
    }

    const photos = createOfflineStore<Photo, string>({
        databaseName: "Visits",
        version: 1,
        tableName: "photos",
        indexes: "&id",
        keyPath: "id",
    });

    const sync = createOfflineSync<Visit, never>({
        databaseName: "VisitsOutbox",
        watermark: { storageKey: "visits.watermark" },
        attachments: {
            list: async (entry) => {
                const ids = entry.payload?.photoIds ?? [];
                const rows = await Promise.all(ids.map((id) => photos.get(id)));
                return rows.flatMap((photo) =>
                    photo ? [{ id: photo.id, blob: photo.blob, uploadedUrl: photo.uploadUrl }] : [],
                );
            },
            upload: () => ({ endpoint: "/api/uploads", chunkSize: 256 * 1024 }),
            onUploaded: async (photo, url) => {
                await photos.update(photo.id, { uploadUrl: url, blob: null });
            },
        },
        deliver: async (entry) => {
            await fetch(`/api/visits/${entry.recordId}`, {
                method: "PUT",
                body: JSON.stringify({
                    ...entry.payload,
                    photos: entry.attachments?.map((ref) => ref.url) ?? [],
                }),
            });
        },
        pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
        applyRemote: async () => undefined,
    });

    sync.subscribe((state) => {
        console.log(state.uploadedBytes, state.totalBytes, state.pendingBytes);
    });
    ```

    The attachment inherits everything the entry already has:

    - **A failure is the entry's failure.** A refused upload, or a `start()` that
      resolves `null` (paused or aborted), counts as a `deliver` that threw:
      `attempts` goes up, the record's next edits wait, the next flush retries — and
      `deliver` is **not** called, because the visit would point at nothing.
    - **A dropped connection resumes from the offset.** The per-attachment `key` is
      the same across runs, so the next flush sends `HEAD` + `PATCH` from where it
      stopped, not a new `POST`.
    - **Owner and `coalesce` come first.** An entry held or dropped by
      `getPrincipal`/`foreignEntries` uploads nothing; with `coalesce`, `list`
      receives the folded entry, with the newest payload.
    - **A switch of account mid-upload stops it too.** The owner is checked again
      after every step of the attachment phase (`list`, `upload`, each file) and
      right before `deliver`: when somebody else signed in — in another tab, or
      through a sign-in after an expired token without `resetWatermark()` —, the
      remaining files are not uploaded and the entry stays queued (`summary.held`,
      holding back the record's later edits) or is deleted (`summary.dropped`), per
      `foreignEntries`. The engine's `getPrincipal` also binds an upload whose
      options carry no `getPrincipal` (nor the preset's `getToken`): the file in
      flight stops before its next chunk instead of finishing with the new account's
      token. What already reached the server stays there, and the owner finishes the
      rest when they come back.
    - **Logout mid-upload** (`clearOutbox()`/`resetWatermark()`) stops the run before
      `deliver` and skips `onUploaded`, which would write into the next user's store.
      The resume record keeps the final offset, so the owner's upload finishes
      without resending a byte when they come back.

    The **blob lives in the app's store**, never in the outbox: the queue keeps only
    the record snapshot, without copying the file. Progress shows up in `SyncState`:

    | Field | What it is |
    | --- | --- |
    | `uploadedBytes` / `totalBytes` | bytes of the attachment **uploading now** (`0`/`0` when none) |
    | `pendingBytes` | sum of the attachments not uploaded yet, from `list()` over every queued entry, each file once |
    | `persisted` | `navigator.storage.persisted()`, or `null` where the API is missing |

    The engine **reads** `persisted` but never asks for persistence: in Firefox
    `requestPersistentStorage()` opens a permission prompt, and a prompt that pops up
    out of nowhere during a background sync is a prompt the user denies. Call it at
    login or install. The [Offline field app](./recipes/field-app-offline.md) recipe
    builds all of it: compression before storing, the blob released in `onUploaded`
    and the storage warning with `pendingBytes`.

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
import { encodeIdSegment } from "tempest-react-sdk";
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
  await api.put(`/api/analyses/${encodeIdSegment(record.id)}`, { body: record });

  return record;
}

/** Soft delete: mark a local tombstone + propagate. */
export async function deleteAnalysis(userId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await analyses.update(id, { is_deleted: true, deleted_at: now, updated_at: now });
  await api.put(`/api/analyses/${encodeIdSegment(id)}`, {
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

Don't wire sync state by hand: `useOfflineSync(sync, opts)` subscribes the component to the engine (via `subscribe`/`getState`) and exposes `{ phase, pending, syncing, lastSummary, lastError, uploadedBytes, totalBytes, pendingBytes, persisted, flush, enqueue }`, with optional flush on mount, on the `online` event and on an interval. `useSyncStatus(sync)` returns a ready `{ tone, pending, syncing }` for `<SyncStatusBadge>`. For the offline bar and the SW update prompt, see **[PWA & Offline-First](./pwa.md)**.

```tsx
import { useOfflineSync, SyncStatusBadge, useSyncStatus } from "tempest-react-sdk";
import { sync } from "@/sync/engine";

function SyncBadge() {
  const { tone, pending } = useSyncStatus(sync);
  return <SyncStatusBadge tone={tone} pending={pending} />;
}
```

For optimistic mutations wired to TanStack Query, use `useOfflineMutation` — see [Query](./query.md#useofflinemutation).

!!! tip "Cross-tab coherence"
    Pass `crossTab: true` to `createOfflineSync` to broadcast `SyncState` across tabs of the same origin via `BroadcastChannel` — one tab flushing zeroes the pending badge everywhere. The outbox is already a shared IndexedDB; this only mirrors the in-memory state. `flush` stays single-flight **per tab** (idempotent delivery by `id` covers the rest). Call `sync.dispose()` on teardown to close the channel.

    ```ts
    export const sync = createOfflineSync<Analysis, AnalysisDto>({
      databaseName: "AnalysesOutbox",
      crossTab: true,
      // ...
    });
    ```

## Conflicts: last-write-wins

The backend resolves by `updated_at` (the most recent write wins). On the client, the pull does `bulkPut`, which **overwrites** the local record with the server version — so an unconfirmed local edit can be replaced by a newer server version. If your domain needs finer merging (independent fields, CRDTs), handle it in the `saveAnalysis`/pull layer; the SDK gives you the blocks, it doesn't impose the policy.

For the two common cases, the SDK exports ready-made resolvers to use inside `applyRemote` (ties → remote wins):

```ts
import { createOfflineStore, higherVersionWins, lastWriteWins } from "tempest-react-sdk";

interface Analysis {
  id: string;
  user_id: string;
  updated_at: string;
  version: number;
}

// the same store as section 2
const analyses = createOfflineStore<Analysis, string>({
  databaseName: "FamachaOffline",
  version: 1,
  tableName: "analyses",
  indexes: "&id, user_id, updated_at",
  ownerField: "user_id",
});

// pass it as `applyRemote` to `createOfflineSync`
export async function applyRemote(dto: Analysis): Promise<void> {
  const local = await analyses.get(dto.id);
  await analyses.put(lastWriteWins(local, dto, (r) => r.updated_at));
}

// or, with a version counter on the record
export async function applyRemoteByVersion(dto: Analysis): Promise<void> {
  const local = await analyses.get(dto.id);
  await analyses.put(higherVersionWins(local, dto, (r) => r.version));
}
```

## Recap

- **`createOfflineStore`** is the local source of truth (IndexedDB, scoped by `user_id`).
- **Pull** drains `GET /api/analyses/changes` by `has_more`, applies upserts/tombstones, and keeps `server_time` as the next `since`.
- **Push** writes locally first and **upserts by `id`** — idempotent.
- **`installBackgroundSync`** re-queues and replays offline mutations; idempotency makes replay safe.
- Conflict = **last-write-wins by `updated_at`**, defined by the backend.
- Matches the [`tempest-fastapi-sdk` offline-sync recipe](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/) 1:1. 🚀
