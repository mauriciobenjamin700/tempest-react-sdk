import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeCss, applyCssFixes } from "./analyze.mjs";

let root;
const SELF_DIR = join(dirname(new URL(import.meta.url).pathname), "..", "..");

/** Write a file inside the fixture project, creating its directory. */
function write(rel, text) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    return full;
}

const analyze = (targets = ["."]) => analyzeCss({ root, targets, selfDir: SELF_DIR });
const codesFor = (analysis, file) =>
    analysis.findings.filter((f) => f.file === file).map((f) => f.code);

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-css-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("analyzeCss — collection", () => {
    it("reports nothing when the project has no stylesheet", () => {
        const analysis = analyze();
        expect(analysis.stats.files).toBe(0);
        expect(analysis.findings).toEqual([]);
    });

    it("walks the project and reports paths relative to the root", () => {
        write("src/a.css", ".a { color: red; color: red; }\n");
        const analysis = analyze();
        expect(analysis.stats).toMatchObject({ files: 1, rules: 1, declarations: 2 });
        expect(analysis.findings[0].file).toBe(join("src", "a.css"));
    });

    it("skips node_modules, dist and other generated trees", () => {
        write("node_modules/pkg/x.css", ".a {}\n");
        write("dist/x.css", ".a {}\n");
        write("coverage/x.css", ".a {}\n");
        write("src/x.css", ".a { color: red; }\n");
        expect(analyze().stats.files).toBe(1);
    });

    it("skips a minified sheet and says so", () => {
        write("src/vendor.min.css", ".a{color:red}\n");
        const analysis = analyze();
        expect(analysis.stats.files).toBe(0);
        expect(analysis.skipped[0]).toMatchObject({ reason: "minified" });
    });

    it("honors a single-file target", () => {
        write("src/a.css", ".a { color: red; color: red; }\n");
        write("src/b.css", ".b { color: red; color: red; }\n");
        const analysis = analyze([join("src", "a.css")]);
        expect(analysis.stats.files).toBe(1);
    });

    it("sorts findings error → warn → info", () => {
        write("src/a.css", ".a {\n    color: ;\n}\n.b {\n    color: red;\n    color: red;\n}\n");
        const severities = analyze().findings.map((f) => f.severity);
        expect(severities).toEqual(["error", "warn"]);
        expect(analyze().counts).toMatchObject({ error: 1, warn: 1 });
    });
});

describe("analyzeCss — project-wide knowledge", () => {
    it("accepts a custom property defined in another stylesheet", () => {
        write("src/tokens.css", ":root {\n    --brand: #123456;\n}\n");
        write("src/use.css", ".a {\n    color: var(--brand);\n}\n");
        expect(codesFor(analyze(), join("src", "use.css"))).toEqual([]);
    });

    it("accepts a custom property only the TypeScript sets", () => {
        write("src/app.ts", 'el.style.setProperty("--row-height", "40px");\n');
        write("src/use.css", ".a {\n    height: var(--row-height);\n}\n");
        expect(codesFor(analyze(), join("src", "use.css"))).toEqual([]);
    });

    it("still flags a variable nothing anywhere defines", () => {
        write("src/use.css", ".a {\n    height: var(--nowhere);\n}\n");
        expect(codesFor(analyze(), join("src", "use.css"))).toEqual(["undefined-var"]);
    });

    it("finds a block repeated across CSS Modules", () => {
        const row = ".row {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n";
        write("src/A.module.css", row);
        write("src/B.module.css", row);
        write("src/C.module.css", row);
        const codes = analyze().findings.map((f) => f.code);
        expect(codes).toContain("global-candidate");
    });
});

describe("applyCssFixes", () => {
    it("writes the deduped sheet and reports each change", () => {
        const file = write("src/a.css", ".a {\n    color: red;\n    color: red;\n}\n.gone {\n}\n");
        const result = applyCssFixes({ analysis: analyze() });
        expect(result.total).toBe(2);
        expect(result.files[0].changes.map((c) => c.code)).toEqual([
            "duplicate-declaration",
            "empty-rule",
        ]);
        expect(readFileSync(file, "utf8")).toBe(".a {\n    color: red;\n}\n");
    });

    it("writes nothing on a dry run", () => {
        const before = ".a {\n    color: red;\n    color: red;\n}\n";
        const file = write("src/a.css", before);
        const result = applyCssFixes({ analysis: analyze(), dryRun: true });
        expect(result.total).toBe(1);
        expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("leaves a sheet with a syntax error untouched", () => {
        const before = ".a {\n    color: red;\n    color: red;\n";
        const file = write("src/a.css", before);
        const result = applyCssFixes({ analysis: analyze() });
        expect(result.total).toBe(0);
        expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("is idempotent — a second run finds nothing to do", () => {
        write("src/a.css", ".a {\n    color: red;\n    color: red;\n}\n");
        applyCssFixes({ analysis: analyze() });
        expect(applyCssFixes({ analysis: analyze() }).total).toBe(0);
    });
});
