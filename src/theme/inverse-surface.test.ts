import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, hexToOklch, oklchToHex } from "./color";
import { createTheme } from "./create-theme";
import {
    DEFAULT_CHART_COLORS,
    DEFAULT_CODE_COLORS,
    DEFAULT_STATUS_COLORS,
    INVERSE_SELECTOR,
    createInverseSurface,
    renderInverseSurface,
} from "./inverse-surface";

/**
 * Guard for the inverse surface: the token set for a section painted in the
 * brand color (#409).
 *
 * The defect it exists for is not one bad value but a short list: the report
 * overrode eight tokens by hand and every token it did not name kept the page's
 * value. Measured over the report's navy `#1e2a5a`:
 *
 * | inherited token | contrast on the fill |
 * | --- | --- |
 * | `--tempest-text-subtle` | 2.75:1 |
 * | `--tempest-danger` | 2.12:1 |
 * | `--tempest-selected-indicator` | 2.01:1 |
 * | white text on `--tempest-surface` (a `Card`) | 1.05:1 |
 *
 * So this file does two things the report could not: it derives the list of
 * tokens to redefine from `colors.css` instead of from memory, and it measures
 * every pair a component renders against the inverse fill, for the brands the
 * page-scheme guards already sweep.
 */

const CSS = readFileSync(join(__dirname, "..", "styles", "colors.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
);

/** WCAG 2.x AA floor for body text. */
const TEXT_FLOOR = 4.5;

/** WCAG 2.2 SC 1.4.11 floor for a non-text indicator. */
const INDICATOR_FLOOR = 3;

/**
 * The twelve brands `create-theme.focus-ring.test.ts` sweeps — saturated,
 * near-neutral, very light and very dark — plus the two navies of the report:
 * `#1e2a5a` from its text and `#03184b`, the landing it came from.
 */
const BRANDS = [
    "#03184b",
    "#1e2a5a",
    "#8100D7",
    "#0066ff",
    "#FFD400",
    "#a3e635",
    "#22d3ee",
    "#f97316",
    "#dc2626",
    "#111111",
    "#fafafa",
    "#ec4899",
    "#14b8a6",
    "#4f46e5",
] as const;

const SURFACES = [
    "--tempest-bg",
    "--tempest-surface",
    "--tempest-surface-2",
    "--tempest-surface-3",
] as const;

const STATUSES = ["success", "warning", "danger", "info"] as const;

/**
 * Tokens of the page scheme the inverse surface deliberately leaves alone.
 *
 * The gray ramp is fixed across schemes by design — the dark block does not
 * override it either (`color-scheme.test.ts` pins that) — and the components
 * that read it raw paint self-contained pairs: `Badge`/`Alert` neutral solid
 * with `--tempest-neutral-on-solid`, `Tooltip` in a portal outside the section,
 * the `Switch` track. Redefining it would repaint those everywhere a section
 * holds one, for no pair that fails.
 *
 * `--tempest-neutral-on-solid` goes with it, because it is the ink of exactly
 * that pair (`gray-700` under it). The first version pinned it to white inside
 * the surface and the gallery caught it: under a theme that generates its own
 * gray, the dark `gray-700` is light, and the neutral solid `Badge` in a dark
 * page rendered white on light gray. Inherited, the pair stays the one the page
 * measured.
 */
const EXEMPT = /^--tempest-(gray-\d+|neutral-on-solid)$/;

/**
 * How far a region of the band may lift toward the ink and still be measured.
 *
 * Restated here rather than imported, so the generator's constant is checked
 * against a number and not against itself. The landing that opened #409 lays a
 * glow of `#1f3f8f` at 55% over its navy `#03184b`: the composite `#122d70`
 * sits 0.09 above the fill in OKLCH lightness.
 */
const GLOW_OFFSET = 0.1;

/** The fill lifted toward the ink by {@link GLOW_OFFSET}. */
function glowOf(fill: string, ink: string): string {
    const base = hexToOklch(fill);
    const direction = hexToOklch(ink).l > base.l ? 1 : -1;
    return oklchToHex({ ...base, l: base.l + direction * GLOW_OFFSET });
}

/** Parse a block's custom properties into a map. */
function parse(block: string): Record<string, string> {
    const map: Record<string, string> = {};
    for (const match of block.matchAll(/(--tempest-[\w-]+)\s*:\s*([^;]+);/g)) {
        map[match[1] as string] = (match[2] as string).trim();
    }
    return map;
}

/** The `:root`, dark and inverse blocks of `colors.css`. */
function blocks(): { light: string; dark: string; inverse: string; paint: string } {
    const darkStart = CSS.indexOf('[data-tempest-theme="dark"]');
    const inverseStart = CSS.indexOf(`${INVERSE_SELECTOR} {`);
    const paintStart = CSS.indexOf(`:where(${INVERSE_SELECTOR})`);
    expect(darkStart).toBeGreaterThan(0);
    expect(inverseStart).toBeGreaterThan(darkStart);
    expect(paintStart).toBeGreaterThan(inverseStart);
    return {
        light: CSS.slice(0, darkStart),
        dark: CSS.slice(darkStart, inverseStart),
        inverse: CSS.slice(inverseStart, paintStart),
        paint: CSS.slice(paintStart),
    };
}

/** Whether a declared value carries a color, directly or through `var()`. */
function isColor(map: Record<string, string>, name: string, depth = 0): boolean {
    const value = map[name];
    if (value === undefined || depth > 8) return false;
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value)) return true;
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    return reference ? isColor(map, reference[1] as string, depth + 1) : false;
}

/** The weakest contrast of `color` over every ground. */
function worst(color: string, grounds: readonly string[]): number {
    return Math.min(...grounds.map((ground) => contrastRatio(color, ground)));
}

describe("inverse surface — completeness", () => {
    const light = parse(blocks().light);
    const colorTokens = Object.keys(light).filter(
        (name) => isColor(light, name) && !EXEMPT.test(name),
    );

    it("finds the color tokens of colors.css to check against", () => {
        expect(colorTokens.length).toBeGreaterThan(80);
    });

    it.each(BRANDS)("%s redefines every color token the page scheme declares", (brand) => {
        const { tokens } = createInverseSurface({ primary: brand });
        const missing = colorTokens.filter((name) => !(name in tokens));
        expect(missing).toEqual([]);
    });

    it("declares nothing colors.css does not, so a typo cannot pass as a token", () => {
        const { tokens } = createInverseSurface({ primary: "#1e2a5a" });
        const unknown = Object.keys(tokens).filter((name) => !(name in light));
        expect(unknown).toEqual([]);
    });

    it("writes literal colors, so the section paints the same under either page scheme", () => {
        for (const brand of BRANDS) {
            const { tokens } = createInverseSurface({ primary: brand });
            for (const value of Object.values(tokens)) expect(value).not.toContain("var(");
        }
    });
});

describe.each(BRANDS)("inverse surface contrast — %s", (brand) => {
    const { tokens } = createInverseSurface({ primary: brand });
    const read = (name: string): string => {
        const value = tokens[name];
        expect(value, `${name} missing`).toBeDefined();
        return value as string;
    };
    const surfaces = SURFACES.map(read);
    const glow = glowOf(read("--tempest-bg"), read("--tempest-text"));
    const grounds = [...surfaces, glow];

    it("keeps the ink at 7:1 on every surface and the glow, so three text levels fit above AA", () => {
        expect(worst(read("--tempest-text"), grounds)).toBeGreaterThanOrEqual(7);
    });

    it("keeps muted text above AA on every surface and the glow", () => {
        expect(worst(read("--tempest-text-muted"), grounds)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it("keeps subtle text above AA on bg, surface and the glow", () => {
        expect(
            worst(read("--tempest-text-subtle"), [...surfaces.slice(0, 2), glow]),
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it("orders the three text levels by contrast", () => {
        const bg = read("--tempest-bg");
        const text = contrastRatio(read("--tempest-text"), bg);
        const muted = contrastRatio(read("--tempest-text-muted"), bg);
        const subtle = contrastRatio(read("--tempest-text-subtle"), bg);
        expect(text).toBeGreaterThan(muted);
        expect(muted).toBeGreaterThan(subtle);
    });

    it("clears 3:1 with the focus ring and the selected indicator on every surface and the glow", () => {
        expect(worst(read("--tempest-focus-ring-color"), grounds)).toBeGreaterThanOrEqual(
            INDICATOR_FLOOR,
        );
        expect(worst(read("--tempest-selected-indicator"), grounds)).toBeGreaterThanOrEqual(
            INDICATOR_FLOOR,
        );
    });

    it("labels the action button above AA in every state", () => {
        const fills = ["--tempest-primary", "--tempest-primary-hover", "--tempest-primary-active"];
        expect(worst(read("--tempest-primary-foreground"), fills.map(read))).toBeGreaterThanOrEqual(
            TEXT_FLOOR,
        );
        expect(read("--tempest-text-on-primary")).toBe(read("--tempest-primary-foreground"));
    });

    it("keeps the primary readable as text on bg and surface", () => {
        expect(worst(read("--tempest-primary"), surfaces.slice(0, 2))).toBeGreaterThanOrEqual(
            TEXT_FLOOR,
        );
    });

    it("keeps text on the soft tint above AA", () => {
        expect(
            worst(read("--tempest-primary-on-soft"), [
                read("--tempest-primary-soft"),
                read("--tempest-primary-soft-hover"),
            ]),
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it("keeps the raw ramp pair Tag and Sidebar render above AA", () => {
        expect(
            contrastRatio(read("--tempest-primary-700"), read("--tempest-primary-100")),
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it.each(STATUSES)("keeps the %s family readable", (status) => {
        expect(worst(read(`--tempest-${status}`), grounds)).toBeGreaterThanOrEqual(TEXT_FLOOR);
        expect(
            contrastRatio(read(`--tempest-${status}-fg`), read(`--tempest-${status}-bg`)),
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
        expect(
            contrastRatio(read(`--tempest-${status}-on-solid`), read(`--tempest-${status}-solid`)),
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it("keeps the danger button label readable on hover", () => {
        expect(
            contrastRatio(read("--tempest-danger-on-solid"), read("--tempest-danger-hover")),
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it("keeps every syntax color above AA on the code grounds", () => {
        const grounds = [read("--tempest-bg"), read("--tempest-surface")];
        for (const name of Object.keys(tokens).filter((key) => key.startsWith("--tempest-code-"))) {
            expect(worst(read(name), grounds), name).toBeGreaterThanOrEqual(TEXT_FLOOR);
        }
    });

    it("keeps every categorical chart color at 3:1 on bg, surface and the glow", () => {
        for (let index = 1; index <= 8; index += 1) {
            expect(
                worst(read(`--tempest-chart-${index}`), [...surfaces.slice(0, 2), glow]),
            ).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
        }
    });
});

describe("inverse surface — the fill", () => {
    it("keeps the brand's own 500 when it can carry the scheme", () => {
        const kept = BRANDS.filter(
            (brand) => createInverseSurface({ primary: brand }).step === 500,
        );
        expect(kept).toEqual(["#03184b", "#1e2a5a", "#FFD400", "#a3e635", "#111111", "#fafafa"]);
    });

    it("moves a mid-tone brand down the ramp: white on #0066ff is 4.83:1", () => {
        expect(contrastRatio("#ffffff", "#0066ff")).toBeCloseTo(4.83, 2);
        const surface = createInverseSurface({ primary: "#0066ff" });
        expect(surface.step).toBe(800);
        expect(surface.scheme).toBe("dark");
    });

    it("holds the landing's own glow: subtle text on #122d70 clears AA", () => {
        const { tokens, step } = createInverseSurface({ primary: "#03184b" });
        expect(step).toBe(500);
        expect(tokens["--tempest-bg"]).toBe("#03184b");
        expect(
            contrastRatio(tokens["--tempest-text-subtle"] as string, "#122d70"),
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
        expect(
            contrastRatio(tokens["--tempest-focus-ring-color"] as string, "#122d70"),
        ).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
    });

    it("reads dark-on-light for a light brand and light-on-dark for a dark one", () => {
        expect(createInverseSurface({ primary: "#1e2a5a" }).scheme).toBe("dark");
        expect(createInverseSurface({ primary: "#1e2a5a" }).tokens["--tempest-text"]).toBe(
            "#ffffff",
        );
        expect(createInverseSurface({ primary: "#FFD400" }).scheme).toBe("light");
        expect(createInverseSurface({ primary: "#FFD400" }).tokens["--tempest-text"]).toBe(
            "#101828",
        );
    });

    it("paints the brand itself as the fill and labels the action button with it", () => {
        const { tokens } = createInverseSurface({ primary: "#1e2a5a" });
        expect(tokens["--tempest-bg"]).toBe("#1e2a5a");
        expect(tokens["--tempest-primary-foreground"]).toBe("#1e2a5a");
    });

    it("follows the statuses and chart colors a theme names", () => {
        const plain = createInverseSurface({ primary: "#1e2a5a" }).tokens;
        const named = createInverseSurface({
            primary: "#1e2a5a",
            statuses: { danger: "#a21caf" },
            chart: ["#0ea5e9"],
        }).tokens;
        expect(named["--tempest-danger-solid"]).not.toBe(plain["--tempest-danger-solid"]);
        expect(named["--tempest-chart-1"]).not.toBe(plain["--tempest-chart-1"]);
    });
});

describe("inverse surface — colors.css", () => {
    const { light, dark, inverse, paint } = blocks();

    it("ships the inverse surface of the SDK's own brand, exactly as the generator derives it", () => {
        const generated = createInverseSurface({ primary: "#0066ff" });
        expect(parse(inverse)).toEqual(generated.tokens);
        expect(inverse).toMatch(new RegExp(`color-scheme:\\s*${generated.scheme}\\s*;`));
    });

    it("paints the fill and the ink at zero specificity", () => {
        expect(paint).toMatch(/background-color:\s*var\(--tempest-bg\)/);
        expect(paint).toMatch(/color:\s*var\(--tempest-text\)/);
    });

    it("ports the status, chart and syntax defaults from the stylesheet", () => {
        const lightMap = parse(light);
        const darkMap = { ...lightMap, ...parse(dark) };
        for (const status of STATUSES) {
            expect(DEFAULT_STATUS_COLORS[status]).toBe(lightMap[`--tempest-${status}-solid`]);
        }
        DEFAULT_CHART_COLORS.light.forEach((color, index) => {
            expect(color).toBe(lightMap[`--tempest-chart-${index + 1}`]);
        });
        DEFAULT_CHART_COLORS.dark.forEach((color, index) => {
            expect(color).toBe(darkMap[`--tempest-chart-${index + 1}`]);
        });
        const codeNames = Object.keys(lightMap).filter((name) =>
            name.startsWith("--tempest-code-"),
        );
        expect(codeNames.map((name) => lightMap[name])).toEqual([...DEFAULT_CODE_COLORS.light]);
        expect(codeNames.map((name) => darkMap[name])).toEqual([...DEFAULT_CODE_COLORS.dark]);
    });

    it("ports the shadows of the scheme the fill reads as", () => {
        const lightMap = parse(light);
        const darkMap = { ...lightMap, ...parse(dark) };
        const shadows = (map: Record<string, string>): string[] =>
            Object.keys(lightMap)
                .filter((name) => name.startsWith("--tempest-shadow-"))
                .map((name) => map[name] as string);
        const onNavy = createInverseSurface({ primary: "#1e2a5a" }).tokens;
        const onYellow = createInverseSurface({ primary: "#FFD400" }).tokens;
        expect(shadows(onNavy)).toEqual(shadows(darkMap));
        expect(shadows(onYellow)).toEqual(shadows(lightMap));
    });
});

describe("createTheme — inverse surface", () => {
    it("emits the inverse surface whenever the theme names a primary", () => {
        const theme = createTheme({ primary: "#1e2a5a" });
        expect(theme.inverse).toEqual(createInverseSurface({ primary: "#1e2a5a" }).tokens);
        expect(theme.css).toContain(`${INVERSE_SELECTOR} {`);
        expect(theme.css).toContain(`:where(${INVERSE_SELECTOR})`);
        expect(theme.css.indexOf(INVERSE_SELECTOR)).toBeGreaterThan(
            theme.css.indexOf('[data-tempest-theme="dark"]'),
        );
    });

    it("leaves it out with inverse: false, or without a primary to derive from", () => {
        const off = createTheme({ primary: "#1e2a5a", inverse: false });
        expect(off.inverse).toEqual({});
        expect(off.css).not.toContain("data-tempest-tone");
        const grayOnly = createTheme({ gray: "#64748b" });
        expect(grayOnly.inverse).toEqual({});
        expect(grayOnly.css).not.toContain("data-tempest-tone");
    });

    it("writes under a custom selector, paint rule included", () => {
        const { css } = createTheme({ primary: "#1e2a5a", inverseSelector: ".hero" });
        expect(css).toContain(".hero {\n    color-scheme: dark;");
        expect(css).toContain(":where(.hero) {");
        expect(css).not.toContain("data-tempest-tone");
    });

    it("passes the theme's statuses and chart colors through", () => {
        const options = { primary: "#1e2a5a", danger: "#a21caf", chart: ["#0ea5e9"] };
        expect(createTheme(options).inverse).toEqual(
            createInverseSurface({
                primary: options.primary,
                statuses: { danger: options.danger },
                chart: options.chart,
            }).tokens,
        );
    });

    it("renders the same text createTheme appends", () => {
        const surface = createInverseSurface({ primary: "#1e2a5a" });
        expect(createTheme({ primary: "#1e2a5a" }).css).toContain(
            renderInverseSurface(INVERSE_SELECTOR, surface),
        );
    });
});
