import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contrast guard for the SDK's non-text indicators.
 *
 * `contrast.test.ts` covers text pairs at 4.5:1. A focus ring is not text: WCAG 2.2
 * SC 1.4.11 asks 3:1 of it, against whatever it sits on. Nothing measured that, and
 * the gap was not a value that slipped past a check — it was a whole category no
 * check knew about. `--tempest-focus-ring-color` shipped semitransparent from 0.1.0
 * and measured 1.60:1 in the light theme, which is a focus ring you cannot see.
 *
 * Alpha is why. A tinted ring has no contrast of its own; it has the contrast of
 * whatever it composites over, so the number changes with the surface and is not a
 * property of the token at all. The fix was to make it opaque, and this file is what
 * keeps it that way.
 *
 * The ratios come from `colors.css` rather than from pixels, for the same reason
 * `contrast.test.ts` does it: `axe` in jsdom disables `color-contrast` because
 * nothing is painted, so a browser-shaped check would pass while the ring is
 * invisible.
 */

const CSS = readFileSync(join(__dirname, "colors.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** WCAG 2.2 SC 1.4.11 floor for a non-text indicator. */
const INDICATOR_FLOOR = 3;

/**
 * Surfaces a focus ring can land on.
 *
 * All four, not one: the ring is drawn wherever a focusable element is, and a
 * component nests as deep as the app puts it. Fixing a single background is how a
 * token passes its own test and fails in a card.
 */
const SURFACES = [
    "--tempest-bg",
    "--tempest-surface",
    "--tempest-surface-2",
    "--tempest-surface-3",
] as const;

/**
 * Tokens used as a focus indicator somewhere in the SDK.
 *
 * Kept as data rather than scraped, because scraping the stylesheets for "the colour
 * in a `:focus-visible` rule" is what produced three false positives out of four
 * findings on the first attempt: `:hover:not(:focus)` matched as focus, and the
 * `Lightbox`'s white ring measured against `--tempest-bg` when it is drawn on the
 * lightbox's own dark overlay. The sweep below keeps the list honest instead.
 */
const INDICATOR_TOKENS = [
    "--tempest-focus-ring-color",
    "--tempest-primary",
    "--tempest-danger",
    "--tempest-text",
] as const;

/**
 * Rings drawn on a surface the SDK controls, rather than on a theme surface.
 *
 * `Lightbox` paints its own dark overlay and puts a white ring on it — correct
 * there, and meaningless to measure against `--tempest-bg`. An entry here declares
 * the background the ring is actually validated against, which is the part a scrape
 * cannot know.
 */
const CONTEXTUAL_RINGS = [
    { file: "components/Lightbox/Lightbox.module.css", colour: "#ffffff", over: "#000000" },
] as const;

/**
 * What `currentColor` resolves to when the user agent, not the theme, sets it.
 *
 * Chromium's default link colours, measured — the ring on a focused `<a>` inherits
 * these rather than `--tempest-text`. Ported from what the browser paints, so a
 * change upstream shows up as a failing assertion instead of a wrong claim.
 */
const UA_LINK_COLOURS: Record<"light" | "dark", readonly string[]> = {
    light: ["#0000ee"],
    dark: ["#9e9eff"],
};

/** Token maps for both themes; dark layers over light, which only overrides. */
function themes(): { light: Record<string, string>; dark: Record<string, string> } {
    const split = CSS.indexOf('data-tempest-theme="dark"');
    expect(split).toBeGreaterThan(0);
    const parse = (block: string): Record<string, string> => {
        const map: Record<string, string> = {};
        for (const match of block.matchAll(/(--tempest-[\w-]+)\s*:\s*([^;]+);/g)) {
            map[match[1] as string] = (match[2] as string).trim();
        }
        return map;
    };
    const light = parse(CSS.slice(0, split));
    return { light, dark: { ...light, ...parse(CSS.slice(split)) } };
}

/** Follow `var(--x)` indirection to a literal colour. */
function resolve(map: Record<string, string>, name: string, depth = 0): string {
    const value = map[name];
    if (value === undefined) throw new Error(`token ${name} is not defined`);
    if (depth > 8) throw new Error(`token ${name} loops`);
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    return reference ? resolve(map, reference[1] as string, depth + 1) : value;
}

/** Parse a hex colour into channels. */
function rgb(value: string): [number, number, number] {
    const hex = value.replace("#", "").trim();
    const full =
        hex.length === 3
            ? hex
                  .split("")
                  .map((char) => char + char)
                  .join("")
            : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not an opaque hex colour: ${value}`);
    return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16)) as [
        number,
        number,
        number,
    ];
}

/** Relative luminance, WCAG 2.x. */
function luminance([r, g, b]: [number, number, number]): number {
    const channel = (raw: number): number => {
        const value = raw / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two opaque colours. */
function ratio(a: [number, number, number], b: [number, number, number]): number {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (high + 0.05) / (low + 0.05);
}

/** Collect every CSS module in the SDK. */
function cssModules(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) cssModules(path, out);
        else if (entry.name.endsWith(".module.css")) out.push(path);
    }
    return out;
}

describe.each(["light", "dark"] as const)("focus indicators — %s theme", (mode) => {
    const map = themes()[mode];

    describe.each(INDICATOR_TOKENS)("%s", (name) => {
        it.each(SURFACES)(`reaches ${INDICATOR_FLOOR}:1 over %s`, (surface) => {
            const measured = ratio(rgb(resolve(map, name)), rgb(resolve(map, surface)));
            expect(measured).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
        });
    });

    /**
     * The property that alpha destroys, asserted directly.
     *
     * Without this the token could go back to `rgba(...)` and the ratios above would
     * still be computed — from the opaque channels, ignoring the alpha — and pass
     * while the painted ring fails. The failure this guards against is the one that
     * already happened.
     */
    it("keeps the focus ring opaque, because a tinted ring has no contrast of its own", () => {
        const value = resolve(map, "--tempest-focus-ring-color");
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
});

describe.each(["light", "dark"] as const)("focus indicator fallbacks — %s theme", (mode) => {
    const map = themes()[mode];

    /**
     * The value inside `var(--token, here)`, measured like any other ring.
     *
     * These are dead while `colors.css` is loaded, which is exactly why they rot: a
     * fallback nobody can see is a fallback nobody updates. Two still carried the
     * semitransparent value this change replaced, and two more fell back to
     * `--tempest-primary-100` — a 100-step tint, measured at **1.01:1** against every
     * surface in both themes, which is a focus ring that does not exist.
     *
     * They are reachable: an app that loads `scoped.css` into a subtree the token
     * does not cascade into gets the fallback, and the browser composites it exactly
     * as written.
     *
     * `currentColor` is not one colour, which is the point of `UA_LINK_COLOURS`: in
     * ordinary content it is `--tempest-text`, but inside an `<a>` the user agent has
     * already set its own, and that is what the ring inherits. Measured in Chromium,
     * a focused link fell to 9.40:1 where surrounding text gave 17.75:1 — still far
     * above the floor, but a different number than assuming the token would suggest.
     * Both are asserted, so the weaker one is the one that has to hold.
     *
     * It is still the only fallback that clears the floor in both themes at once: a
     * literal must sit between 0.112 and 0.300 relative luminance to do that, and no
     * blue on the ramp does — this test is how that was found, after `#0052cc` passed
     * at 5.50:1 in light and failed at 2.01:1 in dark.
     */
    it.each(fallbackColours())("%s reaches the floor over every surface", (raw) => {
        const literals =
            raw === "currentColor"
                ? [resolve(map, "--tempest-text"), ...UA_LINK_COLOURS[mode]]
                : [
                      raw.startsWith("var(")
                          ? resolve(map, /\((--[\w-]+)/.exec(raw)?.[1] ?? "")
                          : raw,
                  ];
        for (const literal of literals) {
            for (const surface of SURFACES) {
                expect(ratio(rgb(literal), rgb(resolve(map, surface)))).toBeGreaterThanOrEqual(
                    INDICATOR_FLOOR,
                );
            }
        }
    });
});

/**
 * Every `var(--x, fallback)` fallback used for a focus indicator in the SDK.
 *
 * @returns The fallback values, as written.
 */
function fallbackColours(): string[] {
    const found = new Set<string>();
    const sources = [
        join(__dirname, "reset.css"),
        join(__dirname, "scoped.css"),
        ...cssModules(join(__dirname, "..")),
    ];
    for (const file of sources) {
        const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of css.matchAll(
            /var\(\s*--tempest-focus-ring-color\s*,\s*([^;]+?)\s*\)\s*(?:;|$)/gm,
        )) {
            found.add((match[1] as string).trim());
        }
    }
    expect(found.size).toBeGreaterThan(0);
    return [...found];
}

describe("rings drawn on a surface the SDK paints itself", () => {
    it.each(CONTEXTUAL_RINGS)("$file reaches the floor over its own background", (entry) => {
        const source = readFileSync(join(__dirname, "..", entry.file), "utf8");
        expect(source).toContain(entry.colour);
        expect(ratio(rgb(entry.colour), rgb(entry.over))).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
    });
});

describe("the indicator inventory", () => {
    /**
     * Every colour used as a focus indicator is one this file measures.
     *
     * The list above is data, so it goes stale the moment a component reaches for a
     * colour nobody vetted — silently, since an unmeasured ring looks like a
     * measured one. This sweep is what makes the list a claim rather than a note.
     *
     * `:not(:focus)` is excluded deliberately: it appears inside hover rules, and
     * reading it as a focus rule is what made the first version of this sweep report
     * `--tempest-border-strong` at 1.19:1 — a real number about a rule that never
     * draws a focus ring. The exclusion has to test the whole selector, not the text
     * before the match: in `.input:hover:not(:disabled):not(:focus)` the `:focus`
     * that matches is the one inside `:not()`, so everything before it ends in an
     * open paren and a prefix test sees nothing.
     */
    it("uses no colour this file does not measure", () => {
        const known = new Set<string>([
            ...INDICATOR_TOKENS.map((name) => `var(${name})`),
            ...CONTEXTUAL_RINGS.map((entry) => entry.colour),
        ]);
        const strays: string[] = [];

        for (const file of cssModules(join(__dirname, ".."))) {
            const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
            for (const rule of css.matchAll(
                /([^{}]*):focus(-visible|-within)?([^{}]*)\{([^}]*)\}/g,
            )) {
                const selector = `${rule[1] ?? ""}:focus${rule[2] ?? ""}${rule[3] ?? ""}`;
                if (/:not\(\s*:focus/.test(selector)) continue;
                for (const declaration of (rule[4] ?? "").matchAll(
                    /(?:outline|box-shadow|border-color)\s*:\s*([^;]+)/g,
                )) {
                    const value = (declaration[1] ?? "").trim();
                    if (value === "none" || value.startsWith("0 0 0 0")) continue;
                    const colours = [
                        ...value.matchAll(/var\((--tempest-[\w-]+)[^)]*\)|#[0-9a-fA-F]{3,8}/g),
                    ]
                        .map((match) => match[0])
                        .filter((token) => !/width|offset|space|radius/.test(token));
                    const colour = colours.at(-1);
                    if (!colour) continue;
                    const normalised = /var\((--[\w-]+)/.exec(colour)?.[1];
                    const key = normalised ? `var(${normalised})` : colour;
                    if (!known.has(key)) {
                        strays.push(`${relative(join(__dirname, ".."), file)} — ${key}`);
                    }
                }
            }
        }

        expect([...new Set(strays)]).toEqual([]);
    });
});
