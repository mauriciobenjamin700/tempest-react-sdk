import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    buildStyleEntry,
    scanStyleImports,
    selectedSheets,
    type StyleManifest,
} from "./tempest-styles";

const MANIFEST: StyleManifest = {
    core: "core.css",
    components: {
        Button: ["Button.css"],
        DataTable: ["DataTable.css", "Pagination.css", "Table.css"],
        Stack: ["Layout.css"],
    },
};

describe("scanStyleImports", () => {
    it("collects named imports from the root entry", () => {
        const found = scanStyleImports(`import { Button, Card } from "tempest-react-sdk";`);
        expect(found).toEqual(expect.arrayContaining(["Button", "Card"]));
    });

    it("reads through an alias to the imported name, not the local one", () => {
        expect(scanStyleImports(`import { Button as Btn } from "tempest-react-sdk";`)).toEqual([
            "Button",
        ]);
    });

    it("ignores type-only imports, which render nothing", () => {
        expect(scanStyleImports(`import type { ButtonProps } from "tempest-react-sdk";`)).toEqual(
            [],
        );
        expect(scanStyleImports(`import { type ButtonProps } from "tempest-react-sdk";`)).toEqual(
            [],
        );
    });

    it("ignores imports from other packages", () => {
        expect(scanStyleImports(`import { Button } from "some-other-ui";`)).toEqual([]);
    });

    it("reads the styled subpaths too", () => {
        expect(scanStyleImports(`import { LineChart } from "tempest-react-sdk/charts";`)).toEqual([
            "LineChart",
        ]);
    });

    /**
     * A namespace import defeats the scan by design: `sdk.Button` is resolved at
     * runtime, so no static set of names is knowable. Reporting `null` is what lets
     * the caller fall back to the whole sheet instead of silently under-serving.
     */
    it("reports null for a namespace import rather than guessing", () => {
        expect(scanStyleImports(`import * as sdk from "tempest-react-sdk";`)).toBeNull();
    });
});

describe("buildStyleEntry", () => {
    it("emits the transitive closure a component needs, not just its own sheet", () => {
        const css = buildStyleEntry(["DataTable"], MANIFEST);
        expect(css).toContain("styles/Pagination.css");
        expect(css).toContain("styles/Table.css");
    });

    it("maps a component to the sheet its CSS module actually owns", () => {
        expect(buildStyleEntry(["Stack"], MANIFEST)).toContain("styles/Layout.css");
    });

    it("scopes the reset by default, leaving the document to the app", () => {
        const css = buildStyleEntry(["Button"], MANIFEST);
        expect(css).toContain("styles/tokens.css");
        expect(css).toContain("styles/scoped.css");
        expect(css).not.toContain("styles/core.css");
    });

    it("emits the pre-split foundation when the SDK owns the page", () => {
        const css = buildStyleEntry(["Button"], MANIFEST, "global");
        expect(css).toContain("styles/core.css");
        expect(css).not.toContain("styles/scoped.css");
    });

    it("emits tokens alone when the app brings its own reset", () => {
        const css = buildStyleEntry(["Button"], MANIFEST, "none");
        expect(css).toContain("styles/tokens.css");
        expect(css).not.toContain("styles/scoped.css");
        expect(css).not.toContain("styles/core.css");
    });

    it("falls back to the whole sheet when the names are unknowable", () => {
        expect(buildStyleEntry(null, MANIFEST)).toContain("styles.css");
    });

    it("never emits a sheet for a name the manifest does not know", () => {
        expect(buildStyleEntry(["NotAComponent"], MANIFEST)).not.toMatch(/NotAComponent/);
    });

    it("inlines the narrowed token block instead of importing the whole sheet", () => {
        const css = buildStyleEntry(["Button"], MANIFEST, "scoped", ":root{--tempest-bg:#fff}");
        expect(css).not.toContain("styles/tokens.css");
        expect(css).toContain(":root{--tempest-bg:#fff}");
        expect(css).toContain("styles/scoped.css");
    });

    /**
     * `@import` is only valid before any rule, so a token block above the imports
     * invalidates every one of them — the components arrive with no CSS at all, and the
     * page looks like the plugin did nothing. Custom properties resolve regardless of
     * where the declaration sits, so last is both safe and the only safe place.
     */
    it("puts the inlined block after every `@import`, which is the only valid order", () => {
        const css = buildStyleEntry(["Button"], MANIFEST, "scoped", ":root{--tempest-bg:#fff}");
        expect(css.lastIndexOf("@import")).toBeLessThan(css.indexOf(":root{"));
    });

    it("splits `core.css` into tokens and base when the global reset is narrowed", () => {
        const css = buildStyleEntry(["Button"], MANIFEST, "global", ":root{--tempest-bg:#fff}");
        expect(css).toContain("styles/base.css");
        expect(css).not.toContain("styles/core.css");
        expect(css).not.toContain("styles/tokens.css");
    });

    it("keeps the foundation whole when the names are unknowable, narrowed or not", () => {
        const css = buildStyleEntry(null, MANIFEST, "global", ":root{--tempest-bg:#fff}");
        expect(css).toContain("styles/core.css");
        expect(css).toContain("styles.css");
    });
});

describe("selectedSheets", () => {
    it("names the sheets the closure has to read, reset included", () => {
        expect(selectedSheets(["DataTable"], MANIFEST, "scoped")).toEqual([
            "DataTable.css",
            "Pagination.css",
            "Table.css",
            "scoped.css",
        ]);
    });

    it("names the global reset when that is what the entry emits", () => {
        expect(selectedSheets(["Button"], MANIFEST, "global")).toEqual(["Button.css", "base.css"]);
    });

    it("omits the reset entirely when the app brings its own", () => {
        expect(selectedSheets(["Button"], MANIFEST, "none")).toEqual(["Button.css"]);
    });

    it("points at the whole sheet when the names are unknowable", () => {
        expect(selectedSheets(null, MANIFEST, "scoped")).toEqual(["../styles.css"]);
    });
});

describe("the generated scoped reset", () => {
    const raw = readFileSync(join(__dirname, "..", "styles", "scoped.css"), "utf8");
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

    /**
     * The whole point of the file: it may not reach the app's own document. A single
     * unscoped `body` or `html` rule here reintroduces the takeover it exists to
     * avoid, and it would do so invisibly — the components would still look right.
     */
    it("claims no document-level selector", () => {
        const selectors = [...css.matchAll(/(^|\})\s*([^{}][^{]*)\{/g)]
            .map((match) => (match[2] ?? "").trim())
            .filter((selector) => !selector.startsWith("@"));
        for (const selector of selectors) {
            expect(selector).toContain('[class*="tempest_"]');
        }
        expect(css).not.toMatch(/^\s*(html|body)\s*[,{]/m);
        expect(css).not.toContain("#root");
    });

    /**
     * `:where()` is what keeps this a republish rather than a stronger rule. Without
     * it every selector gains 0,1,0 over the global reset it replaces, and an app
     * override that used to win silently stops winning.
     */
    it("adds no specificity, so app overrides still win", () => {
        expect(css).not.toMatch(/(?<!:where\()\[class\*="tempest_"\]/);
    });

    it("carries the normalisation the components are written against", () => {
        expect(css).toContain("box-sizing: border-box");
        expect(css).toMatch(/border-collapse/);
        expect(css).toMatch(/font-family: inherit/);
        expect(css).toMatch(/cursor: pointer/);
    });

    /** Nothing may follow a pseudo-element; the browser drops the whole rule. */
    it("never splices the scope after a pseudo-element", () => {
        expect(css).not.toMatch(/::[a-z-]+[^,{\s]*:where/);
    });
});
