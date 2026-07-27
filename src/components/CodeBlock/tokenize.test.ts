import { describe, expect, it } from "vitest";

import { resolveLanguage, tokenize, tokenizeLines } from "./tokenize";
import type { Token, TokenKind } from "./tokenize";

/** The tokens of one kind, so a test can name what it cares about. */
const of = (tokens: Token[], kind: TokenKind) =>
    tokens.filter((token) => token.kind === kind).map((token) => token.value);

/** Tokens must cover the input exactly — this is the invariant that matters. */
function assertLossless(code: string, language: string) {
    expect(
        tokenize(code, language)
            .map((token) => token.value)
            .join(""),
    ).toBe(code);
}

describe("resolveLanguage", () => {
    it("maps the aliases people actually type", () => {
        expect(resolveLanguage("ts")).toBe("typescript");
        expect(resolveLanguage("SH")).toBe("bash");
        expect(resolveLanguage("py")).toBe("python");
        expect(resolveLanguage("jsonc")).toBe("json");
    });

    it("falls back to plain rather than failing on an unknown language", () => {
        expect(resolveLanguage("brainfuck")).toBe("plain");
        expect(resolveLanguage(undefined)).toBe("plain");
        expect(resolveLanguage("")).toBe("plain");
    });
});

describe("tokenize — never loses or invents characters", () => {
    const samples: [string, string][] = [
        ["typescript", "const x: number = 1; // note\nexport function f() { return `a${x}b`; }"],
        ["tsx", '<Button onClick={() => save()} label="Ok" />'],
        ["json", '{"a": 1, "b": [true, null], "c": "s"}'],
        ["css", ".a { --x: 4px; color: rgb(0 0 0 / 50%); } /* c */"],
        ["html", "<a href=\"/x\" class='y'>t</a><!-- c -->"],
        ["bash", "npm run build --watch # go\nexport A=$HOME"],
        ["python", 'def f(a):\n    """doc"""\n    return None if a else True'],
        ["sql", "SELECT * FROM t WHERE a = 'x' -- c"],
        ["plain", "anything at all\nsecond line"],
    ];

    for (const [language, code] of samples) {
        it(`is lossless for ${language}`, () => {
            assertLossless(code, language);
        });
    }

    it("is lossless for an unknown language", () => {
        assertLossless("<<< weird ??? >>>", "cobol");
    });

    it("returns nothing for empty input", () => {
        expect(tokenize("", "ts")).toEqual([]);
        expect(tokenize("", "cobol")).toEqual([]);
    });

    it("emits a single plain token for an unknown language", () => {
        expect(tokenize("a b c", "cobol")).toEqual([{ kind: "plain", value: "a b c" }]);
    });
});

describe("tokenize — the JavaScript family", () => {
    it("finds keywords, strings, numbers and comments", () => {
        const tokens = tokenize('const n = 42; // hi\nlet s = "x";', "ts");
        expect(of(tokens, "keyword")).toEqual(["const", "let"]);
        expect(of(tokens, "number")).toEqual(["42"]);
        expect(of(tokens, "string")).toEqual(['"x"']);
        expect(of(tokens, "comment")).toEqual(["// hi"]);
    });

    it("keeps a keyword inside a string a string — order of rules matters", () => {
        const tokens = tokenize('const s = "return const";', "ts");
        expect(of(tokens, "string")).toEqual(['"return const"']);
        expect(of(tokens, "keyword")).toEqual(["const"]);
    });

    it("keeps code inside a comment a comment", () => {
        const tokens = tokenize("// const x = 1\nlet y", "ts");
        expect(of(tokens, "comment")).toEqual(["// const x = 1"]);
        expect(of(tokens, "keyword")).toEqual(["let"]);
    });

    it("spans a block comment across lines as one token", () => {
        expect(of(tokenize("/* a\nb */\nlet x", "ts"), "comment")).toEqual(["/* a\nb */"]);
    });

    it("handles a template literal with an interpolation", () => {
        expect(of(tokenize("const s = `a${b}c`;", "ts"), "string")).toEqual(["`a${b}c`"]);
    });

    it("does not treat a keyword prefix as a keyword", () => {
        // "constant" starts with "const" — a word boundary is what stops it.
        expect(of(tokenize("constant = 1", "ts"), "keyword")).toEqual([]);
    });

    it("marks a call as a function", () => {
        expect(of(tokenize("save(1)", "ts"), "function")).toEqual(["save"]);
    });

    it("reads JSX tags in tsx but not in ts", () => {
        expect(of(tokenize("<Button />", "tsx"), "tag")).toEqual(["<Button", "/>"]);
        expect(of(tokenize("<Button />", "ts"), "tag")).toEqual([]);
    });

    it("reads hex and separated numbers", () => {
        expect(of(tokenize("0xFF + 1_000", "ts"), "number")).toEqual(["0xFF", "1_000"]);
    });
});

describe("tokenize — the other grammars", () => {
    it("separates a JSON key from a JSON string value", () => {
        const tokens = tokenize('{"a": "b"}', "json");
        expect(of(tokens, "property")).toEqual(['"a"']);
        expect(of(tokens, "string")).toEqual(['"b"']);
    });

    it("reads CSS custom properties and at-rules", () => {
        const tokens = tokenize("@media x { --a: 1px; }", "css");
        expect(of(tokens, "keyword")).toEqual(["@media"]);
        expect(of(tokens, "property")).toEqual(["--a"]);
        expect(of(tokens, "number")).toEqual(["1px"]);
    });

    it("reads HTML tags and attributes", () => {
        const tokens = tokenize('<img src="a.png">', "html");
        expect(of(tokens, "tag")).toEqual(["<img"]);
        expect(of(tokens, "attribute")).toEqual(["src"]);
    });

    it("reads shell variables and flags", () => {
        const tokens = tokenize("echo $HOME --force", "bash");
        expect(of(tokens, "property")).toEqual(["$HOME"]);
        expect(of(tokens, "attribute")).toEqual(["--force"]);
    });

    it("reads a Python triple-quoted docstring as one string", () => {
        expect(of(tokenize('"""a\nb"""', "python"), "string")).toEqual(['"""a\nb"""']);
    });

    it("reads SQL keywords in either case", () => {
        expect(of(tokenize("select FROM", "sql"), "keyword")).toEqual(["select", "FROM"]);
    });

    it("reads a doubled quote inside a SQL string", () => {
        expect(of(tokenize("'it''s'", "sql"), "string")).toEqual(["'it''s'"]);
    });
});

describe("tokenizeLines", () => {
    it("splits tokens at newlines so each line stands alone", () => {
        const lines = tokenizeLines("const a = 1;\nconst b = 2;", "ts");
        expect(lines).toHaveLength(2);
        expect(lines[0].map((t) => t.value).join("")).toBe("const a = 1;");
        expect(lines[1].map((t) => t.value).join("")).toBe("const b = 2;");
    });

    it("splits a token that itself spans lines", () => {
        // A block comment is one token but has to render on two lines.
        const lines = tokenizeLines("/* a\nb */", "ts");
        expect(lines).toHaveLength(2);
        expect(lines[0][0]).toEqual({ kind: "comment", value: "/* a" });
        expect(lines[1][0]).toEqual({ kind: "comment", value: "b */" });
    });

    it("keeps a blank line as an empty line, not a dropped one", () => {
        const lines = tokenizeLines("a\n\nb", "plain");
        expect(lines).toHaveLength(3);
        expect(lines[1]).toEqual([]);
    });

    it("always returns at least one line", () => {
        expect(tokenizeLines("", "ts")).toEqual([[]]);
    });

    it("preserves the source exactly when joined back", () => {
        const code = "function f() {\n  // x\n\n  return 1;\n}";
        const joined = tokenizeLines(code, "ts")
            .map((line) => line.map((t) => t.value).join(""))
            .join("\n");
        expect(joined).toBe(code);
    });
});
