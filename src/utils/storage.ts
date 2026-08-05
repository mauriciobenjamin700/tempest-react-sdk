/**
 * Typed wrapper around `localStorage` that JSON-encodes values and
 * silently handles environments where storage is unavailable (SSR, private mode).
 *
 * @tempest-limits empty-catch — every method here is best-effort by contract:
 * `localStorage` throws on quota exhaustion, in Safari private mode, and when a
 * cross-origin frame has storage blocked. A caller persisting a preference has no
 * recovery to run and no user-facing message to show, so the write is dropped and
 * the app keeps the value in memory for the session.
 */
export const storage = {
    get<T>(key: string, fallback: T): T {
        if (typeof window === "undefined") return fallback;
        try {
            const raw = window.localStorage.getItem(key);
            return raw === null ? fallback : (JSON.parse(raw) as T);
        } catch {
            return fallback;
        }
    },
    set<T>(key: string, value: T): void {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* empty */
        }
    },
    remove(key: string): void {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.removeItem(key);
        } catch {
            /* empty */
        }
    },
};
