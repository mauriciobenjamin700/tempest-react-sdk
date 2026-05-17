import { useCallback, useEffect, useState } from "react";

export type LocalStorageOptions<T> = {
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
};

const defaultSerialize = JSON.stringify;
const defaultDeserialize = <T>(raw: string): T => JSON.parse(raw) as T;

/**
 * State synced with `localStorage`. SSR-safe — initial render returns the
 * provided default; the stored value is hydrated after mount. Updates to the
 * same key in other tabs are picked up via the `storage` event.
 *
 * @param key - localStorage key.
 * @param defaultValue - value used when nothing is stored or in SSR.
 * @param options - custom `serialize` / `deserialize` (default JSON).
 * @returns Tuple `[value, setValue, remove]`.
 */
export function useLocalStorage<T>(
    key: string,
    defaultValue: T,
    options: LocalStorageOptions<T> = {},
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
    const serialize = options.serialize ?? defaultSerialize;
    const deserialize = options.deserialize ?? defaultDeserialize;

    const read = useCallback((): T => {
        if (typeof window === "undefined") return defaultValue;
        try {
            const raw = window.localStorage.getItem(key);
            if (raw === null) return defaultValue;
            return deserialize(raw);
        } catch {
            return defaultValue;
        }
    }, [key, defaultValue, deserialize]);

    const [value, setStored] = useState<T>(read);

    useEffect(() => {
        setStored(read());
    }, [read]);

    const setValue = useCallback(
        (next: T | ((prev: T) => T)): void => {
            setStored((current) => {
                const resolved =
                    typeof next === "function" ? (next as (prev: T) => T)(current) : next;
                try {
                    if (typeof window !== "undefined") {
                        window.localStorage.setItem(key, serialize(resolved));
                    }
                } catch {
                    /* swallow quota/exceptions */
                }
                return resolved;
            });
        },
        [key, serialize],
    );

    const remove = useCallback((): void => {
        try {
            if (typeof window !== "undefined") {
                window.localStorage.removeItem(key);
            }
        } catch {
            /* ignore */
        }
        setStored(defaultValue);
    }, [key, defaultValue]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onStorage = (event: StorageEvent): void => {
            if (event.key !== key) return;
            if (event.newValue === null) {
                setStored(defaultValue);
                return;
            }
            try {
                setStored(deserialize(event.newValue));
            } catch {
                /* ignore malformed remote value */
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [key, defaultValue, deserialize]);

    return [value, setValue, remove];
}
