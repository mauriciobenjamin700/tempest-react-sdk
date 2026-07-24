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
     * before rendering queries, so cached data is available offline.
     */
    restore: () => Promise<void>;
    /** Write the current cache snapshot immediately (bypassing the throttle). */
    flush: () => Promise<void>;
    /** Stop persisting and drop the pending write. */
    unsubscribe: () => void;
    /** Delete the persisted snapshot (e.g. on logout). */
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
 * @example
 * const persistence = persistQueryClientOffline({ queryClient });
 * await persistence.restore(); // before first render
 * // ... later, on logout:
 * await persistence.clear();
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

    async function save(): Promise<void> {
        await store.put({ id: key, state: dehydrate(queryClient) });
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    function schedule(): void {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            void save();
        }, throttleMs);
    }

    const unsubscribeCache = queryClient.getQueryCache().subscribe(schedule);

    return {
        async restore() {
            const snapshot = await store.get(key);
            if (snapshot) hydrate(queryClient, snapshot.state);
        },
        async flush() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            await save();
        },
        unsubscribe() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            unsubscribeCache();
        },
        async clear() {
            await store.delete(key);
        },
    };
}
