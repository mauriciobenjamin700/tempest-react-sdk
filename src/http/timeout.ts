/**
 * The timeout half of `createApiClient`'s request plumbing.
 *
 * It lives beside the client rather than inside it because it is the one piece
 * with no knowledge of the SDK: given a caller's signal and a deadline it hands
 * back a signal to pass `fetch`, a way to tell whose abort fired, and the
 * cleanup. That makes it testable on its own and keeps the client file about
 * requests.
 */

/** A signal to hand `fetch`, plus how to read the outcome and clean up. */
export interface TimedSignal {
    /** Pass this to `fetch`. */
    signal: AbortSignal | undefined;
    /** Whether the abort came from the timeout rather than the caller. */
    timedOut: () => boolean;
    /** Clear the timer and drop the listener. Always call it. */
    dispose: () => void;
}

/**
 * Compose the caller's signal with a timeout, tracking which one fires.
 *
 * Written with an explicit flag rather than `AbortSignal.timeout()`, whose
 * `TimeoutError` reason would tell the two apart for free. Two reasons: this
 * needs no `AbortSignal.any`, which is Baseline 2024 and would raise the
 * package's support floor for one line of convenience, and the flag is read
 * directly instead of through a reason string that a polyfill could reshape.
 *
 * A caller signal that is already aborted aborts immediately, so a request never
 * goes out for a query react-query has already cancelled.
 *
 * @param signal - The caller's signal, if any.
 * @param ms - Timeout in milliseconds, or `null` to only forward the signal.
 * @returns The composed signal, the outcome reader, and the cleanup.
 */
export function withTimeout(
    signal: AbortSignal | null | undefined,
    ms: number | null,
): TimedSignal {
    if (ms === null) {
        return { signal: signal ?? undefined, timedOut: () => false, dispose: () => {} };
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, ms);
    const onAbort = (): void => controller.abort();

    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
    }

    return {
        signal: controller.signal,
        timedOut: () => timedOut,
        dispose: () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        },
    };
}
