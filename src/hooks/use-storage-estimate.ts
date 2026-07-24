import { useCallback, useEffect, useState } from "react";

/** Raw usage/quota reading from the Storage API, in bytes. */
export interface StorageEstimate {
    /** Bytes currently used by this origin, or `null` when unknown. */
    usage: number | null;
    /** Total bytes available to this origin, or `null` when unknown. */
    quota: number | null;
}

/**
 * `true` when `navigator.storage` exposes the estimate/persist APIs. Guards
 * every call so the helpers stay safe under SSR and older browsers.
 */
function storageManagerAvailable(): boolean {
    return (
        typeof navigator !== "undefined" &&
        "storage" in navigator &&
        typeof navigator.storage?.estimate === "function"
    );
}

/**
 * Read the origin's current storage usage and quota.
 *
 * @returns The estimate, or `{ usage: null, quota: null }` when unsupported.
 */
export async function estimateStorage(): Promise<StorageEstimate> {
    if (!storageManagerAvailable()) return { usage: null, quota: null };
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null };
}

/**
 * Ask the browser to make this origin's storage persistent, so IndexedDB and
 * the Cache Storage are not silently evicted under disk pressure — essential
 * for durable offline-first data.
 *
 * The browser may grant silently, prompt, or deny based on engagement heuristics.
 *
 * @returns `true` when storage is (now or already) persisted, else `false`.
 */
export async function requestPersistentStorage(): Promise<boolean> {
    if (
        typeof navigator === "undefined" ||
        !("storage" in navigator) ||
        typeof navigator.storage?.persist !== "function"
    ) {
        return false;
    }
    if (typeof navigator.storage.persisted === "function") {
        const already = await navigator.storage.persisted();
        if (already) return true;
    }
    return navigator.storage.persist();
}

/** Reactive storage-quota state exposed by {@link useStorageEstimate}. */
export interface UseStorageEstimateResult extends StorageEstimate {
    /** `true` when the Storage API is available. */
    supported: boolean;
    /** `usage / quota` in `[0, 1]`, or `null` when either value is unknown. */
    ratio: number | null;
    /** Whether storage is persisted, `null` before the first read / unsupported. */
    persisted: boolean | null;
    /** `true` during the initial read or a `refresh`. */
    loading: boolean;
    /** Re-read usage/quota and the persisted flag from the browser. */
    refresh: () => Promise<void>;
    /** Request persistent storage; refreshes state and returns the outcome. */
    requestPersist: () => Promise<boolean>;
}

/**
 * Track the origin's storage usage, quota and persistence flag, refreshing on
 * demand. Pair with {@link requestPersistentStorage} to surface a "usando X de
 * Y MB" meter and a "tornar armazenamento permanente" action.
 *
 * @param options - `pollMs` re-reads the estimate on an interval (`0` = off,
 *   the default).
 * @returns The reactive storage state and actions.
 *
 * @example
 * const { usage, quota, ratio, persisted, requestPersist } = useStorageEstimate();
 * return <Meter value={ratio ?? 0} onClick={requestPersist} />;
 */
export function useStorageEstimate(options: { pollMs?: number } = {}): UseStorageEstimateResult {
    const { pollMs = 0 } = options;
    const [supported] = useState<boolean>(() => storageManagerAvailable());
    const [usage, setUsage] = useState<number | null>(null);
    const [quota, setQuota] = useState<number | null>(null);
    const [persisted, setPersisted] = useState<boolean | null>(null);
    const [loading, setLoading] = useState<boolean>(supported);

    const refresh = useCallback(async () => {
        if (!supported) return;
        setLoading(true);
        try {
            const estimate = await estimateStorage();
            setUsage(estimate.usage);
            setQuota(estimate.quota);
            if (typeof navigator.storage?.persisted === "function") {
                setPersisted(await navigator.storage.persisted());
            }
        } finally {
            setLoading(false);
        }
    }, [supported]);

    const requestPersist = useCallback(async () => {
        const granted = await requestPersistentStorage();
        await refresh();
        setPersisted(granted);
        return granted;
    }, [refresh]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (pollMs <= 0 || !supported || typeof window === "undefined") return;
        const id = window.setInterval(() => {
            void refresh();
        }, pollMs);
        return () => window.clearInterval(id);
    }, [pollMs, supported, refresh]);

    const ratio = usage !== null && quota !== null && quota > 0 ? usage / quota : null;

    return {
        supported,
        usage,
        quota,
        ratio,
        persisted,
        loading,
        refresh,
        requestPersist,
    };
}
