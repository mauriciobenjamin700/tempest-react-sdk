/**
 * Clamp `value` between `min` and `max` (inclusive).
 *
 * @example
 * clamp(120, 0, 100); // 100
 * clamp(-5, 0, 100);  // 0
 * clamp(42, 0, 100);  // 42
 */
export function clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return value;
    if (min > max) {
        const swap = min;
        min = max;
        max = swap;
    }
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * Format a byte count as a human-readable size string.
 *
 * Scales through B, KB, MB, GB and TB using 1024 as the base. `decimals`
 * controls the fractional digits for scaled units (default 1); `0` bytes
 * always renders as `"0 B"`.
 *
 * @example
 * formatBytes(0);       // "0 B"
 * formatBytes(1536);    // "1.5 KB"
 * formatBytes(1048576); // "1 MB"
 * formatBytes(1536, 2); // "1.50 KB"
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    const base = 1024;
    const exponent = Math.min(
        Math.floor(Math.log(Math.abs(bytes)) / Math.log(base)),
        units.length - 1,
    );
    const value = bytes / base ** exponent;
    const digits = exponent === 0 ? 0 : Math.max(0, decimals);
    const formatted = parseFloat(value.toFixed(digits)).toString();

    return `${formatted} ${units[exponent]}`;
}

/**
 * Format a number using compact notation (e.g. `1.2K`, `3.4M`).
 *
 * Wraps `Intl.NumberFormat` with `notation: "compact"`. The `locale` defaults
 * to `"en-US"`.
 *
 * @example
 * formatCompactNumber(1234);            // "1.2K"
 * formatCompactNumber(5600000);         // "5.6M"
 * formatCompactNumber(1234, "pt-BR");   // "1,2 mil"
 */
export function formatCompactNumber(value: number, locale: string = "en-US"): string {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
        value,
    );
}
