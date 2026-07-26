// Rewrite relative paths inside CSS to the project alias. Vite resolves aliases
// in stylesheets too, but the TypeScript AST pass cannot see `.css` files.
import { isInsideBase, toAlias } from "./specifier.mjs";

/**
 * `url(...)` in any position — `@import url("x")`, `background: url(x)`.
 * Group 1 is everything before the value, group 2 the optional quote, group 3 the
 * value, so the value's offset is derivable without searching inside the match.
 */
const URL_PATTERN = /(url\(\s*)(["']?)([^"')]+)\2(\s*\))/g;

/**
 * Quoted `@import` without `url()`. The quote must follow the whitespace
 * directly, which is what keeps this from also matching the `url()` form above
 * and rewriting the same span twice.
 */
const IMPORT_PATTERN = /(@import\s+)(["'])([^"']+)\2/g;

/**
 * Collect the rewritable value spans of a stylesheet.
 *
 * @param {string} text - Stylesheet contents.
 * @returns {Array<{ start: number, end: number, value: string }>}
 */
function collectSpans(text) {
    const spans = [];
    for (const pattern of [URL_PATTERN, IMPORT_PATTERN]) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const start = match.index + match[1].length + match[2].length;
            spans.push({ start, end: start + match[3].length, value: match[3] });
        }
    }
    return spans.sort((a, b) => a.start - b.start);
}

/**
 * Rewrite the relative paths of one stylesheet to the alias form.
 *
 * Only values that climb out of the file's directory *and* land inside the alias
 * base are converted, so `data:`, `http:` and fragment URLs need no special
 * casing — none of them starts with `../`.
 *
 * Pure, and back-to-front like the TypeScript pass, for the same reason: earlier
 * offsets must stay valid while later edits are applied.
 *
 * @param {object} params
 * @param {string} params.text - Stylesheet contents.
 * @param {string} params.filePath - Absolute path of the file.
 * @param {string} params.prefix - Alias prefix, e.g. `"@"`.
 * @param {string} params.baseDir - Absolute alias base directory.
 * @returns {{ text: string, changes: Array<{ from: string, to: string, line: number }> }}
 */
export function rewriteCss({ text, filePath, prefix, baseDir }) {
    if (!isInsideBase(filePath, baseDir)) return { text, changes: [] };

    const edits = [];
    const changes = [];
    for (const { start, end, value } of collectSpans(text)) {
        const to = toAlias({ spec: value, filePath, prefix, baseDir });
        if (!to) continue;
        edits.push({ start, end, to });
        changes.push({
            from: value,
            to,
            line: text.slice(0, start).split("\n").length,
        });
    }

    let out = text;
    for (const { start, end, to } of edits.reverse()) {
        out = `${out.slice(0, start)}${to}${out.slice(end)}`;
    }
    return { text: out, changes };
}
