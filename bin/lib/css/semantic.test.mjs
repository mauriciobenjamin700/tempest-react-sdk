import { describe, expect, it } from "vitest";

import { parseCss } from "./parse.mjs";
import { analyzeParsed, declSignature, definedCustomProperties } from "./semantic.mjs";

const TOKENS = {
    names: new Set(["--tempest-space-2", "--tempest-primary", "--tempest-text"]),
    byValue: new Map([
        ["8px", ["--tempest-space-2"]],
        ["#0d6efd", ["--tempest-primary"]],
        ["4px", ["--tempest-space-1", "--tempest-radius-sm"]],
    ]),
    utilities: new Set(),
};

const analyze = (text, options = {}) =>
    analyzeParsed({
        file: "src/a.css",
        parsed: parseCss(text),
        tokens: TOKENS,
        definedVars: new Set([...TOKENS.names, ...(options.defined ?? [])]),
        isModule: options.isModule ?? false,
    });

const codes = (text, options) => analyze(text, options).map((f) => f.code);
const first = (text, code, options) => analyze(text, options).find((f) => f.code === code);

describe("analyzeParsed — syntax passthrough", () => {
    it("turns parser codes into findings with a message and a line", () => {
        const [found] = analyze(".a { color: ; }");
        expect(found).toMatchObject({ code: "empty-value", severity: "error", line: 1 });
        expect(found.message).toContain("empty value");
    });

    it("flags a missing semicolon that swallows the next declarations", () => {
        const found = first(".a {\n    padding: 8px\n    margin: 0;\n}\n", "missing-semicolon");
        expect(found).toMatchObject({ severity: "error", line: 2 });
    });

    it("does not mistake a multi-line value for a missing semicolon", () => {
        expect(
            codes(".a {\n    grid-template-columns: repeat(\n        2,\n        1fr\n    );\n}\n"),
        ).toEqual([]);
    });
});

describe("analyzeParsed — duplicate declarations", () => {
    it("flags the same property with the same value twice", () => {
        const found = first(".a { color: red; color: red; }", "duplicate-declaration");
        expect(found).toMatchObject({ severity: "warn", fixable: true });
    });

    it("flags an override with a different value in the same rule", () => {
        const found = first(".a { color: red; color: blue; }", "overridden-declaration");
        expect(found.fixable).toBe(false);
        expect(found.message).toContain("overrides");
    });

    it("accepts a var() fallback after a literal", () => {
        expect(codes(".a { color: #0d6efd; color: var(--tempest-primary); }")).toEqual([
            "hardcoded-token-value",
        ]);
    });

    it("accepts a vendor-prefixed value before the standard one", () => {
        expect(codes(".a { display: -webkit-box; display: flex; }")).toEqual([]);
    });

    it("accepts an !important escalation", () => {
        expect(codes(".a { color: red; color: blue !important; }")).toEqual([]);
    });
});

describe("analyzeParsed — duplicate selectors", () => {
    it("flags a selector declared twice with overlapping properties", () => {
        const found = first(".a { color: red; }\n.a { color: blue; }\n", "duplicate-selector");
        expect(found).toMatchObject({ line: 2 });
        expect(found.message).toContain("color");
    });

    it("flags a selector split across two rules with no overlap", () => {
        const found = first(".a { color: red; }\n.a { padding: 0; }\n", "duplicate-selector");
        expect(found.message).toContain("merge them");
    });

    it("flags an exact repeat as a duplicate rule, and marks it fixable", () => {
        const found = first(".a { color: red; }\n.a { color: red; }\n", "duplicate-rule");
        expect(found).toMatchObject({ fixable: true, line: 2 });
    });

    it("treats a reordered selector list as the same rule", () => {
        expect(codes(".a, .b { color: red; }\n.b, .a { color: blue; }\n")).toContain(
            "duplicate-selector",
        );
    });

    it("does not compare rules across different at-rule contexts", () => {
        expect(codes(".a { color: red; }\n@media print {\n  .a { color: black; }\n}\n")).toEqual(
            [],
        );
    });
});

describe("analyzeParsed — names", () => {
    it("flags a misspelled property when a real one is close", () => {
        const found = first(".a { bacground-color: red; }", "unknown-property");
        expect(found.message).toContain("background-color");
    });

    it("stays silent on a property it simply does not know", () => {
        expect(codes(".a { anchor-scope: all; }")).toEqual([]);
    });

    it("ignores vendor prefixes and custom properties", () => {
        expect(codes(".a { -webkit-line-clamp: 2; --my-own: 1; }")).toEqual([]);
    });

    it("flags a misspelled at-rule", () => {
        const found = first("@medai (min-width: 1px) { .a { color: red; } }", "unknown-at-rule");
        expect(found.message).toContain("@media");
    });

    it("accepts modern at-rules", () => {
        expect(codes("@layer base {\n  .a { color: red; }\n}\n")).toEqual([]);
    });
});

describe("analyzeParsed — custom properties", () => {
    it("flags an SDK token that does not exist, and suggests the nearest", () => {
        const found = first(".a { gap: var(--tempest-space-3); }", "unknown-token");
        expect(found.message).toContain("--tempest-space-2");
    });

    it("accepts a `--tempest-*` knob that carries a fallback", () => {
        // `var(--tempest-card-padding, …)` is the SDK's own override idiom: the name
        // is not a token, it is a hook an app may set. A fallback means it renders.
        expect(codes(".a { gap: var(--tempest-card-padding, 8px); }")).toEqual([]);
    });

    it("flags a var() nobody defines when there is no fallback", () => {
        const found = first(".a { width: var(--nope); }", "undefined-var");
        expect(found.severity).toBe("warn");
    });

    it("accepts a var() defined elsewhere in the project", () => {
        expect(codes(".a { width: var(--row-height); }", { defined: ["--row-height"] })).toEqual(
            [],
        );
    });

    it("accepts a var() with a fallback", () => {
        expect(codes(".a { width: var(--row-height, 40px); }")).toEqual([]);
    });

    it("accepts a var() the same sheet defines", () => {
        const text = ":root { --mine: 4px; }\n.a { gap: var(--mine); }\n";
        const parsed = parseCss(text);
        expect(definedCustomProperties(parsed)).toEqual(new Set(["--mine"]));
    });
});

describe("analyzeParsed — token suggestions", () => {
    it("suggests the token whose value matches exactly", () => {
        const found = first(".a { gap: 8px; }", "hardcoded-token-value");
        expect(found).toMatchObject({ severity: "info" });
        expect(found.message).toContain("var(--tempest-space-2)");
    });

    it("stays silent when the value belongs to more than one token", () => {
        expect(codes(".a { gap: 4px; }")).toEqual([]);
    });

    it("stays silent for properties nobody themes", () => {
        expect(codes(".a { width: 8px; }")).toEqual([]);
    });
});

describe("analyzeParsed — empty rules", () => {
    it("flags an empty rule in a plain sheet as fixable", () => {
        const found = first(".a {}\n", "empty-rule");
        expect(found.fixable).toBe(true);
    });

    it("never removes an empty rule in a CSS Module", () => {
        const found = first(".a {}\n", "empty-rule", { isModule: true });
        expect(found.fixable).toBe(false);
        expect(found.message).toContain("marker class");
    });

    it("does not call a rule with nested children empty", () => {
        expect(codes(".a {\n  &:hover { color: red; }\n}\n")).toEqual([]);
    });
});

describe("declSignature", () => {
    it("ignores declaration order, case and whitespace", () => {
        const a = parseCss(".x { color: RED; padding:  0 ; }").blocks[0];
        const b = parseCss(".y { padding: 0; color: red; }").blocks[0];
        expect(declSignature(a)).toBe(declSignature(b));
    });
});
