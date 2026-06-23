/**
 * Create a trailing-edge debounced version of `fn`.
 *
 * The wrapped function delays invoking `fn` until `wait` milliseconds have
 * elapsed since the last time it was called. Only the latest arguments are
 * used. Call `.cancel()` to clear any pending invocation.
 *
 * @example
 * const save = debounce((q: string) => search(q), 300);
 * save("a"); save("ab"); save("abc"); // only "abc" runs after 300ms
 * save.cancel();                       // nothing runs
 */
export function debounce<A extends unknown[]>(
    fn: (...args: A) => void,
    wait: number,
): ((...args: A) => void) & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const debounced = (...args: A): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            fn(...args);
        }, wait);
    };

    debounced.cancel = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    };

    return debounced;
}

/**
 * Create a throttled version of `fn` with leading and trailing edges.
 *
 * `fn` runs immediately on the first call (leading edge), then at most once
 * per `wait` milliseconds. If calls happen during the wait window, the last
 * one fires on the trailing edge. Call `.cancel()` to drop any pending
 * trailing call and reset the window.
 *
 * @example
 * const onScroll = throttle(() => render(), 200);
 * window.addEventListener("scroll", onScroll);
 * onScroll.cancel();
 */
export function throttle<A extends unknown[]>(
    fn: (...args: A) => void,
    wait: number,
): ((...args: A) => void) & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastArgs: A | undefined;
    let lastInvoke = 0;

    const invoke = (args: A): void => {
        lastInvoke = Date.now();
        fn(...args);
    };

    const throttled = (...args: A): void => {
        const now = Date.now();
        const remaining = wait - (now - lastInvoke);

        if (remaining <= 0) {
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
            invoke(args);
        } else {
            lastArgs = args;
            if (timer === undefined) {
                timer = setTimeout(() => {
                    timer = undefined;
                    if (lastArgs !== undefined) {
                        const pending = lastArgs;
                        lastArgs = undefined;
                        invoke(pending);
                    }
                }, remaining);
            }
        }
    };

    throttled.cancel = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        lastArgs = undefined;
        lastInvoke = 0;
    };

    return throttled;
}

/**
 * Wrap `fn` so it runs at most once; subsequent calls return the cached result.
 *
 * @example
 * const init = once(() => expensiveSetup());
 * init(); // runs expensiveSetup()
 * init(); // returns the same cached result, no re-run
 */
export function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    let called = false;
    let result: R;

    return (...args: A): R => {
        if (!called) {
            called = true;
            result = fn(...args);
        }
        return result;
    };
}

/**
 * Memoize only the most recent call of `fn`, keyed by shallow-equal arguments.
 *
 * If the next call has the same arguments (compared with `Object.is` per
 * position and equal length), the cached result is returned without re-running
 * `fn`. Any different argument list recomputes and replaces the cache.
 *
 * @example
 * const select = memoizeOne((a: number, b: number) => a + b);
 * select(1, 2); // computes 3
 * select(1, 2); // cached 3
 * select(2, 2); // recomputes 4
 */
export function memoizeOne<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    let hasCache = false;
    let lastArgs: A;
    let lastResult: R;

    const sameArgs = (next: A): boolean => {
        if (!hasCache || next.length !== lastArgs.length) return false;
        for (let i = 0; i < next.length; i++) {
            if (!Object.is(next[i], lastArgs[i])) return false;
        }
        return true;
    };

    return (...args: A): R => {
        if (sameArgs(args)) return lastResult;
        lastArgs = args;
        lastResult = fn(...args);
        hasCache = true;
        return lastResult;
    };
}
