import { lazy } from "react";
import type { ComponentType } from "react";

export interface LazyWithRetryOptions {
    /** Max attempts. Default: 3. */
    retries?: number;
    /** Initial delay (ms) before retrying. Default: 400. */
    initialDelay?: number;
    /**
     * Reload the page after every retry fails. Helps when the stale chunk
     * error is caused by an old `index.html` referencing deleted bundles.
     * Default: true.
     */
    reloadOnFinalFailure?: boolean;
}

/**
 * Wrap `React.lazy` with automatic retry. Common cause of failure:
 * deployed-then-cached `index.html` references chunk filenames that no
 * longer exist. Retrying after a short delay typically picks up the new
 * bundle; a final `location.reload()` recovers from stale `index.html`.
 *
 * @example
 * const Settings = lazyWithRetry(() => import("./Settings"));
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
    factory: () => Promise<{ default: T }>,
    options: LazyWithRetryOptions = {},
): ReturnType<typeof lazy<T>> {
    const { retries = 3, initialDelay = 400, reloadOnFinalFailure = true } = options;

    async function load(attempt = 1): Promise<{ default: T }> {
        try {
            return await factory();
        } catch (error) {
            if (attempt >= retries) {
                if (reloadOnFinalFailure && typeof window !== "undefined") {
                    window.location.reload();
                }
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, initialDelay * 2 ** (attempt - 1)));
            return load(attempt + 1);
        }
    }

    return lazy(load) as ReturnType<typeof lazy<T>>;
}
