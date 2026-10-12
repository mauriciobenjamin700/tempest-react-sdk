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

describe("tokenize — a well-formed string that closes across lines stays one token", () => {
    it.each([
        ["bash", `echo "linha 1\nlinha 2" $HOME`, `"linha 1\nlinha 2"`],
        ["bash", `echo 'linha 1\nlinha 2'`, `'linha 1\nlinha 2'`],
        ["bash", `git commit -m "titulo\n\ncorpo"`, `"titulo\n\ncorpo"`],
        ["sql", `INSERT INTO t VALUES ('linha 1\nlinha 2', 3);`, `'linha 1\nlinha 2'`],
        ["html", `<path d="M0 0\n L10 10"/>`, `"M0 0\n L10 10"`],
        ["typescript", "const s = `a\\\nb`; const k = 1;", "`a\\\nb`"],
    ])("keeps the %s string in %j as one token", (language, code, expected) => {
        expect(of(tokenize(code, language), "string")).toEqual([expected]);
        assertLossless(code, language);
    });

    it("does not swallow the rest of the input after a line-continued template", () => {
        const code = "const s = `a\\\nb`;\nconst k = 1;";
        const tokens = tokenize(code, "ts");
        expect(of(tokens, "string")).toEqual(["`a\\\nb`"]);
        expect(of(tokens, "keyword")).toEqual(["const", "const"]);
        expect(of(tokens, "number")).toEqual(["1"]);
        assertLossless(code, "ts");
    });
});

describe("tokenize — a `$` identifier paints as it did before the plain rule", () => {
    it.each(["$type", "$default", "$this"])("keeps %s as plain `$` plus its keyword", (name) => {
        expect(tokenize(name, "ts")).toEqual([
            { kind: "plain", value: "$" },
            { kind: "keyword", value: name.slice(1) },
        ]);
    });
});

describe("tokenize — adjacent plain runs are one token, as in origin/main (#477)", () => {
    const samples: [string, string][] = [
        ["typescript", "const x = 1; // note\nfunction f(a) { return a + 1; }"],
        ["css", ".a { --x: 4px; color: rgb(0 0 0 / 50%); }"],
        ["html", '<a href="/x" class="y">t</a>'],
        ["python", "def f(a):\n    return a + 1"],
    ];

    it.each(samples)("never leaves two plain tokens side by side in %s", (language, code) => {
        const kinds = tokenize(code, language).map((token) => token.kind);
        kinds.forEach((kind, index) => {
            if (index > 0) expect(kinds[index - 1] === "plain" && kind === "plain").toBe(false);
        });
    });

    it("reproduces origin/main's token array for a realistic module", () => {
        const code =
            'import { useState } from "react";\nexport function Counter() {\n    const [n, setN] = useState(0);\n    return n + 1;\n}';
        expect(tokenize(code, "ts")).toEqual([
            { kind: "keyword", value: "import" },
            { kind: "plain", value: " " },
            { kind: "punctuation", value: "{" },
            { kind: "plain", value: " useState " },
            { kind: "punctuation", value: "}" },
            { kind: "plain", value: " " },
            { kind: "keyword", value: "from" },
            { kind: "plain", value: " " },
            { kind: "string", value: '"react"' },
            { kind: "punctuation", value: ";" },
            { kind: "plain", value: "\n" },
            { kind: "keyword", value: "export" },
            { kind: "plain", value: " " },
            { kind: "keyword", value: "function" },
            { kind: "plain", value: " " },
            { kind: "function", value: "Counter" },
            { kind: "punctuation", value: "(" },
            { kind: "punctuation", value: ")" },
            { kind: "plain", value: " " },
            { kind: "punctuation", value: "{" },
            { kind: "plain", value: "\n    " },
            { kind: "keyword", value: "const" },
            { kind: "plain", value: " " },
            { kind: "punctuation", value: "[" },
            { kind: "plain", value: "n" },
            { kind: "punctuation", value: "," },
            { kind: "plain", value: " setN" },
            { kind: "punctuation", value: "]" },
            { kind: "plain", value: " " },
            { kind: "punctuation", value: "=" },
            { kind: "plain", value: " " },
            { kind: "function", value: "useState" },
            { kind: "punctuation", value: "(" },
            { kind: "number", value: "0" },
            { kind: "punctuation", value: ")" },
            { kind: "punctuation", value: ";" },
            { kind: "plain", value: "\n    " },
            { kind: "keyword", value: "return" },
            { kind: "plain", value: " n " },
            { kind: "punctuation", value: "+" },
            { kind: "plain", value: " " },
            { kind: "number", value: "1" },
            { kind: "punctuation", value: ";" },
            { kind: "plain", value: "\n" },
            { kind: "punctuation", value: "}" },
        ]);
    });
});

describe("tokenize — CSS matches a whole word where it stands (#477)", () => {
    it("reads a hyphenated property whole instead of only its tail", () => {
        expect(of(tokenize("font-size: 1rem", "css"), "property")).toEqual(["font-size"]);
        expect(of(tokenize("max-width: 10rem", "css"), "property")).toEqual(["max-width"]);
    });

    it("reads a function name whole", () => {
        expect(of(tokenize("transform: translate3d(0, 0, 0)", "css"), "function")).toEqual([
            "translate3d",
        ]);
    });

    it("reads a hex colour as a number", () => {
        expect(of(tokenize("color: #ff0000", "css"), "number")).toEqual(["#ff0000"]);
        expect(of(tokenize("color: #abc", "css"), "number")).toEqual(["#abc"]);
    });

    it("does not pull a digit out of the middle of an identifier", () => {
        expect(tokenize("h1", "css")).toEqual([{ kind: "plain", value: "h1" }]);
        expect(tokenize(".mt-2", "css")).toEqual([{ kind: "plain", value: ".mt-2" }]);
        expect(of(tokenize(".mt-2 { gap: 1rem }", "css"), "number")).toEqual(["1rem"]);
    });

    it("does not paint a selector or a pseudo-class as a property", () => {
        expect(of(tokenize(".b:hover { color: red }", "css"), "property")).toEqual(["color"]);
        expect(of(tokenize("li:last-child { margin: 1rem }", "css"), "property")).toEqual([
            "margin",
        ]);
        expect(of(tokenize("a::before { content: 'x' }", "css"), "property")).toEqual(["content"]);
        expect(
            of(tokenize("@media (min-width: 40em) { .x { gap: 1rem } }", "css"), "property"),
        ).toEqual(["gap"]);
    });

    it("leaves a property glued to its value plain, as origin/main did", () => {
        expect(of(tokenize(".x { color:red }", "css"), "property")).toEqual([]);
        expect(of(tokenize(".x { width:100% }", "css"), "property")).toEqual([]);
        expect(of(tokenize("a { background: url(http://x/logo.png) }", "css"), "property")).toEqual(
            ["background"],
        );
    });
});

describe("tokenize — a JSX attribute string may hold a line feed (#477)", () => {
    it("keeps a multiline attribute value one string", () => {
        const code = '<input placeholder="Digite seu\n  nome">';
        expect(of(tokenize(code, "tsx"), "string")).toEqual(['"Digite seu\n  nome"']);
        assertLossless(code, "tsx");
    });

    it("reads a single-quoted attribute value", () => {
        expect(of(tokenize("<Button label='Ok' />", "tsx"), "string")).toEqual(["'Ok'"]);
    });

    it("does not open a string on an apostrophe in JSX text", () => {
        const tokens = tokenize("<p>Don't</p>", "tsx");
        expect(of(tokens, "string")).toEqual([]);
        expect(of(tokens, "plain")).toEqual(["Don't"]);
        assertLossless("<p>Don't</p>", "tsx");
    });
});

describe("tokenize — a `$` inside an identifier stays one plain token", () => {
    it("does not paint a keyword, literal or number out of `foo$this` and friends", () => {
        const tokens = tokenize("foo$this a$true x$1", "ts");
        expect(of(tokens, "keyword")).toEqual([]);
        expect(of(tokens, "literal")).toEqual([]);
        expect(of(tokens, "number")).toEqual([]);
        expect(of(tokens, "plain")).toEqual(["foo$this a$true x$1"]);
    });
});

describe("tokenize — every token is consumed in one pass, so the scan is linear (#477)", () => {
    /**
     * Run `work` and return how long it took, in milliseconds.
     *
     * The budget sits well above what a single pass over the input costs under
     * coverage instrumentation and far below what rescanning cost before #477:
     * an unterminated string was rescanned from every later opener, quadratic in
     * the input (`"` plus 40 000 escaped quotes took about 2 s for JSON).
     */
    const elapsed = (work: () => unknown): number => {
        const start = performance.now();
        work();
        return performance.now() - start;
    };

    /** Ceiling for one tokenize of an adversarial input, in milliseconds. */
    const BUDGET_MS = 250;

    it.each([
        ["json", `"${'\\"'.repeat(40_000)}`],
        ["typescript", `"${'\\"'.repeat(40_000)}`],
        ["javascript", `"${'\\"'.repeat(40_000)}`],
        ["tsx", `"${'\\"'.repeat(40_000)}`],
        ["css", "/*x".repeat(40_000)],
        ["html", "<!--".repeat(40_000)],
        ["bash", `"${'\\"'.repeat(40_000)}`],
        ["python", `"${'\\"'.repeat(40_000)}`],
        ["sql", "/*x".repeat(40_000)],
    ])("tokenizes %s with an unterminated opener in linear time", (language, code) => {
        expect(elapsed(() => tokenize(code, language))).toBeLessThan(BUDGET_MS);
    });

    it("runs an unterminated string to the end of its line, not the input", () => {
        const code = 'a = "sem fim\nb = 1';
        expect(of(tokenize(code, "ts"), "string")).toEqual(['"sem fim']);
        assertLossless(code, "ts");
    });

    it("runs an unterminated block comment to the end of the input as one token", () => {
        const code = "code\n/* sem fim\nmais";
        expect(of(tokenize(code, "ts"), "comment")).toEqual(["/* sem fim\nmais"]);
        assertLossless(code, "ts");
    });

    it.each([
        ["typescript", "a".repeat(80_000)],
        ["tsx", "a".repeat(80_000)],
        ["css", "-".repeat(80_000)],
        ["html", `<a ${"x".repeat(80_000)}`],
        ["python", "a".repeat(80_000)],
    ])("consumes a long %s identifier run in one pass", (language, code) => {
        expect(elapsed(() => tokenize(code, language))).toBeLessThan(BUDGET_MS);
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
