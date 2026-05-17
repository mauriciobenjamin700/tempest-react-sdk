export interface RetryOptions {
    /** Max attempts (including the first). Default: 3. */
    retries?: number;
    /** Initial backoff in ms. Doubles each attempt, capped at `maxDelay`. Default: 300. */
    initialDelay?: number;
    /** Maximum delay between attempts. Default: 10_000. */
    maxDelay?: number;
    /**
     * Return false to stop retrying for a specific error.
     * Default: retry on any thrown error.
     */
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    /** Called before each retry with the upcoming delay. */
    onRetry?: (info: { attempt: number; delay: number; error: unknown }) => void;
    /** Cancel pending retries. */
    signal?: AbortSignal;
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
 * @example
 * const data = await retry(() => api.get("/flaky"), { retries: 5 });
 */
export async function retry<T>(factory: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
        retries = 3,
        initialDelay = 300,
        maxDelay = 10_000,
        shouldRetry = () => true,
        onRetry,
        signal,
    } = options;

    let attempt = 0;
    let lastError: unknown;

    while (attempt < retries) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
            return await factory();
        } catch (error) {
            lastError = error;
            attempt += 1;
            if (attempt >= retries || !shouldRetry(error, attempt)) {
                throw error;
            }
            const delay = Math.min(initialDelay * 2 ** (attempt - 1), maxDelay);
            onRetry?.({ attempt, delay, error });
            await wait(delay, signal);
        }
    }

    throw lastError;
}
