/**
 * Resolve after `ms` milliseconds.
 *
 * @example
 * await sleep(500); // pauses for half a second
 */
export function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Race `promise` against a timeout.
 *
 * Resolves/rejects with `promise` when it settles first. If `ms` elapses
 * before that, the returned promise rejects with an `Error` whose `name` is
 * `"TimeoutError"`.
 *
 * @example
 * await withTimeout(fetch("/slow"), 3000);
 * await withTimeout(fetch("/slow"), 3000, "request too slow");
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(message ?? `Operation timed out after ${ms}ms`);
            error.name = "TimeoutError";
            reject(error);
        }, ms);

        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (reason) => {
                clearTimeout(timer);
                reject(reason);
            },
        );
    });
}
