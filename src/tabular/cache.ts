/**
 * Keeping model bytes on the device, so the second visit works offline.
 *
 * A prediction that needs the network is not offline inference. The model
 * file is the one asset the app cannot re-derive, so it goes into Cache
 * Storage on first load and is read from there afterwards.
 *
 * Cache-first, not network-first, and deliberately: a model file is
 * immutable for a given version, so revalidating it on every load spends a
 * round trip to learn nothing. Publish a new version under a new URL (or
 * pass `revalidate`) when the model changes.
 */

import { ModelFetchError } from "./exceptions";

/** Cache Storage bucket used when the caller does not name one. */
export const DEFAULT_MODEL_CACHE = "tempest-tabular-models";

/** Options for {@link fetchModelBytes}. */
export interface ModelCacheOptions {
    /** Cache Storage bucket name. */
    readonly cacheName?: string;
    /**
     * Go to the network first and fall back to the cache.
     *
     * For a URL that serves "whatever is current" rather than a pinned
     * version. Costs a round trip on every load when online.
     */
    readonly revalidate?: boolean;
    /** `fetch` options, e.g. credentials for a private model endpoint. */
    readonly requestInit?: RequestInit;
}

/**
 * Whether Cache Storage is usable here.
 *
 * Absent in a non-secure context, in Node, and in some private-mode
 * browsers. The module degrades to a plain fetch rather than failing —
 * losing offline support is better than losing inference.
 *
 * @returns `true` when `caches` can be used.
 */
function hasCacheStorage(): boolean {
    return typeof globalThis.caches !== "undefined";
}

/**
 * Fetch the model bytes, preferring the on-device copy.
 *
 * @example
 * ```ts
 * const bytes = await fetchModelBytes("/models/classifier-v3.onnx");
 * const predictor = await TabularPredictor.create(bytes);
 * ```
 *
 * @param url Where the model lives.
 * @param options Cache bucket, revalidation and `fetch` options.
 * @returns The model bytes.
 * @throws {@link ModelFetchError} when the model is neither cached nor
 *   reachable — which is the "offline and never warmed" case, and the
 *   message says so.
 */
export async function fetchModelBytes(
    url: string,
    options: ModelCacheOptions = {},
): Promise<Uint8Array> {
    const cacheName = options.cacheName ?? DEFAULT_MODEL_CACHE;

    if (!hasCacheStorage()) {
        return await downloadBytes(url, options.requestInit);
    }

    const cache = await globalThis.caches.open(cacheName);

    if (options.revalidate !== true) {
        const cached = await cache.match(url);
        if (cached !== undefined) return new Uint8Array(await cached.arrayBuffer());
    }

    try {
        const response = await fetch(url, options.requestInit);
        if (!response.ok) {
            throw new ModelFetchError(
                `Failed to download the model: ${response.status} ${response.statusText}`,
            );
        }
        await cache.put(url, response.clone());
        return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
        const cached = await cache.match(url);
        if (cached !== undefined) return new Uint8Array(await cached.arrayBuffer());
        if (error instanceof ModelFetchError) throw error;
        throw new ModelFetchError(
            `The model is not cached and could not be downloaded: ${url}. ` +
                "Warm the cache while online — prefetch it at install time, or " +
                "precache it in the service worker.",
            { cause: error },
        );
    }
}

/**
 * Download without touching the cache.
 *
 * @param url Where the model lives.
 * @param requestInit `fetch` options.
 * @returns The model bytes.
 * @throws {@link ModelFetchError} when the request fails.
 */
async function downloadBytes(url: string, requestInit?: RequestInit): Promise<Uint8Array> {
    try {
        const response = await fetch(url, requestInit);
        if (!response.ok) {
            throw new ModelFetchError(
                `Failed to download the model: ${response.status} ${response.statusText}`,
            );
        }
        return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
        if (error instanceof ModelFetchError) throw error;
        throw new ModelFetchError(`Failed to download the model: ${url}`, { cause: error });
    }
}

/**
 * Whether a model is already on the device.
 *
 * Useful for showing "available offline" in the UI, and for deciding
 * whether to prefetch on a metered connection.
 *
 * @param url The model URL.
 * @param cacheName Cache Storage bucket name.
 * @returns `true` when the bytes are cached.
 */
export async function isModelCached(
    url: string,
    cacheName: string = DEFAULT_MODEL_CACHE,
): Promise<boolean> {
    if (!hasCacheStorage()) return false;
    const cache = await globalThis.caches.open(cacheName);
    return (await cache.match(url)) !== undefined;
}

/**
 * Store model bytes without downloading them.
 *
 * For an app that already has the bytes — from a file input, or from a
 * bundle it unpacked — and wants the next load to find them cached.
 *
 * @param url The URL to key the entry under.
 * @param bytes The model bytes.
 * @param cacheName Cache Storage bucket name.
 * @returns `true` when the entry was stored, `false` without Cache Storage.
 */
export async function cacheModelBytes(
    url: string,
    bytes: Uint8Array,
    cacheName: string = DEFAULT_MODEL_CACHE,
): Promise<boolean> {
    if (!hasCacheStorage()) return false;
    const cache = await globalThis.caches.open(cacheName);
    const body = new Uint8Array(bytes).buffer as ArrayBuffer;
    await cache.put(
        url,
        new Response(body, {
            headers: { "content-type": "application/octet-stream" },
        }),
    );
    return true;
}

/**
 * Drop cached models.
 *
 * @param url A specific model to evict; omit to delete the whole bucket.
 * @param cacheName Cache Storage bucket name.
 * @returns `true` when something was deleted.
 */
export async function clearModelCache(
    url?: string,
    cacheName: string = DEFAULT_MODEL_CACHE,
): Promise<boolean> {
    if (!hasCacheStorage()) return false;
    if (url === undefined) return await globalThis.caches.delete(cacheName);
    const cache = await globalThis.caches.open(cacheName);
    return await cache.delete(url);
}
