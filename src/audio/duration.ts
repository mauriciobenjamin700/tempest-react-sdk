/**
 * Format a length in milliseconds as a clock: `0:07`, `2:41`, `1:03:12`.
 *
 * Returns `"--:--"` for anything not finite, which is the case that matters: a fresh
 * `MediaRecorder` WebM carries no duration in its header, so `<audio>.duration` reads
 * `Infinity` until the browser has been coaxed into resolving it. Rendering `NaN:aN`
 * there is the bug every home-made audio player ships with.
 *
 * The hour field appears only when there is one, so a voice note reads `0:07` rather
 * than `0:00:07`.
 *
 * @param ms - Length in milliseconds, or a non-finite value for "unknown".
 * @returns A clock string.
 */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "--:--";
    const total = Math.floor(ms / 1000);
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    const pad = (value: number): string => String(value).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
