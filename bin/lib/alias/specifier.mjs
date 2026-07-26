// The single rule both rewriters share: when does a relative specifier become an
// alias specifier, and what does it become.
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * True when `filePath` sits inside `baseDir`.
 *
 * The gate exists because `@/` only resolves for files the bundler and the
 * type-checker process through the alias. A file outside the base — a
 * `vite.config.ts`, a script under `scripts/` — would get a specifier that
 * resolves nowhere, and `vite.config.ts` in particular is loaded *without* the
 * aliases it declares.
 *
 * @param {string} filePath - Absolute file path.
 * @param {string} baseDir - Absolute alias base directory.
 * @returns {boolean}
 */
export function isInsideBase(filePath, baseDir) {
    const rel = relative(baseDir, filePath);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Convert one relative specifier to its alias form, or report that it stays.
 *
 * Only specifiers that climb out of their own directory are converted: a sibling
 * `./x` already reads as "next to this file", which is information the alias
 * form throws away. A specifier that resolves *outside* the alias base is left
 * alone — that is what keeps `../../vite.config` and `../../../scripts/x`
 * intact.
 *
 * The extension is never touched: whatever the specifier carried (`.module.css`,
 * `.svg`, nothing at all) survives, because resolution of extensionless imports
 * is the bundler's business, not this codemod's.
 *
 * @param {object} params
 * @param {string} params.spec - The original specifier text.
 * @param {string} params.filePath - Absolute path of the importing file.
 * @param {string} params.prefix - Alias prefix, e.g. `"@"`.
 * @param {string} params.baseDir - Absolute alias base directory.
 * @returns {string | null} The alias specifier, or `null` to leave it as is.
 */
export function toAlias({ spec, filePath, prefix, baseDir }) {
    if (!spec.startsWith("../")) return null;
    const target = resolve(dirname(filePath), spec);
    const rel = relative(baseDir, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
    return `${prefix}/${rel.split(sep).join("/")}`;
}
