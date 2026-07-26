// The `tempest fix` alias pass: discover the convention, rewrite the files,
// report what changed.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";

import { collectFiles } from "./collect.mjs";
import { discoverAlias } from "./discover.mjs";
import { rewriteCss } from "./rewrite-css.mjs";
import { rewriteSource } from "./rewrite.mjs";
import { loadTypeScript } from "./typescript.mjs";

export { collectFiles } from "./collect.mjs";
export { discoverAlias } from "./discover.mjs";
export { rewriteCss } from "./rewrite-css.mjs";
export { rewriteSource } from "./rewrite.mjs";
export { isInsideBase, toAlias } from "./specifier.mjs";
export { readTsconfig } from "./tsconfig.mjs";
export { loadTypeScript } from "./typescript.mjs";

/**
 * Convert relative imports that climb out of their directory into alias imports.
 *
 * Reports instead of throwing when the project is not set up for it — no
 * TypeScript installed, no alias discoverable. Both are "nothing to do", not
 * failures, so the surrounding `fix` keeps its exit code and still runs ESLint
 * and Prettier.
 *
 * @param {object} params
 * @param {string} params.root - Project root.
 * @param {string[]} params.targets - Positional paths from the command line.
 * @param {boolean} [params.dryRun] - Report the changes without writing them.
 * @returns {{
 *   status: "ok" | "no-typescript" | "no-alias" | "error",
 *   prefix?: string,
 *   baseDir?: string,
 *   files: Array<{ path: string, changes: Array<{ from: string, to: string, line: number }> }>,
 *   total: number,
 *   errors: Array<{ path: string, message: string }>,
 * }}
 */
export function aliasImports({ root, targets, dryRun = false }) {
    const empty = { files: [], total: 0, errors: [] };

    const ts = loadTypeScript(root);
    if (!ts) return { status: "no-typescript", ...empty };

    const alias = discoverAlias({ root, ts });
    if (!alias) return { status: "no-alias", ...empty };

    const { prefix, baseDir } = alias;
    const files = [];
    const errors = [];
    let total = 0;

    for (const { path, kind } of collectFiles({ root, targets, baseDir })) {
        let text;
        try {
            text = readFileSync(path, "utf8");
        } catch (err) {
            errors.push({ path: relative(root, path), message: String(err?.message ?? err) });
            continue;
        }
        const result =
            kind === "style"
                ? rewriteCss({ text, filePath: path, prefix, baseDir })
                : rewriteSource({ text, filePath: path, prefix, baseDir, ts });
        if (!result.changes.length) continue;
        if (!dryRun) {
            try {
                writeFileSync(path, result.text);
            } catch (err) {
                errors.push({ path: relative(root, path), message: String(err?.message ?? err) });
                continue;
            }
        }
        files.push({ path: relative(root, path), changes: result.changes });
        total += result.changes.length;
    }

    return {
        status: errors.length ? "error" : "ok",
        prefix,
        baseDir,
        files,
        total,
        errors,
    };
}
