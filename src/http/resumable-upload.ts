/**
 * @tempest-limits file-lines, function-lines — a resumable upload is one long-lived
 * state machine: chunk the file, negotiate the offset the server already has, upload
 * with retry and backoff, honour pause, resume and abort, and report progress
 * throughout. Every stage reads the same cursor and the same abort signal, and
 * createResumableUpload is the closure that owns them.
 */
import { buildApiError, TempestApiError } from "./errors";
import { generateIdempotencyKey } from "./idempotency";
import { retry, type RetryOptions } from "./retry";

/** The tus protocol version this client speaks. */
export const TUS_VERSION = "1.0.0";

/** Default chunk size: 5 MiB, the size most tus servers are tuned for. */
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * Where a resumable upload is.
 *
 * `"paused"` and `"aborted"` are both "not running", but only `"paused"` keeps the
 * persisted offset — `abort({ discard: true })` throws it away.
 */
export type ResumableUploadState =
    "idle" | "creating" | "uploading" | "paused" | "done" | "error" | "aborted";

/** Byte-level progress for a resumable upload. */
export interface ResumableUploadProgress {
    /** Bytes the server holds, including anything a resume skipped. */
    loaded: number;
    /** Total size of the file. */
    total: number;
    /** `loaded / total`, between 0 and 1. */
    fraction: number;
    /** Bytes already on the server when this run started. `0` on a fresh upload. */
    resumedFrom: number;
}

/** What has to survive a page reload for a resume to be possible. */
export interface ResumableUploadRecord {
    /** Upload URL the creation POST returned, absolute. */
    url: string;
    /** Last offset the server confirmed. */
    offset: number;
    /** File size, so a different file under the same key is not resumed into. */
    size: number;
    /** Idempotency key of the creation request, reused if creation is retried. */
    idempotencyKey: string;
    /** Epoch ms of the last write, so an app can sweep stale records. */
    updatedAt: number;
}

/**
 * Persistence for resume state. Sync or async — both are awaited.
 *
 * Implement it over anything: the default is `localStorage`, and
 * `createOfflineStore` from `@/offline` slots in when you already have a Dexie
 * database open.
 */
export interface ResumableUploadStorage {
    /** Read the record for `key`, or `null`. */
    get(key: string): Promise<ResumableUploadRecord | null> | ResumableUploadRecord | null;
    /** Write the record for `key`. */
    set(key: string, record: ResumableUploadRecord): Promise<void> | void;
    /** Forget the record for `key`. */
    delete(key: string): Promise<void> | void;
}

/** Options for {@link createResumableUpload}. */
export interface ResumableUploadOptions {
    /** tus creation endpoint, e.g. `"/api/uploads"`. */
    endpoint: string;
    /** The bytes to upload. A `File` also supplies the default resume key. */
    file: Blob | File;
    /** Bytes per `PATCH`. Default {@link DEFAULT_CHUNK_SIZE}. */
    chunkSize?: number;
    /** Sent as `Upload-Metadata` (base64-encoded values), e.g. `{ filename }`. */
    metadata?: Record<string, string>;
    /** Extra headers on every request. */
    headers?: Record<string, string>;
    /** Returns the current bearer token, read before each request. */
    getToken?: () => string | null | undefined;
    /** Send cookies. Default `false`. */
    withCredentials?: boolean;
    /**
     * Resume key. Defaults to a fingerprint of endpoint + file name/size/mtime, so
     * picking the same file after a reload resumes instead of restarting.
     */
    key?: string;
    /**
     * Where to persist resume state. Defaults to `localStorage`. Pass `null` to
     * disable persistence — resume then only survives a network blip, not a reload.
     */
    storage?: ResumableUploadStorage | null;
    /** Backoff for a failed chunk. Forwarded to `retry`. Default 5 attempts. */
    retry?: RetryOptions;
    /** Called on every upload-progress tick and after every confirmed chunk. */
    onProgress?: (progress: ResumableUploadProgress) => void;
    /** Called whenever {@link ResumableUpload.state} changes. */
    onStateChange?: (state: ResumableUploadState) => void;
}

/** What a finished upload resolves with. */
export interface ResumableUploadResult {
    /** The tus upload URL — hand this to your API to link the stored file. */
    url: string;
    /** Total bytes uploaded. */
    size: number;
}

/** A resumable upload in progress. Build one with {@link createResumableUpload}. */
export interface ResumableUpload {
    /**
     * Create (or re-attach to) the upload and push chunks until it is complete.
     *
     * Resolves `null` when the run stopped because of `pause()` or `abort()` —
     * neither is a failure. Rejects with a `TempestApiError` when the server
     * refused and the retries ran out.
     */
    start(): Promise<ResumableUploadResult | null>;
    /** Stop after the in-flight chunk is dropped, keeping the resume point. */
    pause(): void;
    /** Continue from the server's offset. Same resolution contract as `start`. */
    resume(): Promise<ResumableUploadResult | null>;
    /**
     * Stop for good.
     *
     * @param options - `discard: true` also sends `DELETE` (tus termination) and
     *   forgets the persisted record, so the next `start()` uploads from zero.
     */
    abort(options?: { discard?: boolean }): Promise<void>;
    /** Current state. */
    readonly state: ResumableUploadState;
    /** Bytes the server has confirmed. */
    readonly offset: number;
    /** The upload URL, once creation succeeded. */
    readonly url: string | null;
    /** The resume key in use. */
    readonly key: string;
}

interface RawResponse {
    status: number;
    text: string;
    header(name: string): string | null;
}

/**
 * Encode a string as standard base64 (padded), UTF-8 first.
 *
 * `Upload-Metadata` carries base64 values precisely so a filename with accents
 * survives an HTTP header, so the UTF-8 step is not optional: `btoa` alone throws
 * on any code point above U+00FF.
 *
 * @param value - Text to encode.
 * @returns Padded base64.
 */
function base64Utf8(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/**
 * Build the `Upload-Metadata` header value: comma-separated `key base64(value)`.
 *
 * @param metadata - Plain string map.
 * @returns The header value, or `null` when there is nothing to send.
 */
function encodeMetadata(metadata: Record<string, string> | undefined): string | null {
    if (!metadata) return null;
    const parts = Object.entries(metadata).map(([name, value]) => `${name} ${base64Utf8(value)}`);
    return parts.length > 0 ? parts.join(",") : null;
}

/**
 * A stable-enough identity for a file, used as the default resume key.
 *
 * Name + size + last-modified is what the tus reference clients fingerprint on:
 * it is cheap (hashing the bytes of a 400 MB recording is not) and it changes
 * whenever the file does, which is the property that matters — resuming into the
 * wrong file would corrupt it silently.
 *
 * @param endpoint - Creation endpoint, so the same file to two servers is two uploads.
 * @param file - The blob or file being uploaded.
 * @returns A key safe to use in `localStorage`.
 */
export function uploadFingerprint(endpoint: string, file: Blob | File): string {
    const named = file as File;
    const name = typeof named.name === "string" ? named.name : "blob";
    const modified = typeof named.lastModified === "number" ? named.lastModified : 0;
    return `${endpoint}|${name}|${file.size}|${file.type}|${modified}`;
}

/**
 * `localStorage`-backed resume storage — the default.
 *
 * `localStorage` and not IndexedDB on purpose. The record is four fields and a
 * URL; the requirement is only that it survives a reload, and pulling Dexie in for
 * that would put an IndexedDB dependency in the bundle of every app that uploads a
 * file. Apps that already have `createOfflineStore` open can pass their own
 * {@link ResumableUploadStorage} instead.
 *
 * @param prefix - Key prefix. Default `"tempest-upload:"`.
 * @returns A storage that no-ops when `localStorage` is unavailable.
 */
export function createLocalUploadStorage(prefix = "tempest-upload:"): ResumableUploadStorage {
    function backend(): Storage | null {
        try {
            return typeof localStorage === "undefined" ? null : localStorage;
        } catch {
            return null;
        }
    }

    return {
        get(key) {
            const raw = backend()?.getItem(prefix + key);
            if (!raw) return null;
            try {
                return JSON.parse(raw) as ResumableUploadRecord;
            } catch {
                return null;
            }
        },
        set(key, record) {
            backend()?.setItem(prefix + key, JSON.stringify(record));
        },
        delete(key) {
            backend()?.removeItem(prefix + key);
        },
    };
}

/**
 * Send one request over `XMLHttpRequest`.
 *
 * `XMLHttpRequest` rather than `fetch` for the same reason `uploadWithProgress`
 * uses it — `fetch` still cannot report upload progress in any browser — plus one
 * more: tus answers every write with the new `Upload-Offset` in a **response
 * header**, and `uploadWithProgress` only hands back a parsed body, so it could
 * not be reused here.
 *
 * @param init - Method, URL, headers, optional body and progress callback.
 * @returns Status, raw text and a header reader.
 */
function sendRequest(init: {
    method: "POST" | "HEAD" | "PATCH" | "DELETE";
    url: string;
    headers: Record<string, string>;
    body?: Blob;
    withCredentials: boolean;
    onProgress?: (loaded: number) => void;
    register: (xhr: XMLHttpRequest) => void;
}): Promise<RawResponse> {
    return new Promise<RawResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(init.method, init.url);
        xhr.withCredentials = init.withCredentials;
        for (const [name, value] of Object.entries(init.headers)) {
            xhr.setRequestHeader(name, value);
        }
        if (init.onProgress) {
            const report = init.onProgress;
            xhr.upload.onprogress = (event: ProgressEvent) => report(event.loaded);
        }
        xhr.onload = () =>
            resolve({
                status: xhr.status,
                text: xhr.responseText,
                header: (name) => xhr.getResponseHeader(name),
            });
        xhr.onerror = () =>
            reject(
                new TempestApiError({
                    status: 0,
                    detail: "Falha de rede no upload resumível.",
                }),
            );
        xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        init.register(xhr);
        xhr.send(init.body);
    });
}

function parseOffset(response: RawResponse): number | null {
    const raw = response.header("Upload-Offset");
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Read an error body without assuming it is JSON.
 *
 * A tus proxy that rejects a chunk often answers with plain text or an HTML error
 * page, and `JSON.parse` throwing there would replace a useful status with a parse
 * error.
 *
 * @param text - Raw response text.
 * @returns The parsed object, the raw text, or `null` when the body was empty.
 */
function parseErrorBody(text: string): unknown {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * Turn a refused tus response into a `TempestApiError`.
 *
 * The fallback `detail` is used unless the server sent a real error envelope,
 * because `buildApiError`'s own fallback (`"Erro 409"`) says nothing about which
 * step of the protocol broke — and that is the whole diagnostic value here.
 *
 * @param response - The raw response that was not acceptable.
 * @param detail - Message to use when the body carries none.
 * @returns The error to throw.
 */
function failed(response: RawResponse, detail: string): TempestApiError {
    const body = parseErrorBody(response.text);
    const envelope = buildApiError(response.status, body, { get: response.header });
    const hasDetail =
        typeof body === "object" && body !== null && ("detail" in body || "message" in body);
    return new TempestApiError({ ...envelope, detail: hasDetail ? envelope.detail : detail });
}

/**
 * Resolve a `Location` header against the page, so a relative upload URL works.
 *
 * tus servers are free to answer creation with either an absolute URL or a
 * path, and the spec does not prefer one — a client that only handles absolute
 * URLs breaks against half the implementations.
 *
 * @param value - The raw `Location` header.
 * @returns An absolute URL, or the input when there is no base to resolve against.
 */
function resolveUploadUrl(value: string): string {
    const base = typeof window === "undefined" ? undefined : window.location.href;
    try {
        return new URL(value, base).href;
    } catch {
        return value;
    }
}

/**
 * Chunked, resumable upload speaking the **tus 1.0.0** protocol (core plus the
 * *creation* and *termination* extensions).
 *
 * ## Why tus and not a bespoke scheme
 *
 * A resumable client whose wire format is undocumented cannot be integrated, and
 * inventing one means the backend is ours forever. tus is a published spec with
 * off-the-shelf servers (`tusd`, `tuspy`, `tus-node-server`), so a caller can point
 * this at something they did not write.
 *
 * ## What the backend must implement
 *
 * Every request carries `Tus-Resumable: 1.0.0`.
 *
 * | Step | Request | Expected response |
 * | --- | --- | --- |
 * | Create | `POST {endpoint}` + `Upload-Length`, `Upload-Metadata`, `Idempotency-Key` | `201` + `Location` (the upload URL, absolute or endpoint-relative) |
 * | Probe | `HEAD {uploadUrl}` | `200`/`204` + `Upload-Offset` |
 * | Write | `PATCH {uploadUrl}` + `Upload-Offset`, `Content-Type: application/offset+octet-stream`, chunk body | `204` + the new `Upload-Offset`; `409` when the offset does not match |
 * | Discard | `DELETE {uploadUrl}` | `204` |
 *
 * ## The failure that actually happens
 *
 * A chunk that the server stored but whose response never arrived. The client
 * cannot tell that from a chunk that was lost, and re-sending it blindly would
 * duplicate bytes. Two things prevent that:
 *
 * - **Writes are addressed, not appended.** Every `PATCH` states the offset it
 *   writes at, so a retry after a lost response is asked to write bytes the server
 *   already has and answers `409`. On any retry the client re-reads the truth with
 *   `HEAD` first and continues from there.
 * - **Creation carries an `Idempotency-Key`** (from `generateIdempotencyKey`),
 *   persisted before the first attempt and reused on retry. tus has no idempotent
 *   creation of its own, so without this a lost `201` leaves an orphan upload on
 *   the server. A backend that honours the header returns the same `Location`; one
 *   that ignores it still works, it just keeps the orphan.
 *
 * @param options - Endpoint, file, and the knobs above.
 * @returns A handle with `start`/`pause`/`resume`/`abort` and live `state`/`offset`.
 *
 * @example
 * const upload = createResumableUpload({
 *     endpoint: "/api/uploads",
 *     file: recording,
 *     metadata: { filename: "nota.webm", ticket: ticketId },
 *     getToken: () => auth.getToken(),
 *     onProgress: ({ fraction }) => setPercent(Math.round(fraction * 100)),
 * });
 *
 * const done = await upload.start();
 * if (done) await api.post("/api/tickets/1/audio", { body: { url: done.url } });
 */
export function createResumableUpload(options: ResumableUploadOptions): ResumableUpload {
    const {
        endpoint,
        file,
        chunkSize = DEFAULT_CHUNK_SIZE,
        metadata,
        headers = {},
        getToken,
        withCredentials = false,
        key = uploadFingerprint(endpoint, file),
        storage = createLocalUploadStorage(),
        retry: retryOptions,
        onProgress,
        onStateChange,
    } = options;

    let state: ResumableUploadState = "idle";
    let offset = 0;
    let url: string | null = null;
    let idempotencyKey: string | null = null;
    let stopping: "pause" | "abort" | null = null;
    let inFlight: XMLHttpRequest | null = null;
    let resumedFrom = 0;

    function setState(next: ResumableUploadState): void {
        if (state === next) return;
        state = next;
        onStateChange?.(next);
    }

    function report(loaded: number): void {
        onProgress?.({
            loaded,
            total: file.size,
            fraction: file.size === 0 ? 1 : loaded / file.size,
            resumedFrom,
        });
    }

    function baseHeaders(): Record<string, string> {
        const result: Record<string, string> = { ...headers, "Tus-Resumable": TUS_VERSION };
        const token = getToken?.();
        if (token && !("Authorization" in result)) result.Authorization = `Bearer ${token}`;
        return result;
    }

    function register(xhr: XMLHttpRequest): void {
        inFlight = xhr;
    }

    async function persist(): Promise<void> {
        if (!storage || !url || !idempotencyKey) return;
        await storage.set(key, {
            url,
            offset,
            size: file.size,
            idempotencyKey,
            updatedAt: Date.now(),
        });
    }

    /**
     * Ask the server how much it holds. The only source of truth after any failure.
     */
    async function probe(target: string): Promise<number> {
        const response = await sendRequest({
            method: "HEAD",
            url: target,
            headers: baseHeaders(),
            withCredentials,
            register,
        });
        if (response.status === 404 || response.status === 410) {
            throw new TempestApiError({
                status: response.status,
                detail: "O upload expirou no servidor. Comece de novo.",
            });
        }
        const confirmed = parseOffset(response);
        if (confirmed === null) throw failed(response, "HEAD sem Upload-Offset.");
        return confirmed;
    }

    /**
     * Re-attach to a persisted upload, or create a new one.
     *
     * The persisted record is only trusted when the file size still matches, and the
     * offset it holds is re-checked with `HEAD` — the client's copy can be ahead of
     * the server's whenever the last response was lost.
     */
    async function ensureUpload(): Promise<string> {
        const stored = storage ? await storage.get(key) : null;
        if (stored && stored.size === file.size) {
            idempotencyKey = stored.idempotencyKey;
            if (stored.url) {
                try {
                    offset = await probe(stored.url);
                    url = stored.url;
                    return stored.url;
                } catch {
                    offset = 0;
                }
            }
        }

        setState("creating");
        idempotencyKey ??= generateIdempotencyKey();
        url = null;
        offset = 0;
        if (storage) {
            await storage.set(key, {
                url: "",
                offset: 0,
                size: file.size,
                idempotencyKey,
                updatedAt: Date.now(),
            });
        }

        const creationHeaders: Record<string, string> = {
            ...baseHeaders(),
            "Upload-Length": String(file.size),
            "Idempotency-Key": idempotencyKey,
        };
        const encoded = encodeMetadata(metadata);
        if (encoded) creationHeaders["Upload-Metadata"] = encoded;

        const response = await sendRequest({
            method: "POST",
            url: endpoint,
            headers: creationHeaders,
            withCredentials,
            register,
        });
        if (response.status !== 201) throw failed(response, "Criação do upload recusada.");
        const locationHeader = response.header("Location");
        if (!locationHeader) throw failed(response, "Criação do upload sem cabeçalho Location.");

        url = resolveUploadUrl(locationHeader);
        await persist();
        return url;
    }

    /** Push one chunk, resyncing the offset first when a previous attempt failed. */
    async function writeChunk(target: string, resync: { needed: boolean }): Promise<void> {
        if (resync.needed) {
            offset = await probe(target);
            resync.needed = false;
            report(offset);
            await persist();
            if (offset >= file.size) return;
        }

        const end = Math.min(offset + chunkSize, file.size);
        const from = offset;
        const response = await sendRequest({
            method: "PATCH",
            url: target,
            headers: {
                ...baseHeaders(),
                "Content-Type": "application/offset+octet-stream",
                "Upload-Offset": String(from),
            },
            body: file.slice(from, end),
            withCredentials,
            onProgress: (loaded) => report(Math.min(from + loaded, file.size)),
            register,
        });

        if (response.status === 409 || response.status === 412) {
            resync.needed = true;
            throw failed(response, "Offset divergente — o servidor já tinha esses bytes.");
        }
        if (response.status !== 204 && response.status !== 200) {
            throw failed(response, "Chunk recusado pelo servidor.");
        }

        offset = parseOffset(response) ?? end;
        report(offset);
        await persist();
    }

    /**
     * Drive the whole upload: attach or create, then chunk until complete.
     *
     * The `shouldRetry` predicate does double duty — besides deciding, it arms
     * `resync` so the next attempt re-reads the server's offset with `HEAD` before
     * writing. That is deliberate: it is the one place that sees *every* chunk
     * failure, whatever the cause, and after any failure the client's idea of the
     * offset is exactly what cannot be trusted.
     *
     * @returns The result, or `null` when `pause`/`abort` stopped the run.
     */
    async function run(): Promise<ResumableUploadResult | null> {
        stopping = null;
        const target = await ensureUpload();
        resumedFrom = offset;
        setState("uploading");
        report(offset);

        const resync = { needed: false };
        while (offset < file.size) {
            if (stopping) break;
            await retry(() => writeChunk(target, resync), {
                retries: 5,
                ...retryOptions,
                shouldRetry: (error, attempt) => {
                    if (stopping) return false;
                    if (error instanceof DOMException && error.name === "AbortError") return false;
                    resync.needed = true;
                    return retryOptions?.shouldRetry?.(error, attempt) ?? true;
                },
            });
        }

        if (stopping === "pause") {
            setState("paused");
            return null;
        }
        if (stopping === "abort") {
            setState("aborted");
            return null;
        }

        setState("done");
        if (storage) await storage.delete(key);
        return { url: target, size: file.size };
    }

    async function guarded(): Promise<ResumableUploadResult | null> {
        try {
            return await run();
        } catch (error) {
            if (
                stopping !== null ||
                (error instanceof DOMException && error.name === "AbortError")
            ) {
                setState(stopping === "abort" ? "aborted" : "paused");
                return null;
            }
            setState("error");
            throw error;
        } finally {
            inFlight = null;
        }
    }

    function stop(reason: "pause" | "abort"): void {
        stopping = reason;
        inFlight?.abort();
        inFlight = null;
    }

    return {
        start: guarded,
        resume: guarded,
        pause: () => stop("pause"),
        abort: async ({ discard = false } = {}) => {
            stop("abort");
            setState("aborted");
            if (!discard) return;
            if (url) {
                await sendRequest({
                    method: "DELETE",
                    url,
                    headers: baseHeaders(),
                    withCredentials,
                    register: () => undefined,
                }).catch(() => undefined);
            }
            if (storage) await storage.delete(key);
        },
        get state() {
            return state;
        },
        get offset() {
            return offset;
        },
        get url() {
            return url;
        },
        key,
    };
}
