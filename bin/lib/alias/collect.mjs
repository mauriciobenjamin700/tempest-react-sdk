// Walk the paths the user asked for and keep the files the codemod can act on.
import { readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import { isInsideBase } from "./specifier.mjs";

const SOURCE_EXTS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const STYLE_EXTS = new Set([".css"]);
const SKIP_DIRS = new Set([
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".git",
    ".vite",
    ".next",
    ".turbo",
]);

/**
 * Classify a file by extension.
 *
 * @param {string} path
 * @returns {"source" | "style" | null}
 */
function kindOf(path) {
    const ext = extname(path);
    if (SOURCE_EXTS.has(ext)) return "source";
    if (STYLE_EXTS.has(ext)) return "style";
    return null;
}

/**
 * Collect the files to rewrite, honoring the positional paths given to the CLI.
 *
 * Everything outside the alias base is dropped here as well as in the rewriters:
 * the walk never leaves the base, so `tempest fix .` on a project root descends
 * straight into `src/` and skips `vite.config.ts`, `e2e/` and `scripts/` without
 * needing to open them. A target that is an ancestor of the base is narrowed to
 * the base; a target that is merely *outside* it yields nothing, so
 * `tempest fix e2e` rewrites nothing instead of quietly rewriting `src/`.
 *
 * Results are sorted so the report — and any diff a reviewer reads — is stable
 * across runs and platforms.
 *
 * @param {object} params
 * @param {string} params.root - Project root; relative targets resolve against it.
 * @param {string[]} params.targets - Positional paths from the command line.
 * @param {string} params.baseDir - Absolute alias base directory.
 * @returns {Array<{ path: string, kind: "source" | "style" }>}
 */
export function collectFiles({ root, targets, baseDir }) {
    const out = new Map();

    const addFile = (path) => {
        if (out.has(path) || !isInsideBase(path, baseDir)) return;
        const kind = kindOf(path);
        if (kind) out.set(path, { path, kind });
    };

    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name.startsWith(".") && entry.isDirectory()) continue;
            if (SKIP_DIRS.has(entry.name)) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) addFile(full);
        }
    };

    for (const target of targets) {
        const full = resolve(root, target);
        let stat;
        try {
            stat = statSync(full);
        } catch {
            continue;
        }
        if (stat.isDirectory()) {
            if (full === baseDir || isInsideBase(full, baseDir)) walk(full);
            else if (isInsideBase(baseDir, full)) walk(baseDir);
        } else if (stat.isFile()) {
            addFile(full);
        }
    }

    return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}
