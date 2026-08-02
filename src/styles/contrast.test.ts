import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contrast guard for every text-on-fill pair the SDK ships.
 *
 * This test exists because the browser is the only place these failures show up and
 * nobody looks there on purpose. `axe` in jsdom disables `color-contrast` — there is
 * no paint to sample — so a component could hardcode white on mid-amber and every
 * check in CI would stay green. It shipped that way: white on
 * `--tempest-success-solid` measured 3.30:1 and on `--tempest-warning-solid` 3.19:1
 * **in the default light theme**.
 *
 * Rather than sampling pixels, the ratios are computed from `colors.css` itself, which
 * makes the check exact, instant, and impossible to skip. A token edit that drops a
 * pair below the floor fails here instead of in someone's product.
 */

const CSS = readFileSync(join(__dirname, "colors.css"), "utf8");

/** WCAG 2.1 SC 1.4.3 floor for normal-size text. */
const TEXT_FLOOR = 4.5;

/**
 * Token maps for both themes.
 *
 * The dark map is layered over the light one because the dark block only overrides
 * what changes — reading it alone would leave half the scale undefined.
 */
function themes(): { light: Record<string, string>; dark: Record<string, string> } {
    const split = CSS.indexOf('data-tempest-theme="dark"');
    expect(split).toBeGreaterThan(0);
    const parse = (block: string): Record<string, string> => {
        const map: Record<string, string> = {};
        for (const match of block.matchAll(/(--tempest-[\w-]+)\s*:\s*([^;]+);/g)) {
            map[match[1]] = match[2].trim();
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
    const reference = value.match(/^var\((--[\w-]+)\)$/);
    return reference ? resolve(map, reference[1], depth + 1) : value;
}

function rgb(value: string): [number, number, number] {
    const hex = value.replace("#", "");
    const full =
        hex.length === 3
            ? hex
                  .split("")
                  .map((char) => char + char)
                  .join("")
            : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${value}`);
    return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16)) as [
        number,
        number,
        number,
    ];
}

/** Relative luminance, per WCAG 2.1. */
function luminance([r, g, b]: [number, number, number]): number {
    const channel = (raw: number): number => {
        const c = raw / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
    const [lighter, darker] = [luminance(rgb(foreground)), luminance(rgb(background))].sort(
        (a, b) => b - a,
    );
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Every (text, fill) pair a component actually renders.
 *
 * Kept as data rather than derived, because "which token sits on which" is a fact
 * about the components, not about the stylesheet — and a derived list would silently
 * stop covering a pair the moment someone renamed a class.
 */
const PAIRS: ReadonlyArray<{ label: string; fg: string; bg: string }> = [
    // Button.primary, and 15 other places that pair these two.
    { label: "primary base", fg: "--tempest-primary-foreground", bg: "--tempest-primary" },
    { label: "primary hover", fg: "--tempest-primary-foreground", bg: "--tempest-primary-hover" },
    { label: "primary active", fg: "--tempest-primary-foreground", bg: "--tempest-primary-active" },

    // Button.danger, Alert.danger.solid, Badge.danger.solid.
    { label: "danger base", fg: "--tempest-danger-on-solid", bg: "--tempest-danger-solid" },
    { label: "danger hover", fg: "--tempest-danger-on-solid", bg: "--tempest-danger-hover" },

    // Button.success, Alert.success.solid, Badge.success.solid.
    { label: "success", fg: "--tempest-success-on-solid", bg: "--tempest-success-solid" },

    // Alert.warning.solid, Badge.warning.solid.
    { label: "warning", fg: "--tempest-warning-on-solid", bg: "--tempest-warning-solid" },

    // Alert.info.solid, Badge.info.solid.
    { label: "info", fg: "--tempest-info-on-solid", bg: "--tempest-info-solid" },

    // Alert.neutral.solid, Badge.neutral.solid — still literal white, and fine at 10:1.
    { label: "neutral", fg: "#ffffff", bg: "--tempest-gray-700" },

    // Soft (tinted) surfaces. `--tempest-*-fg` is the text designed for `--tempest-*-bg`.
    { label: "primary on soft", fg: "--tempest-primary-on-soft", bg: "--tempest-primary-soft" },
    { label: "danger on soft", fg: "--tempest-danger-fg", bg: "--tempest-danger-bg" },
    { label: "success on soft", fg: "--tempest-success-fg", bg: "--tempest-success-bg" },
    { label: "info on soft", fg: "--tempest-info-fg", bg: "--tempest-info-bg" },

    // Page text.
    { label: "text on bg", fg: "--tempest-text", bg: "--tempest-bg" },
    { label: "text on surface", fg: "--tempest-text", bg: "--tempest-surface" },
    { label: "muted on bg", fg: "--tempest-text-muted", bg: "--tempest-bg" },
    { label: "muted on surface", fg: "--tempest-text-muted", bg: "--tempest-surface" },
];

const value = (map: Record<string, string>, token: string): string =>
    token.startsWith("#") ? token : resolve(map, token);

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
    const map = themes()[theme];

    it.each(PAIRS)("$label clears the 4.5:1 text floor", ({ fg, bg }) => {
        const ratio = contrast(value(map, fg), value(map, bg));
        expect(ratio).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
});

/**
 * Tripwire for the pairs that are known-bad.
 *
 * The suite above proves the pairs the SDK *uses* are safe. This one proves the pairs it
 * must never use are still unsafe — because the reason `--tempest-primary-on-soft`
 * exists is invisible from the token list alone, and a future palette edit that made
 * `--tempest-primary` readable on the tint would quietly turn the on-soft token into
 * apparent dead weight for someone to delete.
 *
 * If one of these starts passing, the token is genuinely redundant and this test should
 * be removed along with it — deliberately, not by accident.
 *
 * Note what a token-level guard cannot do: it cannot see that a component *used* the
 * wrong token. `Button`'s `.outline:hover` tinted its background without restating its
 * colour and sat at 4.38:1 in the light theme while every pair in this file passed. The
 * browser sweep is what catches that class; this file catches palette drift.
 */
describe.each(["light", "dark"] as const)("%s theme known-bad pairs", (theme) => {
    const map = themes()[theme];

    it("primary as text on primary-soft stays below the floor", () => {
        expect(
            contrast(value(map, "--tempest-primary"), value(map, "--tempest-primary-soft")),
        ).toBeLessThan(TEXT_FLOOR);
    });

    it("white on the success and warning fills stays below the floor", () => {
        expect(contrast("#ffffff", value(map, "--tempest-success-solid"))).toBeLessThan(TEXT_FLOOR);
        expect(contrast("#ffffff", value(map, "--tempest-warning-solid"))).toBeLessThan(TEXT_FLOOR);
    });
});

describe("contrast helpers", () => {
    it("computes the reference ratios from WCAG", () => {
        expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
        expect(contrast("#000000", "#000000")).toBeCloseTo(1, 5);
        // Both directions must give the same answer.
        expect(contrast("#ffffff", "#767676")).toBeCloseTo(contrast("#767676", "#ffffff"), 5);
    });

    it("expands three-digit hex", () => {
        expect(contrast("#fff", "#000")).toBeCloseTo(21, 5);
    });

    it("rejects a value it cannot read, instead of scoring it", () => {
        expect(() => contrast("rgb(0 0 0)", "#ffffff")).toThrow(/not a hex colour/);
    });

    it("follows var() indirection", () => {
        const map = { "--tempest-a": "var(--tempest-b)", "--tempest-b": "#123456" };
        expect(resolve(map, "--tempest-a")).toBe("#123456");
    });

    it("refuses an undefined token rather than reporting a passing pair", () => {
        expect(() => resolve({}, "--tempest-nope")).toThrow(/not defined/);
    });

    it("refuses a token that loops", () => {
        const map = { "--tempest-a": "var(--tempest-b)", "--tempest-b": "var(--tempest-a)" };
        expect(() => resolve(map, "--tempest-a")).toThrow(/loops/);
    });
});
