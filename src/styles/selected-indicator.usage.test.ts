import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Structural guard: a component that marks a selected or highlighted row draws
 * the mark with `--tempest-selected-indicator`, not with a neighbouring surface.
 *
 * `selected-indicator.contrast.test.ts` proves the token clears 3:1 and that no
 * pair of surfaces does. This file is what connects that proof to the pixels:
 * without it, the token stays correct while a component quietly goes back to
 * `background-color: var(--tempest-surface)` on `.active`, which is the exact
 * state the four components below shipped in — `SegmentedControl` at 1.055:1
 * over its own track, the three menus at 1.053:1 over their panel.
 *
 * The list is data rather than a scrape of every `.active` rule, for the reason
 * the focus-ring sweep learned: scraping produces false positives on rules that
 * merely look like state (`:hover:not(:focus)`), and a component that legitimately
 * signals with something else — `Switch` moves a knob, `Calendar` fills with the
 * solid brand — would be reported as broken.
 */
const COMPONENTS_WITH_SELECTED_STATE = [
    "Command",
    "ContextMenu",
    "DropdownMenu",
    "SegmentedControl",
] as const;

/** The directory holding the SDK's component stylesheets. */
const COMPONENTS_DIR = join(__dirname, "..", "components");

/** Read a component's stylesheet with comments stripped. */
function stylesheetOf(name: string): string {
    return readFileSync(join(COMPONENTS_DIR, name, `${name}.module.css`), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
    );
}

/** The declaration blocks whose selector names a selected or highlighted state. */
function selectedStateBlocks(css: string): string[] {
    const blocks: string[] = [];
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = (match[1] as string).trim();
        if (/\.(?:segment|option|item)[^{,]*\.active\b/.test(selector)) {
            blocks.push(match[2] as string);
        }
    }
    return blocks;
}

describe("selected state is drawn with the indicator token", () => {
    it.each(COMPONENTS_WITH_SELECTED_STATE)("%s marks its active row with the token", (name) => {
        const blocks = selectedStateBlocks(stylesheetOf(name));
        expect(blocks.length).toBeGreaterThan(0);
        for (const block of blocks) {
            expect(block).toContain("var(--tempest-selected-indicator)");
        }
    });

    it.each(COMPONENTS_WITH_SELECTED_STATE)(
        "%s no longer signals selection with a neighbouring surface alone",
        (name) => {
            for (const block of selectedStateBlocks(stylesheetOf(name))) {
                expect(block).not.toMatch(
                    /background(?:-color)?:\s*var\(--tempest-surface[-\d]*\)/,
                );
            }
        },
    );

    /**
     * Every component that ships a stylesheet is checked for the opposite
     * mistake: using the token for something that is not a selected state would
     * make the list above meaningless as a claim about the SDK.
     */
    it("keeps the token out of stylesheets that have no selected state", () => {
        const allowed = new Set<string>(COMPONENTS_WITH_SELECTED_STATE);
        for (const entry of readdirSync(COMPONENTS_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory() || allowed.has(entry.name)) continue;
            const path = join(COMPONENTS_DIR, entry.name, `${entry.name}.module.css`);
            let css: string;
            try {
                css = readFileSync(path, "utf8");
            } catch {
                continue;
            }
            expect(css).not.toContain("--tempest-selected-indicator");
        }
    });
});
