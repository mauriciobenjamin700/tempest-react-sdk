import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { createOfflineStore } from "../offline/create-offline-store";

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
}

/** Handle returned by {@link persistQueryClientOffline}. */
export interface OfflineQueryPersistence {
    /**
     * Load the persisted snapshot into the `QueryClient`. Call once on boot,
     * before rendering queries, so cached data is available offline. A no-op
     * once {@link OfflineQueryPersistence.clear} has been called.
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
     * listening to the query cache, waits for any write already in flight and
     * only then deletes the row — so neither a write pending in the last
     * throttle window nor cache activity after logout (the next user's first
     * query) can re-persist the previous user's responses. Afterwards
     * `restore`/`flush` are no-ops; to persist a new session, call
     * {@link persistQueryClientOffline} again after login.
     *
     * The in-memory `QueryClient` is **not** cleared: the app owns it and the
     * shape of its logout (`queryClient.clear()`, or `removeQueries` on the
     * user-scoped keys only while keeping a public catalog). Because
     * persistence is already off, that call can come before or after this one.
     *
     * Idempotent and safe to call concurrently; every call deletes the row
     * again.
     */
    clear: () => Promise<void>;
}

interface Snapshot {
    id: string;
    state: ReturnType<typeof dehydrate>;
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
 *     await persistence.clear();
 *     queryClient.clear();
 * }
 */
export function persistQueryClientOffline(
    options: OfflineQueryPersistenceOptions,
): OfflineQueryPersistence {
    const { queryClient, throttleMs = 1000 } = options;
    const key = options.key ?? "tanstack-query";
    const store = createOfflineStore<Snapshot, string>({
        databaseName: options.databaseName ?? "TempestQueryCache",
        version: 1,
        tableName: "cache",
        indexes: "&id",
        keyPath: "id",
    });

    let ended = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const inFlight = new Set<Promise<unknown>>();

    async function save(): Promise<void> {
        if (ended) return;
        const write = store.put({ id: key, state: dehydrate(queryClient) });
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

    const unsubscribeCache = queryClient.getQueryCache().subscribe(schedule);

    function stop(): void {
        cancelTimer();
        unsubscribeCache();
    }

    return {
        async restore() {
            if (ended) return;
            const snapshot = await store.get(key);
            if (snapshot && !ended) hydrate(queryClient, snapshot.state);
        },
        async flush() {
            cancelTimer();
            await save();
        },
        unsubscribe: stop,
        async clear() {
            ended = true;
            stop();
            await Promise.allSettled([...inFlight]);
            await store.delete(key);
        },
    };
}
