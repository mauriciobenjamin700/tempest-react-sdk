/**
 * Error names a browser gives a write refused for lack of space. Firefox's
 * legacy `NS_ERROR_DOM_QUOTA_REACHED` still surfaces from older Gecko builds.
 * An array literal, not a `Set`: a top-level `new Set(...)` is a call the
 * bundler cannot prove pure, so it would stay in every slice of the barrel.
 */
const QUOTA_ERROR_NAMES: readonly string[] = ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"];

/**
 * Thrown by every write of an {@link OfflineStore} (`put`, `bulkPut`,
 * `update`, `updateMany`, `delete`, `clear`) when the browser refuses it for
 * lack of space, so the app can say "storage is full, sync before going on"
 * instead of showing Dexie's error.
 *
 * Why it exists: the error that reaches the caller is not a
 * `QuotaExceededError`. Measured in Chromium 159 with
 * `Storage.overrideQuotaForOrigin` at 1 MiB and a 4 MiB record, every write
 * rejected with Dexie's **`AbortError`**: the request succeeds and the quota is
 * enforced when the transaction commits, so the quota error only shows as the
 * `inner` of the abort. Checking `error.name === "QuotaExceededError"` misses
 * it. {@link isQuotaExceededError} recognises every shape and this class wraps
 * them in one.
 *
 * The original error is kept in `cause`. After a `bulkPut`, `cause` is Dexie's
 * `BulkError` when individual records failed, and its `failuresByPos` tells
 * which ones; the others may have been written.
 *
 * Writes made through `store.raw` or `store.db` bypass the store and are not
 * converted: test them with {@link isQuotaExceededError}.
 *
 * Also what `createOfflineSync(...).enqueue` rejects with when the outbox
 * cannot grow, since the outbox is an `OfflineStore`.
 *
 * @example
 * try {
 *     await visits.put(visit, userId);
 * } catch (error) {
 *     if (error instanceof StorageFullError) {
 *         toast.error("Memória cheia: sincronize antes de continuar.");
 *         return;
 *     }
 *     throw error;
 * }
 */
export class StorageFullError extends Error {
    /**
     * @param cause - The error the browser or Dexie raised, kept as `cause`.
     */
    constructor(cause: unknown) {
        super("O armazenamento do navegador está cheio.", { cause });
        this.name = "StorageFullError";
    }
}

/**
 * Whether `error` means the browser refused a write for lack of space.
 *
 * Recognises a {@link StorageFullError}, the browser's `QuotaExceededError`
 * (a `DOMException` or, in recent Chromium, its own class), Dexie's
 * `QuotaExceededError`, and the shapes that carry one inside: Dexie's
 * `AbortError` (`inner`, the shape Chromium produces at commit), `BulkError`
 * and `ModifyError` (`failures`), and any error whose `cause` is one.
 *
 * Use it on writes made outside an {@link OfflineStore} — `store.raw`,
 * `store.db.transaction(...)`, your own Dexie table — which reject with the
 * raw shapes.
 *
 * @param error - The caught value.
 * @returns Whether it is, or wraps, a quota error.
 */
export function isQuotaExceededError(error: unknown): boolean {
    const seen = new Set<unknown>();

    /**
     * Walk one value and the errors it wraps; `seen` stops a cycle.
     *
     * @param value - The value to inspect.
     * @returns Whether it or anything it wraps is a quota error.
     */
    function check(value: unknown): boolean {
        if (typeof value !== "object" || value === null || seen.has(value)) return false;
        seen.add(value);
        if (value instanceof StorageFullError) return true;
        const candidate = value as {
            name?: unknown;
            inner?: unknown;
            cause?: unknown;
            failures?: unknown;
        };
        if (typeof candidate.name === "string" && QUOTA_ERROR_NAMES.includes(candidate.name)) {
            return true;
        }
        if (check(candidate.inner) || check(candidate.cause)) return true;
        return Array.isArray(candidate.failures) && candidate.failures.some(check);
    }

    return check(error);
}
