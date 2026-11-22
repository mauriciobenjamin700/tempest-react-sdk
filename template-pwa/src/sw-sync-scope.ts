/**
 * Path prefixes whose mutations the page already retries on its own — empty in
 * a fresh scaffold. Add one when the app starts delivering a resource through
 * an outbox (`createOfflineSync`), e.g. `"/api/visits/"`.
 *
 * Two queues retrying the same mutation do not cooperate. The outbox sends the
 * latest version of a record when the network returns; the worker replays,
 * later and in its own order, every attempt the page made while offline —
 * including versions the outbox has already superseded — and bypasses the
 * outbox's conflict policy and its single-flight flush.
 */
export const RETRIED_BY_THE_PAGE: readonly string[] = [];

/**
 * Whether a failed mutation is queued by the worker's background sync
 * (`installBackgroundSync` in `src/sw.ts`) for replay when the network returns.
 *
 * Only this origin's `/api/` is queued, and never:
 *
 * - **a tus request** (`Tus-Resumable` header, sent on every request of
 *   `createResumableUpload`). The upload client already resumes by itself: it
 *   re-reads the server's offset with `HEAD` and continues from there. A `PATCH`
 *   kept by the worker is replayed with the `Upload-Offset` it had when it
 *   failed, so it is either a duplicate of bytes the client already sent or a
 *   `409`, and the worker stores the whole chunk body (5 MiB by default) in
 *   IndexedDB for every failed attempt to get there. A creation `POST` replayed
 *   by the worker opens an upload nobody will ever finish.
 * - **a path in {@link RETRIED_BY_THE_PAGE}**.
 *
 * @param url - The request URL.
 * @param request - The request, for its headers.
 * @param origin - The worker's own origin (`self.location.origin`).
 * @param retriedByThePage - Prefixes left to the page. Defaults to
 *   {@link RETRIED_BY_THE_PAGE}.
 * @returns `true` when the worker should queue the request if it fails.
 */
export function queuesInTheWorker(
    url: URL,
    request: Request,
    origin: string,
    retriedByThePage: readonly string[] = RETRIED_BY_THE_PAGE,
): boolean {
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return false;
    if (request.headers.has("Tus-Resumable")) return false;
    return !retriedByThePage.some((prefix) => url.pathname.startsWith(prefix));
}
