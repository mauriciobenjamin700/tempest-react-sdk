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
 */
const GRAMMARS: Record<CodeLanguage, Rule[]> = {
    typescript: jsRules(false),
    javascript: jsRules(false),
    tsx: jsRules(true),
    jsx: jsRules(true),
    json: [
        { kind: "property", pattern: /"(?:[^"\\]|\\.)*"(?=\s*:)/y },
        { kind: "string", pattern: /"(?:[^"\\]|\\.)*"/y },
        { kind: "number", pattern: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
        { kind: "literal", pattern: /\b(?:true|false|null)\b/y },
        { kind: "punctuation", pattern: /[{}[\],:]/y },
    ],
    css: [
        { kind: "comment", pattern: /\/\*[\s\S]*?\*\//y },
        { kind: "string", pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/y },
        { kind: "keyword", pattern: /@[a-zA-Z-]+/y },
        { kind: "property", pattern: /--?[a-zA-Z][\w-]*(?=\s*:)/y },
        { kind: "function", pattern: /[a-zA-Z-]+(?=\()/y },
        { kind: "number", pattern: /-?\d+(?:\.\d+)?(?:px|rem|em|%|s|ms|vh|vw|fr|deg)?/y },
        { kind: "punctuation", pattern: /[{}();:,>+~]/y },
    ],
    html: [
        { kind: "comment", pattern: /<!--[\s\S]*?-->/y },
        { kind: "string", pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/y },
        { kind: "tag", pattern: /<\/?[a-zA-Z][\w:-]*/y },
        { kind: "attribute", pattern: /[a-zA-Z][\w:-]*(?==)/y },
        { kind: "punctuation", pattern: /\/?>|=/y },
    ],
    bash: [
        { kind: "comment", pattern: /#[^\n]*/y },
        { kind: "string", pattern: /"(?:[^"\\]|\\.)*"|'[^']*'/y },
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
            pattern: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/y,
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
    ],
    sql: [
        { kind: "comment", pattern: /--[^\n]*|\/\*[\s\S]*?\*\//y },
        { kind: "string", pattern: /'(?:[^']|'')*'/y },
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
        { kind: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
        {
            kind: "string",
            pattern: /`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/y,
        },
        { kind: "keyword", pattern: new RegExp(`\\b(?:${JS_KEYWORDS})\\b`, "y") },
        { kind: "literal", pattern: new RegExp(`\\b(?:${JS_LITERALS})\\b`, "y") },
        {
            kind: "number",
            pattern: /\b(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)\b/y,
        },
        { kind: "function", pattern: /[A-Za-z_$][\w$]*(?=\s*\()/y },
        { kind: "punctuation", pattern: /[{}[\]().,;:?!=<>+\-*/%&|^~]/y },
    ];
    if (withJsx) {
        // Before the keyword rule, so `<Button` reads as a tag and not as `<`.
        rules.splice(2, 0, { kind: "tag", pattern: /<\/?[A-Za-z][\w.]*|\/>/y });
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
 * @param code - The source.
 * @param language - Grammar name or alias.
 * @returns Tokens covering the input exactly, in order.
 *
 * @example
 * tokenize("const x = 1;", "ts");
 * // [{kind: "keyword", value: "const"}, {kind: "plain", value: " x "}, …]
 */
export function tokenize(code: string, language: string | undefined): Token[] {
    const rules = GRAMMARS[resolveLanguage(language)];
    if (rules.length === 0) return code === "" ? [] : [{ kind: "plain", value: code }];

    const tokens: Token[] = [];
    let plainFrom = 0;
    let at = 0;

    const flushPlain = (until: number) => {
        if (until > plainFrom) tokens.push({ kind: "plain", value: code.slice(plainFrom, until) });
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
            tokens.push(matched);
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
