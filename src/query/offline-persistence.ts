import {
    dehydrate,
    hydrate,
    type QueryCacheNotifyEvent,
    type QueryClient,
} from "@tanstack/react-query";
import { createOfflineStore } from "../offline/create-offline-store";
import { isDevBuild } from "../utils/dev-mode";
import { ownerFingerprint } from "../utils/owner-fingerprint";

/**
 * Clears still running, per `databaseName` + `key` slot, across every handle.
 *
 * A handle's `clear()` deletes by key with no ordering against other handles,
 * so a new handle created on login while the previous one is still clearing
 * could `restore()` the previous user's snapshot before the delete lands, or
 * have its first write deleted by it. Every handle's `restore()` and writes
 * wait for the slot's pending clear first; the entry is dropped once settled.
 */
const pendingClears = new Map<string, Promise<unknown>>();

/** Options for {@link persistQueryClientOffline}. */
export interface OfflineQueryPersistenceOptions {
    /** The `QueryClient` to snapshot and restore. */
    queryClient: QueryClient;
    /** IndexedDB database name for the snapshot. Default `"TempestQueryCache"`. */
    databaseName?: string;
    /** Row key under which the snapshot is stored. Default `"tanstack-query"`. */
    key?: string;
    /**
     * Minimum gap between snapshot writes, in ms — cache churn is coalesced into
     * one trailing write per window. Default `1000`.
     */
    throttleMs?: number;
    /**
     * Who is signed in right now — a stable, non-secret id such as the user id;
     * `null`/`undefined` when nobody is. Read on every write, which stamps the
     * snapshot with a one-way fingerprint of it (never the id itself), and on
     * `restore()`, which hydrates only a snapshot stamped with the same
     * fingerprint.
     *
     * `clear()` on logout already deletes the snapshot; this covers the session
     * that ends without it — a token that expired, a crash, a tab closed while
     * signed in. Without it, the next account to boot on the browser is shown
     * the previous account's cached responses (#531). A snapshot written before
     * this option was set carries no stamp and is not restored either; it is a
     * cache, so the cost is one cold start.
     *
     * A foreign snapshot is skipped, not deleted: a cookie app that only learns
     * the principal after a `/me` round trip would otherwise wipe its own cache
     * on every cold start. The next write replaces it.
     *
     * The handle is bound to the first signed-in owner it writes or restores.
     * Once bound, a write under another owner — nobody, because the token
     * expired without `clear()`, or a second account on the same tab — deletes
     * the snapshot instead of stamping the bound owner's cached responses with
     * the new owner (#563); the same owner coming back writes again. Writes
     * before anyone signs in stay anonymous and are restored while nobody is,
     * so an app that persists logged-out data keeps doing so. An anonymous
     * snapshot written by 0.82.0 is not restored (it may hold an expired
     * session's cache): one cold start, once.
     *
     * Read synchronously. A non-string, non-number value (the `Promise` of an
     * `async` getter) or a getter that throws reads as nobody. Omit it to restore
     * every snapshot, as before 0.82.0.
     */
    getPrincipal?: () => string | number | null | undefined;
}

/** Options for {@link OfflineQueryPersistence.clear}. */
export interface OfflineQueryClearOptions {
    /**
     * Also clear the in-memory `QueryClient` (`queryClient.clear()`) once
     * persistence has stopped and the snapshot is deleted — the one-call logout.
     * Default `false`: the client belongs to the app, which may want to keep
     * public queries (a catalog, feature flags) across sessions and drop only
     * the user-scoped keys with `removeQueries`.
     */
    resetClient?: boolean;
}

/** Handle returned by {@link persistQueryClientOffline}. */
export interface OfflineQueryPersistence {
    /**
     * Load the persisted snapshot into the `QueryClient`. Call once on boot,
     * before rendering queries, so cached data is available offline. A no-op
     * once {@link OfflineQueryPersistence.clear} has been called, and — with
     * `getPrincipal` — for a snapshot written under another principal.
     */
    restore: () => Promise<void>;
    /**
     * Write the current cache snapshot immediately (bypassing the throttle). A
     * no-op once {@link OfflineQueryPersistence.clear} has been called.
     */
    flush: () => Promise<void>;
    /** Stop persisting and drop the pending write. Idempotent. */
    unsubscribe: () => void;
    /**
     * End the persisted session (e.g. on logout) and delete the snapshot.
     *
     * Terminal for this handle: it cancels the pending throttled write, stops
     * persisting cache changes, waits for any write already in flight and only
     * then deletes the row — so neither a write pending in the last throttle
     * window nor cache activity after logout (the next user's first query) can
     * re-persist the previous user's responses. Afterwards `restore`/`flush`
     * are no-ops; to persist a new session, call
     * {@link persistQueryClientOffline} again after login. In a dev build
     * (`isDevBuild()`), the first `restore`, `flush` or added/updated query on
     * an ended handle logs one `console.warn` saying so, because a handle kept
     * at module scope would otherwise stop persisting in silence.
     *
     * Ordered against other handles on the same `databaseName` + `key`: until
     * this clear settles, a new handle's `restore()` and writes wait for it, so
     * a handle created on login without awaiting the logout neither hydrates
     * the previous snapshot nor has its first write deleted.
     *
     * If the delete rejects, `resetClient` still clears the client and the
     * rejection reaches the caller.
     *
     * The in-memory `QueryClient` is cleared only with `resetClient: true`, and
     * then only after persistence has stopped, so the reset itself cannot
     * trigger a write. It is opt-in because the app owns the client and the
     * shape of its logout: it may keep public queries and drop only the
     * user-scoped keys with `removeQueries`. Because persistence is already
     * off, that manual call can come before or after this one.
     *
     * Idempotent and safe to call concurrently; every call deletes the row
     * again.
     *
     * @param options - `resetClient` also clears the in-memory `QueryClient`.
     */
    clear: (options?: OfflineQueryClearOptions) => Promise<void>;
}

/**
 * Owner stamp of a snapshot written while nobody was signed in.
 *
 * Not a fingerprint (`ownerFingerprint` only yields `p:` + 16 hex characters),
 * so it never matches a signed-in owner. It replaces the `null` stamp of 0.82.0
 * on purpose: a `null` row from 0.82.0 may hold the cache of a session that
 * expired before the write (#563), and nothing in it tells that row apart from
 * genuinely anonymous data, so `restore()` skips it — one cold start, once.
 */
const ANONYMOUS_SNAPSHOT_OWNER = "p:anonymous";

interface Snapshot {
    id: string;
    state: ReturnType<typeof dehydrate>;
    /**
     * Owner fingerprint, or {@link ANONYMOUS_SNAPSHOT_OWNER}, when `getPrincipal`
     * was set at write time; absent otherwise.
     */
    owner?: string | null;
}

/**
 * Fingerprint whoever `getPrincipal` says is signed in.
 *
 * @param getPrincipal - The app's principal getter.
 * @returns The fingerprint, or `null` for nobody, a non-identity value or a throw.
 */
function currentOwner(getPrincipal: () => unknown): string | null {
    try {
        return ownerFingerprint("p", getPrincipal());
    } catch {
        return null;
    }
}

/**
 * Persist a TanStack `QueryClient` cache to IndexedDB (via
 * {@link createOfflineStore}) and restore it on boot — so a reload or a cold
 * offline start shows the last-known data instead of empty screens.
 *
 * Self-contained: uses `dehydrate`/`hydrate` from `@tanstack/react-query`
 * directly, so no `@tanstack/react-query-persist-client` dependency is needed.
 * Writes are throttled and subscribe to the query cache; call `unsubscribe` on
 * teardown. Dexie is a peer dependency of the offline store — install it.
 *
 * @param options - The client plus storage/throttle configuration.
 * @returns A handle with `restore`, `flush`, `clear` and `unsubscribe`.
 *
 * `clear()` is terminal for the handle (see {@link OfflineQueryPersistence.clear}):
 * a logout that only deleted the row used to be undone by the pending write or
 * by the next cache event, restoring the previous user's data on the next boot
 * (#440).
 *
 * @example
 * const persistence = persistQueryClientOffline({ queryClient });
 * await persistence.restore();
 *
 * async function logout(): Promise<void> {
 *     await persistence.clear({ resetClient: true });
 * }
 */
export function persistQueryClientOffline(
    options: OfflineQueryPersistenceOptions,
): OfflineQueryPersistence {
    const { queryClient, throttleMs = 1000, getPrincipal } = options;
    const key = options.key ?? "tanstack-query";
    const databaseName = options.databaseName ?? "TempestQueryCache";
    const store = createOfflineStore<Snapshot, string>({
        databaseName,
        version: 1,
        tableName: "cache",
        indexes: "&id",
        keyPath: "id",
    });

    const slot = `${databaseName}\u0000${key}`;
    let ended = false;
    let warnedEnded = false;
    let warnedRebound = false;
    let boundOwner: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const inFlight = new Set<Promise<unknown>>();

    async function afterPendingClear(): Promise<void> {
        const pending = pendingClears.get(slot);
        if (pending) await pending;
    }

    function warnEnded(): void {
        if (warnedEnded || !isDevBuild()) return;
        warnedEnded = true;
        console.warn(
            "[tempest-react-sdk] persistQueryClientOffline: handle ended by clear(); " +
                "create a new one after login to keep persisting.",
        );
    }

    function warnRebound(): void {
        if (warnedRebound || !isDevBuild()) return;
        warnedRebound = true;
        console.warn(
            "[tempest-react-sdk] persistQueryClientOffline: another account signed in on a " +
                "handle bound to the previous one; its snapshot is deleted instead of written. " +
                "Create a new handle after login to keep persisting.",
        );
    }

    /**
     * Write the snapshot, or delete the row when the session it holds is over.
     *
     * With `getPrincipal`, the handle is bound to the first signed-in owner it
     * writes or restores. A write under any other owner — nobody, after a token
     * expired, or a second account signing in on the same tab — deletes the row
     * instead of stamping it: the in-memory cache still holds the bound owner's
     * responses, and stamping them with the new owner is what handed them to the
     * next account (#563). The same owner coming back writes again.
     *
     * A second account (not an expiry) means the app kept the handle across a
     * login, which stops persistence for that account in silence; a dev build
     * logs one `console.warn` saying so, as for a handle ended by `clear()`.
     */
    async function save(): Promise<void> {
        if (ended) return;
        await afterPendingClear();
        if (ended) return;
        const snapshot: Snapshot = { id: key, state: dehydrate(queryClient) };
        let foreign = false;
        if (getPrincipal) {
            const owner = currentOwner(getPrincipal);
            foreign = boundOwner !== null && owner !== boundOwner;
            if (foreign && owner !== null) warnRebound();
            if (owner !== null) boundOwner = boundOwner ?? owner;
            snapshot.owner = owner ?? ANONYMOUS_SNAPSHOT_OWNER;
        }
        const write = foreign ? store.delete(key) : store.put(snapshot);
        inFlight.add(write);
        try {
            await write;
        } finally {
            inFlight.delete(write);
        }
    }

    function cancelTimer(): void {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function schedule(): void {
        if (timer || ended) return;
        timer = setTimeout(() => {
            timer = null;
            void save();
        }, throttleMs);
    }

    function onCacheEvent(event: QueryCacheNotifyEvent): void {
        if (!ended) {
            schedule();
            return;
        }
        if (event.type !== "added" && event.type !== "updated") return;
        unsubscribeCache();
        warnEnded();
    }

    const unsubscribeCache = queryClient.getQueryCache().subscribe(onCacheEvent);

    async function endSession(resetClient: boolean): Promise<void> {
        try {
            await Promise.allSettled([...inFlight]);
            await store.delete(key);
        } finally {
            if (resetClient) queryClient.clear();
        }
    }

    return {
        async restore() {
            if (ended) {
                warnEnded();
                return;
            }
            await afterPendingClear();
            if (ended) return;
            const snapshot = await store.get(key);
            if (!snapshot || ended) return;
            if (getPrincipal) {
                const owner = currentOwner(getPrincipal);
                if (snapshot.owner !== (owner ?? ANONYMOUS_SNAPSHOT_OWNER)) return;
                if (owner !== null) boundOwner = boundOwner ?? owner;
            }
            hydrate(queryClient, snapshot.state);
        },
        async flush() {
            if (ended) {
                warnEnded();
                return;
            }
            cancelTimer();
            await save();
        },
        unsubscribe() {
            cancelTimer();
            unsubscribeCache();
        },
        async clear(clearOptions = {}) {
            ended = true;
            cancelTimer();
            const previous = pendingClears.get(slot);
            const run = endSession(clearOptions.resetClient ?? false);
            const settled = Promise.allSettled([previous, run]);
            pendingClears.set(slot, settled);
            void settled.then(() => {
                if (pendingClears.get(slot) === settled) pendingClears.delete(slot);
            });
            await run;
        },
    };
}
