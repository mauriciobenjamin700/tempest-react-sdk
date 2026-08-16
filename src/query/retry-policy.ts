import { isApiError } from "../http/errors";

/**
 * Statuses in the 4xx range that are still worth replaying.
 *
 * `429` is a refusal that explicitly means "later", and `408` is the server
 * saying the request itself timed out — both describe a condition that changes on
 * its own. Every other 4xx is the server refusing on purpose, and repeating it
 * changes nothing.
 */
const RETRIABLE_CLIENT_STATUSES: ReadonlySet<number> = new Set([408, 429]);

/** How many times a retriable failure is replayed. */
const MAX_RETRIES = 1;

/**
 * Default `retry` for SDK queries: replay transport and server failures, never a
 * deliberate client-side refusal.
 *
 * A flat `retry: 1` replays a 403 on an admin-only listing and a 404 for a record
 * somebody deleted. The server meant both — the second attempt returns the same
 * answer, doubles the network log and holds the spinner on screen for the length
 * of another round trip. A network failure or a 5xx is a different thing: it may
 * well succeed on the next try, so those keep the previous behaviour.
 *
 * @example
 * new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
 *
 * @param failureCount - Attempts already made, as react-query counts them.
 * @param error - The rejection value from the query function.
 * @returns Whether react-query should try again.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
    if (failureCount >= MAX_RETRIES) return false;
    if (!isApiError(error)) return true;
    if (error.status === 0) return true;
    if (error.status >= 400 && error.status < 500) {
        return RETRIABLE_CLIENT_STATUSES.has(error.status);
    }
    return true;
}
