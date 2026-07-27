// A tolerant CSS scanner: turns a stylesheet into blocks + declarations and
// records every syntax defect it walks past instead of throwing.
//
// Tolerant on purpose. A linter that dies on the first unbalanced brace reports
// one problem per run, and the file it refuses to read is exactly the file that
// needs reading. This one keeps scanning: a stray `}` is recorded and the walk
// continues, so a single pass finds every defect in the sheet.
//
// Offsets are kept truthful (every block and declaration carries `start`/`end`)
// because `tempest fix` splices the original text — it never re-prints the AST,
// so formatting, comments and author intent survive a fix pass untouched.

/** Number of newlines in a string. */
function countNewlines(text) {
    let n = 0;
    for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") n += 1;
    return n;
}

/**
 * Index of the first character that is neither whitespace nor part of a
 * comment, so a declaration's reported line points at the declaration and not
 * at the blank line or the comment above it.
 *
 * @param {string} raw
 * @returns {number} Index into `raw`; `raw.length` when it holds only trivia.
 */
function contentStart(raw) {
    let i = 0;
    while (i < raw.length) {
        const ch = raw[i];
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f") {
            i += 1;
            continue;
        }
        if (ch === "/" && raw[i + 1] === "*") {
            const close = raw.indexOf("*/", i + 2);
            if (close < 0) return raw.length;
            i = close + 2;
            continue;
        }
        return i;
    }
    return i;
}

/**
 * Drop `/* … *\/` comments, keeping everything else byte-for-byte.
 *
 * @param {string} raw
 * @returns {string}
 */
export function stripComments(raw) {
    let out = "";
    let i = 0;
    while (i < raw.length) {
        if (raw[i] === "/" && raw[i + 1] === "*") {
            const close = raw.indexOf("*/", i + 2);
            if (close < 0) break;
            i = close + 2;
            out += " ";
            continue;
        }
        if (raw[i] === '"' || raw[i] === "'") {
            const quote = raw[i];
            let j = i + 1;
            while (j < raw.length && raw[j] !== quote) j += raw[j] === "\\" ? 2 : 1;
            out += raw.slice(i, Math.min(j + 1, raw.length));
            i = j + 1;
            continue;
        }
        out += raw[i];
        i += 1;
    }
    return out;
}

/**
 * Blank out quoted strings and parenthesized groups, so a scan for a delimiter
 * cannot trip over one that lives inside `url(…)`, `calc(…)` or a string.
 *
 * @param {string} value
 * @returns {string} Same length as `value`, with those spans replaced by spaces.
 */
export function maskValue(value) {
    let out = "";
    let depth = 0;
    let quote = null;
    for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (quote) {
            out += ch === "\n" ? "\n" : " ";
            if (ch === quote) quote = null;
            else if (ch === "\\") {
                out += " ";
                i += 1;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            out += " ";
            continue;
        }
        if (ch === "(") {
            depth += 1;
            out += " ";
            continue;
        }
        if (ch === ")") {
            depth = Math.max(0, depth - 1);
            out += " ";
            continue;
        }
        out += depth > 0 && ch !== "\n" ? " " : ch;
    }
    return out;
}

/** Index of the first `:` outside strings and parens, or -1. */
function colonIndex(raw) {
    return maskValue(raw).indexOf(":");
}

/**
 * Parse a stylesheet.
 *
 * @param {string} text - Raw file contents.
 * @returns {{
 *   blocks: Array<{
 *     kind: "rule" | "at",
 *     prelude: string,
 *     context: string[],
 *     line: number,
 *     endLine: number | null,
 *     start: number,
 *     bodyStart: number,
 *     end: number | null,
 *     decls: Array<{ prop: string, value: string, line: number, start: number, end: number }>,
 *     children: number,
 *     invalid: boolean,
 *   }>,
 *   statements: Array<{ name: string, params: string, line: number }>,
 *   errors: Array<{ code: string, line: number, text?: string }>,
 * }}
 */
export function parseCss(text) {
    const blocks = [];
    const statements = [];
    const errors = [];
    const stack = [];

    let i = 0;
    let line = 1;
    let bufStart = 0;
    let bufLine = 1;

    const reset = () => {
        bufStart = i;
        bufLine = line;
    };

    /**
     * Record a defect, and mark the block it happened inside.
     *
     * The mark is what keeps one mistake from being reported as two: a rule whose
     * only declaration the parser had to reject looks empty afterwards, and
     * "this rule is dead code" is a lie about a rule that is merely broken.
     */
    const pushError = (code, errorLine, text) => {
        errors.push(
            text === undefined ? { code, line: errorLine } : { code, line: errorLine, text },
        );
        const block = stack[stack.length - 1];
        if (block) block.invalid = true;
    };

    const pending = () => {
        const raw = text.slice(bufStart, i);
        const offset = contentStart(raw);
        return {
            raw,
            body: stripComments(raw.slice(offset)).trim(),
            start: bufStart + offset,
            line: bufLine + countNewlines(raw.slice(0, offset)),
        };
    };

    /**
     * Turn the pending buffer into a declaration (or an at-statement), pushing a
     * diagnostic when it is neither.
     */
    const flushDecl = (end) => {
        const { body, start, line: declLine } = pending();
        if (!body) return;
        if (body.startsWith("@")) {
            const match = /^@([\w-]+)\s*([\s\S]*)$/.exec(body);
            statements.push({
                name: (match?.[1] ?? "").toLowerCase(),
                params: (match?.[2] ?? "").trim(),
                line: declLine,
            });
            return;
        }
        const block = stack[stack.length - 1];
        if (!block) {
            pushError("declaration-outside-rule", declLine, body);
            return;
        }
        const colon = colonIndex(body);
        if (colon < 0) {
            pushError("missing-colon", declLine, body);
            return;
        }
        const prop = body.slice(0, colon).trim();
        const value = body.slice(colon + 1).trim();
        if (!prop) {
            pushError("missing-property", declLine, body);
            return;
        }
        if (!value) {
            pushError("empty-value", declLine, prop);
            return;
        }
        block.decls.push({ prop, value, line: declLine, start, end });
    };

    while (i < text.length) {
        const ch = text[i];

        if (ch === "\n") {
            line += 1;
            i += 1;
            continue;
        }

        if (ch === "/" && text[i + 1] === "*") {
            const close = text.indexOf("*/", i + 2);
            if (close < 0) {
                pushError("unterminated-comment", line);
                line += countNewlines(text.slice(i));
                i = text.length;
                continue;
            }
            line += countNewlines(text.slice(i, close));
            i = close + 2;
            continue;
        }

        if (ch === '"' || ch === "'") {
            let j = i + 1;
            let closed = false;
            while (j < text.length) {
                if (text[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (text[j] === ch) {
                    closed = true;
                    break;
                }
                if (text[j] === "\n") break;
                j += 1;
            }
            if (!closed) pushError("unterminated-string", line);
            line += countNewlines(text.slice(i, Math.min(j + 1, text.length)));
            i = Math.min(j + 1, text.length);
            continue;
        }

        if (ch === "(") {
            let depth = 0;
            let j = i;
            let quote = null;
            while (j < text.length) {
                const cj = text[j];
                if (quote) {
                    if (cj === "\\") j += 1;
                    else if (cj === quote) quote = null;
                } else if (cj === '"' || cj === "'") quote = cj;
                else if (cj === "(") depth += 1;
                else if (cj === ")") {
                    depth -= 1;
                    if (depth === 0) break;
                }
                j += 1;
            }
            if (depth !== 0) pushError("unterminated-paren", line);
            line += countNewlines(text.slice(i, Math.min(j + 1, text.length)));
            i = Math.min(j + 1, text.length);
            continue;
        }

        if (ch === "{") {
            const { body, start, line: preludeLine } = pending();
            if (!body) pushError("empty-selector", line);
            const parent = stack[stack.length - 1];
            if (parent) parent.children += 1;
            const block = {
                kind: body.startsWith("@") ? "at" : "rule",
                prelude: body,
                context: stack.map((b) => b.prelude),
                line: preludeLine,
                endLine: null,
                start,
                bodyStart: i + 1,
                end: null,
                decls: [],
                children: 0,
                invalid: false,
            };
            blocks.push(block);
            stack.push(block);
            i += 1;
            reset();
            continue;
        }

        if (ch === "}") {
            flushDecl(i);
            const block = stack.pop();
            if (!block) pushError("unexpected-brace", line);
            else {
                block.endLine = line;
                block.end = i + 1;
            }
            i += 1;
            reset();
            continue;
        }

        if (ch === ";") {
            flushDecl(i + 1);
            i += 1;
            reset();
            continue;
        }

        i += 1;
    }

    const { body: trailing, line: trailingLine } = pending();
    if (stack.length > 0) {
        flushDecl(i);
        for (const block of stack) {
            block.invalid = true;
            errors.push({ code: "unclosed-block", line: block.line });
        }
    } else if (trailing.startsWith("@")) {
        flushDecl(i);
    } else if (trailing && colonIndex(trailing) >= 0) {
        errors.push({ code: "declaration-outside-rule", line: trailingLine, text: trailing });
    } else if (trailing) {
        errors.push({ code: "missing-brace", line: trailingLine, text: trailing });
    }

    return { blocks, statements, errors };
}

/**
 * Selector list of a rule, normalized so two spellings of the same target
 * compare equal: whitespace collapsed, combinators spaced, list order sorted
 * (`.a, .b` and `.b, .a` select the same set).
 *
 * @param {string} prelude
 * @returns {string[]}
 */
export function normalizeSelectors(prelude) {
    return maskCommas(prelude)
        .map((part) =>
            part
                .trim()
                .replace(/\s*([>+~])\s*/g, " $1 ")
                .replace(/\s+/g, " "),
        )
        .filter(Boolean)
        .sort();
}

/**
 * Split a selector list on top-level commas — a comma inside `:is(a, b)` or
 * `[title="a,b"]` does not start a new selector.
 *
 * @param {string} prelude
 * @returns {string[]}
 */
function maskCommas(prelude) {
    const mask = maskValue(prelude);
    const out = [];
    let last = 0;
    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i] !== ",") continue;
        out.push(prelude.slice(last, i));
        last = i + 1;
    }
    out.push(prelude.slice(last));
    return out;
}
