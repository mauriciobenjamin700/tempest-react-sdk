/**
 * How large the assets a page precached actually are.
 *
 * Prefers the stored `Content-Length`, because materializing a cached ONNX model
 * or WASM binary to learn its length would pull tens of megabytes into memory on
 * every measurement. When the header is missing the size is counted off the body
 * stream instead — chunk by chunk, keeping only one chunk alive at a time.
 *
 * The fallback exists because "no `Content-Length`" is not the rare case a
 * header-only reader assumes. A chunked transfer drops it, a proxy that
 * re-encodes drops it, and a cross-origin response only exposes it under CORS
 * rules — and in a report a `null` from any of those is indistinguishable from a
 * model nobody measured. FAMACHApp shipped 12 field runs with both model-size
 * columns empty for exactly this reason.
 */

/**
 * Count a response body's bytes without holding it in memory.
 *
 * @param response The response to drain. Consumed by this call, which is why
 *   callers pass a clone.
 * @returns The byte count, or `null` when the body cannot be read.
 */
async function countBodyBytes(response: Response): Promise<number | null> {
    const body = response.body;
    if (!body) return null;
    const reader = body.getReader();
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
        }
    } catch {
        return null;
    } finally {
        reader.releaseLock();
    }
    return total;
}

/**
 * Byte size of a response sitting in a Cache Storage bucket.
 *
 * @param cacheName The cache bucket to look in.
 * @param url The request URL the response was stored under.
 * @returns The size in bytes, or `null` when Cache Storage is unavailable, the
 *   entry is absent, or the body cannot be read either.
 *
 * @example
 * ```typescript
 * const bytes = await cachedResponseBytes("app-models", "/models/detect.onnx");
 * console.log(bytes === null ? "—" : formatBytes(bytes)); // "12.0 MB"
 * ```
 */
export async function cachedResponseBytes(cacheName: string, url: string): Promise<number | null> {
    if (typeof caches === "undefined") return null;
    try {
        const cache = await caches.open(cacheName);
        const response = await cache.match(url);
        if (!response) return null;

        const header = response.headers.get("content-length");
        if (header) {
            const bytes = Number.parseInt(header, 10);
            if (Number.isFinite(bytes)) return bytes;
        }
        return await countBodyBytes(response.clone());
    } catch {
        return null;
    }
}
