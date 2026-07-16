# PWA & Offline-First

`tempest-react-sdk` ships everything a Tempest app needs to become an **offline-first PWA** — with no dependency on Workbox or `vite-plugin-pwa`. This page is the map: service-worker registration and updates, caching, background sync, storage durability and the status UI. The **sync engine** (`createOfflineSync`) has its own recipe in [Offline Sync (FastAPI)](./offline-sync.md) — here we cover the PWA layer around it.

!!! info "The pieces"
    | Layer | What it does | Where it runs |
    | -- | -- | -- |
    | `tempest-react-sdk/vite` | generates manifest, icons, dev SW | build (Vite) |
    | `tempest-react-sdk/sw` | precache, runtime cache, background sync | inside `sw.ts` |
    | hooks + components | update, status, quota, indicators | main thread (React) |

## 1. Register the service worker and update with consent

`registerServiceWorker` handles `register()` + update detection. For the **user-driven** flow ("New version — update"), use the `useServiceWorkerUpdate` hook with the `<UpdatePrompt>` component:

```tsx
import { useServiceWorkerUpdate, UpdatePrompt } from "tempest-react-sdk";

export function ServiceWorkerGate() {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });
  return <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />;
}
```

When a new worker finishes installing, `updateAvailable` flips to `true`; `applyUpdate()` activates the waiting worker (`skipWaiting`) and reloads the page once it takes control.

!!! tip "Keep `autoUpdate` off here"
    `useServiceWorkerUpdate` exists to hand the reload decision to the user. If you want a silent reload instead, call `registerServiceWorker({ url, autoUpdate: true })` directly, without the hook.

## 2. Precache + runtime cache + navigation preload

Inside your `sw.ts`, register specific routes **before** the precache (so they win over the catch-all):

```ts
/// <reference lib="webworker" />
import { installRuntimeCache, installPrecache } from "tempest-react-sdk/sw";

installRuntimeCache([
  { match: /\/api\//, strategy: "network-first", cacheName: "api", maxAgeSeconds: 300 },
  { match: /\.(png|jpg|webp)$/, strategy: "cache-first", cacheName: "img", maxEntries: 60 },
]);

installPrecache(); // app shell + offline navigation
```

`installPrecache` enables the **Navigation Preload API** on `activate` by default (`navigationPreload: true`): the browser fetches the navigation request in parallel with the worker boot and the handler serves `event.preloadResponse`, cutting first-navigation latency after the worker starts.

!!! note "Where the manifest comes from"
    `installPrecache` reads `precache-manifest.json`, emitted by the `tempestPwaManifest()` plugin from the `tempest-react-sdk/vite` subpath. See [Vite config](./vite-config.md).

## 3. Background sync + periodic sync

`installBackgroundSync` queues mutating requests (`POST`/`PUT`/`PATCH`/`DELETE`) that fail offline and replays them when the network returns — via the Background Sync API, with an opportunistic fallback for browsers without it (Safari).

```ts
import { installBackgroundSync } from "tempest-react-sdk/sw";

installBackgroundSync({ match: (url) => url.pathname.startsWith("/api/") });
```

To replay even **without a fresh navigation**, register a periodic sync on the main thread. The SW already listens for the `periodicsync` event:

```ts
import { registerPeriodicSync } from "tempest-react-sdk/sw";

const registration = await navigator.serviceWorker.ready;
await registerPeriodicSync({ registration, minIntervalMinutes: 360 });
```

`registerPeriodicSync` checks the `periodic-background-sync` permission first and returns `false` when unavailable (Chrome-only) — calling it unconditionally is safe.

## 4. Durability: request persistent storage

Without `navigator.storage.persist()`, the browser may **evict** IndexedDB and Cache Storage under disk pressure — fatal for offline data. `useStorageEstimate` shows usage/quota and exposes the action to make storage persistent:

```tsx
import { useStorageEstimate } from "tempest-react-sdk";

function StorageMeter() {
  const { usage, quota, ratio, persisted, requestPersist } = useStorageEstimate();
  return (
    <div>
      <progress value={ratio ?? 0} />
      <span>
        {((usage ?? 0) / 1e6).toFixed(1)} of {((quota ?? 0) / 1e6).toFixed(0)} MB
      </span>
      {!persisted && <button onClick={requestPersist}>Make persistent</button>}
    </div>
  );
}
```

Outside React, use the pure functions `estimateStorage()` and `requestPersistentStorage()`.

## 5. Cache observability

For a "X MB cached" readout or a "clear cache" action on logout, use the main-thread helpers:

```ts
import { inspectCaches, clearCaches } from "tempest-react-sdk/sw";

const reports = await inspectCaches({ filter: "tempest-" });
const totalMb = reports.reduce((n, r) => n + (r.bytes ?? 0), 0) / 1e6;

await clearCaches("tempest-"); // on logout
```

`inspectCaches` measures bytes by default (reading each response); pass `measureBytes: false` for a fast, count-only report.

## 6. Offline status UI

Two ready-made components, driven by `useOnline` and the sync engine:

```tsx
import { OfflineIndicator, SyncStatusBadge, useSyncStatus } from "tempest-react-sdk";
import { notesSync } from "@/sync/engine";

function StatusBar() {
  const { tone, pending } = useSyncStatus(notesSync);
  return (
    <>
      <OfflineIndicator position="top" />
      <SyncStatusBadge tone={tone} pending={pending} />
    </>
  );
}
```

- **`<OfflineIndicator>`** — a fixed bar that appears offline and flashes a confirmation on reconnect. Renders nothing while online, so it is safe to mount at the app root.
- **`<SyncStatusBadge>`** — a pill with icon + label + pending count, driven by `useSyncStatus(sync).tone`.

## 7. Reactive sync-engine hooks

`useOfflineSync` subscribes a component to an `OfflineSync` engine and optionally flushes on mount, on the `online` event and on an interval:

```tsx
import { useOfflineSync } from "tempest-react-sdk";
import { notesSync } from "@/sync/engine";

function useNotesSync() {
  return useOfflineSync(notesSync, { flushOnMount: true, intervalMs: 30_000 });
  // → { phase, pending, syncing, lastSummary, lastError, lastSyncedAt, enqueue, flush }
}
```

For **optimistic** mutations that write to the outbox and patch the TanStack Query cache (with rollback on failure), use `useOfflineMutation` — see [Query](./query.md#useofflinemutation).

## 8. Conflict resolution

The pull overwrites the local record with the server version. When you need an explicit policy inside `applyRemote`, the helpers cover the two common cases (ties → remote wins):

```ts
import { lastWriteWins, higherVersionWins } from "tempest-react-sdk";

applyRemote: async (dto) => {
  const local = await store.get(dto.id);
  await store.save(lastWriteWins(local, dto, (r) => r.updatedAt));
};
```

## Recap

- **`useServiceWorkerUpdate` + `<UpdatePrompt>`** give the consent-based update flow. ✅
- **`installPrecache`** enables navigation preload; **`installRuntimeCache`** covers the Workbox-like strategies.
- **`installBackgroundSync`** + **`registerPeriodicSync`** replay offline mutations, with or without a fresh navigation.
- **`useStorageEstimate`** + **`requestPersistentStorage`** prevent IndexedDB eviction.
- **`inspectCaches`/`clearCaches`** give cache visibility and cleanup.
- **`<OfflineIndicator>` / `<SyncStatusBadge>` / `useOfflineSync` / `useSyncStatus`** assemble the reactive status UI. 🚀
