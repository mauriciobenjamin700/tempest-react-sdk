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

!!! note "It also catches the worker that was already waiting"
    The common case fires no event at all: the user opened the app after a deploy (the new worker installed and went to `waiting`), closed the tab, and came back later. On that second visit `updatefound` never fires — `install` already happened. `registerServiceWorker` reads `registration.waiting` as soon as the registration resolves, so `updateAvailable` flips just the same. Each worker is announced **once**, even when both routes apply in one session, and neither fires on a first install (no `controller`) — that is `onReady`, not an update.

!!! tip "Keep `autoUpdate` off here"
    `useServiceWorkerUpdate` exists to hand the reload decision to the user. If you want a silent reload instead, call `registerServiceWorker({ url, autoUpdate: true })` directly, without the hook.

## 2. Precache + runtime cache + navigation preload

Inside your `sw.ts`, register specific routes **before** the precache (so they win over the catch-all):

```ts
/// <reference lib="webworker" />
import { installRuntimeCache, installPrecache } from "tempest-react-sdk/sw";

installRuntimeCache([
  { match: /\/api\//, strategy: "network-first", cacheName: "tempest-api", maxAgeSeconds: 300 },
  { match: /\.(png|jpg|webp)$/, strategy: "cache-first", cacheName: "tempest-img", maxEntries: 60 },
]);

installPrecache(); // app shell + offline navigation
```

`installPrecache` enables the **Navigation Preload API** on `activate` by default (`navigationPreload: true`): the browser fetches the navigation request in parallel with the worker boot and the handler serves `event.preloadResponse`, cutting first-navigation latency after the worker starts.

!!! note "Where the manifest comes from"
    `installPrecache` reads `precache-manifest.json`, emitted by the `tempestPwaManifest()` plugin from the `tempest-react-sdk/vite` subpath. See [Vite config](./vite-config.md).

!!! warning "Deploying to a subpath (GitHub Pages and friends)"
    `tempestPwaManifest()` prefixes the URLs with Vite's `base`, but `installPrecache` runs inside the worker and **cannot** see that config. When your `base` is not `/`, point both path options inside it:

    ```ts
    installPrecache({
      manifestUrl: "/my-app/precache-manifest.json",
      navigateFallback: "/my-app/index.html",
    });
    ```

    With the defaults (`/precache-manifest.json` and `/index.html`) the worker installs, fetches a manifest that 404s, and offline navigation never resolves.

### Authenticated responses stay out of the cache (unless you ask)

Cache Storage is keyed by **URL** and outlives logout. Left alone, account A's `GET /api/me` stays there and is served to account B on the same browser as soon as the network drops — or takes longer than `networkTimeoutSeconds`. Measured in Chromium 153 (11/10/2026), before 0.77.0: B, offline, received A's body.

So `installRuntimeCache` enforces four rules on its own:

- **A request carrying a credential header goes straight to the network** — `Authorization`, `X-Api-Key`, `X-Auth-Token` and the rest of `DEFAULT_CREDENTIAL_HEADERS` (override per route with `credentialHeaders`): the route neither reads nor writes the cache, as if the service worker did not exist for it.
- **`Cache-Control: no-store` is never stored**, and **`private`** only with the opt-in.
- **`maxAgeSeconds` also applies to the fallback**: an expired entry is a miss, never an offline "last resort". This holds for `network-first` and `stale-while-revalidate`.
- **Age counts from the write**, not from the `Date` header — which a CORS response does not expose, so for an API on another origin `maxAgeSeconds` never expired anything.

Do you really want authenticated data offline? Turn on `cacheAuthenticated` for the route:

```ts
/// <reference lib="webworker" />
import { installRuntimeCache } from "tempest-react-sdk/sw";

installRuntimeCache([
  {
    match: /\/api\//,
    strategy: "network-first",
    cacheName: "tempest-api",
    networkTimeoutSeconds: 5,
    maxAgeSeconds: 300,
    cacheAuthenticated: true,
  },
]);
```

With the opt-in, every entry is stored with `Vary` on each credential header the request carried (`Vary: authorization`, for example): the Cache API only returns it for the **same** credential. Another account (or none) misses instead of reading the data. A token rotated while online simply rewrites the entry.

The revalidation that keeps going after the response — the `stale-while-revalidate` refresh and the network request that lost to `networkTimeoutSeconds` — is handed to `event.waitUntil`, so the browser does not stop the worker mid-write.

!!! warning "Limit: cookie sessions"
    The service worker **cannot see** the request's `Cookie`, so it cannot tell a cookie-session API from a public GET. Gating on `request.credentials` does not help: it would switch off caching for every same-origin image and font. For a cookie-session API, cache privacy depends on two things outside the SDK:

    - the server sending `Cache-Control: private` (or `no-store`) on personal responses — the SDK honours it;
    - the app calling [`clearSessionData()`](#6-logout-clear-the-session-data) on logout.

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

### Credentials never reach IndexedDB

The queue lives in the `tempest-bg-sync` IndexedDB database and outlives logout. So `installBackgroundSync` **removes the credential headers** before writing — `Authorization` and the rest of `DEFAULT_CREDENTIAL_HEADERS` (`x-api-key`, `x-auth-token`, `x-csrf-token`, …). Before 0.77.0 the bearer stayed readable there after logout and the mutation was replayed with the old identity (measured in Chromium 153, 11/10/2026).

Entries written by earlier versions are scrubbed too: on the first open after the update, the database migrates and deletes their credential headers from disk. On replay the list is applied again, so no entry goes out with the credential it stored.

On replay, the worker asks the open pages for the **current** credentials, over `postMessage` (a message of type `BACKGROUND_SYNC_CREDENTIALS_MESSAGE`, with a `MessagePort` for the answer). Install the provider once, next to your auth — the `--pwa` template already does it in `src/pwa.tsx`:

```ts
import { createTempestAuth } from "tempest-react-sdk";
import { provideBackgroundSyncCredentials } from "tempest-react-sdk/sw";

export const auth = createTempestAuth<{ id: string }>({ baseURL: "https://api.example.com" });

provideBackgroundSyncCredentials(
  () => {
    const { token } = auth.useAuthStore.getState();
    return token ? { Authorization: `Bearer ${token}` } : null;
  },
  { getPrincipal: () => auth.useAuthStore.getState().user?.id },
);
```

!!! warning "Without a provider, no mutation is replayed"
    The queue does not keep the token, so only the page can hand it back — and only the page can say who is signed in. Without `provideBackgroundSyncCredentials`, the tab does not answer, the entry's owner is **unknown**, and it stays pending until `maxRetentionMinutes` and is gone, whether or not it carried a credential header. In development builds the worker warns in the console (once per replay). A cookie-session API with no token installs the provider all the same: `provideBackgroundSyncCredentials(() => null, { getPrincipal })`.

#### Every entry has an owner

`getPrincipal` binds the mutation to whoever made it. Right after queueing, the worker asks the tab that issued the request who is signed in and stores a **SHA-256 fingerprint** of that id on the entry — never the id or the token. The question does not delay the `fetch` rejection; until it comes back (up to 6 s), replay keeps the entry pending.

The owner is in one of three states:

| State | When | Replay |
| -- | -- | -- |
| **owned** | the tab answered with `getPrincipal` | only goes out with the answer of a tab where the **same** owner is signed in; none matches → dropped |
| **unowned** | the tab answered without `getPrincipal` | any answer will do (preferring one without a principal) |
| **unknown** | nobody answered, `getPrincipal` threw, the tab was gone (or there was none), the stamp was lost past the 6 s, or the entry predates 0.77 | **fails closed**, with or without a credential header: only goes out with the answer of a tab without a principal; every tab has one → dropped; no answer → stays pending |

On replay the worker asks **every** tab in parallel, under one 3 s deadline, and uses the answer that fits — another account's tab answering first no longer drops A's mutation. Then:

| Chosen answer | Replay |
| -- | -- |
| headers including every stripped one | sent with them — only the header **names** the original request carried, so always returning `Authorization` never leaks the token to a URL that did not receive it |
| headers missing a stripped one | stays pending (it does not go out anonymous to take a 401 and vanish) |
| `null` (no session) | dropped, unsent |
| no valid answer | stays pending until `maxRetentionMinutes` |

Only an **unowned** entry with no credential header is replayed as it was, without asking. An entry whose owner is **unknown** asks even without a header: on a cookie-session API (`credentials: "include"`), the browser attaches on replay the cookie of whoever is signed in at that moment, so replaying unchecked would send A's mutation with B's session (as it did up to 0.77.0). A provider error (`getHeaders` or `getPrincipal` throwing) comes back as an explicit `{ error: true }`, never as silence.

Measured in Chromium 153 (11/10/2026), with a real service worker, IndexedDB and two tabs: A queues offline, B signs in without clearing anything, the sync fires — the server receives no POST; with B's tab open next to it, A's mutation goes out with A's refreshed token.

There is one replay per queue: `sync`, `periodicsync` and the Safari fallback firing together share the same pass, so a mutation is never sent twice. And `clearBackgroundSyncQueue()` reaches work in flight: each entry is checked against the database right before it goes out, and a request still failing when the queue was cleared is not written afterwards.

Outside that path, `installBackgroundSync` has two knobs:

- **`credentialHeaders`** — the list of headers removed. For a custom one: `[...DEFAULT_CREDENTIAL_HEADERS, "x-tenant-key"]`. The provider must return all of them.
- **`beforeReplay(request, { queuedAt, strippedHeaders, ownerState, owner })`** — replaces the request to the pages: return the `Request` to send, `null` to drop, or throw to keep it pending. Useful when the worker can get the credential by itself; `ownerState`/`owner` let it apply the same owner rule.

!!! warning "Limit: credentials in the URL or the body"
    Only **headers** leave the queue. A token in the query string (`?access_token=…`) or inside the mutation body is stored as sent. Send credentials in a header.

!!! warning "`credentialHeaders: []` brings the old behavior back"
    With an empty list, every header — bearer included — goes to IndexedDB in plain text and is replayed as stored. It is an explicit choice, for apps with no open page at replay time that accept the risk.

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

For a "X MB cached" readout or a "clear cache" button, use the main-thread helpers:

```ts
import { inspectCaches, clearCaches } from "tempest-react-sdk/sw";

const reports = await inspectCaches({ filter: "tempest-" });
const totalMb = reports.reduce((n, r) => n + (r.bytes ?? 0), 0) / 1e6;

await clearCaches("tempest-img"); // one specific bucket
```

`inspectCaches` measures bytes by default (reading each response); pass `measureBytes: false` for a fast, count-only report.

## 6. Logout: clear the session data

The runtime cache and the background-sync queue belong to the **browser**, not to the user: the next account that signs in inherits both. On logout, call `clearSessionData()`:

```ts
import { createTempestAuth } from "tempest-react-sdk";
import { clearSessionData } from "tempest-react-sdk/sw";

export const auth = createTempestAuth({ baseURL: "https://api.example.com" });

export async function signOut() {
  await clearSessionData();
  auth.logout();
}
```

It deletes **every** Cache Storage bucket except the app-shell precache (`tempest-precache-*`), plus the whole `tempest-bg-sync` queue. It returns `{ caches, queueCleared }` with what it removed.

Why not a prefix: before 0.77.0 the docs said `clearCaches("tempest-")` on logout, and the recipe named the cache `api` — the prefix did not match and **nothing** was deleted. Worse, it would match `tempest-precache-*` and break the app offline. The default filter inverts the logic, so it works whatever `cacheName` you chose. To narrow it, pass `caches` (a `CacheFilter`); for a queue with another name, `queueName`. Just the queue: `clearBackgroundSyncQueue()`.

!!! tip "It runs in the page"
    Cache Storage and IndexedDB are origin storage, reachable from `window` — no message to the service worker needed. If your auth exposes an end-of-session callback, call `clearSessionData()` there too, to cover a session that expires on its own. With `getPrincipal` on the provider and the token in a header, the queue no longer depends on it to keep its owner — the runtime cache still does. With a cookie session, the owner check trusts that each tab's `getPrincipal` reflects the cookie the browser will send; a tab with stale state (A still in memory while B signed in on another tab) authorizes the replay with B's cookie. So, with cookies, call `clearSessionData()` on logout even when using `getPrincipal`.

## 7. Offline status UI

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

## 8. Reactive sync-engine hooks

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

## 9. Conflict resolution

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
- **`installPrecache`** enables navigation preload; **`installRuntimeCache`** covers the Workbox-like strategies and keeps authenticated responses out of the cache unless `cacheAuthenticated`.
- **`installBackgroundSync`** + **`registerPeriodicSync`** replay offline mutations, with or without a fresh navigation — without storing credentials; **`provideBackgroundSyncCredentials`** supplies the current ones at replay.
- **`clearSessionData`** on logout clears the runtime cache and the queue. 🔒
- **`useStorageEstimate`** + **`requestPersistentStorage`** prevent IndexedDB eviction.
- **`inspectCaches`/`clearCaches`** give cache visibility and cleanup.
- **`<OfflineIndicator>` / `<SyncStatusBadge>` / `useOfflineSync` / `useSyncStatus`** assemble the reactive status UI. 🚀
