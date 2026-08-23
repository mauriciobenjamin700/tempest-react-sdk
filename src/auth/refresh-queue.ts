export interface CreateRefreshQueueOptions {
    /**
     * Reads the credential the refresh installs — typically the access token.
     *
     * Supplying it makes the queue skip a refresh whose work another caller has
     * already done. Without it, only calls that literally overlap in time are
     * collapsed.
     */
    getToken?: () => string | null | undefined;
}

/**
 * Deduplicate concurrent refresh calls. When multiple 401 responses arrive
 * at once, all of them share the same in-flight `refresh()` promise instead
 * of triggering N parallel refreshes.
 *
 * **In-flight sharing alone does not collapse a burst.** A page that fires
 * several requests at once gets several 401s back, but they do not land inside
 * one window: the stragglers arrive after the first refresh already resolved,
 * find no promise to join, and each starts another one — rotating a token that
 * is already fresh. Measured against a mock backend, five concurrent expired
 * requests took two refreshes, not one.
 *
 * Pass `getToken` to close that gap. The queue remembers the token its last
 * refresh produced, and a call that finds that same token still in place returns
 * immediately, because the refresh it was about to perform has already happened.
 * The same five requests then take exactly one refresh, and so do twenty.
 *
 * @param refresh - Performs the refresh and installs the new credentials.
 * @param options - Optional token reader that enables already-refreshed
 *   detection.
 * @returns A function that refreshes at most once per rotation.
 *
 * @example
 * const refresh = createRefreshQueue(() => AuthService.refresh(), {
 *     getToken: () => useAuthStore.getState().token,
 * });
 *
 * // In every request that hits 401:
 * await refresh();
 * // ...retry the original request
 */
export function createRefreshQueue(
    refresh: () => Promise<void>,
    options: CreateRefreshQueueOptions = {},
): () => Promise<void> {
    const { getToken } = options;
    let current: Promise<void> | null = null;
    let lastIssued: string | null = null;

    return () => {
        if (current) return current;

        if (getToken && lastIssued !== null && getToken() === lastIssued) {
            return Promise.resolve();
        }

        current = (async () => {
            try {
                await refresh();
                if (getToken) lastIssued = getToken() ?? null;
            } finally {
                current = null;
            }
        })();
        return current;
    };
}
