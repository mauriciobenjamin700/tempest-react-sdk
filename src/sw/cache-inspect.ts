/**
 * Main-thread helpers to inspect and clear the Cache Storage buckets a service
 * worker fills — for a "X MB cacheado" readout and a "limpar cache" action
 * (e.g. on logout). All guard `caches` so they no-op safely under SSR / older
 * browsers.
 */

/** Per-cache usage summary returned by {@link inspectCaches}. */
export interface CacheReport {
    /** The Cache Storage bucket name. */
    name: string;
    /** Number of cached responses. */
    entries: number;
    /** Approximate total bytes, or `null` when byte measurement was skipped. */
    bytes: number | null;
}

/** A cache-name matcher: a prefix string, a `RegExp`, or a predicate. */
export type CacheFilter = string | RegExp | ((name: string) => boolean);

function nameMatches(filter: CacheFilter | undefined, name: string): boolean {
    if (filter === undefined) return true;
    if (typeof filter === "string") return name.startsWith(filter);
    if (filter instanceof RegExp) return filter.test(name);
    return filter(name);
}

function cacheStorageAvailable(): boolean {
    return typeof caches !== "undefined";
}

/** Best-effort byte size of one cached response (Content-Length, else the blob). */
async function responseBytes(response: Response): Promise<number> {
    const header = response.headers.get("content-length");
    if (header) {
        const parsed = Number(header);
        if (!Number.isNaN(parsed)) return parsed;
    }
    try {
        const blob = await response.clone().blob();
        return blob.size;
    } catch {
        return 0;
    }
}

/**
 * Report entry counts (and optionally byte sizes) for the Cache Storage
 * buckets whose name passes `filter`.
 *
 * @param options - `filter` narrows which caches to include; `measureBytes`
 *   (default `true`) reads each response to sum sizes — set `false` for a fast,
 *   count-only report.
 * @returns One {@link CacheReport} per matching cache. Empty when unsupported.
 *
 * @example
 * const reports = await inspectCaches({ filter: "tempest-" });
 * const totalMb = reports.reduce((n, r) => n + (r.bytes ?? 0), 0) / 1e6;
 */
export async function inspectCaches(
    options: { filter?: CacheFilter; measureBytes?: boolean } = {},
): Promise<CacheReport[]> {
    if (!cacheStorageAvailable()) return [];
    const { filter, measureBytes = true } = options;

    const names = (await caches.keys()).filter((name) => nameMatches(filter, name));
    const reports: CacheReport[] = [];
    for (const name of names) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        let bytes: number | null = null;
        if (measureBytes) {
            bytes = 0;
            for (const request of requests) {
                const response = await cache.match(request);
                if (response) bytes += await responseBytes(response);
            }
        }
        reports.push({ name, entries: requests.length, bytes });
    }
    return reports;
}

/**
 * Delete Cache Storage buckets whose name passes `filter` (all of them when no
 * filter is given).
 *
 * @param filter - Which caches to delete.
 * @returns The names of the caches that were deleted.
 *
 * @example
 * await clearCaches("tempest-"); // drop every SDK-managed cache on logout
 */
export async function clearCaches(filter?: CacheFilter): Promise<string[]> {
    if (!cacheStorageAvailable()) return [];
    const names = (await caches.keys()).filter((name) => nameMatches(filter, name));
    const deleted: string[] = [];
    for (const name of names) {
        if (await caches.delete(name)) deleted.push(name);
    }
    return deleted;
}
