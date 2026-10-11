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
    /** Id of the window client that issued the request, when there is one. */
    clientId?: string;
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
    clients?: {
        matchAll(options: { type: "window" }): Promise<readonly WindowClientLike[]>;
        get(id: string): Promise<WindowClientLike | undefined>;
    };
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
    /**
     * Fingerprint of who was signed in when the request failed, as reported by
     * the issuing page; `null` for "nobody"; absent when the page had no
     * `getPrincipal` or did not answer.
     */
    owner?: string | null;
    /** Set while the worker is still asking the issuing page for the owner. */
    ownerPending?: boolean;
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

/**
 * How long a replay waits on an entry whose owner is still being stamped. Past
 * it (the worker died mid-question), the entry is treated as owner-less.
 */
const OWNER_STAMP_GRACE_MS = CREDENTIALS_TIMEOUT_MS * 2;

/** What a queued request looked like when it was stored, passed to `beforeReplay`. */
export interface BackgroundSyncReplayContext {
    /** Epoch milliseconds of the original failed attempt. */
    queuedAt: number;
    /** Lower-cased credential header names stripped before the entry was stored. */
    strippedHeaders: readonly string[];
    /**
     * Owner fingerprint stamped at enqueue time (see `getPrincipal` on
     * {@link provideBackgroundSyncCredentials}); `null` when nobody was signed in;
     * `undefined` when the entry is not bound to an owner.
     */
    owner: string | null | undefined;
}

/** The request a window client is asked about, as sent by the worker. */
export interface BackgroundSyncCredentialsRequest {
    /** Absolute URL of the queued request. */
    url: string;
    /** HTTP method of the queued request. */
    method: string;
    /**
     * `"enqueue"` when the worker only wants the owner of a request that just
     * failed; `"replay"` when it is about to send it and needs the credentials.
     */
    phase: "enqueue" | "replay";
}

/** Options for {@link provideBackgroundSyncCredentials}. */
export interface ProvideBackgroundSyncCredentialsOptions {
    /**
     * Who is signed in right now — a stable, non-secret id such as the user id;
     * `null`/`undefined` when nobody is. Read when a request is queued and again
     * when it is replayed: an entry is only sent while the same principal is
     * signed in, and dropped otherwise, so a mutation queued by one account is
     * never sent with another account's credentials even when the app forgets
     * `clearSessionData()` on logout. Only a SHA-256 fingerprint reaches the
     * queue, never the value itself.
     */
    getPrincipal?: () => string | null | undefined | Promise<string | null | undefined>;
}

/** A window client's parsed answer. */
interface ClientAnswer {
    headers: Record<string, string> | null;
    owner: string | null | undefined;
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
     * The context carries the entry's `owner`, so a custom hook can apply the
     * same rule as the default.
     *
     * Default: entries with neither stripped credentials nor an owner are
     * replayed as-is. The others ask the open window clients over `postMessage`
     * (see {@link provideBackgroundSyncCredentials}): an owner that differs from
     * the one signed in now drops the entry — a mutation is never sent
     * anonymously or as somebody else; `null` headers (no session) drop it too;
     * otherwise only the stripped header names are re-applied. No answer (no
     * page open, or no provider installed) keeps it pending until
     * `maxRetentionMinutes`.
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

async function enqueue(name: string, entry: QueuedRequest): Promise<number> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readwrite");
    const add = tx.objectStore(STORE).add(entry);
    await txDone(tx);
    db.close();
    return add.result as number;
}

/**
 * Record the owner of a queued entry and clear its `ownerPending` flag. A no-op
 * when the entry is already gone (replayed, or the queue was cleared).
 */
async function stampOwner(
    name: string,
    id: number,
    owner: string | null | undefined,
): Promise<void> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
        const entry = get.result as QueuedRequest | undefined;
        if (!entry) return;
        delete entry.ownerPending;
        if (owner !== undefined) entry.owner = owner;
        store.put(entry);
    };
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
 * Ask one window client about a queued request over a `MessageChannel`.
 *
 * @returns The parsed answer, or `undefined` when the client stayed silent for
 *   {@link CREDENTIALS_TIMEOUT_MS} or answered something unrecognizable.
 */
async function askClient(
    client: WindowClientLike,
    request: BackgroundSyncCredentialsRequest,
): Promise<ClientAnswer | undefined> {
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
    if (answer === null || typeof answer !== "object" || !("headers" in answer)) return undefined;
    const { headers, owner } = answer as { headers: unknown; owner?: unknown };
    return {
        headers:
            headers !== null && typeof headers === "object"
                ? (headers as Record<string, string>)
                : null,
        owner: typeof owner === "string" || owner === null ? owner : undefined,
    };
}

/**
 * Ask each open window client, in turn, until one answers.
 *
 * @returns The first answer, or `undefined` when no client answered.
 */
async function askClients(
    sw: BgSwGlobal,
    request: BackgroundSyncCredentialsRequest,
): Promise<ClientAnswer | undefined> {
    const clients = (await sw.clients?.matchAll({ type: "window" })) ?? [];
    for (const client of clients) {
        const answer = await askClient(client, request);
        if (answer) return answer;
    }
    return undefined;
}

/**
 * The default `beforeReplay`. An entry with neither stripped credentials nor an
 * owner goes as-is. Otherwise an open page is asked: an owner mismatch drops the
 * entry, `null` headers for a credentialed entry drop it, and only the header
 * names that were stripped are re-applied, so a page answer can never add a
 * credential the original request did not carry to that URL.
 *
 * @throws {Error} When no page answered — the entry stays pending.
 */
async function defaultBeforeReplay(
    sw: BgSwGlobal,
    request: Request,
    context: BackgroundSyncReplayContext,
): Promise<Request | null> {
    const bound = context.owner !== undefined;
    if (context.strippedHeaders.length === 0 && !bound) return request;
    const answer = await askClients(sw, {
        url: request.url,
        method: request.method,
        phase: "replay",
    });
    if (answer === undefined) throw new Error("background-sync: no client provided credentials");
    if (bound && answer.owner !== context.owner) return null;
    if (context.strippedHeaders.length === 0) return request;
    if (answer.headers === null) return null;
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(answer.headers)) {
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
 * `prepare` that throws — are kept for the next attempt, and so is an entry
 * whose owner is still being stamped (for up to {@link OWNER_STAMP_GRACE_MS}). Throws if any entry is
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
        const stamping = entry.ownerPending === true;
        if (stamping && now - entry.timestamp < OWNER_STAMP_GRACE_MS) {
            pending += 1;
            continue;
        }
        try {
            const request = await prepare(deserializeRequest(entry), {
                queuedAt: entry.timestamp,
                strippedHeaders: entry.strippedHeaders ?? [],
                owner: stamping ? undefined : entry.owner,
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
 * Right after queueing, the worker asks the page that issued the request who is
 * signed in (`getPrincipal` on {@link provideBackgroundSyncCredentials}) and
 * stamps the entry with that owner, without delaying the rejection. A page that
 * does not answer leaves the entry owner-less, replayed under the credential
 * rules alone.
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
                const issuer = event.clientId ? await sw.clients?.get(event.clientId) : undefined;
                const entry = await serializeRequest(request, Date.now(), stripped);
                if (issuer) entry.ownerPending = true;
                const id = await enqueue(queueName, entry);
                if (issuer) {
                    event.waitUntil(
                        askClient(issuer, {
                            url: request.url,
                            method: request.method,
                            phase: "enqueue",
                        }).then((answer) => stampOwner(queueName, id, answer?.owner)),
                    );
                }
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
 * One-way fingerprint of a principal: hex SHA-256, so the queue can compare
 * owners without ever holding the id itself.
 *
 * @returns The fingerprint, or `null` when nobody is signed in.
 */
async function ownerFingerprint(principal: string | null | undefined): Promise<string | null> {
    if (principal === null || principal === undefined || principal === "") return null;
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`tempest-bg-sync:${principal}`),
    );
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Answer the worker's questions about queued requests (see `beforeReplay` on
 * {@link installBackgroundSync}). Install it once in the page, next to your auth
 * setup; it reads the token at replay time, so the queue never has to store it.
 *
 * Return `null` from `getHeaders` when there is no session: the worker then drops
 * the entry instead of replaying it anonymously. Throwing leaves it pending. The
 * worker only applies headers whose names the original request carried, so
 * returning `Authorization` for every URL never leaks it to a URL that did not
 * receive it in the first place.
 *
 * Pass `getPrincipal` to bind each entry to whoever queued it: the worker asks
 * for the owner right after queueing and again before replaying, and drops the
 * entry when they differ. Without it, entries are not bound, and only
 * `clearSessionData()` on logout keeps one account's mutation from going out
 * with the next account's token.
 *
 * @param getHeaders - Resolves the headers for one queued request at replay.
 * @param options - `getPrincipal` binds entries to their owner.
 * @returns A function that removes the listener. A no-op outside the browser.
 *
 * @example
 * import { provideBackgroundSyncCredentials } from "tempest-react-sdk/sw";
 *
 * const stop = provideBackgroundSyncCredentials(
 *     () => {
 *         const token = localStorage.getItem("token");
 *         return token ? { Authorization: `Bearer ${token}` } : null;
 *     },
 *     { getPrincipal: () => localStorage.getItem("userId") },
 * );
 */
export function provideBackgroundSyncCredentials(
    getHeaders: BackgroundSyncCredentialsProvider,
    options: ProvideBackgroundSyncCredentialsOptions = {},
): () => void {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return () => undefined;
    const container = navigator.serviceWorker;
    const { getPrincipal } = options;
    const onMessage = (event: MessageEvent): void => {
        const data = event.data as Partial<BackgroundSyncCredentialsRequest> & { type?: unknown };
        const port = event.ports[0];
        if (data?.type !== BACKGROUND_SYNC_CREDENTIALS_MESSAGE || !port) return;
        const request: BackgroundSyncCredentialsRequest = {
            url: String(data.url),
            method: String(data.method),
            phase: data.phase === "enqueue" ? "enqueue" : "replay",
        };
        void (async () => {
            try {
                const headers = request.phase === "enqueue" ? null : await getHeaders(request);
                const answer: { headers: Record<string, string> | null; owner?: string | null } = {
                    headers,
                };
                if (getPrincipal) answer.owner = await ownerFingerprint(await getPrincipal());
                port.postMessage(answer);
            } catch {
                port.close();
            }
        })();
    };
    container.addEventListener("message", onMessage);
    return () => container.removeEventListener("message", onMessage);
}
