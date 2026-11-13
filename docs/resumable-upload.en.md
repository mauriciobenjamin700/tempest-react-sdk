# Resumable upload (tus)

`uploadWithProgress` makes **one** request. That works until the file gets big: a 40-minute recording from `useAudioRecorder`, a video, a dump. Then a 4G connection that wobbles for three seconds throws away the 300 MB already sent, and reloading the page throws it away again.

`createResumableUpload` splits the file into chunks, remembers where it stopped, and carries on — after a network drop **or** a reload.

!!! info "Protocol: tus 1.0.0, not something we invented"
    The client speaks [tus](https://tus.io) (core plus the *creation* and *termination* extensions). That is deliberate: a resumable client with a private wire format means the backend is ours forever. With tus you can point it at `tusd`, `tus-node-server` or `py-tus` without writing a server at all — and the [What your backend must implement](#what-your-backend-must-implement) section fits in one table.

<!-- gallery:recipe-resumable-upload -->
[![Upload resumível (tus) in the gallery](assets/gallery/recipe-resumable-upload.webp)](gallery.md)

*Section `recipe-resumable-upload` of the [gallery](gallery.md) — run it locally to interact.*
<!-- /gallery -->

## The minimal example

```tsx
import { createResumableUpload, type ResumableUpload } from "tempest-react-sdk";
import { useRef, useState } from "react";

export function SendRecording({ file }: { file: File }) {
  const upload = useRef<ResumableUpload | null>(null);
  const [percent, setPercent] = useState(0);
  const [state, setState] = useState("idle");

  async function start() {
    upload.current ??= createResumableUpload({
      endpoint: "/api/uploads",
      file,
      metadata: { filename: file.name },
      onProgress: ({ fraction }) => setPercent(Math.round(fraction * 100)),
      onStateChange: setState,
    });

    const done = await upload.current.start();
    if (done) await fetch(`/api/recordings?url=${encodeURIComponent(done.url)}`, { method: "POST" });
  }

  return (
    <>
      <progress value={percent} max={100} />
      <button type="button" onClick={() => void start()}>Send</button>
      <button type="button" onClick={() => upload.current?.pause()}>Pause</button>
      <button type="button" onClick={() => void upload.current?.resume()}>Resume</button>
      <button type="button" onClick={() => void upload.current?.abort({ discard: true })}>
        Cancel
      </button>
      <p>{state}</p>
    </>
  );
}
```

What happens: a `POST` creates the upload, a series of `PATCH`es pushes 5 MiB at a time, `onProgress` gets every byte tick, and at the end `start()` resolves with `{ url, size }` — the tus URL, which you store next to the record.

!!! tip "`start()` resolves `null` when you paused or cancelled"
    Only a **failure** rejects. `pause()` and `abort()` are not failures, so the promise resolves `null` and you do not need a `try/catch` around a pause button.

## States

`upload.state` (and `onStateChange`) walks through:

| State | Meaning |
| --- | --- |
| `idle` | Nothing started |
| `creating` | The creation `POST` is in flight |
| `uploading` | Chunks are going out |
| `paused` | `pause()` — the resume point is **kept** |
| `done` | Finished; the persisted record was deleted |
| `error` | The retries ran out; `start()` rejected |
| `aborted` | `abort()` — with `discard: true`, the record was deleted |

## Resuming after a reload

That is the reason it exists. The client stores `{ url, offset, size, idempotencyKey }` (plus `owner`, with `getPrincipal` or `getToken`) under a **resume key** and, on the next `start()`, re-attaches to the upload:

```ts
const upload = createResumableUpload({ endpoint: "/api/uploads", file });
// Page reloaded, the user picked the same file, called start() again:
// → HEAD on the old upload, the offset comes back as 312 MB, the PATCHes carry on from there.
```

The default key is a fingerprint of `endpoint + name + size + type + lastModified` — the same criterion the reference tus clients use. Cheap (it does not hash 400 MB) and it changes whenever the file does, which is the property that matters: resuming into the wrong file would corrupt both.

!!! warning "A nameless `Blob` has a weak fingerprint"
    `Blob` has no `name` and no `lastModified`, so two blobs of the same size and type collide. Pass an explicit `key` when what you upload is not a `File`.

### Where the state lives

By default, `localStorage`, through `createLocalUploadStorage()`. **Not** IndexedDB, and that is a choice: the record is four fields and a URL, the requirement is only to survive a reload, and pulling Dexie in for that would put IndexedDB in the bundle of every app that uploads a file.

If your app already has a Dexie database open, plug yours in:

```ts
import {
  createOfflineStore,
  createResumableUpload,
  type ResumableUploadRecord,
} from "tempest-react-sdk";

const store = createOfflineStore<{ id: string; record: ResumableUploadRecord }, string>({
  databaseName: "Uploads",
  version: 1,
  tableName: "resume",
  indexes: "&id",
});

createResumableUpload({
  endpoint: "/api/uploads",
  file,
  storage: {
    get: async (key) => (await store.get(key))?.record ?? null,
    set: async (key, record) => {
      await store.put({ id: key, record });
    },
    delete: async (key) => {
      await store.delete(key);
    },
  },
});
```

`storage: null` turns persistence off: resuming then survives a network drop, but not a reload.

### One record per user — `getPrincipal` and `clear()`

The record survives a reload — and, for that very reason, a logout. The default key carries no user at all: if A signs out leaving an upload half-done and B picks a file with the same fingerprint, B's client would send `HEAD` and `PATCH` to A's upload URL with B's token and, if the server refused, send the creation `POST` with A's `Idempotency-Key` (#479).

Two pieces close this:

```ts
import { createLocalUploadStorage, createResumableUpload } from "tempest-react-sdk";

declare const file: File;
declare const auth: { getToken: () => string | null };
declare const session: { userId: string | null };

const upload = createResumableUpload({
  endpoint: "/api/uploads",
  file,
  getToken: () => auth.getToken(),
  getPrincipal: () => session.userId,
});

await upload.start();

export function onSessionEnd(): void {
  createLocalUploadStorage().clear();
}
```

- **`getPrincipal`** — the same getter the error reporter and `provideBackgroundSyncCredentials` take. The record gets a one-way fingerprint of the user (`owner`, never the raw id), and a record with another owner — another user, nobody, or no owner, written before 0.78.0 — is **deleted** instead of resumed: its URL gets no request, and its `Idempotency-Key` is never reused.
- **`clear()`** — removes every record under `createLocalUploadStorage()`'s `tempest-upload:` prefix. Call it from `onSessionEnd` (see [Auth → Ending the session](./auth.en.md#ending-the-session-createtempestauth-and-onsessionend)). A custom `storage` implements the equivalent on its side.

And if the account switch happens **while the upload runs**? `getPrincipal` is read again before every chunk and every record write: once it names someone else, the run stops with `ResumableUploadSupersededError` (`reason: "principal"`), before the new account's token reaches the previous one's upload URL. A `clear()` mid-run does the same (`reason: "cleared"`) instead of the record being written back. It is not a pause — the run cannot go on as the new account: the state moves to `"error"`.

```ts
import { ResumableUploadSupersededError, createResumableUpload } from "tempest-react-sdk";

declare const file: File;
declare const session: { userId: string | null };

export async function send(): Promise<string | null> {
  const upload = createResumableUpload({
    endpoint: "/api/uploads",
    file,
    getPrincipal: () => session.userId,
  });
  try {
    return (await upload.start())?.url ?? null;
  } catch (error) {
    if (error instanceof ResumableUploadSupersededError) return null;
    throw error;
  }
}
```

`clear()` only removes values shaped like an upload record: a prefix with no delimiter (`"app"`) does not take the app's own keys (`"appSettings"`) with it.

#### Without `getPrincipal`: the record belongs to the token (0.82.0)

Up to 0.81.0, without `getPrincipal` any record under the same key was resumed, whoever wrote it (#528). Since **0.82.0**, with `getToken` and no `getPrincipal`, the record is stamped with a one-way fingerprint of the **token** (`owner: "t:…"`, never the token itself), and a record stamped by another token — or not stamped at all — is deleted instead of resumed. B never again sends a `HEAD` to A's URL or reuses A's `Idempotency-Key`.

The price is that tokens **rotate**. The stamp is rewritten on every record write, and the handle itself carries on with its upload after a refresh (`pause()` → `resume()`). But a reload after a refresh during which no chunk was written finds the old token's stamp and **starts over**. `getPrincipal` has no such cost — the user does not rotate — so it stays the recommendation:

| Configuration | Another user's record | Resumes after refresh + reload | Account switch while uploading |
| --- | --- | --- | --- |
| `getPrincipal` | deleted | yes | stops with `ResumableUploadSupersededError` |
| `getToken: auth.getToken` from `createTempestAuth` (0.82.0) | deleted | yes | stops with `ResumableUploadSupersededError` |
| `getToken` only, any other getter (0.82.0 default) | deleted | only if a chunk was written after the refresh | **carries on**, with the new token on the previous upload's URL |
| neither (anonymous, cookie session) | **resumed** | yes | **carries on** |

With any other getter, the handle cannot tell a refresh from another account's sign-in — both are just a new token. So `abort()` also ends the own-record exception: a `start()`/`resume()` after it behaves like a new handle, which resumes the record only if the current owner stamped it and otherwise creates another upload with a fresh `Idempotency-Key`. Up to 0.82.0, a `resume()` after the `abort()` this page tells you to call from `onSessionEnd` carried on "its own" upload with whoever's token was current — B's, on A's URL, with A's `Idempotency-Key` (#561). Without `abort()`, the row above still applies: switch the getter to `auth.getToken` or pass `getPrincipal`.

#### `getToken: auth.getToken` — the record belongs to the session

When `getToken` is the **very** getter `createTempestAuth` returned, the upload reads the preset's session from it ([`auth.sessionKey()`](./auth.en.md#the-session-as-a-key-authsessionkey)) and uses it as `getPrincipal`. The session does not rotate on refresh, so a reload after a rotation resumes; and it changes on another account's `login()`, so the run stops before the new token reaches the previous upload's URL:

```ts
import { createResumableUpload, createTempestAuth } from "tempest-react-sdk";

export const auth = createTempestAuth({ baseURL: "https://api.example.com" });

export function sendRecording(recording: File) {
  return createResumableUpload({
    endpoint: "/api/uploads",
    file: recording,
    getToken: auth.getToken,
  }).start();
}
```

This also holds for a session **restored** by `auth.refresh()` — the boot restore from the cookie, an OAuth callback: since 0.83.0 it gets a session of its own, and the next account restored the same way does not resume the previous one's upload (up to 0.82.0 both answered the same key, see [`auth.sessionKey()`](./auth.en.md#the-session-as-a-key-authsessionkey)).

Measured in `src/http/resumable-upload.session.test.ts` (`npx vitest run src/http/resumable-upload.session.test.ts`): on `main` before this change, B's `login()` between the first and second `PATCH` let the upload **finish**, with the following `PATCH`es carrying `Bearer B-tok-1` to A's upload URL; and a reload after a refresh started over with a new `POST`. Now the run rejects with `ResumableUploadSupersededError` and the reload resumes with a `HEAD`.

!!! note "The getter, not a wrapper"
    `getToken: () => auth.getToken()` is another function and carries no session: it stays bound to the token, like the "any other getter" row. A `login()` into the same account is a new session — the upload starts over; to resume across logins, pass `getPrincipal` with the user's id.

!!! warning "A cookie session needs `getPrincipal`"
    Without `getToken` — a cookie-only session, outside `createTempestAuth`, which always has a token — the SDK cannot see who is signed in: the record has no owner and is resumed by whoever comes next, as before. With a cookie session and more than one account per browser, pass `getPrincipal` and clear at session end — and, without the getter, call `abort()` on the uploads in progress from `onSessionEnd`, because a running upload only notices an account switch through `getPrincipal`.

## The failure that actually happens

It is not the chunk that gets lost. It is the chunk the **server stored and whose response never came back**. The client cannot tell that from a lost chunk, and re-sending it blindly would duplicate bytes.

Two things prevent that:

**1. Writes are addressed, not appended.** Every `PATCH` states the offset it writes at (`Upload-Offset`). If the response was lost and the client repeats it, it is asking to write bytes the server already has — and gets `409`. On **any** retry the client re-reads the truth with `HEAD` before writing and continues from where the server really is.

**2. Creation carries an `Idempotency-Key`.** tus has no idempotent creation; without this, a lost `201` would leave an orphan upload on the server and the client would create a second one. The key (from `generateIdempotencyKey`) is stored **before** the first attempt and reused on retry. A backend that honours the header returns the same `Location`; one that ignores it works just the same, it only keeps the orphan.

!!! tip "The backoff is the SDK's `retry`"
    There is no second backoff here: every chunk runs inside [`retry`](./http.md#retry-exponential-backoff) — exponential, honouring `Retry-After`. Tune it with `retry: { retries, initialDelay, shouldRetry }`.

!!! check "What the chunk loop retries, and what it does not"
    Two of these decisions are **specific to the resume protocol** and do not
    follow the SDK's general policy:

    | Answer | Retried? | Why |
    | --- | --- | --- |
    | network failure, `408`, `425`, `429`, `5xx` | **yes** | the standard policy: it can change on its own |
    | `409`, `412` | **yes** | the offset-divergence signal — the replay *is* the fix, and the resync `HEAD` performs it |
    | `200`/`204` with an `Upload-Offset` not past the one sent | **yes**, within `retries` | tus says the new offset is the previous one plus the bytes received; confirming without moving is a protocol error (`code: "UPLOAD_OFFSET_STALLED"`, 0.83.0). The resync `HEAD` checks whether the server stored the bytes anyway |
    | `404`, `410` | **no** | the upload is gone from the server. Recreating one only happens at attach, never inside the loop |
    | `400`, `403`, `413`, `415`, `422` | **no** | a deliberate refusal; the 5th attempt gets the same answer |

    `409` is the interesting case: the SDK's general policy refuses 4xx, and it is
    right to — but here it means "your offset is wrong", which is exactly what the
    retry fixes.

    `404` is the inverse. A resource that vanished *looks* transient, but the
    resync `HEAD` hits the same `404`, so retrying meant probing a dead resource
    five times before reporting "the upload expired" — with the backoff stacked on
    top. Start a fresh upload for that one.

    Your own `shouldRetry` **replaces** this policy entirely, in both directions.

## What your backend must implement

Every request carries `Tus-Resumable: 1.0.0`.

| Step | Request | Expected response |
| --- | --- | --- |
| Create | `POST {endpoint}` + `Upload-Length`, `Upload-Metadata`, `Idempotency-Key` | `201` + `Location` (the upload URL, absolute or relative) |
| Probe | `HEAD {uploadUrl}` | `200`/`204` + `Upload-Offset` |
| Write | `PATCH {uploadUrl}` + `Upload-Offset`, `Content-Type: application/offset+octet-stream`, body = chunk | `204` + the new `Upload-Offset`, greater than the one sent; `409` when the offset does not match |
| Discard | `DELETE {uploadUrl}` | `204` |

Details that tend to bite:

- **`Location` may be relative.** The client resolves it against the `endpoint` the `POST` went to (RFC 9110), so `/files/abc` from `https://tus.example.com/files/` becomes `https://tus.example.com/files/abc`. Up to 0.81.0 it resolved against the page and sent the chunks to the app's origin.
- **`Upload-Metadata`** is comma-separated `key base64(value)`, with the value encoded as **UTF-8 before** base64 — that is how `note-ação.webm` survives an HTTP header.
- **`HEAD` answering `404`/`410`** is read as "the server forgot this upload": the client recreates it from scratch instead of getting stuck.
- **A missing `Upload-Offset` on a successful `PATCH`** is tolerated — the client assumes the end of the chunk — but sending it is better.
- **An `Upload-Offset` that does not advance on a successful `PATCH`** — the offset sent, or a smaller one — becomes a `TempestApiError` with `code: "UPLOAD_OFFSET_STALLED"` and the response's status, counted as a chunk failure: the next attempt re-reads the offset with `HEAD`, and the upload rejects once `retries` runs out (`retries: 0` sends **one** `PATCH`; the default, five). Up to 0.82.0 the loop took the answer as success and re-sent the same chunk forever — measured in #569, more than 1500 requests in 4 s even with `retries: 0`; the real case was a `303` redirect turned into a `GET` answered `200` with the same offset. Refusing without a retry was rejected: the server may have stored the bytes and only answered badly, and the `HEAD` settles that for free. It is the same rule as the reference client (`tus-js-client`), where only an offset that moved refills the retry counter.
- Keep a table of `Idempotency-Key`s if you want to avoid orphans.

!!! info "Off-the-shelf servers"
    `tusd` (Go), `tus-node-server` (Node) and `tuspy`/`py-tus` (Python) already implement the table. In a FastAPI app of your own it is four routes.

## Progress and pausing, precisely

```ts
const upload = createResumableUpload({
  endpoint: "/api/uploads",
  file,
  chunkSize: 1024 * 1024, // 1 MiB: finer ticks, more round-trips
  // the default is DEFAULT_CHUNK_SIZE (5 MiB), exported so a settings UI can show it
  getToken: () => auth.getToken(),
  withCredentials: true,
  retry: { retries: 8, initialDelay: 500 },
  onProgress: ({ loaded, total, fraction, resumedFrom }) => {
    console.log(`${loaded}/${total} (${Math.round(fraction * 100)}%), resumed at ${resumedFrom}`);
  },
});
```

- `onProgress` reports **bytes of the whole file**, not of the chunk. `resumedFrom` says how many were already on the server when this run started — useful so you do not announce "0%" for an upload that resumed at 80%.
- `pause()` drops the in-flight chunk; the persisted offset stays at the last **confirmed** chunk. `resume()` does a `HEAD` first, so partial bytes the server accepted are not lost.
- `abort({ discard: true })` sends `DELETE` and clears the record; without `discard`, the resume point stays.

!!! warning "The token does not follow `Location` off your origin"
    tus answers creation with a `Location` **the server chooses**, and the spec allows an absolute URL on another host — handing the upload to object storage is ordinary operation, not an attack. Up to 0.65.0 the bearer token followed that header wherever it pointed, along with the file bytes.

    Since **0.66.0** the credential is bound to the `endpoint`'s origin. When `Location` points elsewhere, the creation `POST` still carries the token — that one went to your backend — and the following `HEAD`/`PATCH`/`DELETE` go without it. The upload completes normally, which is what a presigned storage URL expects anyway.

    When the storage host genuinely needs your API's token, declare it:

    ```ts
    createResumableUpload({
      endpoint: "/api/uploads",
      file,
      getToken: () => auth.getToken(),
      trustedOrigins: ["https://storage.example.com"],
    });
    ```

    The same applies to the persisted record: a `url` in `localStorage` pointing off-origin does not get the token back on resume.

    Since **0.82.0** the static `headers` follow the same scope: an `X-Api-Key` goes on the creation `POST` and not to a `Location` on another origin, which gets only the tus headers.

    The `csrf` option follows the same rule: the CSRF token goes on the creation `POST`, every `PATCH` and the discarding `DELETE` — never on the offset `HEAD` — and only to the `endpoint`'s origin and the `trustedOrigins`. See [CSRF](./http.md#csrf-a-session-cookie-needs-its-pair).

!!! warning "`XMLHttpRequest`, not `fetch` — except with static `headers`"
    As in `uploadWithProgress`: `fetch` still cannot report **upload** progress in any browser. There is a second reason here — tus returns the new offset in a **response header**, and `uploadWithProgress` only hands back a parsed body, so it could not be reused.

    The exception is a request carrying the static `headers` (since **0.83.0**, #564). `XMLHttpRequest` follows every redirect and has no way to refuse one. Measured in Chrome 150 with the packaged `createResumableUpload` (the `npm pack` tarball bundled with esbuild), a server on `127.0.0.1:5340` answering `301`/`302`/`303`/`307`/`308` towards `localhost:5341`, which echoes the headers with CORS: `X-Api-Key` reached the other origin on all 5 codes, on the creation `POST` and on the chunk `PATCH`, along with the bytes; so did `X-CSRF-Token`; only `Authorization` was stripped by the browser. The XHR's `responseURL` shows where the request ended up (`http://localhost:5341/files/1`, measured), but by the time it is readable the header is gone.

    So such a request goes out over `fetch` with `redirect: "manual"`, and a redirect answering it becomes a `TempestApiError` with `code: "REDIRECT_REFUSED"`, not retried — the same rule as `createApiClient` ([HTTP](./http.en.md)). Measured again after the change: **no** request reached the other origin in the 10 cases (5 codes × redirect on the `PATCH` and on creation), and an `endpoint` on another origin without a redirect still works.

    The cost is the progress **inside** a chunk: with static `headers`, `onProgress` advances once per confirmed chunk. For a finer bar, lower `chunkSize`; or send the credential through `getToken`, which keeps the `XMLHttpRequest` — the browser strips `Authorization` on a cross-origin redirect by itself. `X-CSRF-Token` alone does not switch the transport, for the reason [HTTP](./http.en.md) documents for `createApiClient`.

    **Migration:** a server that answers creation or a chunk with a redirect — same-origin included, like FastAPI's trailing-slash `307` — now fails with `REDIRECT_REFUSED` when there are static `headers`. Point `endpoint` at the final URL (`/api/uploads/`).

## Recap

- **`createResumableUpload({ endpoint, file })`** — 5 MiB chunks, resume across network drops and reloads, tus 1.0.0 on the wire.
- **`start()` / `pause()` / `resume()` / `abort({ discard })`**; `start()` resolves `null` when you stopped on purpose.
- The resume point lives in `localStorage` by default; swap it with `storage`, disable it with `null`.
- **`getPrincipal`** binds the record to the user; without it, since 0.82.0, the record belongs to the `getToken` token — or to the session, when the getter is `createTempestAuth`'s `auth.getToken`. **`createLocalUploadStorage().clear()`** in `onSessionEnd` removes what is left.
- A lost response is handled by **addressed offsets + a `HEAD` before every retry**, and creation by an **`Idempotency-Key`**.
- The backoff is the SDK's `retry` — there is no second one.

### See also

- [HTTP](./http.md) — `uploadWithProgress` (single request), `retry`, `generateIdempotencyKey`
- [Audio](./audio.md) — `useAudioRecorder`, which produces the long files that motivated this
- [Offline](./offline.md) — `createOfflineStore`, if you would rather keep resume state in IndexedDB
