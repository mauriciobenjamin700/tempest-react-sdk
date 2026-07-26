/** How many steps the sequential token scale has. */
export const SEQUENTIAL_STEP_COUNT = 7;

/** How many steps the diverging token scale has, midpoint included. */
export const DIVERGING_STEP_COUNT = 9;

/**
 * First sequential step that clears 2:1 against the chart surface.
 *
 * A sequential scale may let its near-zero end recede into the surface — on a
 * heatmap that is exactly what "almost nothing" should look like. An **ordinal**
 * scale may not: every step is a discrete mark someone has to see. Starting an
 * ordinal ramp here is the difference.
 */
export const ORDINAL_START_STEP = 3;

/** A `var(--tempest-chart-…)` reference, so the value follows the active theme. */
export type ChartColorToken = string;

/** Reference a token by name rather than interpolating the string at each call site. */
function token(name: string): ChartColorToken {
    return `var(--tempest-chart-${name})`;
}

/**
 * Clamp `value` into `0…1` against a domain, tolerating a reversed or empty one.
 *
 * A zero-width domain (every datum equal) would otherwise divide by zero and paint
 * the whole chart `NaN`; it resolves to the middle of the scale instead, which is
 * the honest reading of "no variation".
 */
function normalize(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return 0;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (hi === lo) return 0.5;
    return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/** Map a `0…1` position onto `1…steps`, inclusive. */
function stepOf(t: number, steps: number): number {
    return Math.min(steps, Math.max(1, Math.round(t * (steps - 1)) + 1));
}

export interface SequentialScaleOptions {
    /** Lowest value in the data. */
    min: number;
    /** Highest value in the data. */
    max: number;
    /**
     * Keep every step visible against the surface, for discrete ordered marks.
     *
     * Off by default: a heatmap *wants* its near-zero cells to recede. Turn it on
     * for tiers, funnel stages or anything where each step is its own mark.
     */
    ordinal?: boolean;
}

/**
 * Build a magnitude scale over the sequential tokens.
 *
 * Returns `var(--tempest-chart-sequential-N)` rather than a hex string, so a
 * heatmap painted once follows the theme — including dark mode, whose steps are
 * chosen for the dark surface rather than flipped.
 *
 * @example
 * const color = sequentialScale({ min: 0, max: 250 });
 * <rect fill={color(value)} />
 *
 * @param options - The data domain, and whether every step must stay visible.
 * @returns A function from value to a CSS colour reference.
 */
export function sequentialScale(
    options: SequentialScaleOptions,
): (value: number) => ChartColorToken {
    const { min, max, ordinal = false } = options;
    const first = ordinal ? ORDINAL_START_STEP : 1;
    const span = SEQUENTIAL_STEP_COUNT - first + 1;
    return (value) => token(`sequential-${first + stepOf(normalize(value, min, max), span) - 1}`);
}

export interface DivergingScaleOptions {
    /** Lowest value in the data. */
    min: number;
    /** Highest value in the data. */
    max: number;
    /**
     * The value that means "no deviation". Default `0`.
     *
     * It is a parameter because the interesting midpoint is often not zero — a
     * budget variance diverges around the target, not around nothing.
     */
    center?: number;
}

/**
 * Build a polarity scale over the diverging tokens.
 *
 * Each arm is scaled against its **own** distance from the centre, so an asymmetric
 * domain (say −5…+80) still uses the full cool arm for its small negatives. Scaling
 * both arms by the wider one — the easy mistake — would collapse every negative
 * into the step next to the midpoint and hide the sign entirely.
 *
 * @example
 * const color = divergingScale({ min: -12, max: 40 });   // centre 0
 * const budget = divergingScale({ min: 80, max: 130, center: 100 });
 *
 * @param options - The data domain and the neutral centre.
 * @returns A function from value to a CSS colour reference.
 */
export function divergingScale(options: DivergingScaleOptions): (value: number) => ChartColorToken {
    const { min, max, center = 0 } = options;
    const mid = Math.ceil(DIVERGING_STEP_COUNT / 2);
    const armSteps = mid - 1;
    const coolSpan = Math.abs(center - Math.min(min, max));
    const warmSpan = Math.abs(Math.max(min, max) - center);

    return (value) => {
        if (!Number.isFinite(value) || value === center) return token(`diverging-${mid}`);
        if (value < center) {
            if (coolSpan === 0) return token(`diverging-${mid}`);
            const t = Math.min(1, (center - value) / coolSpan);
            // Step 1 is the cool extreme, so a bigger deviation walks toward it.
            return token(`diverging-${mid - stepOf(t, armSteps)}`);
        }
        if (warmSpan === 0) return token(`diverging-${mid}`);
        const t = Math.min(1, (value - center) / warmSpan);
        return token(`diverging-${mid + stepOf(t, armSteps)}`);
    };
}

/**
 * Every step of a token scale, in order — for rendering a legend.
 *
 * A continuous scale needs a legend showing the ramp with its end labels; without
 * one the reader has no way to turn a colour back into a number.
 *
 * @param kind - Which scale.
 * @returns The token references, lightest/coolest first.
 */
export function scaleSteps(kind: "sequential" | "diverging"): ChartColorToken[] {
    const count = kind === "sequential" ? SEQUENTIAL_STEP_COUNT : DIVERGING_STEP_COUNT;
    return Array.from({ length: count }, (_, i) => token(`${kind}-${i + 1}`));
}
