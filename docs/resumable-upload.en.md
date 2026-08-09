# Resumable upload (tus)

`uploadWithProgress` makes **one** request. That works until the file gets big: a 40-minute recording from `useAudioRecorder`, a video, a dump. Then a 4G connection that wobbles for three seconds throws away the 300 MB already sent, and reloading the page throws it away again.

`createResumableUpload` splits the file into chunks, remembers where it stopped, and carries on — after a network drop **or** a reload.

!!! info "Protocol: tus 1.0.0, not something we invented"
    The client speaks [tus](https://tus.io) (core plus the *creation* and *termination* extensions). That is deliberate: a resumable client with a private wire format means the backend is ours forever. With tus you can point it at `tusd`, `tus-node-server` or `py-tus` without writing a server at all — and the [What your backend must implement](#what-your-backend-must-implement) section fits in one table.

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

That is the reason it exists. The client stores `{ url, offset, size, idempotencyKey }` under a **resume key** and, on the next `start()`, re-attaches to the upload:

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

## The failure that actually happens

It is not the chunk that gets lost. It is the chunk the **server stored and whose response never came back**. The client cannot tell that from a lost chunk, and re-sending it blindly would duplicate bytes.

Two things prevent that:

**1. Writes are addressed, not appended.** Every `PATCH` states the offset it writes at (`Upload-Offset`). If the response was lost and the client repeats it, it is asking to write bytes the server already has — and gets `409`. On **any** retry the client re-reads the truth with `HEAD` before writing and continues from where the server really is.

**2. Creation carries an `Idempotency-Key`.** tus has no idempotent creation; without this, a lost `201` would leave an orphan upload on the server and the client would create a second one. The key (from `generateIdempotencyKey`) is stored **before** the first attempt and reused on retry. A backend that honours the header returns the same `Location`; one that ignores it works just the same, it only keeps the orphan.

!!! tip "The backoff is the SDK's `retry`"
    There is no second backoff here: every chunk runs inside [`retry`](./http.md#retry-exponential-backoff) — exponential, honouring `Retry-After`. Tune it with `retry: { retries, initialDelay, shouldRetry }`.

## What your backend must implement

Every request carries `Tus-Resumable: 1.0.0`.

| Step | Request | Expected response |
| --- | --- | --- |
| Create | `POST {endpoint}` + `Upload-Length`, `Upload-Metadata`, `Idempotency-Key` | `201` + `Location` (the upload URL, absolute or relative) |
| Probe | `HEAD {uploadUrl}` | `200`/`204` + `Upload-Offset` |
| Write | `PATCH {uploadUrl}` + `Upload-Offset`, `Content-Type: application/offset+octet-stream`, body = chunk | `204` + the new `Upload-Offset`; `409` when the offset does not match |
| Discard | `DELETE {uploadUrl}` | `204` |

Details that tend to bite:

- **`Location` may be relative.** The client resolves it against the page, so `/api/uploads/abc` is fine.
- **`Upload-Metadata`** is comma-separated `key base64(value)`, with the value encoded as **UTF-8 before** base64 — that is how `note-ação.webm` survives an HTTP header.
- **`HEAD` answering `404`/`410`** is read as "the server forgot this upload": the client recreates it from scratch instead of getting stuck.
- **A missing `Upload-Offset` on a successful `PATCH`** is tolerated — the client assumes the end of the chunk — but sending it is better.
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

!!! warning "`XMLHttpRequest`, not `fetch`"
    As in `uploadWithProgress`: `fetch` still cannot report **upload** progress in any browser. There is a second reason here — tus returns the new offset in a **response header**, and `uploadWithProgress` only hands back a parsed body, so it could not be reused.

## Recap

- **`createResumableUpload({ endpoint, file })`** — 5 MiB chunks, resume across network drops and reloads, tus 1.0.0 on the wire.
- **`start()` / `pause()` / `resume()` / `abort({ discard })`**; `start()` resolves `null` when you stopped on purpose.
- The resume point lives in `localStorage` by default; swap it with `storage`, disable it with `null`.
- A lost response is handled by **addressed offsets + a `HEAD` before every retry**, and creation by an **`Idempotency-Key`**.
- The backoff is the SDK's `retry` — there is no second one.

### See also

- [HTTP](./http.md) — `uploadWithProgress` (single request), `retry`, `generateIdempotencyKey`
- [Audio](./audio.md) — `useAudioRecorder`, which produces the long files that motivated this
- [Offline](./offline.md) — `createOfflineStore`, if you would rather keep resume state in IndexedDB
