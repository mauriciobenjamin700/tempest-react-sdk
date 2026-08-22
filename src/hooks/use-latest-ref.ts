/* eslint-disable react-hooks/refs -- writing at render time is deliberate; an effect would add a staleness window (see the docstring) */
import { useRef, type RefObject } from "react";

/**
 * Keeps a ref pointing at the most recent value it was given.
 *
 * The escape hatch for reading fresh state inside something that must not be
 * re-created when that state changes: an interval, a subscription, an event
 * listener registered once on mount. Listing the value in the effect's
 * dependencies would tear the effect down and set it back up on every change;
 * omitting it captures the value from the render that created the closure and
 * never sees another. The ref is neither — a stable object whose `current` is
 * always current.
 *
 * The assignment happens **during render**, for the same reason
 * {@link useStableCallback} does it: moving it into an effect opens a
 * one-commit staleness window, where an effect declared earlier in the same
 * commit reads the previous render's value.
 *
 * Reach for {@link useStableCallback} instead when the value is a function you
 * want to *call* — it hands back a callable with a stable identity, rather than
 * making every call site reach through `.current`.
 *
 * **List the returned ref in your effect's dependencies.** It is a stable object,
 * so the effect never re-runs because of it, but `react-hooks/exhaustive-deps`
 * cannot prove that for a custom hook the way it does for a bare `useRef`.
 * Listing it lets the rule verify the array instead of taking an omission on
 * trust.
 *
 * **Not for holding the previous value.** The write happens during render, so
 * `.current` is already the current value by the time any effect reads it. A hook
 * that wants the value from the *previous* commit — `usePrevious` — needs the
 * effect-based write, and swapping it for this would make it return the present.
 *
 * @typeParam T - The tracked value.
 * @param value - The value to track. Written on every render.
 * @returns A stable ref whose `current` holds the latest `value`.
 *
 * @example
 * const optionsRef = useLatestRef(options);
 *
 * useEffect(() => {
 *   const id = setInterval(() => poll(optionsRef.current), 5_000);
 *   return () => clearInterval(id);
 * }, []); // the interval survives every options change, and still reads the latest
 */
export function useLatestRef<T>(value: T): RefObject<T> {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}
