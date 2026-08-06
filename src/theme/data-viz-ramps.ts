import { contrastRatio, hexToOklch, oklchToHex } from "./color";

/** Number of steps in a sequential ramp. */
export const SEQUENTIAL_STEPS = 7;

/** Steps per arm of a diverging scale, excluding the neutral midpoint. */
export const DIVERGING_ARM_STEPS = 4;

/** A diverging scale: cool arm (extreme → near-mid), the midpoint, then the warm arm. */
export interface DivergingRamp {
    cool: string[];
    mid: string;
    warm: string[];
}

/**
 * Lightness range a ramp spans, per mode.
 *
 * Dark mode is **selected, not flipped**: its own band, chosen for the dark surface.
 * Mechanically inverting the light ramp yields steps that are either invisible
 * against a near-black surface or so bright they read as highlights.
 */
const BAND = {
    light: { from: 0.93, to: 0.34 },
    dark: { from: 0.28, to: 0.86 },
} as const;

/**
 * Chroma shaped as a dome across the ramp.
 *
 * A constant chroma makes the pale end look muddy and the dark end look neon. The
 * dome keeps the extremes believable while the middle carries the hue, which is
 * what makes a heatmap readable at a glance.
 *
 * @param t - Position along the ramp, `0`–`1`.
 * @returns A multiplier for the peak chroma.
 */
function chromaDome(t: number): number {
    return 0.35 + 0.65 * (1 - Math.abs(2 * t - 1) ** 1.6);
}

export interface BuildRampOptions {
    /** How many steps to emit. Defaults to {@link SEQUENTIAL_STEPS}. */
    steps?: number;
    /** Chroma at the middle of the ramp. */
    peakChroma?: number;
}

/**
 * Build a single-hue ramp with evenly spaced perceptual lightness.
 *
 * Even spacing in OKLCH lightness — not in RGB — is what makes equal data steps look
 * like equal colour steps.
 *
 * Steps come back in **token order**: index 0 is the end that means "near zero", so
 * it is the lightest on a light canvas and the darkest on a dark one. That is the
 * order `--tempest-chart-sequential-1…7` is written in, and it makes index 0 the step
 * nearest the surface in both modes — which is what `ordinalStart` walks from.
 * Returning a fixed light→dark order instead would put token 1 at opposite ends of
 * the scale depending on the mode, and a dark theme would paint every heatmap
 * inverted.
 *
 * @param hue - OKLCH hue in degrees.
 * @param mode - Which lightness band to span.
 * @param options - Shape of the ramp: `steps` (how many to emit) and `peakChroma`
 *   (chroma at the middle).
 * @returns Hex steps, near-zero end first.
 */
export function buildRamp(
    hue: number,
    mode: "light" | "dark",
    { steps = SEQUENTIAL_STEPS, peakChroma = 0.19 }: BuildRampOptions = {},
): string[] {
    const band = BAND[mode];
    const out: string[] = [];
    for (let i = 0; i < steps; i += 1) {
        const t = steps === 1 ? 0 : i / (steps - 1);
        out.push(
            oklchToHex({
                l: band.from + (band.to - band.from) * t,
                c: peakChroma * chromaDome(t),
                h: hue,
            }),
        );
    }
    return out;
}

/**
 * The first index of `ramp` that clears `minContrast` against `surface`.
 *
 * A **sequential** ramp may let its near-zero end recede into the surface — that is
 * what "almost nothing" should look like on a heatmap. An **ordinal** ramp may not:
 * every step is a discrete mark a reader has to see. This is how a consumer finds
 * where the ordinal-safe slice of a sequential ramp begins.
 *
 * @param ramp - Hex steps in token order, near-zero end first.
 * @param surface - The chart surface the ramp sits on.
 * @param minContrast - Floor to clear. Default `2` — the ordinal floor.
 * @returns The first safe index, or `0` when every step already clears it.
 */
export function ordinalStart(ramp: string[], surface: string, minContrast = 2): number {
    const index = ramp.findIndex((step) => contrastRatio(step, surface) >= minContrast);
    return index < 0 ? ramp.length - 1 : index;
}

/**
 * Build a diverging scale from two opposing hues around a neutral midpoint.
 *
 * The midpoint is **grey, never a hue**: a coloured midpoint reads as a third
 * category instead of as "no deviation", which is the one thing a diverging scale
 * exists to show. The arms get equal step counts so neither side looks like it
 * carries more range than the other.
 *
 * @param params.coolHue - OKLCH hue for the negative arm.
 * @param params.warmHue - OKLCH hue for the positive arm.
 * @param params.mid - Neutral midpoint, in hex.
 * @param params.mode - Which lightness band to span.
 * @param params.steps - Steps per arm.
 * @returns The scale, each arm ordered extreme → nearest the midpoint.
 */
export function buildDivergingRamp({
    coolHue,
    warmHue,
    mid,
    mode,
    steps = DIVERGING_ARM_STEPS,
}: {
    coolHue: number;
    warmHue: number;
    mid: string;
    mode: "light" | "dark";
    steps?: number;
}): DivergingRamp {
    /*
     * Each arm spans from its extreme to just short of the midpoint, so the two
     * arms together read as one continuous scale rather than two ramps abutting.
     */
    const band = mode === "light" ? { from: 0.86, to: 0.4 } : { from: 0.82, to: 0.42 };
    const arm = (hue: number): string[] => {
        const out: string[] = [];
        for (let i = 0; i < steps; i += 1) {
            const t = steps === 1 ? 0 : i / (steps - 1);
            out.push(
                oklchToHex({
                    l: band.from + (band.to - band.from) * t,
                    c: 0.17 * chromaDome(1 - t * 0.5),
                    h: hue,
                }),
            );
        }
        return out.reverse();
    };
    return { cool: arm(coolHue), mid, warm: [...arm(warmHue)].reverse() };
}

/**
 * The hue of a hex colour, for feeding the ramp builders.
 *
 * @param hex - Any hex colour.
 * @returns Its OKLCH hue in degrees.
 */
export function hueOf(hex: string): number {
    return hexToOklch(hex).h;
}
