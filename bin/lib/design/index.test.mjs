import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeDesign } from "./index.mjs";

let root;

function write(relative, contents) {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-design-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("analyzeDesign", () => {
    it("reports nothing for a well-shaped project", () => {
        write(
            "src/features/orders/OrderRow.tsx",
            [
                "interface OrderRowProps {",
                "  code: string;",
                "}",
                "",
                "/** One row. */",
                "export function OrderRow({ code }: OrderRowProps) {",
                "  return <span>{code}</span>;",
                "}",
            ].join("\n"),
        );
        const result = analyzeDesign({ root });
        expect(result.findings).toEqual([]);
        expect(result.stats.files).toBe(1);
        expect(result.counts.warn).toBe(0);
    });

    it("reports findings with project-relative paths", () => {
        write(
            "src/pages/List.tsx",
            "export function List() {\n  fetch('/api');\n  return null;\n}",
        );
        const result = analyzeDesign({ root });
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].file).toBe(join("src", "pages", "List.tsx"));
        expect(result.findings[0].code).toBe("fetch-in-component");
    });

    it("walks app/ as well as src/", () => {
        write("app/Widget.tsx", "export function Widget() {\n  fetch('/x');\n  return null;\n}");
        expect(analyzeDesign({ root }).findings.map((f) => f.code)).toEqual(["fetch-in-component"]);
    });

    it("ignores declaration files and generated code", () => {
        write("src/types.d.ts", "export type Any = any;");
        write("src/icons.generated.ts", "export const icons = { a: 1 as any };");
        write("src/generated/api.ts", "export const client = {} as any;");
        const result = analyzeDesign({ root });
        expect(result.stats.files).toBe(0);
        expect(result.findings).toEqual([]);
    });

    it("reports statistics over the files it read", () => {
        write("src/a.ts", "export const a = 1;\nexport const b = 2;");
        write("src/b.ts", "export const c = 3;");
        const result = analyzeDesign({ root });
        expect(result.stats.files).toBe(2);
        expect(result.stats.codeLines).toBe(3);
        expect(result.stats.largest.lines).toBe(2);
    });

    it("collects waivers with their reasons", () => {
        write(
            "src/Crop.tsx",
            [
                "/**",
                " * Cropper.",
                " *",
                " * @tempest-limits file-lines — drag, zoom and canvas export share one",
                " * piece of geometry state.",
                " */",
                "export function Crop() {",
                ...Array.from({ length: 200 }, (_, i) => `  const v${i} = ${i};`),
                "  return null;",
                "}",
            ].join("\n"),
        );
        const result = analyzeDesign({ root });
        expect(result.findings.map((f) => f.code)).not.toContain("file-lines");
        expect(result.waivers).toEqual([
            {
                file: "src/Crop.tsx",
                code: "file-lines",
                reason: expect.stringContaining("geometry state"),
            },
        ]);
    });

    it("sorts warnings before info", () => {
        write("src/a.tsx", "export function A() {\n  fetch('/x');\n  return null;\n}");
        write("src/a.test.ts", "const mock = {} as any;");
        const result = analyzeDesign({ root });
        expect(result.findings.map((f) => f.severity)).toEqual(["warn", "info"]);
    });

    it("flags truncation when the file cap is reached", () => {
        for (let i = 0; i < 5; i += 1) write(`src/f${i}.ts`, "export const v = 1;");
        const result = analyzeDesign({ root, maxFiles: 2 });
        expect(result.stats.files).toBe(2);
        expect(result.truncated).toBe(true);
    });

    it("returns empty stats when there is nothing to read", () => {
        const result = analyzeDesign({ root });
        expect(result.stats).toEqual({
            files: 0,
            codeLines: 0,
            medianLines: 0,
            largest: null,
        });
    });
});
