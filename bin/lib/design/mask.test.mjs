import { describe, expect, it } from "vitest";

import { countCodeLines, lineAt, maskSource, matchPair } from "./mask.mjs";

describe("maskSource", () => {
    it("blanks line and block comments while keeping newlines", () => {
        const { masked, commentText } = maskSource("const a = 1; // note\n/* two\nlines */\nb;");
        expect(masked).toContain("const a = 1;");
        expect(masked).not.toContain("note");
        expect(masked.split("\n")).toHaveLength(4);
        expect(commentText).toContain("note");
        expect(commentText).toContain("two");
    });

    it("blanks string contents but keeps the quotes", () => {
        const { masked } = maskSource('const s = "a } b";');
        expect(masked).toMatch(/const s = "\s+";/);
        expect(masked).not.toContain("}");
    });

    it("keeps template holes as code and blanks the literal text", () => {
        const { masked } = maskSource("const s = `x ${ value } y`;");
        expect(masked).toContain("value");
        expect(masked).not.toContain("x ");
    });

    it("blanks a regex body so its braces do not unbalance the scan", () => {
        const { masked } = maskSource('const re = /a{2}"/g;');
        expect(masked).not.toContain("{2}");
        expect(masked).not.toContain('"');
    });

    it("does not treat JSX closing slashes as a regex", () => {
        const { masked } = maskSource("const el = <div>{value}</div>;");
        expect(masked).toContain("value");
        expect(masked).toContain("</div>");
    });

    it("does not let an unterminated string swallow the rest of the file", () => {
        const { masked } = maskSource('const broken = "oops\nconst after = 1;');
        expect(masked).toContain("const after = 1;");
    });
});

describe("countCodeLines", () => {
    it("counts only lines with code left after masking", () => {
        const { masked } = maskSource("a;\n\n// comment\nb;\n/* block\nmore */\nc;\n");
        expect(countCodeLines(masked)).toBe(3);
    });
});

describe("lineAt", () => {
    it("is 1-based", () => {
        expect(lineAt("a\nb\nc", 0)).toBe(1);
        expect(lineAt("a\nb\nc", 2)).toBe(2);
        expect(lineAt("a\nb\nc", 4)).toBe(3);
    });
});

describe("matchPair", () => {
    it("finds the matching delimiter across nesting", () => {
        const text = "f({ a: { b: 1 } })";
        expect(matchPair(text, 1, "(", ")")).toBe(text.length - 1);
    });

    it("returns -1 when unbalanced", () => {
        expect(matchPair("f({", 1, "(", ")")).toBe(-1);
    });
});
