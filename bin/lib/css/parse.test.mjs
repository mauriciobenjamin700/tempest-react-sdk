import { describe, expect, it } from "vitest";

import { maskValue, normalizeSelectors, parseCss, stripComments } from "./parse.mjs";

const codes = (text) => parseCss(text).errors.map((e) => e.code);

describe("parseCss — structure", () => {
    it("records rules, declarations and their lines", () => {
        const { blocks } = parseCss(".a {\n    color: red;\n    padding: 0;\n}\n");
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({ kind: "rule", prelude: ".a", line: 1, endLine: 4 });
        expect(blocks[0].decls.map((d) => [d.prop, d.value, d.line])).toEqual([
            ["color", "red", 2],
            ["padding", "0", 3],
        ]);
    });

    it("keeps the last declaration when the block omits its semicolon", () => {
        const { blocks, errors } = parseCss(".a { color: red }");
        expect(errors).toEqual([]);
        expect(blocks[0].decls).toHaveLength(1);
    });

    it("nests blocks and records the at-rule context", () => {
        const { blocks } = parseCss("@media (min-width: 600px) {\n  .a { color: red; }\n}\n");
        expect(blocks[0]).toMatchObject({ kind: "at", children: 1 });
        expect(blocks[1]).toMatchObject({
            kind: "rule",
            prelude: ".a",
            context: ["@media (min-width: 600px)"],
        });
    });

    it("collects at-statements with their params", () => {
        const { statements } = parseCss('@import "x.css";\n@charset "utf-8";\n');
        expect(statements).toEqual([
            { name: "import", params: '"x.css"', line: 1 },
            { name: "charset", params: '"utf-8"', line: 2 },
        ]);
    });

    it("reports the declaration line, not the comment above it", () => {
        const { blocks } = parseCss(".a {\n\n    /* why */\n    color: red;\n}\n");
        expect(blocks[0].decls[0].line).toBe(4);
    });

    it("keeps a comment out of the parsed value", () => {
        const { blocks } = parseCss(".a { color: red /* nope */; }");
        expect(blocks[0].decls[0].value).toBe("red");
    });

    it("does not split on a semicolon inside url() or a string", () => {
        const { blocks, errors } = parseCss('.a { background: url("a;b.png"); content: "x;y"; }');
        expect(errors).toEqual([]);
        expect(blocks[0].decls.map((d) => d.prop)).toEqual(["background", "content"]);
    });

    it("does not open a block on a brace inside a string", () => {
        const { blocks, errors } = parseCss('.a { content: "{"; color: red; }');
        expect(errors).toEqual([]);
        expect(blocks).toHaveLength(1);
    });

    it("records offsets that point at the declaration text", () => {
        const text = ".a {\n    color: red;\n}\n";
        const { blocks } = parseCss(text);
        const decl = blocks[0].decls[0];
        expect(text.slice(decl.start, decl.end)).toBe("color: red;");
        expect(text.slice(blocks[0].start, blocks[0].end)).toBe(text.trimEnd());
    });
});

describe("parseCss — syntax defects", () => {
    it("flags a declaration with no colon", () => {
        expect(codes(".a { color red; }")).toEqual(["missing-colon"]);
    });

    it("flags an empty value", () => {
        expect(codes(".a { color: ; }")).toEqual(["empty-value"]);
    });

    it("flags a block that is never closed", () => {
        expect(codes(".a {\n  color: red;\n")).toEqual(["unclosed-block"]);
    });

    it("flags a stray closing brace and keeps parsing after it", () => {
        const { blocks, errors } = parseCss("}\n.a { color: red; }\n");
        expect(errors.map((e) => e.code)).toEqual(["unexpected-brace"]);
        expect(blocks).toHaveLength(1);
    });

    it("flags an unterminated comment", () => {
        expect(codes(".a { color: red; }\n/* forever")).toEqual(["unterminated-comment"]);
    });

    it("flags an unterminated string", () => {
        expect(codes('.a { content: "oops;\n}')).toContain("unterminated-string");
    });

    it("flags an unbalanced paren", () => {
        expect(codes(".a { width: calc(1px + 2px;\n}\n")).toContain("unterminated-paren");
    });

    it("flags a declaration outside any rule", () => {
        expect(codes("color: red;\n")).toEqual(["declaration-outside-rule"]);
    });

    it("flags a selector with no block", () => {
        expect(codes(".a { color: red; }\n.b\n")).toEqual(["missing-brace"]);
    });

    it("flags an empty selector", () => {
        expect(codes("{ color: red; }")).toEqual(["empty-selector"]);
    });

    it("accepts a clean sheet", () => {
        expect(codes(".a { color: red; }\n@media print { .a { color: black; } }\n")).toEqual([]);
    });
});

describe("stripComments / maskValue", () => {
    it("removes comments and keeps strings", () => {
        expect(stripComments('a /* x */ b "c/* d */"')).toBe('a   b "c/* d */"');
    });

    it("masks parens and strings without changing length, keeping the function name", () => {
        const value = 'url("a:b") red';
        expect(maskValue(value)).toHaveLength(value.length);
        expect(maskValue(value)).not.toContain(":");
        expect(maskValue(value).trim().startsWith("url")).toBe(true);
    });

    it("keeps newlines visible through the mask", () => {
        expect(maskValue("a\nb")).toBe("a\nb");
    });
});

describe("normalizeSelectors", () => {
    it("sorts the list and collapses whitespace", () => {
        expect(normalizeSelectors(".b  >  span , .a")).toEqual([".a", ".b > span"]);
    });

    it("does not split on a comma inside :is()", () => {
        expect(normalizeSelectors(":is(.a, .b) span")).toEqual([":is(.a, .b) span"]);
    });
});
