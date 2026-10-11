/**
 * Background-sync helper: queue failed mutating requests (POST/PUT/PATCH/DELETE)
 * while offline and replay them when connectivity returns. A dependency-free
 * take on Workbox's `BackgroundSyncPlugin`, backed by a tiny IndexedDB queue.
 *
 * Import inside your `sw.ts`. Uses the Background Sync API (`registration.sync`)
 * when available, and also replays opportunistically on the next request as a
 * fallback for browsers without it (e.g. Safari).
 *
 * Credential headers (`Authorization` and the rest of
 * {@link DEFAULT_CREDENTIAL_HEADERS}) are never written to IndexedDB: the queue
 * outlives the session, and a stored bearer stayed readable after logout and was
 * replayed with the old identity (reproduced in Chromium 153, 11/10/2026). On
 * replay the worker asks an open page for the *current* credentials — see
 * {@link provideBackgroundSyncCredentials} — or a custom `beforeReplay` hook.
 *
 * @example
 *   import { installBackgroundSync } from "tempest-react-sdk/sw";
 *
 *   installBackgroundSync({ match: (url) => url.pathname.startsWith("/api/") });
 */

interface SyncEventLike {
    tag: string;
    waitUntil(promise: Promise<unknown>): void;
}

interface BgFetchEventLike {
    request: Request;
    respondWith(response: Response | Promise<Response>): void;
    waitUntil(promise: Promise<unknown>): void;
}

interface PeriodicSyncEventLike {
    tag: string;
    waitUntil(promise: Promise<unknown>): void;
}

/** Minimal shape of a window client the worker can message. */
interface WindowClientLike {
    postMessage(message: unknown, transfer: Transferable[]): void;
}

interface BgSwGlobal {
    registration: { sync?: { register(tag: string): Promise<void> } };
    clients?: { matchAll(options: { type: "window" }): Promise<readonly WindowClientLike[]> };
    addEventListener(type: "sync", listener: (event: SyncEventLike) => void): void;
    addEventListener(type: "fetch", listener: (event: BgFetchEventLike) => void): void;
    addEventListener(type: "periodicsync", listener: (event: PeriodicSyncEventLike) => void): void;
}

function getSwScope(): BgSwGlobal {
    return globalThis as unknown as BgSwGlobal;
}

/** A serialized request stored in the queue. */
interface QueuedRequest {
    id?: number;
    url: string;
    method: string;
    headers: [string, string][];
    body: ArrayBuffer | null;
    timestamp: number;
    /** The original `credentials` mode, so cookie-based APIs replay with cookies. */
    credentials?: RequestCredentials;
    /** Lower-cased names of the credential headers removed before persisting. */
    strippedHeaders?: string[];
}

/** Default IndexedDB database name (and sync tag) of the background-sync queue. */
const DEFAULT_QUEUE_NAME = "tempest-bg-sync";

/**
 * Header names treated as credentials and never persisted by
 * {@link installBackgroundSync}. `Cookie` and `Proxy-Authorization` are listed
 * for completeness although the browser forbids scripts from setting them.
 */
export const DEFAULT_CREDENTIAL_HEADERS: readonly string[] = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "x-xsrf-token",
];

/**
 * `type` of the message the worker posts to window clients to ask for the
 * credentials of a queued request. Answered by
 * {@link provideBackgroundSyncCredentials}.
 */
export const BACKGROUND_SYNC_CREDENTIALS_MESSAGE = "tempest:bg-sync-credentials";

/** How long the worker waits for each window client to answer, in milliseconds. */
const CREDENTIALS_TIMEOUT_MS = 3000;

/** What a queued request looked like when it was stored, passed to `beforeReplay`. */
export interface BackgroundSyncReplayContext {
    /** Epoch milliseconds of the original failed attempt. */
    queuedAt: number;
    /** Lower-cased credential header names stripped before the entry was stored. */
    strippedHeaders: readonly string[];
}

/** The request a window client is asked to authorize, as sent by the worker. */
export interface BackgroundSyncCredentialsRequest {
    /** Absolute URL of the queued request. */
    url: string;
    /** HTTP method of the queued request. */
    method: string;
}

/**
 * Resolve the credentials for a queued request: a header record to apply, or
 * `null` when there is no session (the entry is then dropped).
 */
export type BackgroundSyncCredentialsProvider = (
    request: BackgroundSyncCredentialsRequest,
) => Record<string, string> | null | Promise<Record<string, string> | null>;

/** Options for {@link installBackgroundSync}. */
export interface InstallBackgroundSyncOptions {
    /**
     * Which requests to queue on failure. A `RegExp` against the URL or a
     * predicate. Only non-`GET` requests are ever considered. Default: all
     * non-`GET` requests.
     */
    match?: RegExp | ((url: URL, request: Request) => boolean);
    /** IndexedDB database name, also used as the sync tag. Default `tempest-bg-sync`. */
    queueName?: string;
    /** Drop queued requests older than this (minutes) on replay. Default `1440` (24h). */
    maxRetentionMinutes?: number;
    /**
     * Also drain the queue on the `periodicsync` event carrying this tag,
     * complementing the one-off `sync` replay so long-pending mutations retry
     * even without a fresh navigation. Register the periodic sync from the main
     * thread with {@link registerPeriodicSync}. Default `${queueName}-periodic`.
     */
    periodicSyncTag?: string;
    /**
     * Header names stripped before a request is persisted. Default
     * {@link DEFAULT_CREDENTIAL_HEADERS}; extend it for a custom credential
     * header (`[...DEFAULT_CREDENTIAL_HEADERS, "x-tenant-key"]`). Passing `[]`
     * restores the pre-0.77 behavior of persisting every header, credentials
     * included, in plain IndexedDB.
     */
    credentialHeaders?: readonly string[];
    /**
     * Prepare each queued request right before it is replayed: return the
     * request to send (typically with the current credentials applied) or
     * `null` to drop the entry for good. A thrown error keeps the entry pending.
     *
     * Default: entries stored without credentials are replayed as-is; entries
     * whose credential headers were stripped ask the open window clients over
     * `postMessage` (see {@link provideBackgroundSyncCredentials}) and re-apply
     * only the stripped header names from the answer. An answer of `null` (no
     * session) drops the entry; no answer (no page open, or no provider
     * installed) keeps it pending until `maxRetentionMinutes`.
     */
    beforeReplay?: (
        request: Request,
        context: BackgroundSyncReplayContext,
    ) => Request | null | Promise<Request | null>;
}

const STORE = "requests";

function openQueueDb(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => reject(request.error);
    });
}

function txDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function enqueue(name: string, entry: QueuedRequest): Promise<void> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    await txDone(tx);
    db.close();
}

async function readAll(name: string): Promise<QueuedRequest[]> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readonly");
    const all = await new Promise<QueuedRequest[]>((resolve, reject) => {
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as QueuedRequest[]);
        req.onerror = () => reject(req.error);
    });
    db.close();
    return all;
}

async function remove(name: string, id: number): Promise<void> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
}

/**
 * Serialize a request for the queue, leaving out every header named in
 * `credentialHeaders` and recording which ones were present.
 */
async function serializeRequest(
    request: Request,
    timestamp: number,
    credentialHeaders: ReadonlySet<string>,
): Promise<QueuedRequest> {
    const buffer = await request.clone().arrayBuffer();
    const headers: [string, string][] = [];
    const strippedHeaders: string[] = [];
    for (const [name, value] of request.headers.entries()) {
        if (credentialHeaders.has(name.toLowerCase())) strippedHeaders.push(name.toLowerCase());
        else headers.push([name, value]);
    }
    return {
        url: request.url,
        method: request.method,
        headers,
        body: buffer.byteLength > 0 ? buffer : null,
        timestamp,
        credentials: request.credentials,
        strippedHeaders,
    };
}

function deserializeRequest(entry: QueuedRequest): Request {
    return new Request(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body ?? undefined,
        credentials: entry.credentials,
    });
}

/**
 * Ask each open window client, in turn, for the credentials of a queued request
 * over a `MessageChannel`.
 *
 * @returns The first answer: a header record, or `null` for "no session".
 *   `undefined` when no client answered within {@link CREDENTIALS_TIMEOUT_MS}.
 */
async function askClientsForCredentials(
    sw: BgSwGlobal,
    request: BackgroundSyncCredentialsRequest,
): Promise<Record<string, string> | null | undefined> {
    const clients = (await sw.clients?.matchAll({ type: "window" })) ?? [];
    for (const client of clients) {
        const answer = await new Promise<unknown>((resolve) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => {
                channel.port1.close();
                resolve(undefined);
            }, CREDENTIALS_TIMEOUT_MS);
            channel.port1.onmessage = (event: MessageEvent) => {
                clearTimeout(timer);
                channel.port1.close();
                resolve(event.data);
            };
            client.postMessage({ type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE, ...request }, [
                channel.port2,
            ]);
        });
        if (answer !== null && typeof answer === "object" && "headers" in answer) {
            const headers = (answer as { headers: unknown }).headers;
            if (headers === null) return null;
            if (typeof headers === "object") return headers as Record<string, string>;
        }
    }
    return undefined;
}

/**
 * The default `beforeReplay`: entries stored without credentials go as-is;
 * entries with stripped credentials get the current values from an open page,
 * restricted to the header names that were stripped, so a page answer can never
 * add a credential the original request did not carry to that URL.
 *
 * @throws {Error} When no page answered — the entry stays pending.
 */
async function defaultBeforeReplay(
    sw: BgSwGlobal,
    request: Request,
    context: BackgroundSyncReplayContext,
): Promise<Request | null> {
    if (context.strippedHeaders.length === 0) return request;
    const answer = await askClientsForCredentials(sw, {
        url: request.url,
        method: request.method,
    });
    if (answer === undefined) throw new Error("background-sync: no client provided credentials");
    if (answer === null) return null;
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(answer)) {
        if (context.strippedHeaders.includes(name.toLowerCase())) headers.set(name, value);
    }
    return new Request(request, { headers });
}

/** Everything {@link replayQueue} needs besides the clock. */
interface ReplayConfig {
    name: string;
    maxRetentionMs: number;
    prepare: (
        request: Request,
        context: BackgroundSyncReplayContext,
    ) => Request | null | Promise<Request | null>;
}

/**
 * Replay every queued request once. Entries that succeed, are stale, get a 4xx
 * (a client error that will not fix itself) or that `prepare` rejects with
 * `null` are removed; entries that fail again — network error, 5xx, or a
 * `prepare` that throws — are kept for the next attempt. Throws if any entry is
 * still pending, so a `sync` handler keeps the sync registered.
 */
async function replayQueue(config: ReplayConfig, now: number): Promise<void> {
    const { name, maxRetentionMs, prepare } = config;
    const entries = await readAll(name);
    let pending = 0;

    for (const entry of entries) {
        if (entry.id === undefined) continue;
        if (now - entry.timestamp > maxRetentionMs) {
            await remove(name, entry.id);
            continue;
        }
        try {
            const request = await prepare(deserializeRequest(entry), {
                queuedAt: entry.timestamp,
                strippedHeaders: entry.strippedHeaders ?? [],
            });
            if (request === null) {
                await remove(name, entry.id);
                continue;
            }
            const response = await fetch(request);
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                await remove(name, entry.id);
            } else {
                pending += 1;
            }
        } catch {
            pending += 1;
        }
    }

    if (pending > 0) throw new Error(`background-sync: ${pending} request(s) still pending`);
}

function matches(
    match: InstallBackgroundSyncOptions["match"],
    url: URL,
    request: Request,
): boolean {
    if (!match) return true;
    return typeof match === "function" ? match(url, request) : match.test(url.href);
}

/**
 * Install the background-sync queue: on a failed mutating request, the request
 * is serialized to IndexedDB (without its credential headers) and a sync is
 * registered; the original fetch still rejects (so your app can show an offline
 * state), and the request is replayed later when the network returns.
 *
 * Without the Background Sync API (every non-Chromium browser), the queue is
 * drained opportunistically whenever a `GET` goes through the worker.
 *
 * @tempest-limits empty-catch — `registration.sync.register` is unavailable on
 * every non-Chromium browser and fails on a revoked background-sync permission.
 * The entry is already durable in IndexedDB at that point, and the queue is also
 * drained opportunistically on the next successful request, so losing the OS-level
 * wakeup degrades *when* the replay happens, not *whether* it happens.
 */
export function installBackgroundSync(options: InstallBackgroundSyncOptions = {}): void {
    const sw = getSwScope();
    const {
        match,
        queueName = DEFAULT_QUEUE_NAME,
        maxRetentionMinutes = 1440,
        periodicSyncTag = `${options.queueName ?? DEFAULT_QUEUE_NAME}-periodic`,
        credentialHeaders = DEFAULT_CREDENTIAL_HEADERS,
        beforeReplay,
    } = options;
    const stripped = new Set(credentialHeaders.map((name) => name.toLowerCase()));
    const replay: ReplayConfig = {
        name: queueName,
        maxRetentionMs: maxRetentionMinutes * 60 * 1000,
        prepare: beforeReplay ?? ((request, context) => defaultBeforeReplay(sw, request, context)),
    };

    sw.addEventListener("fetch", (event) => {
        const request = event.request;
        if (request.method === "GET" || request.method === "HEAD") return;

        const url = new URL(request.url);
        if (!matches(match, url, request)) return;

        event.respondWith(
            fetch(request.clone()).catch(async (error) => {
                const entry = await serializeRequest(request, Date.now(), stripped);
                await enqueue(queueName, entry);
                try {
                    await sw.registration.sync?.register(queueName);
                } catch {
                    /* empty */
                }
                throw error;
            }),
        );
    });

    sw.addEventListener("sync", (event) => {
        if (event.tag !== queueName) return;
        event.waitUntil(replayQueue(replay, Date.now()));
    });

    sw.addEventListener("periodicsync", (event) => {
        if (event.tag !== periodicSyncTag) return;
        event.waitUntil(replayQueue(replay, Date.now()).catch(() => undefined));
    });

    sw.addEventListener("fetch", (event) => {
        if (sw.registration.sync) return;
        if (event.request.method !== "GET") return;
        event.waitUntil(replayQueue(replay, Date.now()).catch(() => undefined));
    });
}

/**
 * Delete the background-sync queue — every request still waiting to be
 * replayed — by dropping its IndexedDB database. Call it on logout (or use
 * `clearSessionData()`, which also clears the runtime caches) so mutations made
 * under one session are never replayed under the next.
 *
 * Works from the page and from the worker. The worker closes its connection on
 * `versionchange`, so the deletion is never blocked for longer than one queue
 * operation; the next failed request recreates the database.
 *
 * @param queueName - The `queueName` given to {@link installBackgroundSync}.
 *   Default `tempest-bg-sync`.
 * @returns `true` once the database is gone; `false` when IndexedDB is
 *   unavailable (SSR, old browsers).
 *
 * @example
 * import { clearBackgroundSyncQueue } from "tempest-react-sdk/sw";
 *
 * await clearBackgroundSyncQueue();
 */
export function clearBackgroundSyncQueue(queueName: string = DEFAULT_QUEUE_NAME): Promise<boolean> {
    if (typeof indexedDB === "undefined") return Promise.resolve(false);
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(queueName);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Answer the worker's request for the current credentials of a queued request
 * (see `beforeReplay` on {@link installBackgroundSync}). Install it once in the
 * page, next to your auth setup; it reads the token at replay time, so the queue
 * never has to store it.
 *
 * Return `null` from `getHeaders` when there is no session: the worker then drops
 * the entry instead of replaying it anonymously. Throwing leaves it pending. The
 * worker only applies headers whose names the original request carried, so
 * returning `Authorization` for every URL never leaks it to a URL that did not
 * receive it in the first place.
 *
 * @param getHeaders - Resolves the headers for one queued request.
 * @returns A function that removes the listener. A no-op outside the browser.
 *
 * @example
 * import { provideBackgroundSyncCredentials } from "tempest-react-sdk/sw";
 *
 * const stop = provideBackgroundSyncCredentials(() => {
 *     const token = localStorage.getItem("token");
 *     return token ? { Authorization: `Bearer ${token}` } : null;
 * });
 */
export function provideBackgroundSyncCredentials(
    getHeaders: BackgroundSyncCredentialsProvider,
): () => void {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return () => undefined;
    const container = navigator.serviceWorker;
    const onMessage = (event: MessageEvent): void => {
        const data = event.data as Partial<BackgroundSyncCredentialsRequest> & { type?: unknown };
        const port = event.ports[0];
        if (data?.type !== BACKGROUND_SYNC_CREDENTIALS_MESSAGE || !port) return;
        void (async () => {
            try {
                const headers = await getHeaders({
                    url: String(data.url),
                    method: String(data.method),
                });
                port.postMessage({ headers });
            } catch {
                port.close();
            }
        })();
    };
    container.addEventListener("message", onMessage);
    return () => container.removeEventListener("message", onMessage);
}
