import { describe, expect, it } from "vitest";

import { narrowTokens, parseTokenBlocks, reachableTokens } from "./narrow-tokens";

const SHEET = [
    ":root{color-scheme:light;--tempest-primary-500:#06f;--tempest-primary:var(--tempest-primary-500);--tempest-bg:#fff;--tempest-unused:#123}",
    "[data-tempest-theme=dark]{color-scheme:dark;--tempest-primary-500:#3b82f6;--tempest-bg:#0b0d12}",
    "[data-tempest-density=compact]{--tempest-control-height-md:34px}",
].join("\n");

describe("parseTokenBlocks", () => {
    it("reads one entry per block, in source order", () => {
        const blocks = parseTokenBlocks(SHEET);
        expect(blocks.map((block) => block.selector)).toEqual([
            ":root",
            "[data-tempest-theme=dark]",
            "[data-tempest-density=compact]",
        ]);
        expect(blocks[0]?.declarations.get("--tempest-primary")).toBe("var(--tempest-primary-500)");
    });

    it("skips a block that declares nothing", () => {
        expect(parseTokenBlocks(":root{}\n:root{--tempest-bg:#fff}")).toHaveLength(1);
    });
});

describe("reachableTokens", () => {
    it("follows a token that names another token", () => {
        const reached = reachableTokens(
            parseTokenBlocks(SHEET),
            ".x{color:var(--tempest-primary)}",
        );
        expect([...reached].sort()).toEqual(["--tempest-primary", "--tempest-primary-500"]);
    });

    it("ignores a name the sheet does not declare", () => {
        expect(reachableTokens(parseTokenBlocks(SHEET), ".x{color:var(--app-brand)}").size).toBe(0);
    });
});

describe("narrowTokens", () => {
    it("keeps the alias and its target, drops what nothing reads", () => {
        const out = narrowTokens(SHEET, ".x{color:var(--tempest-primary)}") ?? "";
        expect(out).toContain("--tempest-primary:var(--tempest-primary-500)");
        expect(out).toContain("--tempest-primary-500:#06f");
        expect(out).not.toContain("--tempest-unused");
        expect(out).not.toContain("--tempest-bg");
    });

    it("keeps the dark theme's copy of a token the light theme also declares", () => {
        const out = narrowTokens(SHEET, ".x{background:var(--tempest-bg)}") ?? "";
        expect(out).toContain(":root{");
        expect(out).toContain("[data-tempest-theme=dark]{");
        expect(out.match(/--tempest-bg:/g)).toHaveLength(2);
    });

    it("carries `color-scheme` with a block that survives", () => {
        const out = narrowTokens(SHEET, ".x{background:var(--tempest-bg)}") ?? "";
        expect(out).toContain("color-scheme:light");
        expect(out).toContain("color-scheme:dark");
    });

    it("omits a block whose every token was dropped, `color-scheme` and all", () => {
        const out = narrowTokens(SHEET, ".x{color:var(--tempest-primary)}") ?? "";
        expect(out).not.toContain("data-tempest-density");
        expect(out).not.toContain("--tempest-control-height-md");
    });

    /**
     * The dark block survives here because it redeclares `--tempest-primary-500`, the
     * alias target — not because reading `--tempest-primary` mentions dark. Dropping it
     * would leave the dark theme resolving the alias to the light value, which is the
     * failure mode this cut has to not have.
     */
    it("keeps the dark block when it redeclares a token reached through an alias", () => {
        const out = narrowTokens(SHEET, ".x{color:var(--tempest-primary)}") ?? "";
        expect(out).toContain("[data-tempest-theme=dark]{");
        expect(out).toContain("--tempest-primary-500:#3b82f6");
    });

    it("counts a read from the app's own CSS, not only the SDK's", () => {
        const out = narrowTokens(SHEET, ".app-card{background:var(--tempest-bg)}") ?? "";
        expect(out).toContain("--tempest-bg:#fff");
    });

    it("falls back to the whole sheet when a token name is built at runtime", () => {
        expect(narrowTokens(SHEET, "const c = `var(--tempest-${tone})`;")).toBeNull();
        expect(narrowTokens(SHEET, 'const c = "var(--tempest-" + tone + ")";')).toBeNull();
    });

    it("falls back when nothing reads a token at all, rather than emitting an empty sheet", () => {
        expect(narrowTokens(SHEET, ".x{color:red}")).toBeNull();
    });

    /**
     * The compiler's own `--lightningcss-*` pair is dead weight today and load-bearing
     * the moment one rule uses `light-dark()`. A `--tempest-`-only closure would drop it
     * in both cases; this is the guard that the closure reads every custom property.
     */
    it("keeps a non-`--tempest-` custom property that something reads", () => {
        const sheet = ":root{--lightningcss-light:initial;--tempest-bg:#fff}";
        const out =
            narrowTokens(sheet, ".x{color:light-dark(var(--lightningcss-light),#000)}") ?? "";
        expect(out).toContain("--lightningcss-light:initial");
        expect(out).not.toContain("--tempest-bg");
    });
});
