/**
 * Deduplicate concurrent refresh calls. When multiple 401 responses arrive
 * at once, all of them share the same in-flight `refresh()` promise instead
 * of triggering N parallel refreshes.
 *
 * @example
 * const refresh = createRefreshQueue(() => AuthService.refresh());
 *
 * // In every request that hits 401:
 * await refresh();
 * // ...retry the original request
 */
export function createRefreshQueue(refresh: () => Promise<void>): () => Promise<void> {
    let current: Promise<void> | null = null;

    return () => {
        if (current) return current;
        current = (async () => {
            try {
                await refresh();
            } finally {
                current = null;
            }
        })();
        return current;
    };
}
