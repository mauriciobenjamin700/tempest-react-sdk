import { useCallback, useMemo, useState } from "react";

export interface UseMapResult<K, V> {
    map: ReadonlyMap<K, V>;
    set: (key: K, value: V) => void;
    delete: (key: K) => void;
    clear: () => void;
    get: (key: K) => V | undefined;
    has: (key: K) => boolean;
    size: number;
}

/**
 * Reactive `Map` wrapper. Mutating via `set` / `delete` / `clear` triggers a
 * re-render and yields a fresh `map` reference each time.
 *
 * @typeParam K - key type.
 * @typeParam V - value type.
 * @param initial - initial entries.
 * @returns `{ map, set, delete, clear, get, has, size }`.
 */
export function useMap<K, V>(initial?: Iterable<readonly [K, V]>): UseMapResult<K, V> {
    const [map, setMap] = useState<Map<K, V>>(() => new Map(initial));

    const set = useCallback((key: K, value: V): void => {
        setMap((current) => {
            const next = new Map(current);
            next.set(key, value);
            return next;
        });
    }, []);

    const remove = useCallback((key: K): void => {
        setMap((current) => {
            if (!current.has(key)) return current;
            const next = new Map(current);
            next.delete(key);
            return next;
        });
    }, []);

    const clear = useCallback((): void => {
        setMap((current) => (current.size === 0 ? current : new Map<K, V>()));
    }, []);

    const get = useCallback((key: K): V | undefined => map.get(key), [map]);
    const has = useCallback((key: K): boolean => map.has(key), [map]);

    return useMemo<UseMapResult<K, V>>(
        () => ({
            map,
            set,
            delete: remove,
            clear,
            get,
            has,
            size: map.size,
        }),
        [map, set, remove, clear, get, has],
    );
}
