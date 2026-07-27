// The `tempest fix` CSS pass. Removes only what is provably dead:
//
//   1. a declaration repeated with the identical value in the same rule,
//   2. a rule that repeats an earlier one declaration for declaration,
//   3. an empty rule in a plain stylesheet.
//
// Nothing here changes what the browser computes. The **earlier** copy is always
// the one removed, because CSS is last-wins: dropping the later one would change
// the result whenever something in between touches the same property.
//
// Everything else the analysis finds — an override with a different value, a
// misspelled property, a repeated block that wants to be a global class — is
// reported and left alone. Guessing which of two conflicting values the author
// meant is not a fix, it is a coin flip inside somebody's design.
import { declSignature, ruleKey } from "./semantic.mjs";

/**
 * Grow a removal range to swallow the leading indentation and the trailing
 * whitespace, so deleting a declaration leaves neither a blank indented line nor
 * a double space where it used to sit on a one-line rule.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {{ start: number, end: number }}
 */
function expandRange(text, start, end) {
    let from = start;
    while (from > 0 && (text[from - 1] === " " || text[from - 1] === "\t")) from -= 1;
    if (from > 0 && text[from - 1] !== "\n") from = start;

    let to = end;
    while (to < text.length && (text[to] === " " || text[to] === "\t")) to += 1;
    if (text[to] === "\r") to += 1;
    if (text[to] === "\n") to += 1;

    return { start: from, end: to };
}

/**
 * Compute the edits for one stylesheet.
 *
 * @param {object} params
 * @param {string} params.text - Original file contents.
 * @param {ReturnType<import("./parse.mjs").parseCss>} params.parsed
 * @param {boolean} [params.isModule] - CSS Module: empty rules are kept.
 * @returns {{ text: string, changes: Array<{ code: string, line: number, message: string }> }}
 */
export function fixCss({ text, parsed, isModule = false }) {
    if (parsed.errors.length > 0) return { text, changes: [] };

    const edits = [];
    const changes = [];
    const byKey = new Map();

    for (const block of parsed.blocks) {
        const removable = block.end !== null && block.start < block.end;

        if (block.kind === "rule" && removable) {
            const key = ruleKey(block);
            const previous = byKey.get(key);
            if (
                previous &&
                block.decls.length > 0 &&
                declSignature(block) === declSignature(previous.block) &&
                previous.removable
            ) {
                edits.push({ ...expandRange(text, previous.block.start, previous.block.end) });
                changes.push({
                    code: "duplicate-rule",
                    line: previous.block.line,
                    message: `removed \`${previous.block.prelude}\` — line ${block.line} repeats it exactly`,
                });
            }
            byKey.set(key, { block, removable });
        }

        if (block.decls.length === 0 && block.children === 0 && !isModule && removable) {
            edits.push({ ...expandRange(text, block.start, block.end) });
            changes.push({
                code: "empty-rule",
                line: block.line,
                message: `removed empty rule \`${block.prelude}\``,
            });
            continue;
        }

        const lastByProp = new Map();
        for (const decl of block.decls) {
            const prop = decl.prop.toLowerCase();
            const value = decl.value.replace(/\s+/g, " ").toLowerCase();
            const previous = lastByProp.get(prop);
            if (previous && previous.value === value) {
                edits.push({ ...expandRange(text, previous.decl.start, previous.decl.end) });
                changes.push({
                    code: "duplicate-declaration",
                    line: previous.decl.line,
                    message: `removed duplicate \`${prop}\` — line ${decl.line} declares the same value`,
                });
            }
            lastByProp.set(prop, { decl, value });
        }
    }

    if (edits.length === 0) return { text, changes: [] };

    const applied = dropOverlaps(edits);
    let out = text;
    for (const edit of applied) out = out.slice(0, edit.start) + out.slice(edit.end);

    return {
        text: out,
        changes: changes.sort((a, b) => a.line - b.line),
    };
}

/**
 * Keep the widest non-overlapping edits, ordered back-to-front for splicing.
 *
 * A duplicate declaration inside a rule that is itself a duplicate produces two
 * overlapping removals. The enclosing one wins — dropping the whole rule already
 * drops the declaration — and applying both would splice at an offset that no
 * longer exists.
 *
 * @param {Array<{ start: number, end: number }>} edits
 * @returns {Array<{ start: number, end: number }>} Descending by `start`.
 */
function dropOverlaps(edits) {
    const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
    const kept = [];
    let reach = -1;
    for (const edit of sorted) {
        if (edit.start < reach) continue;
        kept.push(edit);
        reach = edit.end;
    }
    return kept.reverse();
}
