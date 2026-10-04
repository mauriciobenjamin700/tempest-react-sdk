/**
 * @tempest-limits file-lines — the inverse surface is a whole scheme: surfaces,
 * text, the action color, focus, selection, statuses, charts and syntax colors,
 * each derived and then measured against the brand fill it sits on. Splitting
 * the derivation from the table it is measured against is how the two drift.
 */
/**
 * Inverse surface: the token set for a section painted in the brand color —
 * a hero, a call-to-action band, a footer — so the components inside it invert
 * instead of inheriting the page's tokens.
 *
 * Every value is derived from the brand and measured against the fill it will
 * sit on, the same way {@link createTheme} measures the page schemes. Overriding
 * eight tokens by hand (what #409 had to do) leaves the rest of the scheme on
 * the page's values: measured over a navy `#1e2a5a`, the inherited
 * `--tempest-text-subtle` lands at 2.75:1, `--tempest-danger` at 2.12:1, the
 * selected indicator at 2.01:1, and a `Card` puts white text on
 * `--tempest-surface` at 1.05:1.
 */
import {
    contrastRatio,
    createColorScale,
    hexToOklch,
    oklchToHex,
    readableForeground,
    type ColorScale,
    type Oklch,
    type ScaleStep,
} from "./color";
import { buildDivergingRamp, buildRamp, hueOf } from "./data-viz-ramps";
import {
    INVERSE_SELECTOR,
    type InverseScheme,
    type InverseSurface,
    type InverseSurfaceOptions,
} from "./inverse-render";
import { DEFAULT_PAGE_SELECTORS, defaultToneRules } from "./inverse-restore";
import { THEME_STATUSES, writeStatus, type ThemeStatus } from "./status-tokens";

export { INVERSE_SELECTOR, renderInverseSurface } from "./inverse-render";
export { DEFAULT_TONE_SELECTOR } from "./inverse-restore";
export type {
    InverseScheme,
    InverseSurface,
    InverseSurfaceGenerator,
    InverseSurfaceOptions,
    PageSelectors,
} from "./inverse-render";

/** WCAG 2.x AA floor for body text. */
const AA_TEXT = 4.5;

/**
 * What text is fitted to, rather than the floor itself.
 *
 * The margin the SDK's dark theme keeps on `--tempest-text-subtle` (4.79 over its
 * surface): a value solved to exactly 4.5 turns the next rounding into a failure.
 */
const TEXT_TARGET = 4.75;

/** WCAG 2.2 SC 1.4.11 floor for a non-text indicator. */
const INDICATOR_FLOOR = 3;

/**
 * What the focus ring and the selected indicator are fitted to.
 *
 * Well above the 3:1 floor on purpose: the SDK's own rings keep 5.40:1 (dark)
 * and 5.50:1 (light) worst case, because a ring travels onto surfaces nobody
 * validated it against.
 */
const RING_TARGET = 4.5;

/**
 * The smallest contrast the ink must keep — on the fill, the surfaces and the
 * glow — before the fill is accepted.
 *
 * AA (4.5) is not enough here, because the surface has three text levels — text,
 * muted and subtle — and all three must clear AA. With text at 4.83:1 (white on
 * the default `#0066ff`) the three collapse into one color. 7:1 (AAA) leaves room
 * for muted to sit visibly between text and subtle.
 */
const MIN_TEXT_RATIO = 7;

/**
 * Fill candidates, nearest the brand first, darker before lighter on a tie.
 *
 * `500` is the brand itself and wins whenever it can carry the scheme. When it
 * cannot — a mid-tone brand such as `#0066ff`, where white measures 4.83:1 —
 * the walk moves one step at a time, so the section stays as close to the brand
 * as the measurement allows.
 *
 * Measuring the glow is what most of the walking pays for: against the flat
 * fill and the surfaces alone, 9 of the 14 test brands keep their `500`; with
 * the glow, 6 do. The three that move (`#8100D7`, `#22d3ee`, `#14b8a6`) are the
 * ones whose subtle text would fail on a lifted region of their own band.
 */
const FILL_CANDIDATES: readonly ScaleStep[] = [500, 600, 400, 700, 300, 800, 200, 900];

/**
 * Lightness offsets from the fill, per scheme.
 *
 * The sizes are the SDK's own, measured in OKLCH: the dark theme's surfaces sit
 * 0.046, 0.094 and 0.140 from `#0b0d12`, its borders 0.155 and 0.222; the light
 * theme's surfaces sit 0.018, 0.037 and 0.073 from white, its borders 0.073 and
 * 0.128.
 *
 * The direction is not the SDK's. On the page, raised surfaces move toward the
 * ink, which costs nothing there: the page fill is near-white or near-black, so
 * the ink keeps 13:1 or more on the third surface. A brand fill sits mid-axis,
 * and moving toward the ink spends exactly the contrast the text needs. Measured
 * across the fourteen brands of the contrast test, every text level held to AA
 * on every surface and on the glow ({@link GLOW_OFFSET}):
 *
 * | surfaces move | brands keeping their own `500` | where `#8100D7` / `#4f46e5` land |
 * | --- | --- | --- |
 * | toward the ink | 6 of 14 | `800` / `800` |
 * | away from the ink | 6 of 14 | `700` / `700` |
 *
 * Never worse and one step nearer the brand for the purples, and with every
 * surface carrying the ink at least as well as the fill does.
 *
 * So surfaces move away from the ink — a card in a navy band is a deeper navy,
 * one in a yellow band a paler yellow — and every surface then carries the ink
 * at least as well as the fill does. Borders still move toward the ink, since a
 * border has to separate from the fill and the surfaces alike.
 */
const OFFSETS: Record<
    InverseScheme,
    { surfaces: readonly [number, number, number]; border: number; borderStrong: number }
> = {
    dark: { surfaces: [0.046, 0.094, 0.14], border: 0.155, borderStrong: 0.222 },
    light: { surfaces: [0.018, 0.037, 0.073], border: 0.073, borderStrong: 0.128 },
};

/**
 * How far toward the ink a region of the band may lift and still be measured.
 *
 * A brand section is rarely one flat color: the landing that opened #409 lays a
 * radial glow of `#1f3f8f` at 55% over its navy `#03184b`, which lifts the
 * ground by 0.09 in OKLCH lightness, and a hover tint does the same. Text fitted
 * to the flat fill alone failed there — subtle measured 3.64:1 on that glow. So
 * every text and indicator token is also fitted against the fill lifted by this
 * much; darker variations (the landing's `#020f30` footer) only add contrast.
 */
const GLOW_OFFSET = 0.1;

/** Text ink per scheme — the SDK's own extremes. */
const INK: Record<InverseScheme, string> = { dark: "#ffffff", light: "#101828" };

/**
 * The SDK's default status colors, used when a theme names none.
 *
 * Ported from `src/styles/colors.css` (`--tempest-*-solid` in the light block),
 * and pinned by a test that reads that file.
 */
export const DEFAULT_STATUS_COLORS: Record<ThemeStatus, string> = {
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    info: "#2563eb",
};

/**
 * The SDK's categorical chart colors, per scheme.
 *
 * Ported from `src/styles/colors.css` (`--tempest-chart-1` … `-8`), pinned by a
 * test that reads that file. Used as the starting hue for each slot, then fitted
 * to the inverse fill.
 */
export const DEFAULT_CHART_COLORS: Record<InverseScheme, readonly string[]> = {
    light: ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4", "#ea580c", "#0f766e"],
    dark: ["#60a5fa", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee", "#fb923c", "#2dd4bf"],
};

/** Names of the `CodeBlock` syntax tokens, in `colors.css` order. */
const CODE_TOKENS = [
    "comment",
    "punctuation",
    "string",
    "number",
    "keyword",
    "literal",
    "function",
    "tag",
    "attribute",
    "property",
] as const;

/**
 * The SDK's syntax colors, per scheme, in {@link CODE_TOKENS} order.
 *
 * Ported from `src/styles/colors.css` (`--tempest-code-*`), pinned by a test
 * that reads that file. Used as the starting hue, then fitted to the inverse
 * code grounds.
 */
export const DEFAULT_CODE_COLORS: Record<InverseScheme, readonly string[]> = {
    light: [
        "#5f666e",
        "#5d6671",
        "#327243",
        "#9d5035",
        "#625baf",
        "#9f4c4f",
        "#1a6c94",
        "#974d72",
        "#127171",
        "#127171",
    ],
    dark: [
        "#838b93",
        "#818b95",
        "#589866",
        "#c57558",
        "#8580d8",
        "#c87172",
        "#2893c6",
        "#c07197",
        "#349897",
        "#349897",
    ],
};

/**
 * The SDK's elevation shadows, per scheme.
 *
 * Ported from `src/styles/colors.css` (`--tempest-shadow-*`). A light-ink fill
 * takes the dark theme's heavier shadows, since a faint shadow vanishes on it.
 * The dark block does not override `--tempest-shadow-inner`, so the dark row
 * carries the light value it inherits.
 */
const SHADOWS: Record<InverseScheme, Record<string, string>> = {
    light: {
        xs: "0 1px 2px rgba(15, 23, 42, 0.04)",
        sm: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
        md: "0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04)",
        lg: "0 12px 32px rgba(15, 23, 42, 0.12), 0 4px 8px rgba(15, 23, 42, 0.06)",
        xl: "0 24px 48px rgba(15, 23, 42, 0.18), 0 8px 16px rgba(15, 23, 42, 0.08)",
        inner: "inset 0 2px 4px rgba(15, 23, 42, 0.06)",
    },
    dark: {
        xs: "0 1px 2px rgba(0, 0, 0, 0.3)",
        sm: "0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.2)",
        md: "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)",
        lg: "0 12px 32px rgba(0, 0, 0, 0.5), 0 4px 8px rgba(0, 0, 0, 0.3)",
        xl: "0 24px 48px rgba(0, 0, 0, 0.6), 0 8px 16px rgba(0, 0, 0, 0.3)",
        inner: "inset 0 2px 4px rgba(15, 23, 42, 0.06)",
    },
};

/** Lightness step used when fitting a color toward the ink. */
const FIT_STEP = 0.005;

/**
 * Move a color along the lightness axis toward (positive `delta`) or away from
 * the ink, keeping its hue.
 *
 * @param base - The color to move, in OKLCH.
 * @param direction - `1` when the ink is lighter than the fill, `-1` otherwise.
 * @param delta - How far to move, in OKLCH lightness.
 * @param chroma - Chroma of the result; defaults to the base's.
 * @returns The moved color as hex, gamut-mapped.
 */
function shift(base: Oklch, direction: 1 | -1, delta: number, chroma: number = base.c): string {
    const l = Math.min(1, Math.max(0, base.l + direction * delta));
    return oklchToHex({ l, c: chroma, h: base.h });
}

/** Weakest contrast of `color` against every ground. */
function worst(color: string, grounds: readonly string[]): number {
    return Math.min(...grounds.map((ground) => contrastRatio(color, ground)));
}

/**
 * Walk a color toward the ink until it clears `floor` against every ground.
 *
 * Hue and chroma are kept, so a danger stays red and a keyword stays violet;
 * only lightness moves, and only as far as the measurement asks. When the walk
 * reaches the end of the lightness axis without clearing, the ink itself is
 * returned — it is the most contrasting color the scheme has.
 *
 * @param start - Where to start, as hex.
 * @param direction - `1` when the ink is lighter than the grounds, `-1` otherwise.
 * @param grounds - Every background the color will sit on.
 * @param floor - The ratio to clear against all of them.
 * @param ink - Fallback when nothing on the walk clears.
 * @returns The first color on the walk that clears, else `ink`.
 */
function fitToward(
    start: string,
    direction: 1 | -1,
    grounds: readonly string[],
    floor: number,
    ink: string,
): string {
    const base = hexToOklch(start);
    for (let delta = 0; delta <= 1; delta += FIT_STEP) {
        const candidate = shift(base, direction, delta);
        if (worst(candidate, grounds) >= floor) return candidate;
        if ((direction === 1 && base.l + delta >= 1) || (direction === -1 && base.l - delta <= 0)) {
            break;
        }
    }
    return ink;
}

/**
 * How far the soft tint sits from the fill, per scheme; the hover tint sits
 * {@link SOFT_HOVER_FACTOR} times as far.
 */
const SOFT_OFFSET: Record<InverseScheme, number> = { dark: 0.07, light: 0.05 };

/** Distance of the soft hover tint, relative to the soft tint's. */
const SOFT_HOVER_FACTOR = 1.6;

/**
 * The soft tint and its hover, lifted toward the ink only as far as the ink
 * still reads on both.
 *
 * A tint toward the ink is what reads as "highlighted" on a fill, and it is also
 * what eats the ink's contrast: on the `#8100D7` fill, the full offset left white
 * at 4.42:1 on the hover tint. So the offset shrinks until the ink clears
 * {@link TEXT_TARGET} on both, and when even a sliver cannot — the fill gives the
 * ink no room — the tints move away from the ink instead, like the surfaces.
 *
 * @param base - The fill, in OKLCH.
 * @param direction - `1` when the ink is lighter than the fill, `-1` otherwise.
 * @param offset - The preferred distance of the soft tint.
 * @param ink - The scheme's text ink.
 * @returns The soft tint and its hover, as hex.
 */
function softTints(base: Oklch, direction: 1 | -1, offset: number, ink: string): [string, string] {
    for (let delta = offset; delta > FIT_STEP; delta -= FIT_STEP) {
        const tints: [string, string] = [
            shift(base, direction, delta),
            shift(base, direction, delta * SOFT_HOVER_FACTOR),
        ];
        if (worst(ink, tints) >= TEXT_TARGET) return tints;
    }
    return [shift(base, direction, -offset), shift(base, direction, -offset * SOFT_HOVER_FACTOR)];
}

/** Mix `top` over `bottom` at `amount`, the way `color-mix(in srgb, …)` composites. */
function mix(bottom: string, top: string, amount: number): string {
    const parse = (hex: string): number[] =>
        [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
    const [a, b] = [parse(bottom), parse(top)];
    const channels = a.map((channel, index) =>
        Math.round(channel + ((b[index] as number) - channel) * amount),
    );
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Derive the inverse scheme over one candidate fill.
 *
 * Text is three levels, like the page: the ink, then `muted` fitted to the
 * geometric mean of the ink's contrast and {@link TEXT_TARGET} (so it sits
 * visibly between the two), then `subtle` fitted to {@link TEXT_TARGET} on
 * `bg` and `surface` — the same pairs the SDK holds its own `text-subtle` to.
 *
 * The action color is the ink itself: a white button on a navy band, labelled in
 * the fill. Hover and active step back toward the fill, because the ink is
 * already the end of the axis and has nowhere further to go.
 *
 * `--tempest-danger-hover` steps toward the side that keeps `-on-solid`
 * readable: darker when the ink is white, lighter when it is dark. A fixed
 * direction cannot hold one ink over both fills — over the dark scheme's
 * `#dc2626` it measured 4.00:1 with the lighter hover.
 *
 * The ramp (`--tempest-primary-50` … `-900`) is emitted too, because `Tag` and
 * `Sidebar` pair raw steps (`100` under `700`). It is the scheme's unanchored
 * ramp, so that pair keeps the shape it has on the page.
 *
 * @param fill - The fill, as hex.
 * @param options - The brand description.
 * @returns The token map and the scheme it reads as.
 */
function deriveOver(
    fill: string,
    options: InverseSurfaceOptions,
): { tokens: Record<string, string>; scheme: InverseScheme; glow: string } {
    const ink = readableForeground(fill, INK.dark, INK.light);
    const scheme: InverseScheme = ink === INK.dark ? "dark" : "light";
    const direction: 1 | -1 = scheme === "dark" ? 1 : -1;
    const base = hexToOklch(fill);
    const offsets = OFFSETS[scheme];
    const tokens: Record<string, string> = {};

    const surfaces = [fill, ...offsets.surfaces.map((delta) => shift(base, direction, -delta))];
    const [bg, surface, surface2, surface3] = surfaces as [string, string, string, string];
    const glow = shift(base, direction, GLOW_OFFSET);
    const grounds = [...surfaces, glow];
    tokens["--tempest-bg"] = bg;
    tokens["--tempest-surface"] = surface;
    tokens["--tempest-surface-2"] = surface2;
    tokens["--tempest-surface-3"] = surface3;
    tokens["--tempest-border"] = shift(base, direction, offsets.border);
    tokens["--tempest-border-strong"] = shift(base, direction, offsets.borderStrong);

    const textWorst = worst(ink, grounds);
    const tint = base.c * 0.4;
    tokens["--tempest-text"] = ink;
    tokens["--tempest-text-muted"] = fitToward(
        shift(base, direction, 0, tint),
        direction,
        grounds,
        Math.max(TEXT_TARGET, Math.sqrt(textWorst * TEXT_TARGET)),
        ink,
    );
    tokens["--tempest-text-subtle"] = fitToward(
        shift(base, direction, 0, tint),
        direction,
        [bg, surface, glow],
        TEXT_TARGET,
        ink,
    );

    const inkBase: Oklch = { ...hexToOklch(ink), h: base.h };
    tokens["--tempest-primary"] = ink;
    tokens["--tempest-primary-hover"] = shift(inkBase, direction, -0.05, base.c * 0.25);
    tokens["--tempest-primary-active"] = shift(inkBase, direction, -0.1, base.c * 0.3);
    tokens["--tempest-primary-foreground"] = fill;
    tokens["--tempest-text-on-primary"] = fill;

    const [soft, softHover] = softTints(base, direction, SOFT_OFFSET[scheme], ink);
    tokens["--tempest-primary-soft"] = soft;
    tokens["--tempest-primary-soft-hover"] = softHover;
    tokens["--tempest-primary-on-soft"] = fitToward(
        soft,
        direction,
        [soft, softHover],
        TEXT_TARGET,
        ink,
    );

    const ring = fitToward(fill, direction, grounds, RING_TARGET, ink);
    tokens["--tempest-focus-ring-color"] = ring;
    tokens["--tempest-selected-indicator"] = ring;

    const ramp: ColorScale = createColorScale(options.primary, scheme, { anchor: false });
    for (const [step, value] of Object.entries(ramp)) {
        tokens[`--tempest-primary-${step}`] = value;
    }

    for (const status of THEME_STATUSES) {
        const scale = createColorScale(
            options.statuses?.[status] ?? DEFAULT_STATUS_COLORS[status],
            scheme,
        );
        writeStatus(tokens, status, scale, scheme);
        tokens[`--tempest-${status}`] = fitToward(
            tokens[`--tempest-${status}`] as string,
            direction,
            grounds,
            TEXT_TARGET,
            ink,
        );
        if (status === "danger") {
            const whiteInk = tokens["--tempest-danger-on-solid"] === "#ffffff";
            const darker: ScaleStep = scheme === "dark" ? 400 : 700;
            const lighter: ScaleStep = scheme === "dark" ? 600 : 500;
            tokens["--tempest-danger-hover"] = scale[whiteInk ? darker : lighter];
        }
    }

    const chart = options.chart?.length ? options.chart : DEFAULT_CHART_COLORS[scheme];
    chart.forEach((color, index) => {
        tokens[`--tempest-chart-${index + 1}`] = fitToward(
            color,
            direction,
            [bg, surface, glow],
            INDICATOR_FLOOR,
            ink,
        );
    });
    const coolHue = hueOf(options.chart?.[0] ?? options.primary);
    const warmHue = options.statuses?.danger
        ? hueOf(options.statuses.danger)
        : (coolHue + 180) % 360;
    buildRamp(coolHue, scheme).forEach((value, index) => {
        tokens[`--tempest-chart-sequential-${index + 1}`] = value;
    });
    const diverging = buildDivergingRamp({ coolHue, warmHue, mid: surface3, mode: scheme });
    [...diverging.cool, diverging.mid, ...diverging.warm].forEach((value, index) => {
        tokens[`--tempest-chart-diverging-${index + 1}`] = value;
    });
    tokens["--tempest-chart-grid"] = tokens["--tempest-border"] as string;
    tokens["--tempest-chart-axis"] = tokens["--tempest-text-subtle"] as string;

    const codeGrounds = [bg, surface, mix(surface, ink, 0.1)];
    CODE_TOKENS.forEach((name, index) => {
        tokens[`--tempest-code-${name}`] = fitToward(
            DEFAULT_CODE_COLORS[scheme][index] as string,
            direction,
            codeGrounds,
            TEXT_TARGET,
            ink,
        );
    });

    for (const [name, value] of Object.entries(SHADOWS[scheme])) {
        tokens[`--tempest-shadow-${name}`] = value;
    }

    return { tokens, scheme, glow };
}

/**
 * The gates a candidate fill must clear before it is accepted.
 *
 * Text reaches {@link MIN_TEXT_RATIO} on every surface, every fitted text token
 * clears AA where it is used, the ring clears 3:1 on every surface, and the
 * action label clears AA on all three button states.
 *
 * @param tokens - A derived token map.
 * @param glow - The fill lifted by {@link GLOW_OFFSET}, measured alongside the surfaces.
 * @returns The weakest margin over its floor across all gates; `>= 0` passes.
 */
function margin(tokens: Record<string, string>, glow: string): number {
    const read = (name: string): string => tokens[name] as string;
    const surfaces = [
        read("--tempest-bg"),
        read("--tempest-surface"),
        read("--tempest-surface-2"),
        read("--tempest-surface-3"),
    ];
    const label = read("--tempest-primary-foreground");
    const checks: number[] = [
        worst(read("--tempest-text"), [...surfaces, glow]) / MIN_TEXT_RATIO,
        worst(read("--tempest-text-muted"), [...surfaces, glow]) / AA_TEXT,
        worst(read("--tempest-text-subtle"), [...surfaces.slice(0, 2), glow]) / AA_TEXT,
        worst(read("--tempest-focus-ring-color"), [...surfaces, glow]) / INDICATOR_FLOOR,
        worst(label, [
            read("--tempest-primary"),
            read("--tempest-primary-hover"),
            read("--tempest-primary-active"),
        ]) / AA_TEXT,
    ];
    return Math.min(...checks) - 1;
}

/**
 * Build the inverse surface for a brand.
 *
 * The fill is the brand's own `500` whenever it can carry the scheme, and
 * otherwise the nearest ramp step that can (see {@link FILL_CANDIDATES}). Whether
 * the surface reads light-on-dark or dark-on-light follows the fill, so a yellow
 * brand gets dark ink and a navy one white — the same pick `createTheme` makes
 * for `--tempest-primary-foreground`.
 *
 * The values are literal colors, not references to the page's ramp, so the
 * section paints the same in the light and the dark page scheme: the brand is
 * the brand in both.
 *
 * The result also carries the rules that let a region inside the surface go
 * back to the page's tokens (`data-tempest-tone="default"`), written for the
 * selectors in `options`.
 *
 * @param options - The brand, plus the status and chart colors the theme names
 *   and the selectors the surface and the page are written under.
 * @returns The token map, the scheme it reads as, the fill step used and the
 *   default-tone rules.
 */
export function createInverseSurface(options: InverseSurfaceOptions): InverseSurface {
    const ramp = createColorScale(options.primary, "light");
    let best: InverseSurface | null = null;
    let bestMargin = Number.NEGATIVE_INFINITY;
    for (const step of FILL_CANDIDATES) {
        const derived = deriveOver(ramp[step], options);
        const measured = margin(derived.tokens, derived.glow);
        if (measured > bestMargin) {
            best = { tokens: derived.tokens, scheme: derived.scheme, step };
            bestMargin = measured;
        }
        if (measured >= 0) break;
    }
    const surface = best as InverseSurface;
    surface.rules = defaultToneRules(
        Object.keys(surface.tokens),
        options.selector ?? INVERSE_SELECTOR,
        options.page ?? DEFAULT_PAGE_SELECTORS,
    );
    return surface;
}
