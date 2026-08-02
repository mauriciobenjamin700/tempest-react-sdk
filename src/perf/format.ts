/**
 * Rendering helpers for the numbers a profiler produces.
 */

/**
 * Format a millisecond duration for display.
 *
 * Sub-second values keep millisecond resolution — the interesting range for a
 * single forward pass — and anything longer switches to seconds so a cold
 * start that pays a model download does not read as a five-digit number.
 * Durations under `1 ms` render as `"<1 ms"` rather than `"0 ms"`, which
 * would read as "not measured".
 *
 * @param value Duration in milliseconds.
 * @returns The formatted string, or `"—"` for a non-finite or negative input.
 *
 * @example
 * ```typescript
 * formatDurationMs(0.04);   // "<1 ms"
 * formatDurationMs(142.6);  // "143 ms"
 * formatDurationMs(4321);   // "4.32 s"
 * formatDurationMs(NaN);    // "—"
 * ```
 */
export function formatDurationMs(value: number): string {
    if (!Number.isFinite(value) || value < 0) return "—";
    if (value < 1) return "<1 ms";
    if (value < 1000) return `${Math.round(value)} ms`;
    return `${(value / 1000).toFixed(2)} s`;
}
