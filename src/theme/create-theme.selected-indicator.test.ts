import { describe, expect, it } from "vitest";

import { contrastRatio } from "./color";
import { createTheme } from "./create-theme";

/**
 * Contrast guard for the selected-state indicator a **generated** theme emits.
 *
 * `styles/selected-indicator.contrast.test.ts` measures the token in
 * `colors.css`. It cannot reach this one: `applyTheme` injects a `<style>` into
 * the head, so a branded app paints whatever `createTheme` derived, and a token
 * that is correct in the stylesheet says nothing about the value a brand
 * produces. That gap is how the focus ring shipped translucent from a generated
 * theme after the release that made it opaque.
 *
 * The measurement that decided the shape of the fix, across these twelve brands
 * and both schemes:
 *
 * | candidate indicator | worst case against `--tempest-bg` |
 * | --- | --- |
 * | `--tempest-surface` (what the four components used) | 1.053:1 |
 * | `--tempest-surface-2` (what the report proposed) | 1.112:1 |
 * | `--tempest-primary-soft` (what the sibling components use) | 1.03:1 |
 * | the step picked by contrast | clears 3:1 on all 96 pairings |
 *
 * So the indicator is derived the way the ring is — walk the ramp until the ink
 * clears the floor against every surface the theme paints — and the components
 * draw it as a border or a bar over whatever tint they already had.
 */

/** WCAG 2.2 SC 1.4.11 floor for a non-text indicator. */
const INDICATOR_FLOOR = 3;

/**
 * The same twelve brands `create-theme.focus-ring.test.ts` sweeps: saturated,
 * near-neutral, very light and very dark, plus `#8100D7` from the report that
 * opened the focus-ring work.
 */
const BRANDS = [
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

/** The surfaces the SDK paints when a theme names only `primary`. */
const SDK_SURFACES: Record<"light" | "dark", readonly string[]> = {
    light: ["#ffffff", "#f8f9fb", "#f1f3f6", "#e4e7ec"],
    dark: ["#0b0d12", "#14171f", "#1d2230", "#262d3f"],
};

/** Resolve one token of a generated scheme down to a literal colour. */
function tokenOf(
    theme: ReturnType<typeof createTheme>,
    scheme: "light" | "dark",
    name: string,
): string {
    const tokens = scheme === "light" ? theme.light : theme.dark;
    const resolve = (key: string, depth = 0): string => {
        const value = tokens[key];
        if (value === undefined) throw new Error(`token ${key} is not generated`);
        if (depth > 8) throw new Error(`token ${key} loops`);
        const reference = /^var\((--[\w-]+)\)$/.exec(value);
        return reference ? resolve(reference[1] as string, depth + 1) : value;
    };
    return resolve(name);
}

describe.each(["light", "dark"] as const)("generated selected indicator — %s theme", (scheme) => {
    it.each(BRANDS)("%s clears the floor on every surface the SDK paints", (brand) => {
        const indicator = tokenOf(
            createTheme({ primary: brand }),
            scheme,
            "--tempest-selected-indicator",
        );
        for (const surface of SDK_SURFACES[scheme]) {
            expect(contrastRatio(indicator, surface)).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
        }
    });

    it.each(BRANDS)("%s emits an opaque indicator", (brand) => {
        expect(
            tokenOf(createTheme({ primary: brand }), scheme, "--tempest-selected-indicator"),
        ).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    /**
     * A translucent ring is a choice a theme may make; a translucent state
     * indicator is the defect this token exists to end, so the option does not
     * reach it.
     */
    it.each(BRANDS)("%s keeps the indicator opaque even when the ring is not", (brand) => {
        const theme = createTheme({ primary: brand, focusRingAlpha: 0.35 });
        expect(tokenOf(theme, scheme, "--tempest-focus-ring-color")).toContain("/ 0.35)");
        expect(tokenOf(theme, scheme, "--tempest-selected-indicator")).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    /**
     * The tint the components still paint under the indicator, measured: it is
     * below the floor for every brand, which is why it cannot be the only signal.
     */
    it.each(BRANDS)("%s cannot signal with primary-soft alone", (brand) => {
        const soft = tokenOf(createTheme({ primary: brand }), scheme, "--tempest-primary-soft");
        const backdrop = SDK_SURFACES[scheme][0] as string;
        expect(contrastRatio(soft, backdrop)).toBeLessThan(INDICATOR_FLOOR);
    });
});

describe("a theme that repaints the surfaces", () => {
    it.each(BRANDS)("%s clears the floor over its own generated grays", (brand) => {
        for (const gray of ["#667085", "#7a7f8a", "#4b5563"]) {
            const theme = createTheme({ primary: brand, gray });
            for (const scheme of ["light", "dark"] as const) {
                const indicator = tokenOf(theme, scheme, "--tempest-selected-indicator");
                for (const token of [
                    "--tempest-bg",
                    "--tempest-surface",
                    "--tempest-surface-2",
                    "--tempest-surface-3",
                ]) {
                    expect(
                        contrastRatio(indicator, tokenOf(theme, scheme, token)),
                    ).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
                }
            }
        }
    });
});
