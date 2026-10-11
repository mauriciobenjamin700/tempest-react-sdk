import type { RequestAuthContext } from "../http";

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
 * Pass `getToken` to close that gap. Wired as `createApiClient`'s `refresh`, the
 * queue is told which token each rejected request carried: when that token is
 * no longer the current one, the rotation it was about to trigger already
 * happened, so the call returns at once and the replay picks up the new token.
 * The same five requests then take exactly one refresh, and so do twenty.
 *
 * Called by hand, with no context, the queue falls back to remembering the
 * token its last refresh produced and skipping while that token is in place.
 * That fallback cannot tell "already refreshed" from "the refreshed token has
 * since expired" — both leave the same string in the store — which is why the
 * client passes the context. Before 0.77.0 the client did not, and every
 * access token a refresh issued became unrefreshable once it expired: its `401`
 * skipped the refresh, the replay failed again, and `onUnauthorized` ended the
 * session.
 *
 * @param refresh - Performs the refresh and installs the new credentials.
 * @param options - Optional token reader that enables already-refreshed
 *   detection.
 * @returns A function that refreshes at most once per rotation, accepting the
 *   {@link RequestAuthContext} `createApiClient` passes on a `401`.
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
): (context?: Pick<RequestAuthContext, "token">) => Promise<void> {
    const { getToken } = options;
    let current: Promise<void> | null = null;
    let lastIssued: string | null = null;

    return (context?: Pick<RequestAuthContext, "token">) => {
        if (current) return current;

        if (getToken) {
            const now = getToken() ?? null;
            const rotated = context
                ? context.token !== null && now !== null && context.token !== now
                : lastIssued !== null && now === lastIssued;
            if (rotated) return Promise.resolve();
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
