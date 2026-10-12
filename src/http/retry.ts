import { isApiError, isRetriableStatus } from "./errors";

export interface RetryOptions {
    /**
     * Total attempts, the first one included. Default: 3 — one call plus two
     * replays.
     *
     * The first attempt always runs: `0`, a negative number or a fraction below
     * one all mean "a single attempt, no replay", and that attempt's error is the
     * one the promise rejects with. A fraction is rounded down; `NaN` falls back
     * to the default.
     *
     * The name reads like "replays after the first", but every surface that
     * forwards it has always counted totals — {@link createApiClient}'s `retry`,
     * `createResumableUpload` ("5 attempts"), and `lazyWithRetry`'s own
     * `retries`. Switching to "replays" would add one request to every caller
     * that passes a number, which no change of default can hide, so the count
     * stays a total and only the values that ran nothing were fixed (#486).
     */
    retries?: number;
    /** Initial backoff in ms. Doubles each attempt, capped at `maxDelay`. Default: 300. */
    initialDelay?: number;
    /** Maximum delay between attempts. Default: 10_000. */
    maxDelay?: number;
    /**
     * Honor a `Retry-After` hint on the thrown error (`error.retryAfter`, in
     * seconds — populated by {@link createApiClient} on `429`/`503`). When
     * present it overrides the exponential backoff for that attempt. The value
     * is capped at `maxDelay`. Default: true.
     */
    respectRetryAfter?: boolean;
    /**
     * Return false to stop retrying for a specific error.
     *
     * Default: replay anything that is not a recognisable API error — a
     * transport failure has no status to judge — and, for one that is, only the
     * statuses {@link isRetriableStatus} accepts. A `403` on an admin-only
     * endpoint and a `404` for a deleted record are the server's final answer;
     * repeating them spends the caller's time to show the same error twice.
     */
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    /** Called before each retry with the upcoming delay. */
    onRetry?: (info: { attempt: number; delay: number; error: unknown }) => void;
    /** Cancel pending retries. */
    signal?: AbortSignal;
}

/**
 * The default {@link RetryOptions.shouldRetry}.
 *
 * Permissive about what it cannot classify and strict about what it can: an
 * error with no API shape may well be a transport failure, while an API error
 * carrying a deliberate refusal will answer the same on every attempt.
 *
 * @param error - Whatever the attempt threw.
 * @returns Whether the helper should try again.
 */
function defaultShouldRetry(error: unknown): boolean {
    return !isApiError(error) || isRetriableStatus(error.status);
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

/**
 * Run `factory()` with exponential backoff. Each attempt awaits an
 * increasing delay capped at `maxDelay`. Throws the last error if every
 * attempt fails.
 *
 * `retries` is the **total** number of attempts, never fewer than one — see
 * {@link RetryOptions.retries}. `retries: 5` means one call plus four replays.
 *
 * @param factory - Starts one attempt; called again for every replay.
 * @param options - Attempt count, backoff and the retry predicate.
 * @returns What the first successful attempt resolved with.
 * @throws The error of the last attempt, or an `AbortError` once `signal` aborts.
 *
 * @example
 * const data = await retry(() => api.get("/flaky"), { retries: 5 });
 */
export async function retry<T>(factory: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
        retries = 3,
        initialDelay = 300,
        maxDelay = 10_000,
        respectRetryAfter = true,
        shouldRetry = defaultShouldRetry,
        onRetry,
        signal,
    } = options;

    const attempts = Number.isNaN(retries) ? 3 : Math.max(1, Math.floor(retries));
    let attempt = 0;

    for (;;) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
            return await factory();
        } catch (error) {
            attempt += 1;
            if (attempt >= attempts || !shouldRetry(error, attempt)) {
                throw error;
            }
            const retryAfter =
                respectRetryAfter &&
                typeof (error as { retryAfter?: unknown })?.retryAfter === "number"
                    ? (error as { retryAfter: number }).retryAfter * 1000
                    : null;
            const delay =
                retryAfter !== null
                    ? Math.min(retryAfter, maxDelay)
                    : Math.min(initialDelay * 2 ** (attempt - 1), maxDelay);
            onRetry?.({ attempt, delay, error });
            await wait(delay, signal);
        }
    }
}
