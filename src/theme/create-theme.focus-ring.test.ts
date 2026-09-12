import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { setDevBuild } from "../utils/dev-mode";
import { contrastRatio } from "./color";
import { createTheme } from "./create-theme";

/**
 * Contrast guard for the focus ring a **generated** theme emits.
 *
 * `styles/focus-ring.contrast.test.ts` measures the tokens written in the
 * stylesheets, which is what 0.61.0 made opaque. It cannot reach this file's
 * subject: `applyTheme` injects a `<style>` into the head, so a generated theme
 * wins the cascade over `colors.css` in every app that brands itself — and the
 * generator kept deriving the ring with an alpha, handing back exactly the ring
 * the release had removed. A sweep that stops at the files is a sweep that
 * cannot see a value produced at runtime.
 *
 * The numbers below are the reason the fix is not "default the alpha to 1".
 * Measured across twelve brands, four surfaces and both schemes (96 pairings):
 *
 * | ring | pairings clearing 3:1 |
 * | --- | --- |
 * | `500` at alpha 0.35 | 3 of 96 |
 * | `500` opaque | 58 of 96 |
 * | step picked by contrast | 96 of 96 |
 *
 * Opaque alone leaves a yellow brand at 1.43:1 in light and the reported purple
 * (`#8100D7`) at 1.91:1 in **dark** — the same brand that passes at 7.20:1 in
 * light, which is how a fix measured in one scheme ships broken in the other.
 */

/** WCAG 2.2 SC 1.4.11 floor for a non-text indicator. */
const INDICATOR_FLOOR = 3;

/**
 * Brands that between them cover the ramp: saturated, near-neutral, very light
 * and very dark.
 *
 * The light and dark extremes are the ones that break a fixed step, and
 * `#8100D7` is the brand from the report, kept by name so the row that failed
 * is the row that is now asserted.
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

const SURFACE_TOKENS = [
    "--tempest-bg",
    "--tempest-surface",
    "--tempest-surface-2",
    "--tempest-surface-3",
] as const;

/**
 * The surfaces of the SDK's own `colors.css`, read from the file.
 *
 * A theme that only names `primary` keeps them, so they are what the generated
 * ring is measured against — and reading them here is what makes the copy
 * inside `create-theme.ts` a claim instead of a note that drifts.
 */
function sdkSurfaces(): Record<"light" | "dark", string[]> {
    const css = readFileSync(join(__dirname, "..", "styles", "colors.css"), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
    );
    const split = css.indexOf('data-tempest-theme="dark"');
    expect(split).toBeGreaterThan(0);
    const parse = (block: string): Record<string, string> => {
        const map: Record<string, string> = {};
        for (const match of block.matchAll(/(--tempest-[\w-]+)\s*:\s*([^;]+);/g)) {
            map[match[1] as string] = (match[2] as string).trim();
        }
        return map;
    };
    const light = parse(css.slice(0, split));
    const dark = { ...light, ...parse(css.slice(split)) };
    const resolve = (map: Record<string, string>, name: string, depth = 0): string => {
        const value = map[name];
        if (value === undefined) throw new Error(`token ${name} is not defined`);
        if (depth > 8) throw new Error(`token ${name} loops`);
        const reference = /^var\((--[\w-]+)\)$/.exec(value);
        return reference ? resolve(map, reference[1] as string, depth + 1) : value;
    };
    return {
        light: SURFACE_TOKENS.map((token) => resolve(light, token)),
        dark: SURFACE_TOKENS.map((token) => resolve(dark, token)),
    };
}

/** The ring a generated theme emits for one scheme. */
function ringOf(theme: ReturnType<typeof createTheme>, scheme: "light" | "dark"): string {
    const value = (scheme === "light" ? theme.light : theme.dark)["--tempest-focus-ring-color"];
    expect(value).toBeDefined();
    return value as string;
}

describe.each(["light", "dark"] as const)("generated focus ring — %s theme", (scheme) => {
    const surfaces = sdkSurfaces()[scheme];

    it.each(BRANDS)("%s clears the floor on every surface the SDK paints", (brand) => {
        const ring = ringOf(createTheme({ primary: brand }), scheme);
        for (const surface of surfaces) {
            expect(contrastRatio(ring, surface)).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
        }
    });

    /**
     * The property alpha destroys, asserted directly.
     *
     * Without it the generator could go back to `rgb(… / 0.35)` and the ratios
     * above would still be computed — from the opaque channels, ignoring the
     * alpha — and pass while the painted ring fails. That is the failure that
     * already happened, one level up from the one 0.61.0 fixed.
     */
    it.each(BRANDS)("%s emits an opaque ring", (brand) => {
        expect(ringOf(createTheme({ primary: brand }), scheme)).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
});

describe("a theme that repaints the surfaces", () => {
    /**
     * A generated neutral moves the backdrop, so the ring has to be measured
     * against *that* and not against the SDK's.
     */
    it.each(BRANDS)("%s clears the floor over its own generated grays", (brand) => {
        for (const gray of ["#667085", "#7a7f8a", "#4b5563"]) {
            const theme = createTheme({ primary: brand, gray });
            for (const scheme of ["light", "dark"] as const) {
                const tokens = scheme === "light" ? theme.light : theme.dark;
                const resolve = (name: string): string => {
                    const value = tokens[name];
                    if (value === undefined) throw new Error(`token ${name} is not generated`);
                    const reference = /^var\((--[\w-]+)\)$/.exec(value);
                    return reference ? resolve(reference[1] as string) : value;
                };
                for (const token of SURFACE_TOKENS) {
                    expect(
                        contrastRatio(ringOf(theme, scheme), resolve(token)),
                    ).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
                }
            }
        }
    });
});

describe("the ring keeps the brand when the brand can carry it", () => {
    /**
     * The step walk is a fallback, not a recolour.
     *
     * A brand that already clears the floor at `500` must come back as itself —
     * otherwise every theme would get a ring in a shade nobody chose, which is a
     * worse answer than the one being fixed.
     */
    it("emits the brand color untouched for a brand that passes at 500", () => {
        expect(ringOf(createTheme({ primary: "#8100D7" }), "light")).toBe("#8100d7");
        expect(ringOf(createTheme({ primary: "#FFD400" }), "dark")).toBe("#ffd400");
    });
});

describe("focusRingAlpha", () => {
    it("still produces a translucent ring when a theme asks for one on purpose", () => {
        const { light } = createTheme({ primary: "#0066ff", focusRingAlpha: 0.5 });
        expect(light["--tempest-focus-ring-color"]).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.5\)$/);
    });

    it("treats 1 as the default, emitting hex rather than an alpha-1 rgb()", () => {
        const { light } = createTheme({ primary: "#0066ff", focusRingAlpha: 1 });
        expect(light["--tempest-focus-ring-color"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
});

describe("the warning a translucent ring earns", () => {
    afterEach(() => {
        setDevBuild(undefined);
        vi.restoreAllMocks();
    });

    /**
     * A ring below the floor is the hardest failure to notice: it is drawn, it
     * just does not separate. So asking for one says so out loud, in the build
     * where someone is looking.
     */
    it("warns in a development build, naming the alpha that was asked for", () => {
        setDevBuild(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        createTheme({ primary: "#0066ff", focusRingAlpha: 0.35 });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain("0.35");
        expect(warn.mock.calls[0]?.[0]).toContain("1.4.11");
    });

    it("stays quiet in a production build", () => {
        setDevBuild(false);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        createTheme({ primary: "#0066ff", focusRingAlpha: 0.35 });
        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet for the default, which needs no warning", () => {
        setDevBuild(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        createTheme({ primary: "#0066ff" });
        createTheme({ primary: "#0066ff", focusRingAlpha: 1 });
        expect(warn).not.toHaveBeenCalled();
    });
});
