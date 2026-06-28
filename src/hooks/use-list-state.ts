import { useCallback, useMemo, useState } from "react";

export interface ReorderPayload {
    from: number;
    to: number;
}

export interface ListStateHandlers<T> {
    append: (...items: T[]) => void;
    prepend: (...items: T[]) => void;
    insert: (index: number, ...items: T[]) => void;
    remove: (...indices: number[]) => void;
    reorder: (payload: ReorderPayload) => void;
    setItem: (index: number, item: T) => void;
    setState: (items: T[]) => void;
    apply: (fn: (item: T, index: number) => T) => void;
    clear: () => void;
}

/**
 * Manage an array as state with a rich set of immutable handlers.
 *
 * @typeParam T - element type.
 * @param initial - initial list (default `[]`).
 * @returns Tuple `[list, handlers]`.
 */
export function useListState<T>(initial: T[] = []): [T[], ListStateHandlers<T>] {
    const [list, setList] = useState<T[]>(initial);

    const append = useCallback((...items: T[]): void => {
        setList((current) => [...current, ...items]);
    }, []);

    const prepend = useCallback((...items: T[]): void => {
        setList((current) => [...items, ...current]);
    }, []);

    const insert = useCallback((index: number, ...items: T[]): void => {
        setList((current) => [...current.slice(0, index), ...items, ...current.slice(index)]);
    }, []);

    const remove = useCallback((...indices: number[]): void => {
        const drop = new Set(indices);
        setList((current) => current.filter((_, index) => !drop.has(index)));
    }, []);

    const reorder = useCallback(({ from, to }: ReorderPayload): void => {
        setList((current) => {
            const next = [...current];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    }, []);

    const setItem = useCallback((index: number, item: T): void => {
        setList((current) => current.map((value, i) => (i === index ? item : value)));
    }, []);

    const setState = useCallback((items: T[]): void => setList(items), []);

    const apply = useCallback((fn: (item: T, index: number) => T): void => {
        setList((current) => current.map(fn));
    }, []);

    const clear = useCallback((): void => setList([]), []);

    const handlers = useMemo<ListStateHandlers<T>>(
        () => ({
            append,
            prepend,
            insert,
            remove,
            reorder,
            setItem,
            setState,
            apply,
            clear,
        }),
        [append, prepend, insert, remove, reorder, setItem, setState, apply, clear],
    );

    return [list, handlers];
}
