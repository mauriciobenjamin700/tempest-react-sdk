import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "../theme/color";

/**
 * Contrast guard for the indicator that says "this one is selected".
 *
 * `focus-ring.contrast.test.ts` measures the ring. This file measures the other
 * non-text indicator WCAG 2.2 SC 1.4.11 covers — selection — which four
 * components used to draw by swapping one neutral surface for its neighbour.
 *
 * The numbers are why the report's own proposal does not work. Measured on the
 * surfaces `colors.css` ships:
 *
 * | pair | light | dark |
 * | --- | --- | --- |
 * | `bg` vs `surface` | 1.053:1 | 1.085:1 |
 * | `bg` vs `surface-2` | 1.112:1 | 1.225:1 |
 * | `bg` vs `surface-3` | 1.240:1 | 1.416:1 |
 *
 * The issue suggested moving the highlighted item to `surface-2` so there would
 * be two ramp steps instead of one. Two steps is 1.112:1 — and even the extremes
 * of the ramp, which nothing would look right using, reach 1.240:1. No pair of
 * neutral surfaces can carry this job.
 *
 * Nor can the brand tint the sibling components use. `--tempest-primary-soft`
 * measured across the twelve brands of `create-theme.focus-ring.test.ts` lands
 * between 1.03:1 and 1.61:1 against `bg` in the two schemes: it differs in hue,
 * and the ratio does not count hue. So `ToggleGroup`, `ListTile`, `TreeView` and
 * `NavigationRail` — the components the report holds up as doing it right — are
 * exactly as far from the floor, which is the finding the report did not have.
 *
 * What clears 3:1 is a saturated ink drawn on top of the tint, which is what
 * `--tempest-selected-indicator` is.
 */

const CSS = readFileSync(join(__dirname, "colors.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** WCAG 2.2 SC 1.4.11 floor for a non-text indicator. */
const INDICATOR_FLOOR = 3;

/** Surfaces a selected item can sit on. */
const SURFACES = [
    "--tempest-bg",
    "--tempest-surface",
    "--tempest-surface-2",
    "--tempest-surface-3",
] as const;

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

describe.each(["light", "dark"] as const)("--tempest-selected-indicator — %s theme", (mode) => {
    const map = themes()[mode];

    it.each(SURFACES)(`reaches ${INDICATOR_FLOOR}:1 over %s`, (surface) => {
        const measured = contrastRatio(
            resolve(map, "--tempest-selected-indicator"),
            resolve(map, surface),
        );
        expect(measured).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
    });

    it("stays opaque, because a tinted indicator has no contrast of its own", () => {
        expect(resolve(map, "--tempest-selected-indicator")).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
});

describe.each(["light", "dark"] as const)("why a surface cannot be the indicator — %s", (mode) => {
    const map = themes()[mode];

    /**
     * The measurement that rules out the report's proposal, asserted so it cannot
     * come back as a suggestion in six months.
     */
    it.each([
        ["--tempest-bg", "--tempest-surface"],
        ["--tempest-bg", "--tempest-surface-2"],
        ["--tempest-bg", "--tempest-surface-3"],
        ["--tempest-surface", "--tempest-surface-2"],
        ["--tempest-surface-2", "--tempest-surface-3"],
    ])("%s against %s is below the floor", (background, candidate) => {
        const measured = contrastRatio(resolve(map, background), resolve(map, candidate));
        expect(measured).toBeLessThan(INDICATOR_FLOOR);
    });

    /** The brand tint is not closer, for the same reason: hue is not luminance. */
    it.each(SURFACES)("--tempest-primary-soft against %s is below the floor", (surface) => {
        const measured = contrastRatio(
            resolve(map, "--tempest-primary-soft"),
            resolve(map, surface),
        );
        expect(measured).toBeLessThan(INDICATOR_FLOOR);
    });
});
