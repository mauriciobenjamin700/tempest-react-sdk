import { isApiError, isRetriableStatus } from "../http/errors";

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
 * The status list is {@link isRetriableStatus}, shared with the client's own
 * policy. It used to be a second copy here, and the copy was missing `425` — so
 * a `425 Too Early` was replayed by `createApiClient({ retry: true })` and not
 * by a query, for the same error in the same app.
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
    return isRetriableStatus(error.status);
}
