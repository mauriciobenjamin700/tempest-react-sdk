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
 * replay the worker asks the open pages for the *current* credentials — see
 * {@link provideBackgroundSyncCredentials} — or a custom `beforeReplay` hook.
 * Credentials carried in the URL or the body are out of reach and are stored
 * as sent.
 *
 * @example
 *   import { installBackgroundSync } from "tempest-react-sdk/sw";
 *
 *   installBackgroundSync({ match: (url) => url.pathname.startsWith("/api/") });
 */
import { isDevBuild } from "../utils/dev-mode";
import { DEFAULT_CREDENTIAL_HEADERS, credentialHeaderSet } from "./credential-headers";

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

/**
 * How an entry is tied to whoever queued it:
 * - `"bound"`: the issuing page reported a principal (or `null` for nobody);
 *   the entry only goes out while the same one is signed in.
 * - `"unbound"`: the issuing page answered without `getPrincipal`.
 * - `"unknown"`: nobody could say — no issuing tab, no answer, an error, or an
 *   entry written before owners existed. Fails closed, with or without stripped
 *   credentials: a cookie session rides along on the replay, so an entry with no
 *   credential header is checked like any other.
 *
 * While the worker is still asking, the stored state is `"pending"`, which a
 * replay never sees: it waits, then reads a stamp that never came as `"unknown"`.
 */
export type BackgroundSyncOwnerState = "bound" | "unbound" | "unknown";

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
    /** Absent on entries written before 0.77 — read as `"unknown"`. */
    ownerState?: BackgroundSyncOwnerState | "pending";
    /** Fingerprint of the principal under `"bound"`; `null` for "nobody signed in". */
    owner?: string | null;
}

/** Default IndexedDB database name (and sync tag) of the background-sync queue. */
const DEFAULT_QUEUE_NAME = "tempest-bg-sync";

/**
 * Schema version of the queue database. Version 2 adds the `meta` store (the
 * clear epoch) and migrates version-1 entries, scrubbing their plaintext
 * credential headers on first open.
 */
const DB_VERSION = 2;
const STORE = "requests";
const META = "meta";
const EPOCH_KEY = "epoch";

/**
 * `type` of the message the worker posts to window clients to ask about a queued
 * request. Answered by {@link provideBackgroundSyncCredentials}.
 */
export const BACKGROUND_SYNC_CREDENTIALS_MESSAGE = "tempest:bg-sync-credentials";

/** How long the worker waits for the window clients to answer, in milliseconds. */
const CREDENTIALS_TIMEOUT_MS = 3000;

/**
 * How long a replay waits on an entry whose owner is still being stamped. Past
 * it (the worker died mid-question), the owner is read as `"unknown"`.
 */
const OWNER_STAMP_GRACE_MS = CREDENTIALS_TIMEOUT_MS * 2;

/** What a queued request looked like when it was stored, passed to `beforeReplay`. */
export interface BackgroundSyncReplayContext {
    /** Epoch milliseconds of the original failed attempt. */
    queuedAt: number;
    /** Lower-cased credential header names stripped before the entry was stored. */
    strippedHeaders: readonly string[];
    /** How the entry is tied to its owner. */
    ownerState: BackgroundSyncOwnerState;
    /** Owner fingerprint under `"bound"` (`null` for nobody); `undefined` otherwise. */
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

/**
 * Resolve the credentials for a queued request: a header record to apply, or
 * `null` when there is no session (the entry is then dropped).
 */
export type BackgroundSyncCredentialsProvider = (
    request: BackgroundSyncCredentialsRequest,
) => Record<string, string> | null | Promise<Record<string, string> | null>;

/** Options for {@link provideBackgroundSyncCredentials}. */
export interface ProvideBackgroundSyncCredentialsOptions {
    /**
     * Who is signed in right now — a stable, non-secret id such as the user id;
     * `null`/`undefined` when nobody is. Read when a request is queued and again
     * when it is replayed: an entry is only sent while the same principal is
     * signed in, and dropped otherwise, so a mutation queued by one account is
     * never sent with another account's credentials even when the app forgets
     * `clearSessionData()` on logout. Only a SHA-256 fingerprint reaches the
     * queue, never the value itself. A throw is answered as an explicit error,
     * which leaves the owner unknown (fail closed).
     */
    getPrincipal?: () => string | null | undefined | Promise<string | null | undefined>;
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
    /**
     * Also drain the queue on the `periodicsync` event carrying this tag,
     * complementing the one-off `sync` replay so long-pending mutations retry
     * even without a fresh navigation. Register the periodic sync from the main
     * thread with {@link registerPeriodicSync}. Default `${queueName}-periodic`.
     */
    periodicSyncTag?: string;
    /**
     * Header names stripped before a request is persisted — and stripped again on
     * replay, so entries written by an older version never go out with the
     * credential they stored. Default {@link DEFAULT_CREDENTIAL_HEADERS}; extend it
     * for a custom credential header (`[...DEFAULT_CREDENTIAL_HEADERS,
     * "x-tenant-key"]`). Passing `[]` restores the pre-0.77 behavior of
     * persisting and replaying every header, credentials included.
     */
    credentialHeaders?: readonly string[];
    /**
     * Prepare each queued request right before it is replayed: return the
     * request to send (typically with the current credentials applied) or
     * `null` to drop the entry for good. A thrown error keeps the entry pending.
     * The context carries the entry's owner, so a custom hook can apply the
     * same rule as the default.
     *
     * Default: only an `"unbound"` entry with no stripped credentials is
     * replayed as-is, without asking. Every other entry — credentialed or not —
     * asks every open window client in parallel (see
     * {@link provideBackgroundSyncCredentials}) and picks the answer that fits:
     * - `"bound"`: the answer whose owner matches; none among valid answers →
     *   dropped, never sent anonymously or as somebody else;
     * - `"unknown"`: only an answer without a principal (an app that does not use
     *   `getPrincipal`); every answer has one → dropped. This holds for an entry
     *   with no credential header too, since the browser attaches the cookies of
     *   whoever is signed in at replay time;
     * - `"unbound"`: any answer, preferring one without a principal.
     * Then `null` headers drop a credentialed entry, an answer that lacks one of
     * the stripped headers keeps it pending, and only the stripped names are
     * re-applied. No valid answer at all keeps it pending until
     * `maxRetentionMinutes` (and warns once per replay in development builds) —
     * so a page that never calls {@link provideBackgroundSyncCredentials} leaves
     * every entry it queued `"unknown"`, and none of them is replayed.
     */
    beforeReplay?: (
        request: Request,
        context: BackgroundSyncReplayContext,
    ) => Request | null | Promise<Request | null>;
}

/**
 * Move credential headers out of a header list.
 *
 * @returns The remaining headers and the lower-cased names removed.
 */
function splitHeaders(
    headers: Iterable<[string, string]>,
    credentialHeaders: ReadonlySet<string>,
): { kept: [string, string][]; stripped: string[] } {
    const kept: [string, string][] = [];
    const stripped: string[] = [];
    for (const [name, value] of headers) {
        if (credentialHeaders.has(name.toLowerCase())) stripped.push(name.toLowerCase());
        else kept.push([name, value]);
    }
    return { kept, stripped };
}

/**
 * Scrub version-1 entries during the upgrade: their credential headers were
 * stored in plaintext, so they are removed from disk on the first open, recorded
 * as stripped, and the owner is marked unknown.
 */
function migrateLegacyEntries(store: IDBObjectStore, credentialHeaders: ReadonlySet<string>): void {
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const entry = cursor.value as QueuedRequest;
        const { kept, stripped } = splitHeaders(entry.headers, credentialHeaders);
        cursor.update({
            ...entry,
            headers: kept,
            strippedHeaders: [...new Set([...(entry.strippedHeaders ?? []), ...stripped])],
            ownerState: entry.ownerState ?? "unknown",
        });
        cursor.continue();
    };
}

function openQueueDb(
    name: string,
    credentialHeaders: ReadonlySet<string> = credentialHeaderSet(),
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
            } else if (event.oldVersion < 2 && request.transaction) {
                migrateLegacyEntries(request.transaction.objectStore(STORE), credentialHeaders);
            }
            if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
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

/** The current clear epoch: bumped by every {@link clearBackgroundSyncQueue}. */
async function readEpoch(name: string, credentialHeaders: ReadonlySet<string>): Promise<number> {
    const db = await openQueueDb(name, credentialHeaders);
    const tx = db.transaction(META, "readonly");
    const get = tx.objectStore(META).get(EPOCH_KEY);
    await txDone(tx);
    db.close();
    return (get.result as number | undefined) ?? 0;
}

/**
 * Add an entry unless the queue was cleared since `epoch` was read — checked in
 * the same transaction as the write, so a logout that lands while the request
 * is still failing never lets it into the next session's queue.
 *
 * @returns The new entry's key, or `undefined` when the clear won.
 */
async function enqueue(
    name: string,
    entry: QueuedRequest,
    epoch: number,
    credentialHeaders: ReadonlySet<string>,
): Promise<number | undefined> {
    const db = await openQueueDb(name, credentialHeaders);
    const tx = db.transaction([STORE, META], "readwrite");
    let id: number | undefined;
    const current = tx.objectStore(META).get(EPOCH_KEY);
    current.onsuccess = () => {
        if (((current.result as number | undefined) ?? 0) !== epoch) return;
        const add = tx.objectStore(STORE).add(entry);
        add.onsuccess = () => {
            id = add.result as number;
        };
    };
    await txDone(tx);
    db.close();
    return id;
}

/**
 * Record how an entry is owned. A no-op when the entry is already gone
 * (replayed, or the queue was cleared).
 */
async function stampOwner(
    name: string,
    id: number,
    ownerState: BackgroundSyncOwnerState,
    owner: string | null | undefined,
): Promise<void> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
        const entry = get.result as QueuedRequest | undefined;
        if (!entry) return;
        entry.ownerState = ownerState;
        if (ownerState === "bound") entry.owner = owner ?? null;
        store.put(entry);
    };
    await txDone(tx);
    db.close();
}

async function readAll(
    name: string,
    credentialHeaders: ReadonlySet<string>,
): Promise<QueuedRequest[]> {
    const db = await openQueueDb(name, credentialHeaders);
    const tx = db.transaction(STORE, "readonly");
    const all = await new Promise<QueuedRequest[]>((resolve, reject) => {
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as QueuedRequest[]);
        req.onerror = () => reject(req.error);
    });
    db.close();
    return all;
}

/** Whether an entry is still in the queue — `false` once it was cleared. */
async function stillQueued(name: string, id: number): Promise<boolean> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readonly");
    const count = tx.objectStore(STORE).count(id);
    await txDone(tx);
    db.close();
    return count.result > 0;
}

async function remove(name: string, id: number): Promise<void> {
    const db = await openQueueDb(name);
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
}

/**
 * Serialize a request for the queue, leaving out every credential header and
 * recording which ones were present.
 */
async function serializeRequest(
    request: Request,
    timestamp: number,
    credentialHeaders: ReadonlySet<string>,
    ownerState: QueuedRequest["ownerState"],
): Promise<QueuedRequest> {
    const buffer = await request.clone().arrayBuffer();
    const { kept, stripped } = splitHeaders(request.headers.entries(), credentialHeaders);
    return {
        url: request.url,
        method: request.method,
        headers: kept,
        body: buffer.byteLength > 0 ? buffer : null,
        timestamp,
        credentials: request.credentials,
        strippedHeaders: stripped,
        ownerState,
    };
}

/**
 * Rebuild a stored request, stripping credential headers once more so an entry
 * that still holds one (a custom `credentialHeaders` the migration did not know)
 * never replays it.
 */
function deserializeRequest(
    entry: QueuedRequest,
    credentialHeaders: ReadonlySet<string>,
): { request: Request; strippedHeaders: string[] } {
    const { kept, stripped } = splitHeaders(entry.headers, credentialHeaders);
    return {
        request: new Request(entry.url, {
            method: entry.method,
            headers: kept,
            body: entry.body ?? undefined,
            credentials: entry.credentials,
        }),
        strippedHeaders: [...new Set([...(entry.strippedHeaders ?? []), ...stripped])],
    };
}

/** A window client's parsed answer. */
interface ClientAnswer {
    headers: Record<string, string> | null;
    /** Whether the page has `getPrincipal`. */
    hasPrincipal: boolean;
    owner: string | null;
}

/**
 * Ask one window client about a queued request over a `MessageChannel`.
 *
 * @returns The parsed answer, or `undefined` when the client stayed silent until
 *   `deadline`, answered `{ error: true }`, or answered something unrecognizable.
 */
async function askClient(
    client: WindowClientLike,
    request: BackgroundSyncCredentialsRequest,
    deadline: Promise<void>,
): Promise<ClientAnswer | undefined> {
    const channel = new MessageChannel();
    const answer = await Promise.race([
        new Promise<unknown>((resolve) => {
            channel.port1.onmessage = (event: MessageEvent) => resolve(event.data);
            client.postMessage({ type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE, ...request }, [
                channel.port2,
            ]);
        }),
        deadline.then(() => undefined),
    ]);
    channel.port1.close();
    if (answer === null || typeof answer !== "object" || !("headers" in answer)) return undefined;
    const { headers, owner } = answer as { headers: unknown; owner?: unknown };
    const hasPrincipal = "owner" in answer;
    if (hasPrincipal && typeof owner !== "string" && owner !== null) return undefined;
    return {
        headers:
            headers !== null && typeof headers === "object"
                ? (headers as Record<string, string>)
                : null,
        hasPrincipal,
        owner: hasPrincipal ? (owner as string | null) : null,
    };
}

/** A deadline shared by every client asked in one round. */
function startDeadline(): { promise: Promise<void>; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CREDENTIALS_TIMEOUT_MS);
    });
    return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * Ask every open window client in parallel, under one shared deadline.
 *
 * @returns Every valid answer; empty when nobody answered.
 */
async function askAllClients(
    sw: BgSwGlobal,
    request: BackgroundSyncCredentialsRequest,
): Promise<ClientAnswer[]> {
    const clients = (await sw.clients?.matchAll({ type: "window" })) ?? [];
    if (clients.length === 0) return [];
    const deadline = startDeadline();
    const answers = await Promise.all(
        clients.map((client) => askClient(client, request, deadline.promise)),
    );
    deadline.cancel();
    return answers.filter((answer): answer is ClientAnswer => answer !== undefined);
}

/** State of one replay pass: answers cached per URL + method, and the warning flag. */
interface ReplayRun {
    ask(request: Request): Promise<ClientAnswer[]>;
    warnNoAnswer(): void;
}

function createReplayRun(sw: BgSwGlobal): ReplayRun {
    const answers = new Map<string, Promise<ClientAnswer[]>>();
    let warned = false;
    return {
        ask(request) {
            const key = `${request.method} ${request.url}`;
            let pending = answers.get(key);
            if (!pending) {
                pending = askAllClients(sw, {
                    url: request.url,
                    method: request.method,
                    phase: "replay",
                });
                answers.set(key, pending);
            }
            return pending;
        },
        warnNoAnswer() {
            if (warned || !isDevBuild()) return;
            warned = true;
            console.warn(
                "[tempest-react-sdk/sw] background-sync: a queued request needs an open page " +
                    "to confirm who is signed in or to supply the current credentials, and no " +
                    "open page answered. Call " +
                    "provideBackgroundSyncCredentials() in the page; the entry stays pending.",
            );
        },
    };
}

/** Pick the answer an entry may be replayed with, per its owner state. */
function chooseAnswer(
    answers: readonly ClientAnswer[],
    context: BackgroundSyncReplayContext,
): ClientAnswer | undefined {
    switch (context.ownerState) {
        case "bound":
            return answers.find((answer) => answer.hasPrincipal && answer.owner === context.owner);
        case "unknown":
            return answers.find((answer) => !answer.hasPrincipal);
        case "unbound":
            return answers.find((answer) => !answer.hasPrincipal) ?? answers[0];
    }
}

/**
 * The default `beforeReplay` (rules on {@link InstallBackgroundSyncOptions}).
 *
 * @throws {Error} When no page answered, or the chosen answer lacks a stripped
 *   header — the entry stays pending.
 */
async function defaultBeforeReplay(
    run: ReplayRun,
    request: Request,
    context: BackgroundSyncReplayContext,
): Promise<Request | null> {
    const credentialed = context.strippedHeaders.length > 0;
    if (!credentialed && context.ownerState === "unbound") return request;
    const answers = await run.ask(request);
    if (answers.length === 0) {
        run.warnNoAnswer();
        throw new Error("background-sync: no client answered");
    }
    const chosen = chooseAnswer(answers, context);
    if (!chosen) return null;
    if (!credentialed) return request;
    if (chosen.headers === null) return null;
    const provided = new Map(
        Object.entries(chosen.headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
    if (context.strippedHeaders.some((name) => !provided.has(name))) {
        throw new Error("background-sync: the answer lacks a stripped credential header");
    }
    const headers = new Headers(request.headers);
    for (const name of context.strippedHeaders) headers.set(name, provided.get(name) as string);
    return new Request(request, { headers });
}

/** Everything {@link replayQueue} needs besides the clock. */
interface ReplayConfig {
    sw: BgSwGlobal;
    name: string;
    maxRetentionMs: number;
    credentialHeaders: ReadonlySet<string>;
    beforeReplay?: InstallBackgroundSyncOptions["beforeReplay"];
}

/**
 * Replay every queued request once. Entries that succeed, are stale, get a 4xx
 * (a client error that will not fix itself) or that the preparation rejects with
 * `null` are removed; entries that fail again — network error, 5xx, or a
 * preparation that throws — are kept, and so is an entry whose owner is still
 * being stamped (for up to {@link OWNER_STAMP_GRACE_MS}). Each entry is checked
 * against the store right before it is sent, so a queue cleared mid-replay stops
 * the replay. Throws if any entry is still pending, so a `sync` handler keeps
 * the sync registered.
 */
async function replayQueue(config: ReplayConfig, now: number): Promise<void> {
    const { sw, name, maxRetentionMs, credentialHeaders, beforeReplay } = config;
    const run = createReplayRun(sw);
    const prepare =
        beforeReplay ??
        ((request: Request, context: BackgroundSyncReplayContext) =>
            defaultBeforeReplay(run, request, context));
    const entries = await readAll(name, credentialHeaders);
    let pending = 0;

    for (const entry of entries) {
        if (entry.id === undefined) continue;
        if (now - entry.timestamp > maxRetentionMs) {
            await remove(name, entry.id);
            continue;
        }
        const state = entry.ownerState ?? "unknown";
        if (state === "pending" && now - entry.timestamp < OWNER_STAMP_GRACE_MS) {
            pending += 1;
            continue;
        }
        const ownerState: BackgroundSyncOwnerState = state === "pending" ? "unknown" : state;
        try {
            const { request: stored, strippedHeaders } = deserializeRequest(
                entry,
                credentialHeaders,
            );
            const request = await prepare(stored, {
                queuedAt: entry.timestamp,
                strippedHeaders,
                ownerState,
                owner: ownerState === "bound" ? (entry.owner ?? null) : undefined,
            });
            if (!(await stillQueued(name, entry.id))) continue;
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

/**
 * The replay in flight per queue. `sync`, `periodicsync` and the Safari fallback
 * can fire together; sharing one pass keeps a mutation from being sent twice.
 */
const replaysInFlight = new Map<string, Promise<void>>();

function drainQueue(config: ReplayConfig): Promise<void> {
    const running = replaysInFlight.get(config.name);
    if (running) return running;
    const pass = replayQueue(config, Date.now()).finally(() => {
        replaysInFlight.delete(config.name);
    });
    replaysInFlight.set(config.name, pass);
    return pass;
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
 * Ask the issuing page who owns a just-queued entry and record it.
 *
 * @returns Resolves once the owner is stamped; never rejects.
 */
async function stampFromIssuer(
    name: string,
    id: number,
    issuer: WindowClientLike,
    request: Request,
): Promise<void> {
    const deadline = startDeadline();
    const answer = await askClient(
        issuer,
        { url: request.url, method: request.method, phase: "enqueue" },
        deadline.promise,
    );
    deadline.cancel();
    const state: BackgroundSyncOwnerState = !answer
        ? "unknown"
        : answer.hasPrincipal
          ? "bound"
          : "unbound";
    await stampOwner(name, id, state, answer?.owner);
}

/**
 * Install the background-sync queue: on a failed mutating request, the request
 * is serialized to IndexedDB (without its credential headers) and a sync is
 * registered; the original fetch still rejects (so your app can show an offline
 * state), and the request is replayed later when the network returns.
 *
 * Right after queueing, the worker asks the page that issued the request who is
 * signed in (`getPrincipal` on {@link provideBackgroundSyncCredentials}) and
 * stamps the entry with that owner, without delaying the rejection. The work is
 * handed to `event.waitUntil` synchronously, so the worker stays alive for it
 * in every engine. Without the Background Sync API (every non-Chromium
 * browser), the queue is drained opportunistically whenever a `GET` goes
 * through the worker.
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
    const stripped = credentialHeaderSet(credentialHeaders);
    const replay: ReplayConfig = {
        sw,
        name: queueName,
        maxRetentionMs: maxRetentionMinutes * 60 * 1000,
        credentialHeaders: stripped,
        beforeReplay,
    };

    sw.addEventListener("fetch", (event) => {
        const request = event.request;
        if (request.method === "GET" || request.method === "HEAD") return;

        const url = new URL(request.url);
        if (!matches(match, url, request)) return;

        const epoch = readEpoch(queueName, stripped);
        epoch.catch(() => undefined);
        const attempt = fetch(request.clone());
        const queued = attempt.then(
            () => undefined,
            async () => {
                const issuer = event.clientId ? await sw.clients?.get(event.clientId) : undefined;
                const entry = await serializeRequest(
                    request,
                    Date.now(),
                    stripped,
                    issuer ? "pending" : "unknown",
                );
                const id = await enqueue(queueName, entry, await epoch, stripped);
                if (id === undefined) return undefined;
                try {
                    await sw.registration.sync?.register(queueName);
                } catch {
                    /* empty */
                }
                return issuer ? { id, issuer } : undefined;
            },
        );
        event.respondWith(
            attempt.catch(async (error: unknown) => {
                await queued;
                throw error;
            }),
        );
        event.waitUntil(
            queued
                .then((stamp) =>
                    stamp ? stampFromIssuer(queueName, stamp.id, stamp.issuer, request) : undefined,
                )
                .catch(() => undefined),
        );
    });

    sw.addEventListener("sync", (event) => {
        if (event.tag !== queueName) return;
        event.waitUntil(drainQueue(replay));
    });

    sw.addEventListener("periodicsync", (event) => {
        if (event.tag !== periodicSyncTag) return;
        event.waitUntil(drainQueue(replay).catch(() => undefined));
    });

    sw.addEventListener("fetch", (event) => {
        if (sw.registration.sync) return;
        if (event.request.method !== "GET") return;
        event.waitUntil(drainQueue(replay).catch(() => undefined));
    });
}

/**
 * Empty the background-sync queue — every request still waiting to be replayed —
 * and bump its clear epoch. Call it on logout (or use `clearSessionData()`, which
 * also clears the runtime caches) so mutations made under one session are never
 * replayed under the next.
 *
 * Works from the page and from the worker, and reaches work already in flight
 * in the worker: a replay checks each entry right before sending it, and a
 * request still failing when the queue is cleared is not written afterwards.
 *
 * @param queueName - The `queueName` given to {@link installBackgroundSync}.
 *   Default `tempest-bg-sync`.
 * @returns `true` once the queue is empty; `false` when IndexedDB is
 *   unavailable (SSR, old browsers).
 *
 * @example
 * import { clearBackgroundSyncQueue } from "tempest-react-sdk/sw";
 *
 * await clearBackgroundSyncQueue();
 */
export async function clearBackgroundSyncQueue(
    queueName: string = DEFAULT_QUEUE_NAME,
): Promise<boolean> {
    if (typeof indexedDB === "undefined") return false;
    const db = await openQueueDb(queueName);
    const tx = db.transaction([STORE, META], "readwrite");
    tx.objectStore(STORE).clear();
    const meta = tx.objectStore(META);
    const current = meta.get(EPOCH_KEY);
    current.onsuccess = () => {
        meta.put(((current.result as number | undefined) ?? 0) + 1, EPOCH_KEY);
    };
    await txDone(tx);
    db.close();
    return true;
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
 * {@link installBackgroundSync}). Install it once in every page, next to your
 * auth setup; it reads the token at replay time, so the queue never has to store
 * it. Without it, a queued request that carried a credential header is never
 * replayed.
 *
 * `getHeaders` must return **every** credential header the app sends (the worker
 * keeps an entry pending when one it stripped is missing), or `null` when there
 * is no session — the worker then drops the entry instead of replaying it
 * anonymously. A throw from `getHeaders` or `getPrincipal` is answered as an
 * explicit `{ error: true }`. The worker only applies headers whose names the
 * original request carried, so returning `Authorization` for every URL never
 * leaks it to a URL that did not receive it in the first place.
 *
 * Pass `getPrincipal` to bind each entry to whoever queued it: the worker asks
 * the issuing tab right after queueing, asks every tab again before replaying,
 * and drops the entry when no signed-in tab is its owner.
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
                port.postMessage({ error: true });
            }
        })();
    };
    container.addEventListener("message", onMessage);
    return () => container.removeEventListener("message", onMessage);
}
