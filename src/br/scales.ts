import { lerpColor } from "./svg-utils";

/** Maps a numeric value to a CSS color string. */
export type ColorScale = (value: number) => string;

/**
 * Sequential, colorblind-safe palettes (ColorBrewer / Viridis families, public
 * domain). Ordered light → dark. Swap for your brand ramp if needed — any
 * ordered list of hex colors works with the scale builders below.
 */
export const SEQUENTIAL_BLUES = [
    "#eff3ff",
    "#c6dbef",
    "#9ecae1",
    "#6baed6",
    "#3182bd",
    "#08519c",
] as const;

export const SEQUENTIAL_GREENS = [
    "#edf8e9",
    "#c7e9c0",
    "#a1d99b",
    "#74c476",
    "#31a354",
    "#006d2c",
] as const;

export const SEQUENTIAL_VIRIDIS = [
    "#440154",
    "#414487",
    "#2a788e",
    "#22a884",
    "#7ad151",
    "#fde725",
] as const;

/** Diverging palette (red ↔ neutral ↔ blue), for signed metrics. */
export const DIVERGING_RDBU = [
    "#b2182b",
    "#ef8a62",
    "#fddbc7",
    "#d1e5f0",
    "#67a9cf",
    "#2166ac",
] as const;

/**
 * Interpolate a palette at `t ∈ [0, 1]`, blending between the two nearest
 * stops. `t <= 0` → first color, `t >= 1` → last.
 */
export function interpolatePalette(palette: readonly string[], t: number): string {
    if (palette.length === 0) return "#000000";
    if (palette.length === 1) return palette[0];
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * (palette.length - 1);
    const i = Math.floor(scaled);
    if (i >= palette.length - 1) return palette[palette.length - 1];
    return lerpColor(palette[i], palette[i + 1], scaled - i);
}

/**
 * Continuous scale: linearly interpolate `palette` across `[min, max]`.
 *
 * @example
 * const color = sequentialScale(0, 100, SEQUENTIAL_BLUES);
 * <BrazilMap values={data} colorScale={color} />;
 */
export function sequentialScale(
    min: number,
    max: number,
    palette: readonly string[] = SEQUENTIAL_BLUES,
): ColorScale {
    const span = max - min || 1;
    return (value) => interpolatePalette(palette, (value - min) / span);
}

/**
 * Reject an empty palette where a colour has to come out.
 *
 * `interpolatePalette` already guarded this and the two factories did not, so an
 * empty array made them index at `-1` and return `undefined` announced as
 * `string` — which reaches the DOM as `fill="undefined"` and paints nothing,
 * with no error anywhere. Throwing at construction puts the failure on the line
 * that built the scale instead of on every shape it colours.
 *
 * @param palette - The palette handed to a scale factory.
 * @param factory - Name of the caller, used in the message.
 * @throws {Error} When the palette has no entries.
 * @returns Nothing.
 */
function assertPalette(palette: readonly string[], factory: string): void {
    if (palette.length === 0) {
        throw new Error(`${factory}: palette must have at least one colour`);
    }
}

/**
 * Discrete scale: split `[min, max]` into `palette.length` equal buckets and
 * return the bucket's color (a classic choropleth "quantize" scale).
 */
export function quantizeScale(
    min: number,
    max: number,
    palette: readonly string[] = SEQUENTIAL_BLUES,
): ColorScale {
    assertPalette(palette, "quantizeScale");
    const span = max - min || 1;
    const n = palette.length;
    return (value) => {
        const idx = Math.min(n - 1, Math.max(0, Math.floor(((value - min) / span) * n)));
        return palette[idx] as string;
    };
}

/**
 * Threshold scale: `palette[i]` applies to values in
 * `[thresholds[i-1], thresholds[i])`. `palette` must have
 * `thresholds.length + 1` entries.
 *
 * @example
 * const color = thresholdScale([10, 50, 100], SEQUENTIAL_GREENS.slice(0, 4));
 */
export function thresholdScale(
    thresholds: readonly number[],
    palette: readonly string[],
): ColorScale {
    assertPalette(palette, "thresholdScale");
    return (value) => {
        let i = 0;
        while (i < thresholds.length && value >= (thresholds[i] as number)) i += 1;
        return palette[Math.min(i, palette.length - 1)] as string;
    };
}
