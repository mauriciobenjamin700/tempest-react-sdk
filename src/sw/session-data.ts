import { clearBackgroundSyncQueue } from "./background-sync";
import { clearCaches } from "./cache-inspect";
import type { CacheFilter } from "./cache-inspect";

/** Options for {@link clearSessionData}. */
export interface ClearSessionDataOptions {
    /**
     * Which Cache Storage buckets hold session data. Default: every bucket except
     * the app-shell precache (`tempest-precache-*`), so the app still launches
     * offline after logout while no runtime entry — whatever its `cacheName` —
     * survives into the next session.
     */
    caches?: CacheFilter;
    /** The background-sync `queueName` to clear. Default `tempest-bg-sync`. */
    queueName?: string;
}

/** What {@link clearSessionData} removed. */
export interface ClearSessionDataResult {
    /** Names of the Cache Storage buckets deleted. */
    caches: string[];
    /** Whether the background-sync queue database was deleted. */
    queueCleared: boolean;
}

/** Default cache filter: everything but the versioned app-shell precache. */
function isSessionCache(name: string): boolean {
    return !name.startsWith("tempest-precache-");
}

/**
 * Remove everything the service-worker helpers keep on behalf of the signed-in
 * user: the runtime caches filled by `installRuntimeCache` and the queue of
 * mutations waiting in `installBackgroundSync`. Call it on logout, from the page.
 *
 * Both stores outlive the session and are shared by every account that signs in
 * on the browser. Measured in Chromium 153 (11/10/2026), before this existed:
 * the documented `clearCaches("tempest-")` deleted nothing because the recipe's
 * runtime cache was named `api`, the next account read the previous account's
 * `GET /api/me` offline, and a mutation queued by the previous account was
 * replayed with its stored bearer after logout. A prefix filter cannot know the
 * names a recipe chose, so the default here inverts it: every bucket goes except
 * the precache, which holds only the build's static assets.
 *
 * Cache Storage and IndexedDB are origin storage, readable from the window, so
 * this needs no message to the worker.
 *
 * @param options - Narrow the caches to delete, or name a custom queue.
 * @returns The caches deleted and whether the queue was cleared.
 *
 * @example
 * import { clearSessionData } from "tempest-react-sdk/sw";
 *
 * async function logout() {
 *     await clearSessionData();
 * }
 */
export async function clearSessionData(
    options: ClearSessionDataOptions = {},
): Promise<ClearSessionDataResult> {
    const [caches, queueCleared] = await Promise.all([
        clearCaches(options.caches ?? isSessionCache),
        clearBackgroundSyncQueue(options.queueName),
    ]);
    return { caches, queueCleared };
}
