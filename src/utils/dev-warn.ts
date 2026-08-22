/**
 * Whether the **consuming app** is running in development.
 *
 * The order of the two checks is the whole point. `import.meta.env.DEV` is
 * resolved by Vite when *this package* is built, so in `dist` it is a frozen
 * `false` — a warning gated on it alone can never fire for a consumer, however
 * they run. `process.env.NODE_ENV` survives the library build untouched and is
 * substituted by the consumer's own bundler, which is what makes it the signal
 * that reflects *their* mode. Same idiom as `parse-response.ts`.
 *
 * `typeof process` is guarded because the SDK also runs where it does not exist
 * — a service-worker context, a plain browser ESM page — and there the answer is
 * "not development", not a `ReferenceError`.
 */
export function isDev(): boolean {
    if (typeof process !== "undefined" && process.env?.NODE_ENV) {
        return process.env.NODE_ENV !== "production";
    }
    return Boolean(import.meta.env?.DEV);
}

const warned = new Set<string>();

/**
 * Print a development warning the first time a given key is seen.
 *
 * Once per key, because every call site is a render path or an effect that
 * re-runs on a dependency change: a warning per render buries the console and
 * teaches the reader to scroll past it. Production is silent — the `isDev()`
 * guard is here rather than at each call site so no caller can forget it.
 *
 * @param key - Identity of the warning. Repeated keys print once.
 * @param message - The full message, already carrying its reader-facing prefix.
 */
export function warnOnce(key: string, message: string): void {
    if (!isDev() || warned.has(key)) return;
    warned.add(key);
    console.warn(message);
}

/**
 * Clear the warn-once latch. Test-only — the latch is module state, and a suite
 * that asserts on the same warning twice would otherwise see it only once.
 */
export function resetDevWarnings(): void {
    warned.clear();
}
