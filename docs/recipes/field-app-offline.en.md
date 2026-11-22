# Offline field app

The co-op technician leaves town at 6 a.m., drives 80 km of dirt road and spends the day
going from farm to farm. At every gate he does the same inspection: how many head of
cattle, whether the water troughs are clean, whether the fence holds, whether vaccination
is up to date. He takes photos. He writes down what the farmer said.

There is no signal in the pasture. Sometimes a weak 2G shows up near the farmhouse and
drops in the middle of an upload. Real signal only comes back at night, at the hotel in
town.

This recipe builds the app that technician uses: a PWA that **works entirely without a
network**, keeps everything on the device and sends it on its own when signal shows up —
photos included, which resume from where they stopped when the connection drops halfway. 🚜

!!! info "This recipe is about the field"
    The sync engine itself (outbox, watermark, paginated pull) is explained piece by
    piece in [Offline Sync (FastAPI)](../offline-sync.md). Here you see that engine
    working inside a real app, together with the camera, GPS, resumable upload and export.

## What we are going to build

- **Visit list** — reads from the device, never from the network. Shows what has been
  sent, what is waiting for signal and what hit a conflict.
- **Inspection form** — farm, farmer (with a validated CPF), herd size, checklist, notes
  and the GPS location, which works without internet.
- **Camera photos** — downscaled and compressed on the device before they take up space,
  and sent by **resumable upload** when there is signal.
- **Sync status** — the badge at the top, the "pending upload" panel and the offline bar.
- **Conflict** — the supervisor approved the visit at the office while the technician was
  still editing it in the pasture. The app shows that and lets him choose.
- **Export the visit** — an `.xlsx` sheet + photos in a `.zip`, built without a network,
  so the technician can send it to the farmer over WhatsApp.
- **PWA** — opens without a network, asks for persistent storage and does not swap
  versions in the middle of an inspection.

And the states every real screen has: loading, empty, error, success — and the phone
screen, which is the only one that matters here.

## The backend contract

The backend is a FastAPI service on top of `tempest-fastapi-sdk`, following its
[offline-sync recipe](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/).
The app talks to four routes, all under `root_path="/api"`:

| Route | What it does |
| --- | --- |
| `PUT /api/visits/{id}` | Idempotent upsert of the visit. The `id` is generated on the device. |
| `GET /api/visits/changes?since&cursor&limit` | Paginated delta since the last `server_time`. |
| `GET /api/visits/{id}` | The server's version, used to resolve a conflict. |
| `POST /api/uploads` (tus) | Resumable upload of the photos. |

A visit on the wire:

```json
{
  "id": "0c5f6a52-6a3e-4f43-9a8e-2b1d7c9e4f10",
  "technician_id": "tec-0193",
  "farm_name": "Fazenda Boa Esperança",
  "producer_name": "José Aparecido da Silva",
  "producer_cpf": "529.982.247-25",
  "herd_size": 214,
  "checklist": { "water": true, "fences": false, "vaccination": true, "pasture": true },
  "notes": "Cerca do piquete 3 caída. Produtor vai trocar os mourões até sexta.",
  "status": "done",
  "latitude": -15.60142,
  "longitude": -56.09781,
  "visited_at": "2026-11-18T09:42:10.000Z",
  "updated_at": "2026-11-18T09:58:33.000Z",
  "photos": [
    {
      "id": "8d1e0a7b-3c55-4a0e-b7a1-61f0e2d4c9aa",
      "url": "https://api.cooperativa.com.br/api/uploads/5b2c9f",
      "taken_at": "2026-11-18T09:47:02.000Z"
    }
  ],
  "is_deleted": false
}
```

And the delta page, in the backend's `SyncPaginationSchema` shape:

```json
{
  "items": ["…visitas como acima…"],
  "next_cursor": "eyJpZCI6IjBjNWY2YTUyIn0",
  "has_more": true,
  "limit": 100,
  "server_time": "2026-11-18T22:10:05.118Z"
}
```

An error follows the envelope of the [shared contract](../integration-fastapi.md#the-contract-both-sides-share).
Only one matters here: when the supervisor has already approved the visit, the `PUT`
answers `409` with `{"detail": "Visita já aprovada pelo supervisor.", "code": "VISIT_LOCKED"}`.

!!! warning "`tempest-fastapi-sdk` has no tus server"
    The `/api/uploads` route needs a real tus server — `tusd` behind the same proxy is the
    common path. The table of what it must answer is in
    [Resumable upload](../resumable-upload.md#what-your-backend-must-implement).

## The code, file by file

### 1. The model

```ts
// src/visits/types.ts
export type VisitStatus = "draft" | "done" | "approved";

export type VisitSyncState = "pending" | "synced" | "conflict";

export interface VisitChecklist {
  water: boolean;
  fences: boolean;
  vaccination: boolean;
  pasture: boolean;
}

export interface Visit {
  id: string;
  technician_id: string;
  farm_name: string;
  producer_name: string;
  producer_cpf: string;
  herd_size: number;
  checklist: VisitChecklist;
  notes: string;
  status: VisitStatus;
  latitude: number | null;
  longitude: number | null;
  visited_at: string;
  updated_at: string;
  sync_state: VisitSyncState;
  conflict_detail: string | null;
}

export interface VisitPhoto {
  id: string;
  visit_id: string;
  technician_id: string;
  blob: Blob;
  bytes: number;
  taken_at: string;
  upload_url: string | null;
}

export interface PhotoRef {
  id: string;
  url: string;
  taken_at: string;
}

export interface VisitDto extends Omit<Visit, "sync_state" | "conflict_detail"> {
  photos: PhotoRef[];
  is_deleted: boolean;
}

export type VisitPayload = Omit<VisitDto, "is_deleted">;

export interface VisitChangesPage {
  items: VisitDto[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  server_time: string;
}

export function fromDto(dto: VisitDto): Visit {
  return {
    id: dto.id,
    technician_id: dto.technician_id,
    farm_name: dto.farm_name,
    producer_name: dto.producer_name,
    producer_cpf: dto.producer_cpf,
    herd_size: dto.herd_size,
    checklist: dto.checklist,
    notes: dto.notes,
    status: dto.status,
    latitude: dto.latitude,
    longitude: dto.longitude,
    visited_at: dto.visited_at,
    updated_at: dto.updated_at,
    sync_state: "synced",
    conflict_detail: null,
  };
}

export function toPayload(visit: Visit, photos: PhotoRef[]): VisitPayload {
  return {
    id: visit.id,
    technician_id: visit.technician_id,
    farm_name: visit.farm_name,
    producer_name: visit.producer_name,
    producer_cpf: visit.producer_cpf,
    herd_size: visit.herd_size,
    checklist: visit.checklist,
    notes: visit.notes,
    status: visit.status,
    latitude: visit.latitude,
    longitude: visit.longitude,
    visited_at: visit.visited_at,
    updated_at: visit.updated_at,
    photos,
  };
}
```

Three things to notice:

- The `id` is born **on the device** (`crypto.randomUUID()`). That is what makes the `PUT`
  a safe upsert: sending the same visit twice does not create two.
- `sync_state` and `conflict_detail` are **local only** — the server never sees them. They
  tell the screen whether the visit is waiting for signal, already went, or hit a conflict.
- The photo keeps the `Blob` itself, not a URL. There is no server to point at in the
  pasture.

### 2. The session

```ts
// src/lib/auth.ts
import { createTempestAuth } from "tempest-react-sdk";

export interface Technician {
  id: string;
  name: string;
  email: string;
}

export const auth = createTempestAuth<Technician>({
  baseURL: import.meta.env.VITE_API_URL,
  prefix: "/api",
  mePath: "/auth/me",
});

export function currentTechnicianId(): string | null {
  return auth.useAuthStore.getState().user?.id ?? null;
}
```

[`createTempestAuth`](../integration-fastapi.md#5-turn-key-authentication-createtempestauth)
wires login, refresh and an already-authenticated `auth.api`. `currentTechnicianId` is read
outside React — by the sync engine and the database — so it is a function, not a hook.

### 3. The on-device database

```ts
// src/visits/db.ts
import { createOfflineDatabase } from "tempest-react-sdk";
import type { Visit, VisitPhoto } from "@/visits/types";

const database = createOfflineDatabase<{ visits: Visit; photos: VisitPhoto }>({
  databaseName: "CampoVisitas",
  version: 1,
  tables: {
    visits: {
      indexes: "&id, technician_id, visited_at, sync_state",
      ownerField: "technician_id",
    },
    photos: {
      indexes: "&id, visit_id, technician_id",
      ownerField: "technician_id",
    },
  },
});

export const visits = database.store<Visit>("visits");
export const photos = database.store<VisitPhoto>("photos");
```

Visits and photos live **in the same database**, through
[`createOfflineDatabase`](../offline.md#createofflinedatabase-several-tables-in-one-database).
They belong to each other: you read, delete and migrate them together.

`ownerField: "technician_id"` makes every `put`/`list` honour the owner. When two
technicians share the same co-op tablet, one does not see the other's visits.

!!! tip "Changed an index? Bump the `version`"
    Changing `indexes` without bumping `version` breaks opening the database. Details in
    [Offline › Migrations](../offline.md#migrations).

### 4. The sync engine — with the photos inside

This is the heart of the app.

```ts
// src/visits/sync.ts
import {
  createOfflineSync,
  createResumableUpload,
  encodeIdSegment,
  isApiError,
  lastWriteWins,
} from "tempest-react-sdk";
import { auth, currentTechnicianId } from "@/lib/auth";
import { photos, visits } from "@/visits/db";
import { listPhotos } from "@/visits/photos";
import {
  fromDto,
  toPayload,
  type PhotoRef,
  type Visit,
  type VisitChangesPage,
  type VisitDto,
} from "@/visits/types";

const PHOTO_CHUNK_SIZE = 256 * 1024;

async function uploadPendingPhotos(visitId: string): Promise<PhotoRef[]> {
  const list = await listPhotos(visitId);
  const refs: PhotoRef[] = [];

  for (const photo of list) {
    let url = photo.upload_url;
    if (url === null) {
      const done = await createResumableUpload({
        endpoint: auth.api.url("/uploads"),
        file: photo.blob,
        key: `visit-photo:${photo.id}`,
        chunkSize: PHOTO_CHUNK_SIZE,
        metadata: { visit_id: visitId, photo_id: photo.id, filetype: photo.blob.type },
        getToken: auth.getToken,
      }).start();
      if (done === null) throw new Error("Envio da foto interrompido.");
      url = done.url;
      await photos.update(photo.id, { upload_url: url });
    }
    refs.push({ id: photo.id, url, taken_at: photo.taken_at });
  }
  return refs;
}

export const visitSync = createOfflineSync<Visit, VisitDto>({
  databaseName: "CampoVisitasOutbox",
  watermark: { storageKey: "campo.visits.watermark" },
  getPrincipal: currentTechnicianId,
  foreignEntries: "hold",
  coalesce: true,

  deliver: async (entry) => {
    const visit = entry.payload;
    if (visit === undefined) return;

    try {
      const photoRefs = await uploadPendingPhotos(entry.recordId);
      await auth.api.put(`/visits/${encodeIdSegment(entry.recordId)}`, {
        body: toPayload(visit, photoRefs),
      });
    } catch (error) {
      if (isApiError(error) && error.status === 409 && error.code === "VISIT_LOCKED") {
        await visits.update(entry.recordId, {
          sync_state: "conflict",
          conflict_detail: error.detail,
        });
        return;
      }
      throw error;
    }

    const local = await visits.get(entry.recordId);
    if (local?.updated_at === visit.updated_at) {
      await visits.update(entry.recordId, { sync_state: "synced" });
    }
  },

  pullPage: async (since, cursor) => {
    const page = await auth.api.get<VisitChangesPage>("/visits/changes", {
      params: { since: since ?? undefined, cursor: cursor ?? undefined, limit: 100 },
    });
    return {
      items: page.items,
      nextCursor: page.has_more ? page.next_cursor : null,
      serverTime: page.server_time,
    };
  },

  applyRemote: async (dto) => {
    const owner = currentTechnicianId();
    if (owner === null) return;

    const local = await visits.get(dto.id);
    if (dto.is_deleted) {
      if (local?.sync_state !== "pending") await visits.delete(dto.id);
      return;
    }

    const remote = fromDto(dto);
    if (local?.sync_state === "pending") {
      const winner = lastWriteWins(local, remote, (visit) => visit.updated_at);
      if (winner === local) return;
    }
    await visits.put(remote, owner);
  },
});

export async function saveVisit(visit: Visit): Promise<void> {
  const owner = currentTechnicianId();
  if (owner === null) throw new Error("Sua sessão expirou. Entre de novo para salvar.");

  const existing = await visits.get(visit.id);
  const record: Visit = {
    ...visit,
    technician_id: owner,
    updated_at: new Date().toISOString(),
    sync_state: "pending",
    conflict_detail: null,
  };

  await visits.put(record, owner);
  await visitSync.enqueue(existing === undefined ? "create" : "update", record.id, record);
  void visitSync.flush("after-mutation");
}

export async function acceptServerVersion(visitId: string): Promise<void> {
  const owner = currentTechnicianId();
  if (owner === null) return;

  const dto = await auth.api.get<VisitDto>(`/visits/${encodeIdSegment(visitId)}`);
  await visits.put(fromDto(dto), owner);
}
```

Let's go piece by piece. 🔍

#### `saveVisit`: the device first, the network later

`saveVisit` writes to IndexedDB, puts the visit in the **outbox** and asks for a `flush`.
None of those three things needs a network. Without signal, the `flush` skips itself
(`summary.skipped`) and the entry waits — the screen has already answered.

`create`/`update` is just a label: since the route is an upsert, both become the same
`PUT`.

And `coalesce: true` folds the edits: a technician who saves the same visit ten times
without signal sends **one** `PUT` when the network returns, with the newest version — not
ten. The photos go up once either way (one that already has an `upload_url` is not sent
again), but without the option every intermediate `PUT` still spent a round-trip on a
signal that barely holds. Details, and what is not folded, in
[Ten edits, one request](../offline-sync.md#the-fast-path-createofflinesync).

#### `deliver`: the photos go up before the visit

[`createOfflineSync`](../offline-sync.md#the-fast-path-createofflinesync) calls `deliver`
once per outbox entry. Here it does two things, in this order:

1. **Uploads the photos that have no `upload_url` yet**, one by one, with
   [`createResumableUpload`](../resumable-upload.md).
2. **Sends the visit's `PUT`** with the photo URLs in the body.

Why do the photos live **inside** `deliver` and not in a separate queue? Because that way
they inherit everything the engine already does:

- If anything fails — photo 3 of 5, or the `PUT` — `deliver` throws, the entry **stays
  queued** with `attempts` bumped, and the next flush tries again.
- Photos 1 and 2 already got an `upload_url` and do not go up again.
- Photo 3 **resumes from the byte where it stopped**: the `key: "visit-photo:<id>"` is the
  same, so the resumable upload finds its record and continues with a `HEAD` + `PATCH`.
- Per-record order is preserved: a visit that failed does not let its next edit jump
  ahead. Other visits carry on normally.

!!! info "Why an explicit `key`"
    The resumable upload's default fingerprint uses the `File`'s name and `lastModified`.
    A `Blob` read from IndexedDB has neither, so two blobs of the same size would collide.
    With the photo `id` in the key, each photo has its own resume point. See
    [Resuming after a reload](../resumable-upload.md#resuming-after-a-reload).

!!! tip "Small chunks for bad signal"
    The resumable upload default is `DEFAULT_CHUNK_SIZE` (5 MiB), bigger than a whole
    compressed photo. With `chunkSize: 256 * 1024`, a signal drop loses at most a small
    piece. The cost is more round-trips — which is the trade you want on a 2G that drops.

`getToken: auth.getToken` is not an accident: with `createTempestAuth`'s own getter, the
resume point is bound to the **session**. If another technician signs in on the tablet,
they do not resume the previous one's upload. Details in
[`getToken: auth.getToken`](../resumable-upload.md#gettoken-authgettoken-the-record-belongs-to-the-session).

#### `getPrincipal`: the shared tablet

With `getPrincipal`, every outbox entry is stamped with whoever created it. Before each
delivery the engine checks again:

| Who is signed in at delivery | What happens |
| --- | --- |
| the same technician | delivered |
| nobody | stays queued until they come back |
| another technician | **stays queued**, unsent, until its owner is back |

The third row is `foreignEntries: "hold"`. It keeps the server from receiving Carlos's
inspection with Ana's token **and** keeps Carlos's work: if he signs out with pending
visits and Ana signs in and syncs, his visits stay on the tablet and go out when he signs
back in. The engine default (`"drop"`) would delete them — it suits a personal device, not
the cooperative's tablet. Details in
[Offline Sync › Shared device](../offline-sync.md#the-fast-path-createofflinesync).

A visit **of Carlos's** that Ana edits waits for his edit to go out first: per-record order
holds for held entries too.

#### `pullPage` and `applyRemote`: what comes from the office

The pull brings what changed on the server since the last `server_time`. `pullPage` only
translates the shape: `has_more` becomes `nextCursor: null` when the pages run out.

`applyRemote` decides the conflict, and the rule is simple:

- Local visit **already sent** (`synced` or `conflict`)? The server's replaces it.
- Local visit **pending**? The most recent by `updated_at` wins, through
  [`lastWriteWins`](../pwa.md#9-conflict-resolution). If the local one is newer, it stays,
  and the next flush sends it.
- Tombstone (`is_deleted`)? Delete — unless there is a pending local edit.

#### The `409 VISIT_LOCKED`: a conflict the machine does not settle

The supervisor approved the visit at the office. The technician, offline, still fixed the
head count. When the `PUT` arrives, the server refuses with `409 VISIT_LOCKED`.

Retrying does not help — the fifth attempt gets the same answer. So `deliver` **does not
throw**: it marks the local visit as `conflict`, keeps the server's sentence and
**resolves**. The entry leaves the queue, and the decision goes to whoever can make it:
the technician, on screen. `acceptServerVersion` fetches the office's version and writes it
over the local one.

??? note "Variant: conflict by `version` instead of the clock"
    `updated_at` comes from the **device** clock. A tablet with the wrong date (a battery
    that went flat, a wrong time zone) makes an old edit look new. If your backend keeps a
    `version` counter it increments on every write, extract the rule into a `pickWinner`
    and swap the comparison:

    === "By `updated_at` (default)"

        ```ts
        // src/visits/conflict.ts
        import { lastWriteWins } from "tempest-react-sdk";
        import type { Visit } from "@/visits/types";

        export function pickWinner(local: Visit, remote: Visit): Visit {
          return lastWriteWins(local, remote, (visit) => visit.updated_at);
        }
        ```

    === "By the server's `version`"

        ```ts
        // src/visits/conflict.ts
        import { higherVersionWins } from "tempest-react-sdk";

        export interface VersionedVisit {
          id: string;
          version: number;
        }

        export function pickWinner<T extends VersionedVisit>(local: T, remote: T): T {
          return higherVersionWins(local, remote, (visit) => visit.version);
        }
        ```

    In `applyRemote`, replace `lastWriteWins(...)` with `pickWinner(local, remote)`. In
    both, a tie goes to the server.

### 5. Photos on the device

```ts
// src/visits/photos.ts
import type { CompressedImage } from "tempest-react-sdk/imaging";
import { currentTechnicianId } from "@/lib/auth";
import { photos } from "@/visits/db";
import type { VisitPhoto } from "@/visits/types";

export async function addPhoto(visitId: string, image: CompressedImage): Promise<VisitPhoto> {
  const owner = currentTechnicianId();
  if (owner === null) throw new Error("Sua sessão expirou. Entre de novo para fotografar.");

  const photo: VisitPhoto = {
    id: crypto.randomUUID(),
    visit_id: visitId,
    technician_id: owner,
    blob: image.blob,
    bytes: image.bytes,
    taken_at: new Date().toISOString(),
    upload_url: null,
  };
  await photos.put(photo, owner);
  return photo;
}

export function listPhotos(visitId: string): Promise<VisitPhoto[]> {
  const owner = currentTechnicianId();
  if (owner === null) throw new Error("Your session expired. Sign in again to see the photos.");
  return photos.listBy("visit_id", visitId, owner, { orderBy: "taken_at" });
}
```

[`listBy`](../offline.md#listing-by-another-index-listby) goes through the `visit_id` index
and stays bound to the owner: calling `photos.raw.where("visit_id")` on Dexie directly also
used the index, but returned another technician's photo for the same visit. With nobody
signed in, the function throws instead of calling `listBy` without an owner — which would
list everyone's photos.

The photo enters the database with `upload_url: null`. Whoever sends it to the server is
`deliver`, the next time the visit syncs.

### 6. The screen's queries

```ts
// src/visits/use-visits.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { auth } from "@/lib/auth";
import { visits } from "@/visits/db";
import { listPhotos } from "@/visits/photos";
import type { Visit, VisitPhoto } from "@/visits/types";

export function useVisitList(): UseQueryResult<Visit[], Error> {
  const technicianId: string | null = auth.useAuthStore((state) => state.user?.id ?? null);

  return useQuery({
    queryKey: ["visits", "list", technicianId],
    enabled: technicianId !== null,
    networkMode: "always",
    queryFn: () =>
      visits.list(technicianId ?? undefined, { orderBy: "visited_at", reverse: true }),
  });
}

export function useVisit(visitId: string): UseQueryResult<Visit | null, Error> {
  return useQuery({
    queryKey: ["visits", "one", visitId],
    networkMode: "always",
    queryFn: async () => (await visits.get(visitId)) ?? null,
  });
}

export function useVisitPhotos(visitId: string): UseQueryResult<VisitPhoto[], Error> {
  return useQuery({
    queryKey: ["visits", "photos", visitId],
    networkMode: "always",
    queryFn: () => listPhotos(visitId),
  });
}
```

!!! danger "Without `networkMode: \"always\"`, the list stays loading forever in the pasture"
    TanStack Query **pauses** queries while the browser is offline — the default is
    `networkMode: "online"`. Here the `queryFn` reads IndexedDB, which needs no network at
    all, but the query never even runs: the screen sits on the skeleton until signal comes
    back. `networkMode: "always"` tells Query this function does not depend on the network.
    The measurement, and why the SDK does not change the default for the whole client, are in
    [Query → `networkMode`](../query.md#a-query-that-reads-only-indexeddb-networkmode-always).

### 7. Sync status: the panel and the sign-out button

```tsx
// src/components/SyncPanel.tsx
import { Alert, Button, Card, RelativeTime, useOfflineSync, useOnline } from "tempest-react-sdk";
import { visitSync } from "@/visits/sync";

export function SyncPanel() {
  const online = useOnline();
  const { pending, syncing, lastSyncedAt, lastError, flush } = useOfflineSync(visitSync, {
    flushOnOnline: false,
  });

  if (pending === 0 && lastError === null) return null;

  return (
    <Card title="Envio pendente" style={{ marginBottom: 16 }}>
      <p>
        {pending === 1
          ? "1 alteração esperando sinal."
          : `${pending} alterações esperando sinal.`}
      </p>
      {lastSyncedAt !== null && (
        <p>
          Último envio completo: <RelativeTime date={lastSyncedAt} />
        </p>
      )}
      {lastError !== null && (
        <Alert variant="warning" title="A última tentativa não terminou">
          {lastError}
        </Alert>
      )}
      <Button
        fullWidth
        loading={syncing}
        disabled={!online}
        onClick={() => void flush("manual")}
        style={{ marginTop: 12 }}
      >
        {online ? "Enviar agora" : "Sem sinal — envia sozinho quando voltar"}
      </Button>
    </Card>
  );
}
```

```tsx
// src/components/LogoutButton.tsx
import { LogOut } from "lucide-react";
import { Button } from "tempest-react-sdk";
import { auth } from "@/lib/auth";
import { visitSync } from "@/visits/sync";

export function LogoutButton() {
  async function signOut(): Promise<void> {
    visitSync.resetWatermark();
    await auth.logout();
  }

  return (
    <Button variant="ghost" iconOnly aria-label="Sair" onClick={() => void signOut()}>
      <LogOut size={18} />
    </Button>
  );
}
```

[`useOfflineSync`](../offline-sync.md#reactive-ui-and-auto-flush) subscribes the component
to the engine: `pending`, `syncing`, `lastSyncedAt` and `lastError` change on their own on
every run. The panel passes `flushOnOnline: false` because only one thing triggers the
upload — the `SyncRunner`, in `App`. `pending` also counts another technician's held
entries: Ana sees that Carlos's work is waiting on the tablet.

`lastError` shows why the last run failed. "Failed to fetch" in the pasture is routine;
what you want to see is a `401` or a `413` that will not go away on its own.

!!! warning "Signing out does not clear the outbox — on purpose"
    Logout calls `resetWatermark()`, not `clearOutbox()`. Clearing the queue would lose
    the day's work of someone who signed out without signal. With `getPrincipal` +
    `foreignEntries: "hold"`, the technician's entries stay **safe** until they come back,
    even if another technician signs in and syncs first — so the sign-out button has
    nothing to ask.

### 8. The camera

```tsx
// src/components/VisitPhotos.tsx
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { Badge, Button, EmptyState, Skeleton, formatBytes, useToast } from "tempest-react-sdk";
import { bestSupportedType, useImagePreview, useImageProcessing } from "tempest-react-sdk/imaging";
import { addPhoto } from "@/visits/photos";
import { useVisitPhotos } from "@/visits/use-visits";
import type { VisitPhoto } from "@/visits/types";

function PhotoThumb({ photo }: { photo: VisitPhoto }) {
  const { url } = useImagePreview(photo.blob);

  return (
    <figure style={{ margin: 0, display: "grid", gap: 4 }}>
      {url === null ? (
        <Skeleton height={96} />
      ) : (
        <img
          src={url}
          alt="Foto da vistoria"
          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }}
        />
      )}
      <figcaption>
        <Badge size="sm" variant={photo.upload_url === null ? "warning" : "success"}>
          {photo.upload_url === null ? formatBytes(photo.bytes) : "Enviada"}
        </Badge>
      </figcaption>
    </figure>
  );
}

export function VisitPhotos({ visitId, disabled }: { visitId: string; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const toast = useToast();
  const list = useVisitPhotos(visitId);
  const { compress, isWorking } = useImageProcessing();

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const type = await bestSupportedType(["image/webp", "image/jpeg"]);

    for (const file of files) {
      try {
        const image = await compress(file, {
          maxBytes: 400_000,
          width: 1600,
          height: 1600,
          fit: "contain",
          withoutEnlargement: true,
          type,
        });
        await addPhoto(visitId, image);
      } catch {
        toast.error("Não deu para processar a foto. Tente fotografar de novo.");
      }
    }
    await client.invalidateQueries({ queryKey: ["visits", "photos", visitId] });
  }

  return (
    <section>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(event) => void handleFiles(event)}
      />
      <Button
        variant="soft"
        fullWidth
        leftIcon={<Camera size={18} />}
        loading={isWorking}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        Tirar foto
      </Button>

      {list.isPending ? (
        <Skeleton height={96} style={{ marginTop: 12 }} />
      ) : list.isError ? (
        <p role="alert">Não deu para ler as fotos deste aparelho.</p>
      ) : list.data.length === 0 ? (
        <EmptyState
          title="Nenhuma foto"
          description="Fotografe bebedouros, cercas e o que mais o produtor precisar ver."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {list.data.map((photo) => (
            <PhotoThumb key={photo.id} photo={photo} />
          ))}
        </div>
      )}
    </section>
  );
}
```

`<input type="file" capture="environment">` opens **the phone's own camera app**, on the
rear camera. You get focus, flash and full resolution without asking for any permission —
and it works on the iPhone, where not every browser opens the camera inside the page.

A photo from a current phone is several MB. Storing that raw would fill the device in a few
days. So it goes through [`useImageProcessing`](../imaging.md#in-react) first:

- `width`/`height` 1600 with `fit: "contain"` — downscaling is what saves the most;
- `maxBytes: 400_000` — `compress` searches for the quality that fits the budget;
- `bestSupportedType` — WebP where the browser can encode it, JPEG where it cannot. Asking
  a browser that cannot encode WebP for it would return a PNG, several times bigger, with
  no error at all.

`useImagePreview` creates the `Blob`'s preview URL and **revokes** it on its own at unmount.

!!! warning "Re-encoding drops the photo's GPS"
    EXIF is gone after the re-encode, coordinates included. That protects the location of
    whoever takes the photo — but in an inspection you **want** to know where the photo was
    taken. That is why the location goes in the visit record, through `useGeolocation`,
    just below. See [Imaging › Re-encoding drops EXIF](../imaging.md#re-encoding-drops-exif).

??? tip "Variant: in-app viewfinder, with `captureFrame`"
    If the inspection needs guided framing (a frame for the animal's ear tag, for
    example), open the camera inside the page and capture a frame from the video:

    ```tsx
    // src/components/InlineCamera.tsx
    import { Button, useCameraStream } from "tempest-react-sdk";
    import { captureFrame, type CapturedFrame } from "tempest-react-sdk/imaging";

    export function InlineCamera({ onShot }: { onShot: (frame: CapturedFrame) => void }) {
      const camera = useCameraStream({
        constraints: { video: { facingMode: "environment" }, audio: false },
      });

      async function shoot(): Promise<void> {
        const video = camera.videoRef.current;
        if (video === null) return;
        onShot(await captureFrame(video, { width: 1600, type: "image/jpeg", quality: 0.85 }));
      }

      if (camera.status === "error") {
        return (
          <div role="alert">
            <p>{camera.error?.message}</p>
            <Button onClick={camera.retry}>Tentar de novo</Button>
          </div>
        );
      }

      return (
        <>
          <video ref={camera.videoRef} muted playsInline style={{ width: "100%" }} />
          <Button fullWidth disabled={camera.status !== "ready"} onClick={() => void shoot()}>
            Capturar
          </Button>
        </>
      );
    }
    ```

    `useCameraStream` comes from the root entry, which does not require `onnxruntime-web`.
    The price is a different one: the frame comes out at the video stream's resolution,
    usually lower than the native camera's. For an inspection photo, `<input capture>` is
    usually the better choice.

### 9. The visit screen

```tsx
// src/pages/VisitFormPage.tsx
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Alert,
  AppBar,
  Button,
  CPFInput,
  Checkbox,
  ErrorState,
  Input,
  Skeleton,
  Textarea,
  useGeolocation,
  useOnline,
  useToast,
  validateCPF,
} from "tempest-react-sdk";
import { ExportVisitButton } from "@/components/ExportVisitButton";
import { VisitPhotos } from "@/components/VisitPhotos";
import { acceptServerVersion, saveVisit } from "@/visits/sync";
import { useVisit } from "@/visits/use-visits";
import type { Visit, VisitChecklist, VisitStatus } from "@/visits/types";

const CHECKLIST: { key: keyof VisitChecklist; label: string }[] = [
  { key: "water", label: "Bebedouros limpos e com água" },
  { key: "fences", label: "Cercas e porteiras em bom estado" },
  { key: "vaccination", label: "Vacinação em dia (aftosa e brucelose)" },
  { key: "pasture", label: "Pastagem sem sinais de degradação" },
];

function blankVisit(id: string): Visit {
  const now = new Date().toISOString();
  return {
    id,
    technician_id: "",
    farm_name: "",
    producer_name: "",
    producer_cpf: "",
    herd_size: 0,
    checklist: { water: false, fences: false, vaccination: false, pasture: false },
    notes: "",
    status: "draft",
    latitude: null,
    longitude: null,
    visited_at: now,
    updated_at: now,
    sync_state: "pending",
    conflict_detail: null,
  };
}

function VisitForm({ initial, isNew }: { initial: Visit; isNew: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const [draft, setDraft] = useState<Visit>(initial);
  const [cpfError, setCpfError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const gps = useGeolocation({ enableHighAccuracy: true, timeout: 30_000, disabled: !isNew });
  const locked = draft.status === "approved";
  const coords = gps.coords;

  useEffect(() => {
    if (coords === null) return;
    setDraft((current) =>
      current.latitude === null
        ? { ...current, latitude: coords.latitude, longitude: coords.longitude }
        : current,
    );
  }, [coords]);

  function patch(changes: Partial<Visit>): void {
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function submit(status: VisitStatus): Promise<void> {
    if (!validateCPF(draft.producer_cpf)) {
      setCpfError("CPF inválido. Confira com o produtor.");
      return;
    }
    setSaving(true);
    try {
      await saveVisit({ ...draft, status });
      toast.success(
        online ? "Visita salva. Enviando…" : "Visita salva no aparelho. Sai quando tiver sinal.",
      );
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu para salvar a visita.");
    } finally {
      setSaving(false);
    }
  }

  async function takeServerVersion(): Promise<void> {
    try {
      await acceptServerVersion(draft.id);
      navigate("/");
    } catch {
      toast.error("Não deu para buscar a versão do escritório. Tente com sinal.");
    }
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit("done");
      }}
    >
      <AppBar
        title={isNew ? "Nova visita" : draft.farm_name}
        showBack
        onBack={() => navigate("/")}
        sticky
        safeArea
        actions={isNew ? undefined : <ExportVisitButton visit={draft} />}
      />

      <main style={{ padding: 16, paddingBottom: 120, display: "grid", gap: 16 }}>
        {draft.sync_state === "conflict" && (
          <Alert variant="danger" title="O escritório já fechou esta visita">
            <p>{draft.conflict_detail}</p>
            <Button variant="outline" disabled={!online} onClick={() => void takeServerVersion()}>
              Usar a versão do escritório
            </Button>
          </Alert>
        )}
        {locked && (
          <Alert variant="info" title="Visita aprovada">
            Só o supervisor pode alterar uma visita aprovada.
          </Alert>
        )}

        <Input
          label="Fazenda"
          required
          disabled={locked}
          value={draft.farm_name}
          onChange={(event) => patch({ farm_name: event.target.value })}
        />
        <Input
          label="Produtor"
          required
          disabled={locked}
          value={draft.producer_name}
          onChange={(event) => patch({ producer_name: event.target.value })}
        />
        <CPFInput
          label="CPF do produtor"
          required
          disabled={locked}
          value={draft.producer_cpf}
          error={cpfError}
          onChange={(value) => {
            setCpfError(undefined);
            patch({ producer_cpf: value });
          }}
        />
        <Input
          label="Cabeças no rebanho"
          type="number"
          inputMode="numeric"
          min={0}
          disabled={locked}
          value={String(draft.herd_size)}
          onChange={(event) => patch({ herd_size: Number(event.target.value) || 0 })}
        />

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend>Checklist</legend>
          {CHECKLIST.map((item) => (
            <Checkbox
              key={item.label}
              label={item.label}
              disabled={locked}
              checked={draft.checklist[item.key]}
              onChange={(event) =>
                patch({ checklist: { ...draft.checklist, [item.key]: event.target.checked } })
              }
            />
          ))}
        </fieldset>

        <Textarea
          label="Observações"
          rows={4}
          disabled={locked}
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
        />

        <p>
          {draft.latitude !== null && draft.longitude !== null
            ? `📍 ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}`
            : gps.loading
              ? "📍 Buscando GPS…"
              : "📍 Sem localização — a visita salva assim mesmo."}
        </p>

        <VisitPhotos visitId={draft.id} disabled={locked} />
      </main>

      {!locked && (
        <footer
          style={{
            position: "fixed",
            insetInline: 0,
            bottom: 0,
            display: "flex",
            gap: 8,
            padding: 16,
            background: "var(--tempest-surface)",
            borderTop: "1px solid var(--tempest-border)",
          }}
        >
          <Button
            type="button"
            variant="outline"
            fullWidth
            disabled={saving}
            onClick={() => void submit("draft")}
          >
            Salvar rascunho
          </Button>
          <Button type="submit" fullWidth loading={saving}>
            Concluir visita
          </Button>
        </footer>
      )}
    </form>
  );
}

export function VisitFormPage() {
  const { visitId = "" } = useParams();
  const query = useVisit(visitId);

  if (query.isPending) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }} aria-busy="true">
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Não deu para abrir esta visita"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <VisitForm
      key={visitId}
      initial={query.data ?? blankVisit(visitId)}
      isNew={query.data === null}
    />
  );
}
```

What happens on this screen:

- **Loading**: skeletons shaped like the form while IndexedDB answers.
- **Error**: [`ErrorState`](../components/feedback.md#errorstate) with "try again".
  Reading your own database almost never fails — but when it does (quota exceeded,
  private mode), the technician needs to know.
- **New vs. existing visit**: the route is `/visitas/:visitId`, and the `id` is already
  born in the list (`crypto.randomUUID()`). If the database does not have that `id`, it is
  a new visit.
- **GPS**: [`useGeolocation`](../geo.md) only turns on for a new visit. The phone's GPS
  does not need internet — only open sky, which the pasture has plenty of. 🛰️
- **CPF**: [`CPFInput`](../forms-br.md#masked-inputs) applies the mask and `validateCPF`
  checks the digits before saving.
- **Conflict and approved**: the `Alert` explains what happened. On an approved visit the
  fields are disabled and the action bar goes away.
- **Phone**: the action bar is **fixed at the bottom**, where the thumb reaches, and the
  page's `paddingBottom` keeps it from covering the last field.

### 10. The list

```tsx
// src/pages/VisitListPage.tsx
import { Plus } from "lucide-react";
import { useNavigate } from "react-router";
import {
  AppBar,
  Badge,
  EmptyState,
  ErrorState,
  FloatingActionButton,
  ListTile,
  Skeleton,
  SyncStatusBadge,
  formatDateTime,
} from "tempest-react-sdk";
import { LogoutButton } from "@/components/LogoutButton";
import { SyncPanel } from "@/components/SyncPanel";
import { visitSync } from "@/visits/sync";
import { useVisitList } from "@/visits/use-visits";
import type { VisitStatus, VisitSyncState } from "@/visits/types";

const STATUS_LABEL: Record<VisitStatus, string> = {
  draft: "Rascunho",
  done: "Concluída",
  approved: "Aprovada",
};

const SYNC_BADGE: Record<
  VisitSyncState,
  { label: string; variant: "warning" | "success" | "danger" }
> = {
  pending: { label: "Não enviada", variant: "warning" },
  synced: { label: "Enviada", variant: "success" },
  conflict: { label: "Conflito", variant: "danger" },
};

export function VisitListPage() {
  const navigate = useNavigate();
  const list = useVisitList();

  return (
    <>
      <AppBar
        title="Visitas"
        sticky
        safeArea
        actions={
          <>
            <SyncStatusBadge sync={visitSync} />
            <LogoutButton />
          </>
        }
      />

      <main style={{ padding: 16, paddingBottom: 96 }}>
        <SyncPanel />

        {list.isPending ? (
          <div style={{ display: "grid", gap: 8 }} aria-busy="true">
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : list.isError ? (
          <ErrorState
            title="Não deu para ler as visitas deste aparelho"
            description={list.error.message}
            onRetry={() => void list.refetch()}
          />
        ) : list.data.length === 0 ? (
          <EmptyState
            title="Nenhuma visita ainda"
            description="Toque em “Nova visita” na porteira da fazenda. Funciona sem sinal."
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {list.data.map((visit) => (
              <li key={visit.id}>
                <ListTile
                  title={visit.farm_name}
                  subtitle={`${visit.producer_name} · ${formatDateTime(visit.visited_at)} · ${STATUS_LABEL[visit.status]}`}
                  trailing={
                    <Badge size="sm" variant={SYNC_BADGE[visit.sync_state].variant}>
                      {SYNC_BADGE[visit.sync_state].label}
                    </Badge>
                  }
                  onClick={() => navigate(`/visitas/${visit.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <FloatingActionButton
        icon={<Plus />}
        label="Nova visita"
        onClick={() => navigate(`/visitas/${crypto.randomUUID()}`)}
      />
    </>
  );
}
```

The four states, each with the right component:

| State | What shows up |
| --- | --- |
| loading | three row-shaped [`Skeleton`](../components/feedback.md#skeleton)s |
| error | [`ErrorState`](../components/feedback.md#errorstate) with "try again" |
| empty | [`EmptyState`](../components/feedback.md#emptystate) saying what to do — and that it works without signal |
| with data | one [`ListTile`](../components/data.md#listtile) per visit, each with its own upload badge |

At the top, [`SyncStatusBadge`](../components/feedback.md#syncstatusbadge) takes the engine
as `sync={visitSync}`, subscribes to it on its own and shows the overall state: synced,
syncing, pending, offline or error. The **per-row** badge says which visit, specifically,
has not gone yet.

[`FloatingActionButton`](../components/actions.md#floatingactionbutton) sits in the bottom
right corner, within thumb reach. The list's `paddingBottom: 96` keeps it from covering the
last visit.

### 11. Export the visit (without a network)

The farmer wants the report **right now**, on his WhatsApp. Waiting for the server to
render a PDF at night is not an option.

```ts
// src/visits/export.ts
import { createZip, formatDateTime, writeXlsx } from "tempest-react-sdk";
import { listPhotos } from "@/visits/photos";
import type { Visit } from "@/visits/types";

function extensionOf(type: string): string {
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  return "jpg";
}

function yesNo(value: boolean): string {
  return value ? "Sim" : "Não";
}

export async function buildVisitZip(
  visit: Visit,
  onPercent: (percent: number) => void,
): Promise<Blob> {
  const photoList = await listPhotos(visit.id);

  const sheet = writeXlsx(
    ["Campo", "Valor"],
    [
      ["Fazenda", visit.farm_name],
      ["Produtor", visit.producer_name],
      ["CPF do produtor", visit.producer_cpf],
      ["Data da visita", formatDateTime(visit.visited_at)],
      ["Cabeças no rebanho", visit.herd_size],
      ["Bebedouros limpos e com água", yesNo(visit.checklist.water)],
      ["Cercas e porteiras em bom estado", yesNo(visit.checklist.fences)],
      ["Vacinação em dia", yesNo(visit.checklist.vaccination)],
      ["Pastagem sem degradação", yesNo(visit.checklist.pasture)],
      ["Latitude", visit.latitude],
      ["Longitude", visit.longitude],
      ["Observações", visit.notes],
      ["Fotos", photoList.length],
    ],
  );

  return createZip(
    [
      { path: "visita.xlsx", data: sheet },
      ...photoList.map((photo, index) => ({
        path: `fotos/foto-${String(index + 1).padStart(2, "0")}.${extensionOf(photo.blob.type)}`,
        data: photo.blob,
      })),
    ],
    {
      onProgress: ({ loaded, total }) =>
        onPercent(total === 0 ? 100 : Math.round((loaded / total) * 100)),
    },
  );
}
```

```tsx
// src/components/ExportVisitButton.tsx
import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button, Progress, shareOrDownloadBlob, useToast } from "tempest-react-sdk";
import { buildVisitZip } from "@/visits/export";
import type { Visit } from "@/visits/types";

export function ExportVisitButton({ visit }: { visit: Visit }) {
  const toast = useToast();
  const [percent, setPercent] = useState<number | null>(null);
  const [zip, setZip] = useState<Blob | null>(null);

  async function generate(): Promise<void> {
    setPercent(0);
    try {
      setZip(await buildVisitZip(visit, setPercent));
    } catch {
      toast.error("Não deu para montar o arquivo da visita.");
    } finally {
      setPercent(null);
    }
  }

  async function share(file: Blob): Promise<void> {
    await shareOrDownloadBlob(file, `visita-${visit.id.slice(0, 8)}.zip`, {
      title: `Visita — ${visit.farm_name}`,
    });
    setZip(null);
  }

  if (percent !== null) {
    return <Progress value={percent} showLabel label="Montando o arquivo" />;
  }
  if (zip !== null) {
    return (
      <Button size="sm" leftIcon={<Share2 size={16} />} onClick={() => void share(zip)}>
        Compartilhar
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void generate()}>
      Exportar
    </Button>
  );
}
```

- [`writeXlsx`](../utilities.md#spreadsheets-xlsx-writexlsx) builds the sheet in memory.
  Numbers go in as numbers (Excel sums them), `null` becomes an empty cell, accents
  survive.
- [`createZip`](../utilities.md#zip-archives-createzip) builds the archive in slices,
  without freezing the screen, and **stores** the photos without recompressing — they are
  already WebP/JPEG. `onProgress` feeds the [`Progress`](../components/feedback.md#progress).
- [`shareOrDownloadBlob`](../share.md#export-a-file-shareordownloadblob) opens the phone's
  share sheet (WhatsApp, e-mail, Drive) and downloads on desktop.

!!! tip "Why two taps: \"Exportar\" and then \"Compartilhar\""
    The browser only opens the share sheet right after a user tap (the *transient
    activation*). Building a ZIP with ten photos takes time, and by the end of it that
    window may have closed — then `navigator.share` refuses and `shareOrDownloadBlob` falls
    back to a download. Splitting "build" from "share" makes the second tap open the sheet
    right away.

!!! danger "The ZIP carries the farmer's CPF"
    Personal data leaving the app over WhatsApp is processing of personal data under the
    LGPD (Brazil's data protection law). Confirm with the co-op's legal team that the
    farmer receives **their own** report and that this is an intended use. If you do not
    need the CPF in the sheet, drop the row.

### 12. The app and the service worker

```tsx
// src/App.tsx
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import {
  Banner,
  Button,
  OfflineIndicator,
  QueryProvider,
  ToastProvider,
  UpdatePrompt,
  useOfflineSync,
  useServiceWorkerUpdate,
  useStorageEstimate,
} from "tempest-react-sdk";
import { VisitFormPage } from "@/pages/VisitFormPage";
import { VisitListPage } from "@/pages/VisitListPage";
import { visitSync } from "@/visits/sync";

function SyncRunner() {
  const client = useQueryClient();
  useOfflineSync(visitSync, { flushOnMount: true, flushOnOnline: true, intervalMs: 120_000 });

  useEffect(
    () =>
      visitSync.subscribe(() => {
        void client.invalidateQueries({ queryKey: ["visits"] });
      }),
    [client],
  );

  return null;
}

function StorageGuard() {
  const storage = useStorageEstimate();

  if (storage.persisted === false) {
    return (
      <Banner
        variant="warning"
        title="Proteja as visitas deste aparelho"
        action={<Button size="sm" onClick={() => void storage.requestPersist()}>Proteger</Button>}
      >
        Sem isso, o navegador pode apagar visitas e fotos não enviadas quando faltar espaço.
      </Banner>
    );
  }
  if (storage.ratio !== null && storage.ratio > 0.8) {
    return (
      <Banner variant="danger" title="Armazenamento quase cheio">
        Envie as visitas pendentes antes de tirar mais fotos.
      </Banner>
    );
  }
  return null;
}

function ServiceWorkerGate() {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });
  return <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />;
}

export function App() {
  return (
    <QueryProvider>
      <ToastProvider position="top-center">
        <BrowserRouter>
          <OfflineIndicator position="top" />
          <StorageGuard />
          <SyncRunner />
          <Routes>
            <Route path="/" element={<VisitListPage />} />
            <Route path="/visitas/:visitId" element={<VisitFormPage />} />
          </Routes>
          <ServiceWorkerGate />
        </BrowserRouter>
      </ToastProvider>
    </QueryProvider>
  );
}
```

```ts
// src/sw.ts
import { installPrecache, installSkipWaitingListener } from "tempest-react-sdk/sw";

installSkipWaitingListener();

installPrecache({
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
});
```

- **`SyncRunner`** is the only place that triggers the upload: at boot, when the network
  comes back and every two minutes. `flush` is single-flight, so triggers that coincide
  become one run. On every engine change it invalidates the `["visits"]` queries, and the
  list shows the new badge without a reload.
- **`StorageGuard`** uses [`useStorageEstimate`](../pwa.md#4-durability-request-persistent-storage).
  Without persistent storage the browser may **evict** IndexedDB under disk pressure — and
  here IndexedDB holds work that does not exist anywhere else yet.
- **`OfflineIndicator`** shows the offline bar and flashes a confirmation when signal comes
  back.
- **`UpdatePrompt`** asks before swapping versions. Reloading on its own in the middle of
  an inspection would wipe what is typed in the form.
- **`sw.ts`** only precaches the app shell, so the app opens without a network. See
  [PWA](../pwa.md#2-precache-runtime-cache-navigation-preload).

!!! info "Why this `sw.ts` has no `installBackgroundSync`"
    In this app, the outbox is what resends, and the tus upload resumes by itself. The
    `--pwa` template already keeps tus out of background sync; if you keep the scaffold's
    `installBackgroundSync`, add `"/api/visits/"` to `RETRIED_BY_THE_PAGE` in
    `src/sw-sync-scope.ts`, or a `PUT /api/visits/…` that failed offline goes out of both
    queues. See [One queue per mutation](../scaffold.md#background-sync-offline-mutations-that-resend-themselves).

## Testing in the field (without going to the field)

1. Open the app in Chrome, sign in and let the service worker install.
2. DevTools → **Network** → **Offline**. Create two visits with photos. The list shows
   "Não enviada"; the badge at the top, "Offline".
3. Reload the page while still offline. Everything is still there — the app shell from the
   precache, the data from IndexedDB. ✅
4. Switch to **Slow 3G** and save. While a photo is uploading, go back to **Offline** and
   then to **Slow 3G**. In the Network tab, the upload resumes with a `HEAD` followed by a
   `PATCH` from the offset — not a new `POST`.
5. On the server, mark a visit as approved. Edit it in the app and save: it shows up as
   "Conflito", with the server's sentence.
6. DevTools → **Device Toolbar** → a 360 px phone. The action bar stays at the bottom and
   the "Nova visita" button does not cover the list.

!!! check "What you should see at the end"
    No visit lost, no visit duplicated on the server, and each photo sent **once**, even
    with drops in the middle.

## Recap

- 🗄️ **`createOfflineDatabase`** keeps visits and photos (as `Blob`s) in the same database,
  owned per technician.
- 📤 **`createOfflineSync`** is the outbox: `saveVisit` writes locally and enqueues; the
  upload happens whenever it can, and `coalesce: true` folds the edits of one visit into a
  single `PUT`.
- 📸 Photos go up **inside `deliver`** with **`createResumableUpload`** and a per-photo
  `key` — a failure retries, a drop resumes from the offset, a sent photo does not go up
  again.
- ⚖️ Conflicts come in two kinds: the one the machine settles (`lastWriteWins` in
  `applyRemote`) and the one the technician settles (`409 VISIT_LOCKED` becomes the
  `conflict` state on screen).
- 🗜️ **`useImageProcessing` + `bestSupportedType`** shrink the photo on the device; GPS
  goes in the record, because the re-encode drops EXIF.
- 🟢 **`SyncStatusBadge`**, **`useOfflineSync`** and **`OfflineIndicator`** tell the
  technician what is going on; with `foreignEntries: "hold"`, signing out never risks the
  queue.
- 📦 **`writeXlsx` + `createZip` + `shareOrDownloadBlob`** deliver the report without a
  network.
- 🔒 **`useStorageEstimate`** asks for persistent storage; `UpdatePrompt` does not swap
  versions mid-inspection; the service worker only precaches.
- ⚠️ **`networkMode: "always"`** on the queries that read IndexedDB, or they pause offline.

## See also

- [Offline Sync (FastAPI)](../offline-sync.md) — the outbox engine, piece by piece
- [Offline (IndexedDB)](../offline.md) — `createOfflineStore` and `createOfflineDatabase`
- [Resumable upload (tus)](../resumable-upload.md) — resuming, keys and what the backend implements
- [Imaging](../imaging.md) — downscale, compress and capture frames in the browser
- [PWA & Offline-First](../pwa.md) — service worker, durability and status UI
- [Utilities](../utilities.md) — `writeXlsx`, `createZip` and friends
