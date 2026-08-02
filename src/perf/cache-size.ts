/**
 * How large the assets a page precached actually are.
 *
 * Reads the `Content-Length` of a stored response instead of its body:
 * materializing a cached ONNX model or WASM binary to learn its length would
 * pull tens of megabytes into memory on every measurement.
 */

/**
 * Byte size of a response sitting in a Cache Storage bucket.
 *
 * @param cacheName The cache bucket to look in.
 * @param url The request URL the response was stored under.
 * @returns The size in bytes, or `null` when Cache Storage is unavailable,
 *   the entry is absent, or the stored response carries no usable
 *   `Content-Length` (a chunked transfer, typically).
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
        const header = response?.headers.get("content-length");
        if (!header) return null;
        const bytes = Number.parseInt(header, 10);
        return Number.isFinite(bytes) ? bytes : null;
    } catch {
        return null;
    }
}
