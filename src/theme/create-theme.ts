/**
 * Theme factory: turns a handful of brand colors into the full set of
 * `--tempest-*` token overrides, for both light and dark.
 *
 * Rebranding used to mean hand-writing ~167 custom properties (and getting the
 * dark ramp inversion right by hand). `createTheme({ primary: "#7c3aed" })`
 * emits the same thing, derived in OKLCH so the ramp stays perceptually even.
 */
import {
    contrastRatio,
    createColorScale,
    hexToRgbaString,
    readableForeground,
    type ColorScale,
    type ScaleStep,
} from "./color";

/** Radius presets, applied to the whole `--tempest-radius-*` family at once. */
export type ThemeRadius = "none" | "sm" | "md" | "lg" | "xl" | "full";

/** Status token families that {@link createTheme} can regenerate. */
export type ThemeStatus = "success" | "warning" | "danger" | "info";

/** Input for {@link createTheme}. Every field is optional — omitted families keep the built-in tokens. */
export interface CreateThemeOptions {
    /** Brand color, used as the `500` step of the primary scale. */
    primary?: string;
    /** Neutral color, used as the `500` step of the gray scale (surfaces, borders, text). */
    gray?: string;
    /** Success color (`--tempest-success*`). */
    success?: string;
    /** Warning color (`--tempest-warning*`). */
    warning?: string;
    /** Danger color (`--tempest-danger*`). */
    danger?: string;
    /** Info color (`--tempest-info*`). */
    info?: string;
    /**
     * Categorical series colors for `tempest-react-sdk/charts`, in cycle order.
     * Written to `--tempest-chart-1` … `--tempest-chart-N`, so charts follow the
     * theme instead of a hardcoded palette.
     */
    chart?: string[];
    /** Corner radius scale. A preset name, or explicit per-step values. */
    radius?: ThemeRadius | Partial<Record<"xs" | "sm" | "md" | "lg" | "xl" | "2xl", string>>;
    /** Alpha of `--tempest-focus-ring-color`, derived from the brand color. Default `0.35`. */
    focusRingAlpha?: number;
    /** Selector the light tokens are written under. Default `":root"`. */
    selector?: string;
    /** Selector the dark tokens are written under. Default `'[data-tempest-theme="dark"]'`. */
    darkSelector?: string;
}

/** A generated theme: token maps per color scheme, plus the CSS text that carries them. */
export interface GeneratedTheme {
    /** Light-scheme custom properties, without the leading `--`-less names (keys include `--`). */
    light: Record<string, string>;
    /** Dark-scheme custom properties. */
    dark: Record<string, string>;
    /** Both blocks rendered as CSS, ready for {@link applyTheme} or a stylesheet. */
    css: string;
}

const RADIUS_PRESETS: Record<ThemeRadius, Record<string, string>> = {
    none: { xs: "0", sm: "0", md: "0", lg: "0", xl: "0", "2xl": "0" },
    sm: { xs: "1px", sm: "2px", md: "4px", lg: "6px", xl: "8px", "2xl": "12px" },
    md: { xs: "2px", sm: "4px", md: "8px", lg: "12px", xl: "16px", "2xl": "24px" },
    lg: { xs: "4px", sm: "6px", md: "12px", lg: "16px", xl: "22px", "2xl": "32px" },
    xl: { xs: "6px", sm: "10px", md: "16px", lg: "24px", xl: "32px", "2xl": "44px" },
    full: { xs: "4px", sm: "8px", md: "9999px", lg: "9999px", xl: "9999px", "2xl": "9999px" },
};

const SCALE_STEPS: ScaleStep[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

function writeScale(tokens: Record<string, string>, name: string, scale: ColorScale): void {
    for (const step of SCALE_STEPS) {
        tokens[`--tempest-${name}-${step}`] = scale[step];
    }
}

/** Minimum contrast for body text, WCAG 2.x AA. */
const AA_TEXT_CONTRAST = 4.5;

/**
 * Choose the ramp step for text sitting on the soft tint.
 *
 * A fixed step does not survive an arbitrary brand color: the built-in blue only
 * reaches 4.37:1 at `500` over its own `50` tint, and a generated emerald lands
 * at 4.41:1 at `600` — both fail AA for body text by a hair. So the step is
 * picked by measuring, walking away from the tint until it clears AA, and
 * falling back to the most extreme candidate when even that cannot (a very light
 * or very desaturated brand).
 *
 * @param scale - The generated ramp.
 * @param softStep - Step used as `--tempest-primary-soft`.
 * @param candidates - Steps to try, in order of preference.
 * @returns The first candidate clearing {@link AA_TEXT_CONTRAST}, else the last.
 */
function pickOnSoftStep(
    scale: ColorScale,
    softStep: ScaleStep,
    candidates: ScaleStep[],
): ScaleStep {
    for (const step of candidates) {
        if (contrastRatio(scale[softStep], scale[step]) >= AA_TEXT_CONTRAST) return step;
    }
    return candidates[candidates.length - 1];
}

/**
 * Emit the primary aliases for one scheme.
 *
 * The dark scheme walks the ramp the other way (hover is *lighter*, the soft
 * tint is a dark shade, and readable text on that tint is a light shade) — the
 * same inversion the built-in `colors.css` dark block does by hand.
 */
function writePrimaryAliases(
    tokens: Record<string, string>,
    scale: ColorScale,
    scheme: "light" | "dark",
    focusRingAlpha: number,
): void {
    tokens["--tempest-primary"] = "var(--tempest-primary-500)";
    if (scheme === "light") {
        tokens["--tempest-primary-hover"] = "var(--tempest-primary-600)";
        tokens["--tempest-primary-active"] = "var(--tempest-primary-700)";
        tokens["--tempest-primary-soft"] = "var(--tempest-primary-50)";
        tokens["--tempest-primary-soft-hover"] = "var(--tempest-primary-100)";
        tokens["--tempest-primary-on-soft"] =
            `var(--tempest-primary-${pickOnSoftStep(scale, 50, [600, 700, 800, 900])})`;
    } else {
        tokens["--tempest-primary-hover"] = "var(--tempest-primary-400)";
        tokens["--tempest-primary-active"] = "var(--tempest-primary-300)";
        tokens["--tempest-primary-soft"] = "var(--tempest-primary-100)";
        tokens["--tempest-primary-soft-hover"] = "var(--tempest-primary-200)";
        tokens["--tempest-primary-on-soft"] =
            `var(--tempest-primary-${pickOnSoftStep(scale, 100, [700, 800, 900])})`;
    }

    const foreground = readableForeground(scale[500]);
    tokens["--tempest-primary-foreground"] = foreground;
    tokens["--tempest-text-on-primary"] = foreground;
    tokens["--tempest-focus-ring-color"] = hexToRgbaString(scale[500], focusRingAlpha);
}

/**
 * Emit the neutral surface/border/text aliases from a generated gray scale.
 *
 * `--tempest-bg` is pushed past the ramp on purpose: pure white in light mode and
 * a shade darker than `gray-50` in dark mode, so a raised surface still reads as
 * raised against the page.
 */
function writeNeutralAliases(
    tokens: Record<string, string>,
    scale: ColorScale,
    scheme: "light" | "dark",
): void {
    if (scheme === "light") {
        tokens["--tempest-bg"] = "#ffffff";
        tokens["--tempest-surface"] = "var(--tempest-gray-50)";
        tokens["--tempest-surface-2"] = "var(--tempest-gray-100)";
        tokens["--tempest-surface-3"] = "var(--tempest-gray-200)";
        tokens["--tempest-border"] = "var(--tempest-gray-200)";
        tokens["--tempest-border-strong"] = "var(--tempest-gray-300)";
        tokens["--tempest-text"] = "var(--tempest-gray-900)";
        tokens["--tempest-text-muted"] = "var(--tempest-gray-600)";
        tokens["--tempest-text-subtle"] = "var(--tempest-gray-500)";
    } else {
        tokens["--tempest-bg"] = scale[50];
        tokens["--tempest-surface"] = "var(--tempest-gray-100)";
        tokens["--tempest-surface-2"] = "var(--tempest-gray-200)";
        tokens["--tempest-surface-3"] = "var(--tempest-gray-300)";
        tokens["--tempest-border"] = "var(--tempest-gray-300)";
        tokens["--tempest-border-strong"] = "var(--tempest-gray-400)";
        tokens["--tempest-text"] = "var(--tempest-gray-900)";
        tokens["--tempest-text-muted"] = "var(--tempest-gray-700)";
        tokens["--tempest-text-subtle"] = "var(--tempest-gray-600)";
    }
}

/**
 * Emit one status family (`--tempest-danger`, `-fg`, `-bg`, `-border`, `-solid`).
 *
 * `-fg` is the text shade over `-bg`, so it has to cross the ramp in opposite
 * directions per scheme; `-solid` stays the saturated fill used by badges.
 */
function writeStatus(
    tokens: Record<string, string>,
    name: ThemeStatus,
    scale: ColorScale,
    scheme: "light" | "dark",
): void {
    if (scheme === "light") {
        tokens[`--tempest-${name}`] = scale[700];
        tokens[`--tempest-${name}-fg`] = scale[800];
        tokens[`--tempest-${name}-bg`] = scale[50];
        tokens[`--tempest-${name}-border`] = scale[200];
        tokens[`--tempest-${name}-solid`] = scale[600];
    } else {
        tokens[`--tempest-${name}`] = scale[700];
        tokens[`--tempest-${name}-fg`] = scale[700];
        tokens[`--tempest-${name}-bg`] = scale[50];
        tokens[`--tempest-${name}-border`] = scale[200];
        tokens[`--tempest-${name}-solid`] = scale[500];
    }
}

function renderBlock(selector: string, tokens: Record<string, string>): string {
    const entries = Object.entries(tokens);
    if (entries.length === 0) return "";
    const body = entries.map(([name, value]) => `    ${name}: ${value};`).join("\n");
    return `${selector} {\n${body}\n}`;
}

/**
 * Generate `--tempest-*` overrides from a small brand description.
 *
 * Only the families you pass are generated; everything else falls through to the
 * SDK's own tokens, so a theme stays a patch and not a fork of `colors.css`.
 *
 * @example
 * ```ts
 * import { applyTheme, createTheme } from "tempest-react-sdk";
 *
 * const theme = createTheme({
 *   primary: "#7c3aed",
 *   radius: "lg",
 *   chart: ["#7c3aed", "#0ea5e9", "#22c55e", "#f59e0b"],
 * });
 *
 * applyTheme(theme);
 * ```
 *
 * @param options - Brand colors plus optional radius / chart / focus-ring tuning.
 * @returns The light and dark token maps and the CSS text that carries them.
 */
export function createTheme(options: CreateThemeOptions = {}): GeneratedTheme {
    const {
        primary,
        gray,
        chart,
        radius,
        focusRingAlpha = 0.35,
        selector = ":root",
        darkSelector = '[data-tempest-theme="dark"]',
    } = options;

    const light: Record<string, string> = {};
    const dark: Record<string, string> = {};

    if (primary) {
        const lightScale = createColorScale(primary, "light");
        const darkScale = createColorScale(primary, "dark");
        writeScale(light, "primary", lightScale);
        writeScale(dark, "primary", darkScale);
        writePrimaryAliases(light, lightScale, "light", focusRingAlpha);
        writePrimaryAliases(dark, darkScale, "dark", focusRingAlpha);
    }

    if (gray) {
        const lightScale = createColorScale(gray, "light");
        const darkScale = createColorScale(gray, "dark");
        writeScale(light, "gray", lightScale);
        writeScale(dark, "gray", darkScale);
        writeNeutralAliases(light, lightScale, "light");
        writeNeutralAliases(dark, darkScale, "dark");
    }

    for (const status of ["success", "warning", "danger", "info"] as const) {
        const value = options[status];
        if (!value) continue;
        writeStatus(light, status, createColorScale(value, "light"), "light");
        writeStatus(dark, status, createColorScale(value, "dark"), "dark");
    }

    if (chart?.length) {
        chart.forEach((color, index) => {
            light[`--tempest-chart-${index + 1}`] = color;
        });
        // Declares how many series colors this theme owns. Without it the reader
        // keeps walking into the SDK's built-in `--tempest-chart-7`/`-8`, so a
        // 6-color brand palette silently mixes with two leftover defaults — which
        // is exactly what a 7-series chart would show.
        light["--tempest-chart-count"] = String(chart.length);
    }

    if (radius) {
        const steps = typeof radius === "string" ? RADIUS_PRESETS[radius] : radius;
        for (const [step, value] of Object.entries(steps)) {
            light[`--tempest-radius-${step}`] = value;
        }
    }

    const css = [renderBlock(selector, light), renderBlock(darkSelector, dark)]
        .filter(Boolean)
        .join("\n\n");

    return { light, dark, css };
}

/**
 * Contrast ratio of `--tempest-primary-foreground` over the brand color.
 *
 * Exposed so an app (or a test) can assert its own brand clears WCAG AA (4.5) for
 * body text or AA-large (3.0) for button labels, instead of trusting the pick.
 *
 * @param options - The same input given to {@link createTheme}.
 * @returns The ratio, or `null` when no `primary` was provided.
 */
export function themeContrast(options: CreateThemeOptions): number | null {
    if (!options.primary) return null;
    const scale = createColorScale(options.primary, "light");
    return contrastRatio(scale[500], readableForeground(scale[500]));
}
