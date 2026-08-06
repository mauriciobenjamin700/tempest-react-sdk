/**
 * @tempest-limits file-lines — OKLCH ↔ sRGB with the gamut mapping in between: the
 * transfer function, the LMS matrices, the chroma search that finds the nearest in-
 * gamut colour and the contrast ratio used to check it. Matrices split across files
 * are matrices that get edited one half at a time.
 */
/**
 * Color math behind {@link createTheme} — OKLab/OKLCH conversions, tint scale
 * generation and WCAG contrast picking.
 *
 * Everything here is pure and dependency-free: the SDK generates brand ramps at
 * runtime in the browser, so a color library would be a disproportionate cost
 * for ~150 lines of well-specified math. OKLCH is used instead of HSL because
 * HSL lightness is not perceptual — an HSL ramp of a yellow and of a blue at the
 * same `L` read as wildly different brightness, which is exactly what breaks a
 * generated palette.
 */

/** A color in the OKLCH space: perceptual lightness, chroma and hue. */
export interface Oklch {
    /** Perceptual lightness, `0` (black) to `1` (white). */
    l: number;
    /** Chroma (colorfulness). `0` is gray; sRGB rarely exceeds `~0.37`. */
    c: number;
    /** Hue angle in degrees, `0`–`360`. */
    h: number;
}

/** The ten steps of a Tempest tint scale, lightest to darkest. */
export type ScaleStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/** A generated tint scale, keyed by step. */
export type ColorScale = Record<ScaleStep, string>;

const SCALE_STEPS: ScaleStep[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

/**
 * Target lightness per step for a **brand** ramp in light mode.
 *
 * These are the measured OKLCH lightnesses of the hand-written `--tempest-primary-*`
 * scale in `colors.css`, so a generated brand ramp lands in the same visual range
 * as the built-in one instead of merely near it.
 */
const LIGHT_LIGHTNESS: Record<ScaleStep, number> = {
    50: 0.966,
    100: 0.923,
    200: 0.844,
    300: 0.743,
    400: 0.642,
    500: 0.563,
    600: 0.48,
    700: 0.391,
    800: 0.325,
    900: 0.251,
};

/**
 * Target lightness per step for a **neutral** ramp in light mode — measured from
 * the hand-written `--tempest-gray-*` scale.
 *
 * Deliberately **wider** than the brand curve at both ends (`0.982` → `0.210` vs
 * `0.966` → `0.251`): a neutral carries surfaces that must read as near-white and
 * text that must read as near-black, and the pair `text-muted` on `surface-3` has
 * to clear AA. Reusing the brand curve for neutrals is what dropped that pair to
 * 3.5:1 and made the browser axe sweep fail on every generated theme.
 */
const NEUTRAL_LIGHT_LIGHTNESS: Record<ScaleStep, number> = {
    50: 0.982,
    100: 0.963,
    200: 0.927,
    300: 0.872,
    400: 0.71,
    500: 0.544,
    600: 0.442,
    700: 0.369,
    800: 0.278,
    900: 0.21,
};

/**
 * Neutral ramp for dark mode, measured from the `[data-tempest-theme="dark"]`
 * surface/text tokens: `50` is the page background and `900` is text-grade.
 */
const NEUTRAL_DARK_LIGHTNESS: Record<ScaleStep, number> = {
    50: 0.159,
    100: 0.205,
    200: 0.254,
    300: 0.314,
    400: 0.381,
    500: 0.5,
    600: 0.571,
    700: 0.762,
    800: 0.86,
    900: 0.964,
};

/**
 * Target lightness for a dark-theme ramp — the ramp is **inverted**: `50` is the
 * darkest tint (a surface) and `900` the lightest (text-grade), matching the
 * `[data-tempest-theme="dark"]` block in `colors.css`.
 */
const DARK_LIGHTNESS: Record<ScaleStep, number> = {
    50: 0.238,
    100: 0.288,
    200: 0.362,
    300: 0.452,
    400: 0.544,
    500: 0.632,
    600: 0.712,
    700: 0.788,
    800: 0.862,
    900: 0.928,
};

/**
 * Chroma multiplier per step, relative to the input color's chroma.
 *
 * Peaks around `500`–`600` and falls off at both ends: near-white and near-black
 * tints hold very little chroma before they look muddy or leave the sRGB gamut.
 */
const CHROMA_CURVE: Record<ScaleStep, number> = {
    50: 0.18,
    100: 0.34,
    200: 0.6,
    300: 0.82,
    400: 0.95,
    500: 1,
    600: 0.98,
    700: 0.88,
    800: 0.74,
    900: 0.58,
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Expand `#abc` to `#aabbcc` and normalize to a lowercase 6-digit hex. */
function normalizeHex(hex: string): string {
    const raw = hex.trim().replace(/^#/, "");
    const expanded =
        raw.length === 3 || raw.length === 4
            ? raw
                  .slice(0, 3)
                  .split("")
                  .map((char) => char + char)
                  .join("")
            : raw.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
        throw new Error(`Invalid hex color: "${hex}"`);
    }
    return `#${expanded.toLowerCase()}`;
}

/** Parse a hex color into sRGB channels in the `0`–`1` range. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const normalized = normalizeHex(hex).slice(1);
    return {
        r: parseInt(normalized.slice(0, 2), 16) / 255,
        g: parseInt(normalized.slice(2, 4), 16) / 255,
        b: parseInt(normalized.slice(4, 6), 16) / 255,
    };
}

/** Serialize sRGB channels (`0`–`1`, clamped) back to a `#rrggbb` string. */
export function rgbToHex(r: number, g: number, b: number): string {
    const channel = (value: number): string =>
        Math.round(clamp(value, 0, 1) * 255)
            .toString(16)
            .padStart(2, "0");
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function srgbToLinear(channel: number): number {
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number): number {
    return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** Convert a hex color to OKLCH. */
export function hexToOklch(hex: string): Oklch {
    const { r, g, b } = hexToRgb(hex);
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);

    const long = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const medium = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const short = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
    const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
    const bAxis = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

    const c = Math.sqrt(a * a + bAxis * bAxis);
    const hue = c < 1e-6 ? 0 : (Math.atan2(bAxis, a) * 180) / Math.PI;

    return { l, c, h: hue < 0 ? hue + 360 : hue };
}

/** Convert OKLCH to linear-light sRGB, without gamut clamping. */
function oklchToLinearRgb({ l, c, h }: Oklch): { r: number; g: number; b: number } {
    const hRad = (h * Math.PI) / 180;
    const a = Math.cos(hRad) * c;
    const bAxis = Math.sin(hRad) * c;

    const long = (l + 0.3963377774 * a + 0.2158037573 * bAxis) ** 3;
    const medium = (l - 0.1055613458 * a - 0.0638541728 * bAxis) ** 3;
    const short = (l - 0.0894841775 * a - 1.291485548 * bAxis) ** 3;

    return {
        r: 4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
        g: -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
        b: -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
    };
}

function inGamut({ r, g, b }: { r: number; g: number; b: number }): boolean {
    const epsilon = 1e-4;
    return (
        r >= -epsilon &&
        r <= 1 + epsilon &&
        g >= -epsilon &&
        g <= 1 + epsilon &&
        b >= -epsilon &&
        b <= 1 + epsilon
    );
}

/**
 * Convert OKLCH to a hex color, reducing chroma until the result fits sRGB.
 *
 * Lightness and hue are preserved: desaturating is far less noticeable than
 * shifting either of them, and a naive channel clamp would do both.
 */
export function oklchToHex(color: Oklch): string {
    let chroma = Math.max(0, color.c);
    let rgb = oklchToLinearRgb({ ...color, c: chroma });

    for (let i = 0; i < 24 && !inGamut(rgb); i += 1) {
        chroma *= 0.9;
        rgb = oklchToLinearRgb({ ...color, c: chroma });
    }

    return rgbToHex(linearToSrgb(rgb.r), linearToSrgb(rgb.g), linearToSrgb(rgb.b));
}

/** Options for {@link createColorScale}. */
export interface ColorScaleOptions {
    /**
     * Pin step `500` to the input color's exact lightness. Default `true`.
     *
     * Right for a **brand** color: the hex a designer hands over is the one the
     * buttons must be. Wrong for a **neutral**: nobody checks that `gray-500` is
     * exactly the input, while everybody notices that a surface stopped being
     * near-white — anchoring rescales both halves around the input and compresses
     * exactly the range a neutral needs wide. With `false`, the ramp keeps the
     * tuned lightness curve and the input only contributes hue and chroma (a warm
     * or cool neutral, as asked).
     */
    anchor?: boolean;
    /**
     * Use the neutral lightness curve instead of the brand one. Default `false`.
     *
     * The neutral curve is wider at both ends, which is what keeps
     * `text-muted`-on-`surface-3` above AA. Implies the ramp is meant for
     * surfaces, borders and text rather than for an action color.
     */
    neutral?: boolean;
}

/**
 * Build a ten-step tint scale from a single color.
 *
 * The input color's hue is kept throughout and its chroma sets the intensity of
 * the whole ramp, so a muted brand color yields a muted scale instead of being
 * "corrected" into something the brand never approved.
 *
 * @param hex - Any hex color (`#abc` or `#aabbcc`), the intended `500` step.
 * @param mode - `"light"` for a light→dark ramp, `"dark"` for the inverted ramp
 *   used under `[data-tempest-theme="dark"]`.
 * @param options - See {@link ColorScaleOptions}.
 */
export function createColorScale(
    hex: string,
    mode: "light" | "dark" = "light",
    options: ColorScaleOptions = {},
): ColorScale {
    const base = hexToOklch(hex);
    const targets = options.neutral
        ? mode === "dark"
            ? NEUTRAL_DARK_LIGHTNESS
            : NEUTRAL_LIGHT_LIGHTNESS
        : mode === "dark"
          ? DARK_LIGHTNESS
          : LIGHT_LIGHTNESS;
    const lightness =
        options.anchor === false ? targets : anchorLightnessAt500(targets, base.l, mode);
    const scale = {} as ColorScale;

    for (const step of SCALE_STEPS) {
        scale[step] = oklchToHex({
            l: lightness[step],
            c: base.c * CHROMA_CURVE[step],
            h: base.h,
        });
    }

    return scale;
}

/** Widest lightness band a generated ramp may span, so both ends stay usable. */
const LIGHTNESS_CEILING = 0.985;
const LIGHTNESS_FLOOR = 0.12;

/**
 * Re-anchor a lightness ramp so step `500` lands on the brand color exactly.
 *
 * Without this, `500` is forced onto the ramp's own target lightness: a brand
 * `#7c3aed` came back as `#9161fe` — same hue, same chroma, *re-lightened*. It
 * looks fine in isolation and is wrong anyway, because the one color a designer
 * hands over is the one the buttons must actually be.
 *
 * Each half of the ramp is scaled independently around the anchor, so the shape
 * of the original curve survives and the ramp stays monotonic even for a very
 * light brand (yellow) or a very dark one (navy) — those simply get a shorter
 * run on the crowded side.
 *
 * @param targets - The default per-step lightness for this scheme.
 * @param anchor - Lightness of the brand color, used verbatim at step `500`.
 * @param mode - `"dark"` inverts which side of the ramp is the light one.
 */
function anchorLightnessAt500(
    targets: Record<ScaleStep, number>,
    anchor: number,
    mode: "light" | "dark",
): Record<ScaleStep, number> {
    const anchored = {} as Record<ScaleStep, number>;
    const base = targets[500];
    const lightEnd = mode === "dark" ? targets[900] : targets[50];
    const darkEnd = mode === "dark" ? targets[50] : targets[900];

    const top = Math.min(LIGHTNESS_CEILING, Math.max(lightEnd, anchor + 0.05));
    const bottom = Math.max(LIGHTNESS_FLOOR, Math.min(darkEnd, anchor - 0.05));

    for (const step of SCALE_STEPS) {
        const target = targets[step];
        if (target === base) {
            anchored[step] = anchor;
        } else if (target > base) {
            const ratio = (target - base) / (lightEnd - base);
            anchored[step] = anchor + ratio * (top - anchor);
        } else {
            const ratio = (base - target) / (base - darkEnd);
            anchored[step] = anchor - ratio * (anchor - bottom);
        }
    }

    return anchored;
}

/** WCAG 2.x relative luminance of a hex color. */
export function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2.x contrast ratio between two hex colors, from `1` to `21`. */
export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick the readable foreground for a background, by contrast ratio.
 *
 * Used for `--tempest-primary-foreground`: a generated brand color can land
 * anywhere on the lightness axis, and hardcoding white would silently produce
 * unreadable buttons for light brands (yellow, lime, cyan).
 */
export function readableForeground(
    background: string,
    light = "#ffffff",
    dark = "#101828",
): string {
    return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/** Format a hex color as `rgb(r g b / alpha)`, for focus rings and overlays. */
export function hexToRgbaString(hex: string, alpha: number): string {
    const { r, g, b } = hexToRgb(hex);
    const channel = (value: number): number => Math.round(clamp(value, 0, 1) * 255);
    return `rgb(${channel(r)} ${channel(g)} ${channel(b)} / ${clamp(alpha, 0, 1)})`;
}
