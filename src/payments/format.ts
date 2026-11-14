/**
 * `mm:ss` under an hour, `h:mm:ss` above — a Pix can live for 24 h.
 *
 * The default countdown format of `PixCheckout`, exported so an app that
 * renders its own Pix screen shows the same clock.
 *
 * @param ms - Milliseconds left. Rounded up, so the last second reads `00:01`.
 * @returns The formatted remaining time.
 *
 * @example
 * formatPixRemaining(65_000); // "01:05"
 * formatPixRemaining(3_725_000); // "1:02:05"
 */
export function formatPixRemaining(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return hours > 0 ? `${hours}:${mmss}` : mmss;
}
