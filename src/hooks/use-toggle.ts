import { useCallback, useState } from "react";

export interface ToggleHelpers {
    toggle: () => void;
    setTrue: () => void;
    setFalse: () => void;
    set: (next: boolean) => void;
}

/**
 * Boolean state with `toggle`/`setTrue`/`setFalse` helpers.
 *
 * @param initial - initial value (default `false`).
 * @returns Tuple `[value, helpers]`.
 */
export function useToggle(initial = false): [boolean, ToggleHelpers] {
    const [value, setValue] = useState<boolean>(initial);

    const toggle = useCallback((): void => setValue((current) => !current), []);
    const setTrue = useCallback((): void => setValue(true), []);
    const setFalse = useCallback((): void => setValue(false), []);
    const set = useCallback((next: boolean): void => setValue(next), []);

    return [value, { toggle, setTrue, setFalse, set }];
}
