import { describe, expect, it } from "vitest";

import { fixCss } from "./fix.mjs";
import { parseCss } from "./parse.mjs";

const fix = (text, isModule = false) => fixCss({ text, parsed: parseCss(text), isModule });

describe("fixCss — duplicate declarations", () => {
    it("removes the earlier copy and keeps the cascade position of the later one", () => {
        const { text, changes } = fix(
            ".a {\n    color: red;\n    padding: 0;\n    color: red;\n}\n",
        );
        expect(text).toBe(".a {\n    padding: 0;\n    color: red;\n}\n");
        expect(changes).toEqual([
            {
                code: "duplicate-declaration",
                line: 2,
                message: "removed duplicate `color` — line 4 declares the same value",
            },
        ]);
    });

    it("treats values that differ only in whitespace or case as the same", () => {
        const { text } = fix(".a {\n    color:   RED;\n    color: red;\n}\n");
        expect(text).toBe(".a {\n    color: red;\n}\n");
    });

    it("leaves an override with a different value alone", () => {
        const text = ".a {\n    color: red;\n    color: blue;\n}\n";
        expect(fix(text).text).toBe(text);
    });

    it("keeps a declaration that is duplicated in a different rule", () => {
        const text = ".a { color: red; }\n.b { color: red; }\n";
        expect(fix(text).text).toBe(text);
    });
});

describe("fixCss — duplicate rules", () => {
    it("removes an exact earlier repeat", () => {
        const { text, changes } = fix(".a {\n    color: red;\n}\n.a {\n    color: red;\n}\n");
        expect(text).toBe(".a {\n    color: red;\n}\n");
        expect(changes[0].code).toBe("duplicate-rule");
    });

    it("keeps two rules that declare different values", () => {
        const text = ".a {\n    color: red;\n}\n.a {\n    color: blue;\n}\n";
        expect(fix(text).text).toBe(text);
    });

    it("does not merge rules across at-rule contexts", () => {
        const text =
            ".a {\n    color: red;\n}\n@media print {\n    .a {\n        color: red;\n    }\n}\n";
        expect(fix(text).text).toBe(text);
    });

    it("does not apply an inner and an outer removal that overlap", () => {
        const { text, changes } = fix(
            ".a {\n    color: red;\n    color: red;\n}\n.a {\n    color: red;\n    color: red;\n}\n",
        );
        expect(text).toBe(".a {\n    color: red;\n}\n");
        expect(changes.map((c) => c.code)).toContain("duplicate-rule");
    });
});

describe("fixCss — empty rules", () => {
    it("removes an empty rule from a plain sheet", () => {
        const { text, changes } = fix(".a {\n    color: red;\n}\n.gone {\n}\n");
        expect(text).toBe(".a {\n    color: red;\n}\n");
        expect(changes[0].code).toBe("empty-rule");
    });

    it("keeps an empty rule in a CSS Module", () => {
        const text = ".marker {\n}\n";
        expect(fix(text, true).text).toBe(text);
    });

    it("keeps a rule that only holds nested rules", () => {
        const text = ".a {\n    &:hover {\n        color: red;\n    }\n}\n";
        expect(fix(text).text).toBe(text);
    });
});

describe("fixCss — refusals", () => {
    it("refuses to touch a sheet with a syntax error", () => {
        const text = ".a {\n    color: red;\n    color: red;\n";
        const { text: out, changes } = fix(text);
        expect(out).toBe(text);
        expect(changes).toEqual([]);
    });

    it("returns the input unchanged when there is nothing to remove", () => {
        const text = ".a {\n    color: red;\n}\n";
        const result = fix(text);
        expect(result.text).toBe(text);
        expect(result.changes).toEqual([]);
    });

    it("keeps the comment above a surviving declaration", () => {
        const { text } = fix(".a {\n    color: red;\n    /* why */\n    color: red;\n}\n");
        expect(text).toBe(".a {\n    /* why */\n    color: red;\n}\n");
    });

    it("survives a one-line rule", () => {
        const { text } = fix(".a { color: red; color: red; }\n");
        expect(text).toBe(".a { color: red; }\n");
    });
});
