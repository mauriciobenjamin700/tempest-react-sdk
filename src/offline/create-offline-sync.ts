import { randomId } from "../utils/ids";
import { createOfflineStore } from "./create-offline-store";

/**
 * Mutation kinds queued in the outbox.
 *
 * `create`/`update` carry a snapshot of the record; `delete` needs only the
 * record id. The distinction between `create` and `update` is advisory — the
 * engine treats both as "deliver this record" and leaves the create-vs-update
 * decision to the app's `deliver` callback (a `PUT` upsert usually ignores it).
 */
export type OutboxOp = "create" | "update" | "delete";

/**
 * A single queued mutation.
 *
 * @typeParam TPayload - The record snapshot shape carried by
 *   `create`/`update` entries (omitted for `delete`).
 */
export interface OutboxEntry<TPayload = unknown> {
    /** Stable per-entry id (generated with {@link randomId}). */
    id: string;
    /** The mutation kind. */
    op: OutboxOp;
    /** Primary key of the record the mutation targets. */
    recordId: string;
    /** Epoch milliseconds when the mutation was queued. */
    enqueuedAt: number;
    /** How many delivery attempts have been made so far. */
    attempts: number;
    /** Last delivery error message, kept for UI/debug. */
    lastError?: string;
    /** Record snapshot for `create`/`update`. Omitted for `delete`. */
    payload?: TPayload;
}

/**
 * Why a sync run was triggered. The listed values are the common ones; any
 * string is accepted so apps can add their own telemetry labels.
 */
export type SyncTrigger =
    | "boot"
    | "online-event"
    | "after-mutation"
    | "manual"
    | "interval"
    | (string & {});

/**
 * One page of the server delta pull.
 *
 * @typeParam TRemote - The server-side item shape.
 */
export interface PullPage<TRemote> {
    /** Items changed since the watermark, in this page. */
    items: TRemote[];
    /** Cursor for the next page, or `null` when this is the last page. */
    nextCursor: string | null;
    /**
     * Server clock to persist as the next watermark once the whole delta is
     * applied. `null` leaves the watermark unchanged.
     */
    serverTime: string | null;
}

/** Outcome of a single {@link OfflineSync.flush} run. */
export interface SyncRunSummary {
    /** The trigger passed to `flush`. */
    trigger: SyncTrigger;
    /** Entries delivered to the server this run. */
    succeeded: number;
    /** Entries that failed and stay queued for the next run. */
    failed: number;
    /** Total wall-clock milliseconds the run took. */
    durationMs: number;
    /** `true` when the run was skipped because the device was offline. */
    skipped: boolean;
    /** Last delivery error message seen this run, or `null` when none failed. */
    lastError: string | null;
}

/**
 * Coarse lifecycle phase of the sync engine, surfaced through
 * {@link OfflineSync.getState} / {@link OfflineSync.subscribe} for reactive UI.
 *
 * - `"idle"` — nothing in flight and the last run (if any) fully succeeded.
 * - `"syncing"` — a `flush` run is currently in progress.
 * - `"offline"` — the last run was skipped because the device was offline.
 * - `"error"` — the last run left at least one entry queued after a failure.
 */
export type SyncPhase = "idle" | "syncing" | "offline" | "error";

/**
 * Immutable snapshot of the engine's reactive state. A fresh object is emitted
 * to subscribers on every change, so it is safe to use as a
 * `useSyncExternalStore` snapshot (reference equality signals "no change").
 */
export interface SyncState {
    /** Current lifecycle phase. */
    phase: SyncPhase;
    /** Number of mutations still queued in the outbox. */
    pending: number;
    /** Summary of the most recent `flush` run, or `null` before the first. */
    lastSummary: SyncRunSummary | null;
    /** Message of the most recent delivery failure, or `null`. */
    lastError: string | null;
    /** Epoch ms of the last non-skipped run, or `null` before the first. */
    lastSyncedAt: number | null;
}

/**
 * Pluggable persistence for the pull watermark (the "changed since" cursor).
 * Pass an object with a `storageKey` to use a `localStorage`-backed default.
 */
export interface WatermarkStore {
    /** Read the current watermark, or `null` when none is stored. */
    get: () => string | null;
    /** Persist a new watermark. */
    set: (value: string) => void;
    /** Drop the watermark (e.g. on logout / account switch). */
    clear: () => void;
}

/**
 * Configuration for {@link createOfflineSync}.
 *
 * The engine owns the outbox, the single-flight flush, the offline guard, the
 * paginated pull loop and the watermark; the three transport callbacks
 * (`deliver`, `pullPage`, `applyRemote`) are where the app plugs in its own
 * endpoints, record shape and conflict resolution.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 * @typeParam TRemote - Server item shape returned by `pullPage`.
 */
export interface OfflineSyncConfig<TPayload, TRemote> {
    /** IndexedDB database name for the outbox (kept separate per queue). */
    databaseName: string;
    /** Outbox object-store name. Default `"outbox"`. */
    tableName?: string;
    /** Outbox schema version. Default `1`. */
    version?: number;
    /** Prefix for generated entry ids. Default `"outbox"`. */
    idPrefix?: string;
    /**
     * Deliver one queued mutation to the server. Throwing keeps the entry
     * queued (its `attempts`/`lastError` are bumped) for the next run.
     */
    deliver: (entry: OutboxEntry<TPayload>) => Promise<void>;
    /** Fetch one page of the server delta since `since`, from `cursor`. */
    pullPage: (since: string | null, cursor: string | null) => Promise<PullPage<TRemote>>;
    /**
     * Merge one pulled item into the local store. The app owns conflict
     * resolution here (e.g. last-write-wins, keeping newer local pending
     * edits, resolving tombstones and downloading blobs).
     */
    applyRemote: (item: TRemote) => Promise<void>;
    /** Watermark persistence, or `{ storageKey }` for a `localStorage` default. */
    watermark: WatermarkStore | { storageKey: string };
    /** Called after an entry is delivered and acked. */
    onEntryDelivered?: (entry: OutboxEntry<TPayload>) => void | Promise<void>;
    /** Called after an entry fails delivery (it stays queued). */
    onEntryFailed?: (entry: OutboxEntry<TPayload>, error: unknown) => void | Promise<void>;
    /**
     * Connectivity check. Default reads `navigator.onLine` (always online in
     * non-browser environments). When it returns `false`, `flush` is skipped.
     */
    isOnline?: () => boolean;
}

/**
 * Offline-first sync engine: a durable outbox plus a paginated delta pull.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 */
export interface OfflineSync<TPayload> {
    /**
     * Queue a mutation. Returns the generated entry id.
     *
     * @param op - The mutation kind.
     * @param recordId - Primary key of the affected record.
     * @param payload - Record snapshot (for `create`/`update`).
     */
    enqueue: (op: OutboxOp, recordId: string, payload?: TPayload) => Promise<string>;
    /**
     * Run a full sync (drain the outbox, then pull the delta). Concurrent
     * calls share one in-flight promise, so triggers never overlap.
     *
     * @param trigger - Label for why the run happened. Default `"manual"`.
     */
    flush: (trigger?: SyncTrigger) => Promise<SyncRunSummary>;
    /** Number of mutations still queued. */
    pendingCount: () => Promise<number>;
    /** The queued mutations in FIFO order. */
    listPending: () => Promise<OutboxEntry<TPayload>[]>;
    /** Drop every queued mutation (e.g. on logout). */
    clearOutbox: () => Promise<void>;
    /** Reset the pull watermark (e.g. on logout / account switch). */
    resetWatermark: () => void;
    /** Read the current reactive {@link SyncState} snapshot synchronously. */
    getState: () => SyncState;
    /**
     * Subscribe to {@link SyncState} changes. The listener fires on every
     * enqueue, flush transition and outbox clear.
     *
     * @param listener - Called with the new snapshot on each change.
     * @returns An unsubscribe function.
     */
    subscribe: (listener: (state: SyncState) => void) => () => void;
}

/**
 * Build a `localStorage`-backed {@link WatermarkStore}. Reads/writes are no-ops
 * when `localStorage` is unavailable (SSR / non-browser).
 *
 * @param key - The `localStorage` key.
 * @returns A watermark store persisting to `localStorage`.
 */
function localStorageWatermark(key: string): WatermarkStore {
    const available = typeof localStorage !== "undefined";
    return {
        get: () => (available ? localStorage.getItem(key) : null),
        set: (value: string) => {
            if (available) localStorage.setItem(key, value);
        },
        clear: () => {
            if (available) localStorage.removeItem(key);
        },
    };
}

/**
 * Create an offline-first sync engine over an IndexedDB outbox.
 *
 * The engine drains queued mutations to the server (`deliver`) and pulls the
 * server delta back (`pullPage` + `applyRemote`), advancing a watermark so each
 * run only fetches what changed. `flush` is single-flight and skips cleanly
 * while offline; failed deliveries stay queued with their attempt count bumped.
 *
 * Dexie is an **optional peer dependency** (via {@link createOfflineStore}) —
 * install it (`npm i dexie`) when you use this engine.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 * @typeParam TRemote - Server item shape returned by `pullPage`.
 * @param config - Transport callbacks + outbox/watermark configuration.
 * @returns The sync handle (`enqueue`, `flush`, `pendingCount`, …).
 *
 * @example
 * const sync = createOfflineSync<Note, NoteDto>({
 *     databaseName: "NotesOutbox",
 *     watermark: { storageKey: "notes.watermark" },
 *     deliver: async (entry) => {
 *         if (entry.op === "delete") return api.remove(entry.recordId);
 *         await api.upsert(entry.recordId, entry.payload!);
 *     },
 *     pullPage: async (since, cursor) => {
 *         const page = await api.changes(since, cursor);
 *         return { items: page.items, nextCursor: page.next, serverTime: page.now };
 *     },
 *     applyRemote: async (dto) => {
 *         if (dto.deleted) return localStore.remove(dto.id);
 *         await localStore.save(fromDto(dto));
 *     },
 * });
 * await sync.enqueue("create", note.id, note);
 * await sync.flush("after-mutation");
 */
export function createOfflineSync<TPayload = unknown, TRemote = unknown>(
    config: OfflineSyncConfig<TPayload, TRemote>,
): OfflineSync<TPayload> {
    const outbox = createOfflineStore<OutboxEntry<TPayload>, string>({
        databaseName: config.databaseName,
        version: config.version ?? 1,
        tableName: config.tableName ?? "outbox",
        indexes: "&id, recordId, enqueuedAt",
        keyPath: "id",
    });

    const watermark: WatermarkStore =
        "get" in config.watermark
            ? config.watermark
            : localStorageWatermark(config.watermark.storageKey);

    const idPrefix = config.idPrefix ?? "outbox";
    const isOnline =
        config.isOnline ?? (() => (typeof navigator !== "undefined" ? navigator.onLine : true));

    let inflight: Promise<SyncRunSummary> | null = null;

    const listeners = new Set<(state: SyncState) => void>();
    let state: SyncState = {
        phase: "idle",
        pending: 0,
        lastSummary: null,
        lastError: null,
        lastSyncedAt: null,
    };

    function setState(patch: Partial<SyncState>): void {
        state = { ...state, ...patch };
        for (const listener of listeners) listener(state);
    }

    async function refreshPending(): Promise<void> {
        setState({ pending: await outbox.count() });
    }

    async function push(summary: SyncRunSummary): Promise<void> {
        const entries = await outbox.list(undefined, { orderBy: "enqueuedAt" });
        for (const entry of entries) {
            try {
                await config.deliver(entry);
                await outbox.delete(entry.id);
                await config.onEntryDelivered?.(entry);
                summary.succeeded += 1;
            } catch (cause) {
                const message = cause instanceof Error ? cause.message : "delivery failed";
                await outbox.update(entry.id, {
                    attempts: entry.attempts + 1,
                    lastError: message,
                } as Partial<OutboxEntry<TPayload>>);
                await config.onEntryFailed?.(entry, cause);
                summary.failed += 1;
                summary.lastError = message;
            }
        }
    }

    async function pull(): Promise<void> {
        const since = watermark.get();
        let cursor: string | null = null;
        let serverTime: string | null = since;
        do {
            const page = await config.pullPage(since, cursor);
            for (const item of page.items) {
                await config.applyRemote(item);
            }
            cursor = page.nextCursor;
            serverTime = page.serverTime;
        } while (cursor);
        if (serverTime) watermark.set(serverTime);
    }

    async function runOnce(trigger: SyncTrigger): Promise<SyncRunSummary> {
        const startedAt = Date.now();
        const summary: SyncRunSummary = {
            trigger,
            succeeded: 0,
            failed: 0,
            durationMs: 0,
            skipped: false,
            lastError: null,
        };
        if (!isOnline()) {
            summary.skipped = true;
            summary.durationMs = Date.now() - startedAt;
            return summary;
        }
        await push(summary);
        await pull();
        summary.durationMs = Date.now() - startedAt;
        return summary;
    }

    void refreshPending();

    return {
        async enqueue(op, recordId, payload) {
            const entry: OutboxEntry<TPayload> = {
                id: randomId(idPrefix),
                op,
                recordId,
                enqueuedAt: Date.now(),
                attempts: 0,
                payload,
            };
            await outbox.put(entry);
            await refreshPending();
            return entry.id;
        },
        flush(trigger: SyncTrigger = "manual") {
            if (!inflight) {
                setState({ phase: "syncing" });
                inflight = runOnce(trigger)
                    .then(async (summary) => {
                        await refreshPending();
                        setState({
                            phase: summary.skipped
                                ? "offline"
                                : summary.failed > 0
                                  ? "error"
                                  : "idle",
                            lastSummary: summary,
                            lastError: summary.lastError,
                            lastSyncedAt: summary.skipped ? state.lastSyncedAt : Date.now(),
                        });
                        return summary;
                    })
                    .finally(() => {
                        inflight = null;
                    });
            }
            return inflight;
        },
        pendingCount() {
            return outbox.count();
        },
        listPending() {
            return outbox.list(undefined, { orderBy: "enqueuedAt" });
        },
        async clearOutbox() {
            await outbox.clear();
            await refreshPending();
        },
        resetWatermark() {
            watermark.clear();
        },
        getState() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
