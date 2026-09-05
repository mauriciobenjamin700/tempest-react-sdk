import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the two halves of "a surface follows the theme".
 *
 * **`color-scheme`.** Tokens reach only what the SDK paints. The `<select>`
 * dropdown popup, the scrollbar, the autofill wash, the date picker and the
 * default canvas are drawn by the browser from the `color-scheme` property, and
 * the SDK read `prefers-color-scheme` for 58 releases without ever declaring
 * it. Measured in Chromium with the dark theme on, a bare `<select>` painted
 * `#efefef` under the theme's `#f1f3f8` text — 1.03:1.
 *
 * **Scale versus purpose.** `--tempest-gray-*` is a fixed ramp: the dark block
 * overrides two of its twenty-two members, both for charts. So a component that
 * paints its background from `--tempest-gray-100` keeps a light background in
 * the dark theme while its text follows the theme, which is the same defect
 * seen from the other side. `--tempest-surface-2` carries the identical value in
 * the light theme and flips in the dark one.
 *
 * The allowlist below is the interesting part: four uses of the ramp are
 * deliberate, and a sweep that "fixed" them would break working components.
 */
const STYLES_DIR = dirname(new URL(import.meta.url).pathname);
const COLORS = readFileSync(join(STYLES_DIR, "colors.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
);

/**
 * Components that paint a background from the gray ramp on purpose.
 *
 * Each is a case where following the surface tokens would be the bug:
 *
 * - `Switch` — the thumb is light in both themes, the way a physical switch
 *   reads. `--tempest-surface` would paint it `#14171f` in dark and lose it
 *   against its own track.
 * - `Tooltip` — a tooltip is deliberately inverted against the page in the light
 *   theme, which is what `gray-900` plus white ink buys.
 * - `Timeline` — the neutral marker is a dot with no text on it, and the
 *   mid-ramp gray stays visible over both `--tempest-bg` values.
 * - `Badge` / `Alert` — `.neutral.solid` is a *fill*, and `gray-700` is dark in
 *   both themes. What was wrong there was the ink, now
 *   `--tempest-neutral-on-solid`.
 */
const DELIBERATE_RAMP_FILLS = ["Switch", "Tooltip", "Timeline", "Badge", "Alert"];

describe("color-scheme", () => {
    it("declares the light scheme on :root", () => {
        const root = /:root\s*\{([\s\S]*?)\n\}/.exec(COLORS);
        expect(root).not.toBeNull();
        expect(root![1]).toMatch(/color-scheme:\s*light\s*;/);
    });

    it("declares the dark scheme on the theme attribute, not on a media query", () => {
        const dark = /\[data-tempest-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(COLORS);
        expect(dark).not.toBeNull();
        expect(dark![1]).toMatch(/color-scheme:\s*dark\s*;/);
    });
});

describe("neutral fill tokens", () => {
    it("ships the neutral member of the -on-solid family in both themes", () => {
        const declarations = COLORS.match(/--tempest-neutral-on-solid\s*:/g) ?? [];
        expect(declarations).toHaveLength(2);
    });

    it("keeps the gray ramp fixed across themes, which is why it cannot back a surface", () => {
        const split = COLORS.search(/\[data-tempest-theme="dark"\]\s*\{/);
        expect(split).toBeGreaterThan(0);
        const overridden = COLORS.slice(split).match(/--tempest-gray-\d+\s*:/g) ?? [];
        expect(overridden).toHaveLength(0);
    });
});

describe("components do not back a surface with the gray ramp", () => {
    it("leaves only the deliberate uses", async () => {
        const { readdirSync } = await import("node:fs");
        const componentsDir = join(STYLES_DIR, "..", "components");
        const offenders: string[] = [];
        for (const entry of readdirSync(componentsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const file = join(componentsDir, entry.name, `${entry.name}.module.css`);
            let css: string;
            try {
                css = readFileSync(file, "utf8");
            } catch {
                continue;
            }
            if (!/background(-color)?\s*:[^;]*var\(--tempest-gray-/.test(css)) continue;
            if (DELIBERATE_RAMP_FILLS.includes(entry.name)) continue;
            offenders.push(entry.name);
        }
        expect(offenders).toEqual([]);
    });
});
