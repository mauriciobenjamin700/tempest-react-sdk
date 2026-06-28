import { useCallback, useMemo, useState } from "react";

export interface UseSetResult<T> {
    set: ReadonlySet<T>;
    add: (value: T) => void;
    delete: (value: T) => void;
    clear: () => void;
    has: (value: T) => boolean;
    toggle: (value: T) => void;
    size: number;
}

/**
 * Reactive `Set` wrapper. Mutating via `add` / `delete` / `clear` / `toggle`
 * triggers a re-render and yields a fresh `set` reference each time.
 *
 * @typeParam T - element type.
 * @param initial - initial values.
 * @returns `{ set, add, delete, clear, has, toggle, size }`.
 */
export function useSet<T>(initial?: Iterable<T>): UseSetResult<T> {
    const [set, setSet] = useState<Set<T>>(() => new Set(initial));

    const add = useCallback((value: T): void => {
        setSet((current) => {
            if (current.has(value)) return current;
            const next = new Set(current);
            next.add(value);
            return next;
        });
    }, []);

    const remove = useCallback((value: T): void => {
        setSet((current) => {
            if (!current.has(value)) return current;
            const next = new Set(current);
            next.delete(value);
            return next;
        });
    }, []);

    const clear = useCallback((): void => {
        setSet((current) => (current.size === 0 ? current : new Set<T>()));
    }, []);

    const has = useCallback((value: T): boolean => set.has(value), [set]);

    const toggle = useCallback((value: T): void => {
        setSet((current) => {
            const next = new Set(current);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
    }, []);

    return useMemo<UseSetResult<T>>(
        () => ({
            set,
            add,
            delete: remove,
            clear,
            has,
            toggle,
            size: set.size,
        }),
        [set, add, remove, clear, has, toggle],
    );
}
