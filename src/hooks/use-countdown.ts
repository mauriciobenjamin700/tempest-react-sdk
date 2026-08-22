import { useCallback, useEffect, useState } from "react";
import { useInterval } from "./use-interval";

/** Options for {@link useCountdown}. */
export interface UseCountdownOptions {
    /**
     * How often the remaining time is recomputed, in ms. Default `1000`, which
     * suits a "try again in 3s" label; drop it to ~50 to drive a progress bar.
     */
    tickMs?: number;
}

/**
 * Counts down the time left on a window that started at a known instant.
 *
 * Written around a timestamp rather than a decrementing counter on purpose: the
 * remaining time is recomputed from `Date.now()` on every tick, so a throttled
 * background tab, a slow frame or a `setInterval` that drifts cannot make the
 * countdown disagree with the clock. Remounting recovers the correct value too,
 * which a counter held in state cannot do.
 *
 * The interval stops once it reaches zero instead of ticking forever behind a
 * clamp — `useInterval` pauses on a `null` delay, so reaching zero is what tears
 * the timer down.
 *
 * @param durationMs - Length of the window.
 * @param startedAt - Epoch ms the window opened (`Date.now()` when it started).
 * @param options - Tick cadence.
 * @returns Milliseconds remaining, never below `0`.
 *
 * @example
 * const remaining = useCountdown(60_000, lastSentAt);
 *
 * <button disabled={remaining > 0}>
 *   {remaining > 0 ? `Reenviar em ${Math.ceil(remaining / 1000)}s` : "Reenviar código"}
 * </button>
 */
export function useCountdown(
    durationMs: number,
    startedAt: number,
    options: UseCountdownOptions = {},
): number {
    const { tickMs = 1000 } = options;

    const compute = useCallback(
        () => Math.max(0, durationMs - (Date.now() - startedAt)),
        [durationMs, startedAt],
    );

    const [remaining, setRemaining] = useState(compute);

    useEffect(() => {
        setRemaining(compute());
    }, [compute]);

    useInterval(() => setRemaining(compute()), remaining > 0 ? tickMs : null);

    return remaining;
}
