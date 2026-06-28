import { useCallback, useMemo, useState } from "react";

export interface UseQueueOptions<T> {
    initialValues?: T[];
    limit?: number;
}

export interface UseQueueResult<T> {
    /** Items currently held within the queue (up to `limit`). */
    queue: T[];
    /** Append items; overflow beyond `limit` is held back, not dropped. */
    add: (...items: T[]) => void;
    /** Replace the held queue via a mapper over the current held items. */
    update: (fn: (state: T[]) => T[]) => void;
    /** Drop all currently held (visible) items, keeping any overflow. */
    cleanQueue: () => void;
    /** Number of visible items in the queue. */
    size: number;
}

/**
 * FIFO queue with an optional `limit`. When more items are added than `limit`
 * allows, the surplus is kept in an internal overflow buffer and surfaces into
 * `queue` as room frees up (e.g. after `cleanQueue`). Loosely mirrors Mantine's
 * `useQueue` shape.
 *
 * @typeParam T - element type.
 * @param options - `initialValues` and `limit` (default limit `Infinity`).
 * @returns `{ queue, add, update, cleanQueue, size }`.
 */
export function useQueue<T>(options: UseQueueOptions<T> = {}): UseQueueResult<T> {
    const { initialValues = [], limit = Infinity } = options;

    const [state, setState] = useState<{ queue: T[]; overflow: T[] }>(() => ({
        queue: initialValues.slice(0, limit),
        overflow: initialValues.slice(limit),
    }));

    const add = useCallback(
        (...items: T[]): void => {
            setState((current) => {
                const all = [...current.queue, ...current.overflow, ...items];
                return {
                    queue: all.slice(0, limit),
                    overflow: all.slice(limit),
                };
            });
        },
        [limit],
    );

    const update = useCallback(
        (fn: (queueState: T[]) => T[]): void => {
            setState((current) => {
                const all = [...fn(current.queue), ...current.overflow];
                return {
                    queue: all.slice(0, limit),
                    overflow: all.slice(limit),
                };
            });
        },
        [limit],
    );

    const cleanQueue = useCallback((): void => {
        setState((current) => ({
            queue: current.overflow.slice(0, limit),
            overflow: current.overflow.slice(limit),
        }));
    }, [limit]);

    return useMemo<UseQueueResult<T>>(
        () => ({
            queue: state.queue,
            add,
            update,
            cleanQueue,
            size: state.queue.length,
        }),
        [state.queue, add, update, cleanQueue],
    );
}
