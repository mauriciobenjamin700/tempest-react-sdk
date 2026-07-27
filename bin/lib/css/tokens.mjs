// The `--tempest-*` token table, read from whichever stylesheet this project
// actually has: the installed SDK's `dist/styles.css`, or — when the CLI runs
// from a checkout of the SDK itself — the sources under `src/styles/`.
//
// Read, never hard-coded. A copy of the token list inside the CLI would drift
// the first time a token is added, and then it would report the app's correct
// code as a typo, which is worse than not checking at all. No stylesheet found
// means the token checks stay silent.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Candidate stylesheet locations, in the order they are trusted. */
function candidates(root, selfDir) {
    return [
        join(root, "node_modules", "tempest-react-sdk", "dist", "styles.css"),
        join(root, "node_modules", "tempest-react-sdk", "dist", "utilities.css"),
        join(selfDir, "..", "dist", "styles.css"),
        join(selfDir, "..", "dist", "utilities.css"),
    ];
}

/** Every `.css` file under a directory (non-recursive), sorted. */
function cssFilesIn(dir) {
    try {
        return readdirSync(dir)
            .filter((name) => name.endsWith(".css"))
            .sort()
            .map((name) => join(dir, name));
    } catch {
        return [];
    }
}

/** Normalize a token value for value→token lookups. */
function normalizeValue(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Collect `--custom-property: value` pairs from stylesheet text.
 *
 * Deliberately regex-based rather than a full parse: this runs over the SDK's
 * own already-valid stylesheet, where the only thing wanted is the names, and a
 * value containing `;` inside `url()` at worst costs one entry in the value map.
 *
 * @param {string} text
 * @returns {Array<[name: string, value: string]>}
 */
function customProperties(text) {
    const out = [];
    const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g;
    let match;
    while ((match = re.exec(text))) out.push([match[1], match[2].trim()]);
    return out;
}

/**
 * Load the SDK design tokens.
 *
 * @param {object} params
 * @param {string} params.root - Project root.
 * @param {string} params.selfDir - Directory of the running CLI (`bin/`).
 * @returns {{
 *   source: string | null,
 *   names: Set<string>,
 *   byValue: Map<string, string[]>,
 *   utilities: Set<string>,
 * }}
 */
export function loadTokens({ root, selfDir }) {
    const files = candidates(root, selfDir).filter(existsSync);
    if (files.length === 0) {
        const localStyles = join(selfDir, "..", "src", "styles");
        files.push(...cssFilesIn(localStyles));
    }
    const names = new Set();
    const byValue = new Map();
    const utilities = new Set();
    let source = null;

    for (const file of files) {
        let text;
        try {
            text = readFileSync(file, "utf8");
        } catch {
            continue;
        }
        source ??= file;
        for (const [name, value] of customProperties(text)) {
            if (!name.startsWith("--tempest-")) continue;
            names.add(name);
            if (value.includes("var(")) continue;
            const key = normalizeValue(value);
            const list = byValue.get(key) ?? [];
            if (!list.includes(name)) list.push(name);
            byValue.set(key, list);
        }
        for (const match of text.matchAll(/\.(tempest-[a-z0-9-]+)/g)) utilities.add(match[1]);
    }

    return { source, names, byValue, utilities };
}

/**
 * Token whose value is exactly this literal, when exactly one token has it.
 *
 * Ambiguity is the whole reason for the single-match rule: `4px` is the value of
 * several tokens, and telling somebody to use `--tempest-space-1` when they meant
 * a hairline border is a bad suggestion delivered confidently. One match means
 * the intent is unambiguous.
 *
 * @param {string} value - Declaration value as written.
 * @param {Map<string, string[]>} byValue - Value→tokens index.
 * @returns {string | null}
 */
export function tokenForValue(value, byValue) {
    const matches = byValue.get(normalizeValue(value));
    return matches && matches.length === 1 ? matches[0] : null;
}
