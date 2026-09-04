/**
 * The speed presets the player offers, and why they stop at 2×.
 *
 * The spec lets a browser drop the audio once `playbackRate` leaves a range it
 * considers useful, and that limit varies by engine. These four sit inside every
 * range measured, so the default control never silences a clip by accident. A
 * caller who wants 4× can pass it — and should test it with sound on the
 * browsers they support before promising it.
 */
export const DEFAULT_PLAYBACK_RATES: readonly number[] = [0.5, 1, 1.5, 2];
