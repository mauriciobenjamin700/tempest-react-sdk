import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/theme/color";

const CSS = readFileSync(join(process.cwd(), "src/styles/colors.css"), "utf8");

/**
 * The `:root` block and the dark override, as raw text.
 *
 * Reading the stylesheet rather than a TypeScript copy is the point: the tokens
 * live in CSS, and a duplicate table in a test would drift and then quietly pass
 * while the shipped colours failed.
 */
function block(mode: "light" | "dark"): string {
    const start =
        mode === "light" ? CSS.indexOf(":root") : CSS.indexOf('[data-tempest-theme="dark"]');
    expect(start, `${mode} block missing from colors.css`).toBeGreaterThan(-1);
    const end = CSS.indexOf("}", start);
    return CSS.slice(start, end);
}

/** Resolve one token to a hex value, following a single `var()` indirection. */
function token(mode: "light" | "dark", name: string): string {
    const source = block(mode);
    const direct = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(source);
    if (direct) return direct[1];

    const indirect = new RegExp(`${name}:\\s*var\\((--[\\w-]+)\\)`).exec(source);
    expect(indirect, `${name} not found in the ${mode} block`).not.toBeNull();
    const target = new RegExp(`${indirect![1]}:\\s*(#[0-9a-fA-F]{3,8})`).exec(CSS);
    expect(target, `${indirect![1]} has no literal value`).not.toBeNull();
    return target![1];
}

const CODE_TOKENS = [
    "--tempest-code-comment",
    "--tempest-code-punctuation",
    "--tempest-code-string",
    "--tempest-code-number",
    "--tempest-code-keyword",
    "--tempest-code-literal",
    "--tempest-code-function",
    "--tempest-code-tag",
    "--tempest-code-attribute",
    "--tempest-code-property",
] as const;

/**
 * WCAG AA for body text. Syntax colours are text, not marks.
 *
 * The reason these tokens exist rather than reusing the chart ramp: the ramp is
 * validated at the 3:1 floor a mark needs, and measured as text it fails. In the
 * browser, chart-1 as a keyword came out at 3.47:1 on the dark surface and
 * chart-3 as a string at 2.03:1 on the light one.
 */
const AA_TEXT = 4.5;

/**
 * Both grounds a syntax colour can land on, as measured in a browser.
 *
 * The second is a highlighted line: `CodeBlock` washes it with 10% of the
 * primary, and the composite is a different background from the plain surface.
 * Checking only the surface is what let a keyword ship at 4.17:1 on a marked
 * line — visibly fine, and below AA.
 */
const GROUNDS: Record<"light" | "dark", readonly string[]> = {
    light: ["#f8f9fb", "#deeafe"],
    dark: ["#14171f", "#121f34"],
};

describe.each(["light", "dark"] as const)("syntax colours in %s mode", (mode) => {
    it("keeps the plain code surface where the palette was solved for it", () => {
        expect(token(mode, "--tempest-surface").toLowerCase()).toBe(GROUNDS[mode][0]);
    });

    it.each(CODE_TOKENS)("%s clears AA on every ground it can land on", (name) => {
        const value = token(mode, name);
        for (const ground of GROUNDS[mode]) {
            const ratio = contrastRatio(value, ground);
            expect(ratio, `${name} is ${ratio.toFixed(2)}:1 on ${ground}`).toBeGreaterThanOrEqual(
                AA_TEXT,
            );
        }
    });
});

describe("syntax colours stay distinguishable", () => {
    it.each(["light", "dark"] as const)("keeps the hues apart in %s mode", (mode) => {
        // Attribute and property share a colour on purpose — they play the same
        // role — so the set is smaller than the list.
        const values = new Set(CODE_TOKENS.map((name) => token(mode, name)));
        expect(values.size).toBeGreaterThanOrEqual(CODE_TOKENS.length - 2);
    });
});
