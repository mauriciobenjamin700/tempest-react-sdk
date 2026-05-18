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
