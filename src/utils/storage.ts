/**
 * Typed wrapper around `localStorage` that JSON-encodes values and
 * silently handles environments where storage is unavailable (SSR, private mode).
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
            /* ignore quota errors */
        }
    },
    remove(key: string): void {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.removeItem(key);
        } catch {
            /* ignore */
        }
    },
};
