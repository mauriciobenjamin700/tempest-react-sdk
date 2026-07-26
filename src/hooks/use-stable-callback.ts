/* eslint-disable react-hooks/refs -- writing at render time is deliberate; an effect would add a staleness window (see the docstring) */
import { useCallback, useRef } from "react";

/**
 * Returns a stable function reference that always invokes the latest
 * `callback` argument. Use to break dependency cycles in effects without
 * triggering re-runs when the callback identity changes.
 *
 * The assignment happens **during render** on purpose. Moving it into an effect
 * would satisfy the React Compiler rules but open a one-commit staleness window:
 * an effect declared before this hook's own effect, in the same commit, would call
 * the previous render's callback. This is a primitive other hooks build on, so a
 * subtle staleness here is worse than the rule violation. Prefer React's
 * `useEffectEvent` once it ships as stable.
 */
export function useStableCallback<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
    const ref = useRef(callback);
    ref.current = callback;
    return useCallback((...args: TArgs) => ref.current(...args), []);
}
