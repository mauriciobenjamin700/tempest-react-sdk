/**
 * Tolerance for comparing intersection ratios.
 *
 * Browsers report `intersectionRatio` as the quotient of two rounded areas, so a
 * box sitting exactly on its threshold can come back a hair below it. Without
 * the slack the observer fires (it crossed) and the comparison says it did not.
 */
export const RATIO_EPSILON = 0.001;

/**
 * Highest `intersectionRatio` the target can ever reach inside the root.
 *
 * A box taller (or wider) than the root never fits in it: a section three
 * viewports tall tops out at a ratio of about 0.33. Any threshold above that is
 * unreachable, and an observer asked for it never reports the crossing.
 *
 * @param entry - An observation of the target; only its geometry is read.
 * @returns A value in `(0, 1]`, or `1` when the geometry is unknown (no
 *   `rootBounds`, as in a cross-origin iframe, or an empty box).
 */
export function reachableRatio(entry: IntersectionObserverEntry): number {
    const root = entry.rootBounds;
    const box = entry.boundingClientRect;
    if (!root || box.width <= 0 || box.height <= 0) return 1;
    return Math.min(1, root.height / box.height) * Math.min(1, root.width / box.width);
}

/**
 * The threshold `Reveal` actually observes with, given the one it was asked for.
 *
 * The requested threshold is read as "this fraction of whichever is smaller,
 * the element or the viewport". For a box that fits, that is the plain ratio;
 * for a box taller than the viewport it scales the threshold by the reachable
 * ratio, so `threshold={0.5}` on a 3-viewport section reveals once it fills
 * half the viewport instead of never.
 *
 * @param threshold - The requested threshold, in `[0, 1]`.
 * @param entry - The latest observation, or `null` before the first one.
 * @returns The threshold to observe with.
 */
export function effectiveThreshold(
    threshold: number,
    entry: IntersectionObserverEntry | null,
): number {
    if (!entry) return threshold;
    return threshold * reachableRatio(entry);
}
