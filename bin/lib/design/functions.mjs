// Locate the functions in a masked source file and measure them. No TypeScript
// parser on purpose: `doctor` must run in a project that has not installed
// anything yet, and the numbers it reports (body length, parameter count, prop
// count) are exactly the ones a brace scan can get right.
import { countCodeLines, lineAt, matchPair } from "./mask.mjs";

const DECLARATIONS = [
    /\b(export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^(){}]*>)?\s*\(/g,
    /\b(export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;()]*)?=\s*(?:async\s+)?(?:function\s*(?:<[^(){}]*>)?\s*)?\(/g,
];

// Destructured keys that are plumbing, not decisions: they forward the caller's
// DOM attributes instead of adding a case to the component. Counting them made
// every SDK primitive that spreads `...rest` look like two components — the
// loudest false positive in the first run of this rule.
const PLUMBING_KEYS = new Set(["className", "children", "style", "id", "ref", "key"]);

/**
 * Split a parameter or member list at top-level separators, ignoring nested
 * groups.
 *
 * Angle brackets count as a group so `Record<string, number>` stays one item, but
 * the `>` of an arrow (`=>`) does not — a default value like `onPick = () => {}`
 * otherwise drove the depth negative and every later comma read as a new
 * parameter. The depth is clamped at zero for the same reason: one unbalanced
 * `>` must not turn the rest of the list into phantom items.
 *
 * @param {string} text
 * @param {string} [separator]
 * @returns {string[]}
 */
export function splitTopLevel(text, separator = ",") {
    const parts = [];
    let depth = 0;
    let current = "";
    let previous = "";
    for (const ch of text) {
        const isArrowTail = ch === ">" && previous === "=";
        if ("([{<".includes(ch)) depth += 1;
        else if (")]}>".includes(ch) && !isArrowTail) depth = Math.max(0, depth - 1);
        if (ch === separator && depth === 0) {
            parts.push(current);
            current = "";
            previous = ch;
            continue;
        }
        current += ch;
        previous = ch;
    }
    if (current.trim()) parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Keys of an inline destructured object pattern that represent a real choice.
 *
 * `{ variant, size, className, children, ...rest }` counts 2: the rest element
 * and the DOM plumbing forward the caller's attributes rather than adding a case
 * the component has to handle.
 *
 * @param {string} param - First parameter text.
 * @returns {number} Key count, or 0 when the parameter is not a pattern.
 */
export function destructuredKeyCount(param) {
    const open = param.indexOf("{");
    if (open !== 0) return 0;
    const close = matchPair(param, open, "{", "}");
    if (close === -1) return 0;
    return splitTopLevel(param.slice(open + 1, close)).filter((key) => {
        if (key.startsWith("...")) return false;
        const name = key.split(/[:=]/)[0].trim();
        return !PLUMBING_KEYS.has(name);
    }).length;
}

/**
 * Find the body of a callable whose parameter list closes at `closeParen`.
 *
 * Returns null for an expression-bodied arrow (`const f = (a) => a + 1`): it has
 * no block to measure, and any such function is already below every limit.
 *
 * @param {string} masked
 * @param {number} closeParen
 * @returns {{ start: number, end: number } | null}
 */
function findBody(masked, closeParen) {
    for (let i = closeParen + 1; i < masked.length; i += 1) {
        const ch = masked[i];
        if (ch === "{") {
            const end = matchPair(masked, i, "{", "}");
            return end === -1 ? null : { start: i, end };
        }
        if (ch === ";" || ch === "\n") {
            if (ch === ";") return null;
            continue;
        }
        if (!/[\s=>:|&?[\]<>(),."'`\w$]/.test(ch)) return null;
    }
    return null;
}

/**
 * Classify a declaration by name and file kind.
 *
 * @param {string} name
 * @param {boolean} isTsx
 * @returns {"hook" | "component" | "function"}
 */
export function classify(name, isTsx) {
    if (/^use[A-Z]/.test(name)) return "hook";
    if (isTsx && /^[A-Z]/.test(name)) return "component";
    return "function";
}

/**
 * Measure every function in a masked file.
 *
 * `bodyLines` spans the opening brace through the closing one, blank and
 * comment-only lines excluded — the same thing `max-lines-per-function` with
 * `skipBlankLines` + `skipComments` counts, minus the signature line.
 *
 * @param {string} masked - Output of `maskSource`.
 * @param {object} [options]
 * @param {boolean} [options.isTsx] - Whether components may be detected.
 * @returns {Array<{ name: string, kind: string, line: number, bodyLines: number,
 *   params: string[], destructuredProps: number, exported: boolean }>}
 */
export function findFunctions(masked, { isTsx = false } = {}) {
    const found = new Map();

    for (const pattern of DECLARATIONS) {
        const re = new RegExp(pattern.source, "g");
        let match;
        while ((match = re.exec(masked))) {
            const name = match[2];
            const exported = Boolean(match[1]);
            const openParen = masked.indexOf("(", match.index + match[0].length - 1);
            if (openParen === -1) continue;
            const closeParen = matchPair(masked, openParen, "(", ")");
            if (closeParen === -1) continue;
            const body = findBody(masked, closeParen);
            if (!body) continue;
            if (found.has(body.start)) continue;

            const params = splitTopLevel(masked.slice(openParen + 1, closeParen));
            found.set(body.start, {
                name,
                kind: classify(name, isTsx),
                exported,
                line: lineAt(masked, match.index),
                bodyLines: countCodeLines(masked.slice(body.start, body.end + 1)),
                params,
                destructuredProps: params.length === 1 ? destructuredKeyCount(params[0]) : 0,
            });
        }
    }

    return [...found.values()].sort((a, b) => a.line - b.line);
}

/**
 * Member count of every `…Props` type/interface in the file, keyed by the type
 * name.
 *
 * A union (`type XProps = { as: "a" } | { as: "b"; href: string }`) is skipped:
 * its member count belongs to the branches, not to the alias — and a union is the
 * shape the docs recommend precisely to keep each branch small.
 *
 * @param {string} masked
 * @returns {Map<string, { count: number, line: number }>}
 */
export function findPropsTypes(masked) {
    const out = new Map();
    const re = /\b(?:interface|type)\s+([A-Za-z_$][\w$]*Props)\b([^{;]*)/g;
    let match;
    while ((match = re.exec(masked))) {
        const open = masked.indexOf("{", match.index + match[0].length - 1);
        if (open === -1) continue;
        const close = matchPair(masked, open, "{", "}");
        if (close === -1) continue;
        if (/^\s*[|&]/.test(masked.slice(close + 1))) continue;
        const members = splitTopLevel(masked.slice(open + 1, close), ";").filter((member) =>
            /^(readonly\s+)?\[?["']?[\w$]+["']?\]?\??\s*[:(]/.test(member),
        );
        out.set(match[1], { count: members.length, line: lineAt(masked, match.index) });
    }
    return out;
}
