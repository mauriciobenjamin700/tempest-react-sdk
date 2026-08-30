import { lazy } from "react";
import type { ComponentType } from "react";

/**
 * Any React component, whatever props it declares.
 *
 * Props sit in a *parameter* position, so a bound over them is contravariant:
 * `ComponentType<unknown>` reads as "a component that accepts every possible
 * props object", and only a component that declares no props at all satisfies
 * it. A page typed `({ mode }: Props) => …` is rejected, and so is one whose
 * props are entirely optional. `any` is the only bound that admits every
 * component — which is why React itself declares `lazy` and
 * `LazyExoticComponent` as `ComponentType<any>`. `ComponentType<never>` is not
 * an escape: it fails React's own bound through
 * `ComponentClass.getDerivedStateFromProps`, where the props land back in a
 * covariant position.
 *
 * This relaxes the *bound* only. `T` is still inferred as the concrete
 * component, so the rendered element keeps checking its props and `preload()`
 * still resolves to the concrete module.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

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

/** A lazy component that can also be fetched ahead of being rendered. */
export type PreloadableLazy<T extends AnyComponent> = ReturnType<typeof lazy<T>> & {
    /**
     * Start fetching the chunk now, before anything renders it.
     *
     * Call it on the interaction that makes the route likely — hovering the
     * link, opening the menu that holds it, finishing the step before it — so
     * the chunk is warm by the time the user commits and the suspense fallback
     * never appears.
     *
     * Shares its work with the render path: whichever fires first performs the
     * single fetch and the other awaits the same promise. Safe to call
     * repeatedly.
     *
     * @returns The module, once loaded. Rejects when every retry failed; that
     *   rejection is already handled internally, so a fire-and-forget call
     *   never surfaces as an unhandled rejection.
     */
    preload: () => Promise<{ default: T }>;
};

/**
 * Wrap `React.lazy` with automatic retry and a `preload()` method.
 *
 * Common cause of failure: deployed-then-cached `index.html` references chunk
 * filenames that no longer exist. Retrying after a short delay typically picks
 * up the new bundle; a final `location.reload()` recovers from stale
 * `index.html`.
 *
 * The wrapped component keeps its own props: `T` is inferred from the module
 * the factory resolves to, so a page declaring required, optional or no props
 * all pass through and the rendered element is still checked against them. See
 * {@link AnyComponent} for why the constraint has to be written the way it is.
 *
 * @param factory Dynamic import of the module whose `default` is the component.
 * @param options Retry count, initial backoff and the final-failure reload.
 * @returns The lazy component, carrying an extra `preload()`.
 *
 * @example
 * const Settings = lazyWithRetry(() => import("./Settings"));
 *
 * // Warm the chunk when the route becomes likely, not when it is needed.
 * <a href="/settings" onMouseEnter={() => void Settings.preload()}>Settings</a>
 */
export function lazyWithRetry<T extends AnyComponent>(
    factory: () => Promise<{ default: T }>,
    options: LazyWithRetryOptions = {},
): PreloadableLazy<T> {
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

    let pending: Promise<{ default: T }> | null = null;

    /**
     * Run `load` at most once at a time, so preloading and rendering never
     * fetch the same chunk twice.
     *
     * The internal `catch` does two jobs: it clears the memo, so a component
     * that failed can be tried again once an error boundary resets, and it
     * marks the promise as handled, so a `preload()` nobody awaited does not
     * raise an unhandled rejection. Callers still get a promise that rejects.
     */
    function loadOnce(): Promise<{ default: T }> {
        if (!pending) {
            pending = load();
            pending.catch(() => {
                pending = null;
            });
        }
        return pending;
    }

    const component = lazy(loadOnce) as PreloadableLazy<T>;
    component.preload = loadOnce;
    return component;
}
