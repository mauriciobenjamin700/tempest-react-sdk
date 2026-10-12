/** What a token is painted as. */
export type TokenKind =
    | "plain"
    | "comment"
    | "string"
    | "number"
    | "keyword"
    | "literal"
    | "function"
    | "punctuation"
    | "tag"
    | "attribute"
    | "property";

export interface Token {
    kind: TokenKind;
    value: string;
}

/** Languages the tokenizer knows. Anything else renders as plain text. */
export type CodeLanguage =
    | "typescript"
    | "javascript"
    | "tsx"
    | "jsx"
    | "json"
    | "css"
    | "html"
    | "bash"
    | "python"
    | "sql"
    | "plain";

/** Aliases people actually type, mapped onto the grammars above. */
const ALIASES: Record<string, CodeLanguage> = {
    ts: "typescript",
    typescript: "typescript",
    js: "javascript",
    javascript: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    tsx: "tsx",
    jsx: "jsx",
    json: "json",
    jsonc: "json",
    css: "css",
    scss: "css",
    html: "html",
    xml: "html",
    svg: "html",
    sh: "bash",
    bash: "bash",
    shell: "bash",
    zsh: "bash",
    console: "bash",
    py: "python",
    python: "python",
    sql: "sql",
};

/**
 * Normalise a language name onto a known grammar.
 *
 * @param language - Whatever the caller passed, e.g. `"ts"` or `"Shell"`.
 * @returns The grammar to use; `"plain"` when there is no match.
 */
export function resolveLanguage(language: string | undefined): CodeLanguage {
    if (!language) return "plain";
    return ALIASES[language.toLowerCase()] ?? "plain";
}

/** One grammar rule: a sticky pattern and the kind it produces. */
interface Rule {
    kind: TokenKind;
    pattern: RegExp;
}

const JS_KEYWORDS =
    "as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|keyof|let|new|of|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield";

const JS_LITERALS = "true|false|null|undefined|NaN|Infinity";

/**
 * Rules per grammar, tried in order at each position.
 *
 * Order carries meaning: comments and strings come first so a keyword inside a
 * string stays a string. Every pattern is sticky (`y`) and anchored by
 * `lastIndex`, so a rule can only match where the scanner currently stands.
 *
 * Every string and comment pattern makes its closing delimiter **optional** —
 * `"..."?`, `/*...*?` / `<!--...--?` — so an unterminated opener is consumed as a
 * single token instead of failing and being rescanned from the next opener.
 * Without that, a `"` followed by many escaped quotes was re-read to the end of
 * the input from each opening quote, quadratic in the input (#477).
 *
 * A well-formed string that closes on a later line stays one token where the
 * language allows the newline: bash, SQL, HTML and the JavaScript template
 * literal carry a raw `\n`, and every grammar lets an escape cross the line feed
 * (`\\[\s\S]`), so `"a\` + LF + `b"` is one string. A quote string that cannot
 * hold a raw newline — the JavaScript and JSON `"`/`'`, CSS, the Python
 * `"`/`'` — still ends at the line when it is unterminated, which is the only
 * case the optional close cuts at the line. A JSX attribute value is the
 * exception in the JavaScript family: `="…"` has its own rule, ahead of the
 * plain JS strings, so it may hold a raw line feed — `<input placeholder="a` +
 * LF + `b">` is one string where the plain JS rule would have ended it at the
 * line. The rule matches at the `=` and looks behind for it, so `=` keeps its
 * paint; `(?<==\s)` covers the spaced `= "…"` form too.
 *
 * Each grammar also ends with a `plain` rule that consumes a run of identifier
 * characters in one step. The rules that need a lookahead — the JavaScript
 * `function`, the HTML `attribute`, the CSS `property` and `function`, the
 * Python `function` — match a whole run and then fail if the character after it
 * is not the expected one; with only `at++` to fall back on, the scanner retried
 * that run from every character in it. A code fence holding a long run of word
 * characters and no punctuation (a base64 blob, a minified token) took 6 s at
 * 80 KB and 25 s at 160 KB; the fallback consumes the run once, so the scan
 * stays linear (#477 sweep).
 *
 * The `plain` rule matches an identifier run while the scanner's fallback
 * collects whatever no rule matched, so one plain stretch arrives in pieces;
 * `tokenize` fuses adjacent `plain` tokens back into one, which is the array
 * shape — and the one span per run — that predates the fallback (#477).
 *
 * The JavaScript fallback does **not** start at `$` — it takes a `$` run and an
 * identifier run separately — so a leading `$type`, `$default` and `$this` keep
 * the `$` plain and the name a keyword. Inside an identifier the `$` is an
 * ordinary character, so `foo$this`, `a$true` and `x$1` are one `plain` token
 * instead of painting `this`, `true` and `1` out of them; the `'` string rule
 * carries the same boundary in a lookbehind, so an apostrophe in prose
 * (`Don't`) does not open a string that runs to the end of the input.
 *
 * The same boundary closes the JavaScript keyword, literal and number rules:
 * they end at `(?![\w$])` rather than `\b`, because `\b` holds before a `$`, so
 * `if$foo` would paint `if` and leave the scanner standing on the `$` in the
 * middle of the identifier. The `function` rule only starts where no identifier
 * character precedes it (`(?<![\w$])`). Without that lookbehind a rule that
 * stopped inside a run — the leading-`$` split above stops at every `$1` of
 * `$1$1$1…` — handed the rest of the run to `function`, which read it to the end
 * and failed for want of a `(`, once per `$`: 80 KB of `$1` took 2.8 s and
 * 120 KB of `if$` 4.2 s (#498). With both boundaries every rule that can start
 * inside a run fails at once or consumes a bounded piece of it, so each run is
 * read a constant number of times and `if$foo(`, `this$x(` and `true$y(` paint
 * as the one called identifier they are.
 *
 * The CSS `property` and `function` rules match a whole word where it stands —
 * `font-size` and `translate3d` paint as one token rather than splitting the
 * tail — and a `#rgb`/`#rrggbb` colour paints as a number. A word before a
 * colon only counts as a property when the colon starts a value boundary
 * (whitespace, `;`, `}`): after a `.`/`#`/`(`/`,`/`>`/`+`/`~`/`:` it is a
 * selector, and when the colon is followed by an identifier character it could
 * be a pseudo-class (`li:hover`) or a declaration with no space (`color:red`) —
 * neither can be told apart without a parser, so both stay `plain`, which is
 * what `origin/main` painted (`#477`).
 */
const GRAMMARS: Record<CodeLanguage, Rule[]> = {
    typescript: jsRules(false),
    javascript: jsRules(false),
    tsx: jsRules(true),
    jsx: jsRules(true),
    json: [
        { kind: "property", pattern: /"(?:[^"\\\n]|\\[\s\S])*"(?=\s*:)/y },
        { kind: "string", pattern: /"(?:[^"\\\n]|\\[\s\S])*"?/y },
        { kind: "number", pattern: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
        { kind: "literal", pattern: /\b(?:true|false|null)\b/y },
        { kind: "punctuation", pattern: /[{}[\],:]/y },
    ],
    css: [
        { kind: "comment", pattern: /\/\*[\s\S]*?(?:\*\/|$)/y },
        { kind: "string", pattern: /"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?/y },
        { kind: "keyword", pattern: /@[a-zA-Z-]+/y },
        { kind: "property", pattern: /(?<![.#[\](),>+~:])[\w-]+(?=\s*:(?![\w/:]))/y },
        { kind: "function", pattern: /[\w-]+(?=\()/y },
        { kind: "number", pattern: /#[0-9a-fA-F]{3,8}\b/y },
        { kind: "number", pattern: /(?<![\w-])-?\d+(?:\.\d+)?(?:px|rem|em|%|s|ms|vh|vw|fr|deg)?/y },
        { kind: "punctuation", pattern: /[{}();:,>+~]/y },
        { kind: "plain", pattern: /[\w-]+/y },
    ],
    html: [
        { kind: "comment", pattern: /<!--[\s\S]*?(?:-->|$)/y },
        { kind: "string", pattern: /"(?:[^"\\]|\\[\s\S])*"?|'(?:[^'\\]|\\[\s\S])*'?/y },
        { kind: "tag", pattern: /<\/?[a-zA-Z][\w:-]*/y },
        { kind: "attribute", pattern: /[a-zA-Z][\w:-]*(?==)/y },
        { kind: "punctuation", pattern: /\/?>|=/y },
        { kind: "plain", pattern: /[a-zA-Z][\w:-]*/y },
    ],
    bash: [
        { kind: "comment", pattern: /#[^\n]*/y },
        { kind: "string", pattern: /"(?:[^"\\]|\\[\s\S])*"?|'[^']*'?/y },
        {
            kind: "keyword",
            pattern:
                /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|local|source|set|cd|echo)\b/y,
        },
        { kind: "property", pattern: /\$\{?[A-Za-z_][\w]*\}?/y },
        { kind: "attribute", pattern: /(?<=\s)--?[a-zA-Z][\w-]*/y },
        { kind: "punctuation", pattern: /[|&;()<>]/y },
    ],
    python: [
        { kind: "comment", pattern: /#[^\n]*/y },
        {
            kind: "string",
            pattern:
                /"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?/y,
        },
        {
            kind: "keyword",
            pattern:
                /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/y,
        },
        { kind: "literal", pattern: /\b(?:True|False|None|self)\b/y },
        { kind: "number", pattern: /\b\d+(?:\.\d+)?\b/y },
        { kind: "function", pattern: /[A-Za-z_]\w*(?=\()/y },
        { kind: "punctuation", pattern: /[{}[\]().,:;=+\-*/<>!]/y },
        { kind: "plain", pattern: /[A-Za-z_]\w*/y },
    ],
    sql: [
        { kind: "comment", pattern: /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y },
        { kind: "string", pattern: /'(?:[^']|'')*'?/y },
        {
            kind: "keyword",
            // Case-insensitive: SQL is written both ways and both should paint.
            pattern:
                /\b(?:select|from|where|insert|into|values|update|set|delete|create|table|alter|drop|index|join|inner|left|right|outer|on|group|by|order|having|limit|offset|as|and|or|not|in|is|null|distinct|union|all|with|returning|primary|key|foreign|references|default)\b/iy,
        },
        { kind: "number", pattern: /\b\d+(?:\.\d+)?\b/y },
        { kind: "punctuation", pattern: /[(),;*=<>]/y },
    ],
    plain: [],
};

/** The shared JavaScript-family rules, with JSX tags added for tsx/jsx. */
function jsRules(withJsx: boolean): Rule[] {
    const rules: Rule[] = [
        { kind: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y },
        {
            kind: "string",
            pattern:
                /`(?:[^`\\]|\\[\s\S])*`?|"(?:[^"\\\n]|\\[\s\S])*"?|(?<![\w$])'(?:[^'\\\n]|\\[\s\S])*'?/y,
        },
        { kind: "keyword", pattern: new RegExp(`\\b(?:${JS_KEYWORDS})(?![\\w$])`, "y") },
        { kind: "literal", pattern: new RegExp(`\\b(?:${JS_LITERALS})(?![\\w$])`, "y") },
        {
            kind: "number",
            pattern: /\b(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)(?![\w$])/y,
        },
        { kind: "function", pattern: /(?<![\w$])[A-Za-z_$][\w$]*(?=\s*\()/y },
        { kind: "punctuation", pattern: /[{}[\]().,;:?!=<>+\-*/%&|^~]/y },
        { kind: "plain", pattern: /(?:[A-Za-z_][\w$]*|\$+)/y },
    ];
    if (withJsx) {
        rules.splice(
            1,
            0,
            { kind: "string", pattern: /(?:(?<==)|(?<==\s))"[^"]*"?/y },
            { kind: "string", pattern: /(?:(?<==)|(?<==\s))'[^']*'?/y },
        );
        rules.splice(4, 0, { kind: "tag", pattern: /<\/?[A-Za-z][\w.]*|\/>/y });
    }
    return rules;
}

/**
 * Split source into coloured tokens.
 *
 * This is a **scanner, not a parser**: it recognises comments, strings, numbers,
 * keywords and punctuation by pattern, and knows nothing about scope, types or
 * grammar. That is a deliberate ceiling. A real parser per language is a
 * dependency the size of the rest of the SDK, and the payoff — being right about
 * the corner cases in a documentation snippet — is small. Where it is unsure it
 * emits `plain`, which renders as ordinary text rather than as something wrong.
 *
 * Unknown languages produce a single `plain` token, so an unhighlighted block is
 * a normal outcome and never an error.
 *
 * The scan is linear in the source: an unterminated string or comment becomes a
 * single token that runs to its close, or to the end of the input — or, for a
 * quote that cannot hold a newline and never closes, to the end of the line — so
 * the openers inside it are never rescanned (#477).
 *
 * @param code - The source.
 * @param language - Grammar name or alias.
 * @returns Tokens covering the input exactly, in order.
 *
 * @example
 * tokenize("const x = 1;", "ts");
 * // [{kind: "keyword", value: "const"}, {kind: "plain", value: " "}, …]
 */
export function tokenize(code: string, language: string | undefined): Token[] {
    const rules = GRAMMARS[resolveLanguage(language)];
    if (rules.length === 0) return code === "" ? [] : [{ kind: "plain", value: code }];

    const tokens: Token[] = [];
    let plainFrom = 0;
    let at = 0;

    /**
     * Append a token, fusing it with the previous one when both are `plain`.
     *
     * The `plain` rule matches an identifier run while the scanner's fallback
     * collects the characters no rule matched, so one plain stretch of source
     * arrives in pieces. Fusing them keeps the array shape `origin/main`
     * produced, where a plain run was a single token and each got one span in
     * the DOM rather than one per identifier (#477).
     */
    const push = (token: Token) => {
        const last = tokens[tokens.length - 1];
        if (last && last.kind === "plain" && token.kind === "plain") {
            last.value += token.value;
        } else {
            tokens.push(token);
        }
    };

    const flushPlain = (until: number) => {
        if (until > plainFrom) push({ kind: "plain", value: code.slice(plainFrom, until) });
    };

    while (at < code.length) {
        let matched: Token | null = null;
        for (const rule of rules) {
            rule.pattern.lastIndex = at;
            const found = rule.pattern.exec(code);
            if (found && found[0].length > 0) {
                matched = { kind: rule.kind, value: found[0] };
                break;
            }
        }
        if (matched) {
            flushPlain(at);
            push(matched);
            at += matched.value.length;
            plainFrom = at;
        } else {
            at++;
        }
    }
    flushPlain(code.length);
    return tokens;
}

/**
 * The same tokens, split at newlines so each line can be rendered on its own.
 *
 * Line numbers and highlighted lines both need a per-line structure, and a token
 * is free to span a line break — a block comment usually does. Splitting here
 * keeps that out of the component.
 *
 * @param code - The source.
 * @param language - Grammar name or alias.
 * @returns One token array per line. Always at least one line.
 */
export function tokenizeLines(code: string, language: string | undefined): Token[][] {
    const lines: Token[][] = [[]];
    for (const token of tokenize(code, language)) {
        const pieces = token.value.split("\n");
        pieces.forEach((piece, index) => {
            if (index > 0) lines.push([]);
            if (piece !== "") lines[lines.length - 1].push({ kind: token.kind, value: piece });
        });
    }
    return lines;
}
