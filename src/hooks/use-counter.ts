import { useCallback, useMemo, useState } from "react";

export interface UseCounterOptions {
    min?: number;
    max?: number;
}

export interface CounterHandlers {
    increment: () => void;
    decrement: () => void;
    set: (value: number) => void;
    reset: () => void;
}

const clamp = (value: number, min: number | undefined, max: number | undefined): number => {
    let next = value;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    return next;
};

/**
 * Numeric counter clamped to an optional `[min, max]` range.
 *
 * @param initial - initial value (default `0`), clamped to the range.
 * @param options - optional `min` / `max` bounds.
 * @returns Tuple `[count, { increment, decrement, set, reset }]`.
 */
export function useCounter(
    initial = 0,
    options: UseCounterOptions = {},
): [number, CounterHandlers] {
    const { min, max } = options;
    const [count, setCount] = useState<number>(() => clamp(initial, min, max));

    const increment = useCallback((): void => {
        setCount((current) => clamp(current + 1, min, max));
    }, [min, max]);

    const decrement = useCallback((): void => {
        setCount((current) => clamp(current - 1, min, max));
    }, [min, max]);

    const set = useCallback(
        (value: number): void => {
            setCount(clamp(value, min, max));
        },
        [min, max],
    );

    const reset = useCallback((): void => {
        setCount(clamp(initial, min, max));
    }, [initial, min, max]);

    const handlers = useMemo<CounterHandlers>(
        () => ({ increment, decrement, set, reset }),
        [increment, decrement, set, reset],
    );

    return [count, handlers];
}
