/**
 * Background-sync helper: queue failed mutating requests (POST/PUT/PATCH/DELETE)
 * while offline and replay them when connectivity returns. A dependency-free
 * take on Workbox's `BackgroundSyncPlugin`, backed by a tiny IndexedDB queue.
 *
 * Import inside your `sw.ts`. Uses the Background Sync API (`registration.sync`)
 * when available, and also replays opportunistically on the next request as a
 * fallback for browsers without it (e.g. Safari).
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

interface BgSwGlobal {
    registration: { sync?: { register(tag: string): Promise<void> } };
    addEventListener(type: "sync", listener: (event: SyncEventLike) => void): void;
    addEventListener(type: "fetch", listener: (event: BgFetchEventLike) => void): void;
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
}

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
}

const STORE = "requests";

function openQueueDb(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
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

async function serializeRequest(request: Request, timestamp: number): Promise<QueuedRequest> {
    const buffer = await request.clone().arrayBuffer();
    return {
        url: request.url,
        method: request.method,
        headers: [...request.headers.entries()],
        body: buffer.byteLength > 0 ? buffer : null,
        timestamp,
    };
}

function deserializeRequest(entry: QueuedRequest): Request {
    return new Request(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body ?? undefined,
    });
}

/**
 * Replay every queued request once. Successful (or stale) entries are removed;
 * entries that fail again are kept for the next attempt. Throws if any entry
 * still fails, so a `sync` handler keeps the sync pending.
 */
async function replayQueue(name: string, maxRetentionMs: number, now: number): Promise<void> {
    const entries = await readAll(name);
    let pending = 0;

    for (const entry of entries) {
        if (entry.id === undefined) continue;
        if (now - entry.timestamp > maxRetentionMs) {
            await remove(name, entry.id);
            continue;
        }
        try {
            const response = await fetch(deserializeRequest(entry));
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                // 2xx = done; 4xx = client error that won't fix itself → drop it.
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
 * is serialized to IndexedDB and a sync is registered; the original fetch still
 * rejects (so your app can show an offline state), and the request is replayed
 * later when the network returns.
 */
export function installBackgroundSync(options: InstallBackgroundSyncOptions = {}): void {
    const sw = getSwScope();
    const { match, queueName = "tempest-bg-sync", maxRetentionMinutes = 1440 } = options;
    const maxRetentionMs = maxRetentionMinutes * 60 * 1000;

    sw.addEventListener("fetch", (event) => {
        const request = event.request;
        if (request.method === "GET" || request.method === "HEAD") return;

        const url = new URL(request.url);
        if (!matches(match, url, request)) return;

        event.respondWith(
            fetch(request.clone()).catch(async (error) => {
                const entry = await serializeRequest(request, Date.now());
                await enqueue(queueName, entry);
                try {
                    await sw.registration.sync?.register(queueName);
                } catch {
                    // Background Sync API unavailable — opportunistic replay covers it.
                }
                throw error;
            }),
        );
    });

    sw.addEventListener("sync", (event) => {
        if (event.tag !== queueName) return;
        event.waitUntil(replayQueue(queueName, maxRetentionMs, Date.now()));
    });

    // Fallback for browsers without the Background Sync API: whenever a GET
    // succeeds (a sign we're online), drain the queue opportunistically.
    sw.addEventListener("fetch", (event) => {
        if (sw.registration.sync) return; // native sync will handle it
        if (event.request.method !== "GET") return;
        event.waitUntil(replayQueue(queueName, maxRetentionMs, Date.now()).catch(() => undefined));
    });
}
