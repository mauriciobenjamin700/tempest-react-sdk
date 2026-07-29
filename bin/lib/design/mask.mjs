// Blank out comments, string literals and regex bodies while keeping every byte
// offset and newline in place. Every other rule in this folder runs on the mask
// instead of the raw source, which is what stops the two loudest classes of
// false positive: a brace inside a string ("}") breaking the body scan, and the
// word `any` inside a doc comment being reported as a type.
//
// A `/` starts a regex only when the previous meaningful character is one that
// cannot end an expression. That is the standard heuristic; it keeps JSX
// (`</div>`) and division (`a / b`) out of regex state.

const REGEX_PRECEDERS = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+"]);

/** Last non-whitespace character before `index`, or "" at the start of input. */
function previousMeaningful(source, index) {
    for (let i = index - 1; i >= 0; i -= 1) {
        if (!/\s/.test(source[i])) return source[i];
    }
    return "";
}

/**
 * Replace comment bodies, string contents and regex bodies with spaces.
 *
 * Newlines are preserved everywhere, including inside block comments and
 * template literals, so a line number computed on the mask is the line number in
 * the original file. Template-literal `${…}` holes stay as code, since that is
 * where real expressions live.
 *
 * @param {string} source - Raw file contents.
 * @returns {{ masked: string, commentText: string }} The mask, plus the comment
 *   text that was removed (some rules — `@ts-ignore`, the limits marker — only
 *   exist in comments).
 */
export function maskSource(source) {
    const out = new Array(source.length);
    let comments = "";
    let i = 0;
    /** Depth of `${` holes per nested template literal. */
    const templates = [];

    const blank = (from, to) => {
        for (let k = from; k < to; k += 1) out[k] = source[k] === "\n" ? "\n" : " ";
    };

    while (i < source.length) {
        const ch = source[i];
        const next = source[i + 1];

        if (ch === "/" && next === "/") {
            const end = source.indexOf("\n", i);
            const stop = end === -1 ? source.length : end;
            comments += `${source.slice(i, stop)}\n`;
            blank(i, stop);
            i = stop;
            continue;
        }

        if (ch === "/" && next === "*") {
            const end = source.indexOf("*/", i + 2);
            const stop = end === -1 ? source.length : end + 2;
            comments += `${source.slice(i, stop)}\n`;
            blank(i, stop);
            i = stop;
            continue;
        }

        if (ch === '"' || ch === "'") {
            let k = i + 1;
            while (k < source.length && source[k] !== ch) {
                if (source[k] === "\\") k += 1;
                if (source[k] === "\n") break;
                k += 1;
            }
            out[i] = ch;
            blank(i + 1, k);
            out[k] = source[k] === ch ? ch : source[k] === "\n" ? "\n" : " ";
            i = k + 1;
            continue;
        }

        if (ch === "`") {
            out[i] = "`";
            i += 1;
            let start = i;
            while (i < source.length) {
                if (source[i] === "\\") {
                    i += 2;
                    continue;
                }
                if (source[i] === "$" && source[i + 1] === "{") {
                    blank(start, i);
                    out[i] = " ";
                    out[i + 1] = "{";
                    templates.push(1);
                    i += 2;
                    let depth = 1;
                    while (i < source.length && depth > 0) {
                        const inner = maskHole(source, i, out);
                        depth += inner.delta;
                        i = inner.next;
                        if (depth === 0) break;
                    }
                    templates.pop();
                    start = i;
                    continue;
                }
                if (source[i] === "`") break;
                i += 1;
            }
            blank(start, i);
            if (i < source.length) out[i] = "`";
            i += 1;
            continue;
        }

        if (ch === "/" && REGEX_PRECEDERS.has(previousMeaningful(source, i))) {
            let k = i + 1;
            let inClass = false;
            while (k < source.length && source[k] !== "\n") {
                if (source[k] === "\\") {
                    k += 2;
                    continue;
                }
                if (source[k] === "[") inClass = true;
                else if (source[k] === "]") inClass = false;
                else if (source[k] === "/" && !inClass) break;
                k += 1;
            }
            out[i] = "/";
            blank(i + 1, k);
            if (k < source.length && source[k] === "/") out[k] = "/";
            i = k + 1;
            continue;
        }

        out[i] = ch;
        i += 1;
    }

    for (let k = 0; k < source.length; k += 1) {
        if (out[k] === undefined) out[k] = source[k] === "\n" ? "\n" : " ";
    }
    return { masked: out.join(""), commentText: comments };
}

/**
 * Copy one character of a template-literal `${…}` hole into the mask, reporting
 * how it changes brace depth. Nested strings and comments inside the hole are not
 * re-masked here — a hole deep enough to need that is rare, and treating its
 * braces literally keeps the scan terminating.
 *
 * @param {string} source
 * @param {number} index
 * @param {string[]} out - Mask being built, mutated in place.
 * @returns {{ delta: number, next: number }}
 */
function maskHole(source, index, out) {
    const ch = source[index];
    out[index] = ch === "\n" ? "\n" : ch;
    if (ch === "{") return { delta: 1, next: index + 1 };
    if (ch === "}") return { delta: -1, next: index + 1 };
    return { delta: 0, next: index + 1 };
}

/**
 * Count lines that carry code: non-blank after masking. Comment-only and blank
 * lines do not count, matching `max-lines` with `skipComments` + `skipBlankLines`
 * — the ESLint setting the docs recommend.
 *
 * @param {string} masked - Output of {@link maskSource}.
 * @returns {number}
 */
export function countCodeLines(masked) {
    let count = 0;
    for (const line of masked.split("\n")) {
        if (line.trim().length > 0) count += 1;
    }
    return count;
}

/** 1-based line number of a character offset. */
export function lineAt(text, offset) {
    let line = 1;
    for (let i = 0; i < offset && i < text.length; i += 1) {
        if (text[i] === "\n") line += 1;
    }
    return line;
}

/**
 * Index of the delimiter matching the one at `open`, or -1 when unbalanced.
 *
 * @param {string} masked
 * @param {number} open - Offset of the opening delimiter.
 * @param {string} openCh
 * @param {string} closeCh
 * @returns {number}
 */
export function matchPair(masked, open, openCh, closeCh) {
    let depth = 0;
    for (let i = open; i < masked.length; i += 1) {
        if (masked[i] === openCh) depth += 1;
        else if (masked[i] === closeCh) {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
}
