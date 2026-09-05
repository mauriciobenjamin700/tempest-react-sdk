import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrails for the document-level half of the reset.
 *
 * jsdom computes no layout, so these assert the sheet's *contract* rather than
 * its rendering: the README sells `styles.css` as shipping "a minimal CSS
 * reset", and the single most visible thing a reset owns — the user agent's 8px
 * `body` margin — went unclaimed through 58 releases. The screen version of
 * this defect is a spurious scrollbar on every `AppShell` app plus an unpainted
 * frame around the shell in dark mode, and neither shows up in a unit test.
 * What a unit test can hold is that the declarations exist, that they are
 * outside `@media print`, and that the painted colours come from tokens rather
 * than from literals that cannot follow the theme.
 */
const STYLES_DIR = dirname(new URL(import.meta.url).pathname);
const RESET = readFileSync(join(STYLES_DIR, "reset.css"), "utf8");
const INDEX = readFileSync(join(STYLES_DIR, "index.css"), "utf8");

/** The sheet with comments and every at-rule block removed. */
function topLevel(css: string): string {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    return withoutComments.replace(/@[a-z-]+[^{]*\{(?:[^{}]*\{[^{}]*\}\s*)*[^{}]*\}/g, "");
}

/** The declaration block of the first top-level rule whose selector matches. */
function ruleFor(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^{}]*)\\}`).exec(topLevel(css));
    return match ? match[1] : "";
}

describe("reset.css document surface", () => {
    it("zeroes the user-agent body margin", () => {
        expect(ruleFor(RESET, "body")).toMatch(/margin:\s*0\s*;/);
    });

    it("declares the body rule outside @media print", () => {
        expect(topLevel(RESET)).toContain("body");
    });

    it("paints the body from theme tokens, not literals", () => {
        const body = ruleFor(RESET, "body");
        expect(body).toMatch(/background-color:\s*var\(--tempest-bg\)/);
        expect(body).toMatch(/color:\s*var\(--tempest-text\)/);
    });

    it("carries the height chain down to the app root", () => {
        const chain = ruleFor(RESET, ":where(html, body, #root)");
        expect(chain).toMatch(/height:\s*100%/);
    });

    it("keeps the height chain at zero specificity, so a consumer rule wins", () => {
        expect(RESET).toMatch(/:where\([^)]*#root[^)]*\)\s*\{/);
        expect(topLevel(RESET)).not.toMatch(/(?:^|\})\s*#root\s*\{/);
    });

    it("ships inside the bundled stylesheet", () => {
        expect(INDEX).toContain('@import "./reset.css";');
    });
});
