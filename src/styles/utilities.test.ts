import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrails for the opt-in utility layer.
 *
 * These assert the layer's *contract* rather than its rendering (jsdom computes
 * no layout): every class is namespaced, every value comes from a token, the file
 * stays out of the bundled `styles.css`, and it is reachable as a subpath. Each
 * of those is a promise made in the docs that silently breaks otherwise.
 */
const STYLES_DIR = join(dirname(new URL(import.meta.url).pathname));
const UTILITIES = readFileSync(join(STYLES_DIR, "utilities.css"), "utf8");
const INDEX = readFileSync(join(STYLES_DIR, "index.css"), "utf8");
const PACKAGE_JSON = JSON.parse(
    readFileSync(join(STYLES_DIR, "..", "..", "package.json"), "utf8"),
) as { exports: Record<string, unknown>; scripts: Record<string, string> };

/** Every class selector declared in the sheet, deduplicated. */
function classNames(css: string): string[] {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const matches = withoutComments.matchAll(/\.([a-zA-Z][\w-]*)/g);
    return Array.from(new Set(Array.from(matches, (match) => match[1])));
}

describe("utilities.css contract", () => {
    it("declares at least a couple dozen utilities", () => {
        expect(classNames(UTILITIES).length).toBeGreaterThanOrEqual(24);
    });

    it("namespaces every class with the tempest- prefix", () => {
        const unprefixed = classNames(UTILITIES).filter((name) => !name.startsWith("tempest-"));
        expect(unprefixed).toEqual([]);
    });

    it("carries no literal colors — colors must come from tokens", () => {
        const withoutComments = UTILITIES.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(withoutComments).not.toMatch(/\brgba?\(/);
        expect(withoutComments).not.toMatch(/\bhsla?\(/);
    });

    it("uses no !important, so app CSS can still win", () => {
        expect(UTILITIES.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("!important");
    });

    it("references only tempest tokens", () => {
        const referenced = Array.from(UTILITIES.matchAll(/var\((--[\w-]+)/g), (m) => m[1]);
        expect(referenced.length).toBeGreaterThan(20);
        expect(referenced.filter((name) => !name.startsWith("--tempest-"))).toEqual([]);
    });

    it("stays out of the bundled styles.css so it remains opt-in", () => {
        expect(INDEX).not.toContain("utilities.css");
    });

    it("is exported as its own subpath", () => {
        expect(PACKAGE_JSON.exports["./utilities.css"]).toBe("./dist/utilities.css");
    });

    it("is copied into dist by the build script", () => {
        expect(PACKAGE_JSON.scripts.build).toContain("copy-css-assets");
    });

    it("keeps the mobile-first breakpoints aligned with the token widths", () => {
        expect(UTILITIES).toContain("@media (min-width: 640px)");
        expect(UTILITIES).toContain("@media (min-width: 768px)");
    });

    it("ships the documented layout primitives", () => {
        for (const name of [
            "tempest-container",
            "tempest-stack",
            "tempest-cluster",
            "tempest-row",
            "tempest-center",
            "tempest-spread",
            "tempest-grid-auto",
            "tempest-sidebar-layout",
            "tempest-form-grid",
            "tempest-form-span",
        ]) {
            expect(classNames(UTILITIES)).toContain(name);
        }
    });

    it("ships the documented page pattern and surfaces", () => {
        for (const name of [
            "tempest-page",
            "tempest-page-header",
            "tempest-page-title",
            "tempest-toolbar",
            "tempest-card",
            "tempest-panel",
            "tempest-scroll-x",
        ]) {
            expect(classNames(UTILITIES)).toContain(name);
        }
    });

    it("exposes a local var hook on the tunable primitives", () => {
        expect(UTILITIES).toContain("var(--tempest-stack-gap,");
        expect(UTILITIES).toContain("var(--tempest-grid-min,");
        expect(UTILITIES).toContain("var(--tempest-sidebar-width,");
        expect(UTILITIES).toContain("var(--tempest-container-width,");
    });
});
