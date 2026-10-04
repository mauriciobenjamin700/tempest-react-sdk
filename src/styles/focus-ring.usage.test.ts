import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Structural guard: a focus indicator is drawn with `--tempest-focus-ring-color`,
 * never with the brand.
 *
 * `focus-ring.contrast.test.ts` proves the token clears 3:1 over the four
 * surfaces, and `createTheme` re-derives it per brand so that stays true for any
 * `primary`. `--tempest-primary` carries no such promise: it is whatever the brand
 * is. Measured in Chromium on the `Menubar` trigger before this guard existed, a
 * `createTheme({ primary: "#facc15" })` page drew its ring at **1.53:1** over
 * `--tempest-bg`, while the token on the same page cleared the floor. A theme that
 * overrides only `--tempest-focus-ring-color` also never reached those rings.
 *
 * #418 counted 24 rings in 13 stylesheets with
 * `grep -rc "outline: 2px solid var(--tempest-primary)" src`. The sweep below
 * found 35 sites in 22, because the same mistake also took other shapes: an SVG
 * `stroke` on the two maps, a dead `var(--tempest-focus-ring-color,
 * var(--tempest-primary))` fallback (dead because both tokens come from the same
 * stylesheet, so the fallback is undefined exactly when it is reached), and three
 * rules that removed the outline and signalled focus with a brand border or tint
 * alone. The two assertions are one per shape, so neither depends on the other
 * to catch a regression.
 *
 * Marks that are not focus stay on the brand on purpose — the unread bar of
 * `NotificationCenter`, the highlighted line of `CodeBlock`, the drop target of
 * `Kanban`, the `Tour` spotlight. None of them is reached through `:focus`, so
 * neither assertion sees them.
 */

/** Properties that paint the ring itself. */
const RING_PROPERTIES = /(?:^|[;\s])(outline(?:-color)?|box-shadow|stroke)\s*:\s*([^;]+)/g;

/** Any brand token: the base colour and every step and state of its ramp. */
const BRAND = /--tempest-primary[\w-]*/;

/** Tokens a focus rule may legitimately carry as its indicator. */
const INDICATOR = /--tempest-(?:focus-ring-color|selected-indicator)\b/;

/** The SDK's source root. */
const SRC = join(__dirname, "..");

/**
 * Collect every CSS module under a directory.
 *
 * @param dir - Directory to walk.
 * @param out - Accumulator, filled in place.
 * @returns Absolute paths of every `.module.css` found.
 */
function cssModules(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) cssModules(path, out);
        else if (entry.name.endsWith(".module.css")) out.push(path);
    }
    return out;
}

/**
 * Every focus selector in a stylesheet with the declarations that apply to it.
 *
 * Selector lists are split, and a selector that appears in several rules gets all
 * of their declarations merged: `Resizable` paints the divider in the brand in a
 * `:hover, :focus-visible` rule and draws the ring in a second rule, and only the
 * union says whether the focused divider has a ring. `:not(:focus…)` is skipped —
 * it is a hover rule, and reading it as focus is what produced most of the false
 * positives of the first focus-ring sweep.
 *
 * @param css - Stylesheet source.
 * @returns Selector → concatenated declaration blocks.
 */
function focusSelectors(css: string): Map<string, string> {
    const selectors = new Map<string, string>();
    const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = rule[2] ?? "";
        for (const raw of (rule[1] ?? "").split(",")) {
            const selector = raw.trim().replace(/\s+/g, " ");
            if (!/:focus/.test(selector) || /:not\(\s*:focus/.test(selector)) continue;
            selectors.set(selector, `${selectors.get(selector) ?? ""}${body};`);
        }
    }
    return selectors;
}

/** Each stylesheet with its focus selectors, read once for both assertions. */
const SHEETS = cssModules(SRC).map((file) => ({
    file: relative(SRC, file),
    selectors: focusSelectors(readFileSync(file, "utf8")),
}));

describe("focus indicators are drawn with the focus-ring token", () => {
    it("scans a real number of focus rules", () => {
        const total = SHEETS.reduce((sum, sheet) => sum + sheet.selectors.size, 0);
        expect(total).toBeGreaterThan(100);
    });

    it("never paints a ring, an outline or a focus stroke with a brand token", () => {
        const offenders: string[] = [];
        for (const { file, selectors } of SHEETS) {
            for (const [selector, body] of selectors) {
                for (const declaration of body.matchAll(RING_PROPERTIES)) {
                    const value = (declaration[2] ?? "").replace(/\s+/g, " ").trim();
                    if (BRAND.test(value)) {
                        offenders.push(`${file} ${selector} — ${declaration[1]}: ${value}`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("never signals focus with the brand alone", () => {
        const offenders: string[] = [];
        for (const { file, selectors } of SHEETS) {
            for (const [selector, body] of selectors) {
                if (BRAND.test(body) && !INDICATOR.test(body)) {
                    offenders.push(`${file} ${selector}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
