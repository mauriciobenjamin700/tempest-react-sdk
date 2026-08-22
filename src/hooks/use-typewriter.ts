import { useCallback, useState } from "react";
import { useInterval } from "./use-interval";

/** State returned by {@link useTypewriter}. */
export interface UseTypewriterResult {
    /** The prefix of `text` revealed so far. */
    displayedText: string;
    /** `true` once the whole string is on screen. */
    isComplete: boolean;
    /** Reveal the rest immediately — wire it to a tap or a key press. */
    skip: () => void;
}

/**
 * Reveals a string one character at a time.
 *
 * Changing `text` restarts the reveal. The reset happens during render rather
 * than in an effect, so the new string never flashes in full for one frame
 * before the animation takes over.
 *
 * Always give the reader a way out: an animation that cannot be skipped is a
 * tax on anyone re-reading or moving fast, which is what `skip` is for.
 *
 * How far the reveal got is derived rather than stored: a `speedMs` of `0` reads
 * as "all of it" without a state write, and `useInterval` pausing on a `null`
 * delay is what stops the timer at the end. Both used to need an effect that
 * cleared its own interval from inside a state updater.
 *
 * @param text - The full string to reveal. Nullish is treated as empty.
 * @param speedMs - Delay between characters. `0` or less renders instantly,
 *   which is the hook-safe way to honour `prefers-reduced-motion`.
 * @returns The revealed prefix, whether it finished, and a `skip` action.
 *
 * @example
 * const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
 * const { displayedText, isComplete, skip } = useTypewriter(line, reduced ? 0 : 30);
 *
 * return <p onClick={skip}>{displayedText}{isComplete ? "" : "▌"}</p>;
 */
export function useTypewriter(text: string, speedMs: number): UseTypewriterResult {
    const safeText = text ?? "";
    const initialCount = speedMs > 0 ? 0 : safeText.length;

    const [renderedText, setRenderedText] = useState(safeText);
    const [count, setCount] = useState(initialCount);

    if (renderedText !== safeText) {
        setRenderedText(safeText);
        setCount(initialCount);
    }

    const revealed = speedMs > 0 ? Math.min(count, safeText.length) : safeText.length;

    useInterval(
        () => setCount((current) => current + 1),
        speedMs > 0 && revealed < safeText.length ? speedMs : null,
    );

    const skip = useCallback(() => setCount(safeText.length), [safeText.length]);

    return {
        displayedText: safeText.slice(0, revealed),
        isComplete: revealed >= safeText.length,
        skip,
    };
}
