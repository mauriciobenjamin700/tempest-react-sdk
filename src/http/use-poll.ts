import { useEffect, useRef, useState } from "react";

export interface UsePollOptions<T> {
    /** Polling interval in ms. */
    interval: number;
    /** Disable polling without unmounting. Default: false. */
    disabled?: boolean;
    /** Stop polling once the predicate returns true. */
    stopWhen?: (data: T) => boolean;
    /** Called on each error. */
    onError?: (error: unknown) => void;
}

export interface UsePollResult<T> {
    data: T | null;
    error: unknown;
    loading: boolean;
    stop: () => void;
    start: () => void;
}

/**
 * Poll an async factory on a fixed interval. Skips overlapping requests if a
 * prior call has not finished. Pause via `disabled` or `stopWhen`.
 */
export function usePoll<T>(factory: () => Promise<T>, options: UsePollOptions<T>): UsePollResult<T> {
    const { interval, disabled = false, stopWhen, onError } = options;
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState<boolean>(!disabled);
    const stopped = useRef<boolean>(disabled);
    const inFlight = useRef<boolean>(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    async function tick(): Promise<void> {
        if (stopped.current || inFlight.current) return;
        inFlight.current = true;
        try {
            const next = await factory();
            if (stopped.current) return;
            setData(next);
            setError(null);
            if (stopWhen?.(next)) stopped.current = true;
        } catch (err) {
            if (!stopped.current) {
                setError(err);
                onError?.(err);
            }
        } finally {
            inFlight.current = false;
            setLoading(false);
            if (!stopped.current) {
                timer.current = setTimeout(tick, interval);
            }
        }
    }

    useEffect(() => {
        stopped.current = disabled;
        if (disabled) {
            if (timer.current) clearTimeout(timer.current);
            return;
        }
        setLoading(true);
        void tick();
        return () => {
            stopped.current = true;
            if (timer.current) clearTimeout(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interval, disabled]);

    return {
        data,
        error,
        loading,
        stop: () => {
            stopped.current = true;
            if (timer.current) clearTimeout(timer.current);
        },
        start: () => {
            if (!stopped.current) return;
            stopped.current = false;
            void tick();
        },
    };
}
