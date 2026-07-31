// Which source files the design analysis is allowed to judge. Generated code and
// type declarations are the author's output, not the author's writing: reporting
// a 4000-line `icons.generated.ts` as "too big to read" buries the one component
// that really is.
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SKIP_DIRS = new Set([
    "node_modules",
    "dist",
    "build",
    "out",
    "coverage",
    "public",
    "vendor",
    ".git",
    ".vite",
    ".next",
    ".turbo",
    ".cache",
]);

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/** Above this size a file is treated as generated, not authored. */
const MAX_BYTES = 256 * 1024;

/** Cap on files opened, so `tempest doctor` stays fast on a huge tree. */
const MAX_FILES = 1200;

/** True for a path the analysis must not judge. */
export function isExcluded(path) {
    return (
        path.endsWith(".d.ts") ||
        /\.generated\.[jt]sx?$/.test(path) ||
        /[/\\]generated[/\\]/.test(path)
    );
}

/**
 * Collect the project's own source files.
 *
 * @param {object} params
 * @param {string} params.root - Project root; relative targets resolve against it.
 * @param {string[]} [params.targets] - Positional paths from the command line.
 * @param {number} [params.maxFiles]
 * @returns {{ files: string[], skipped: Array<{ path: string, reason: string }>, truncated: boolean }}
 */
export function collectSources({ root, targets = ["src", "app"], maxFiles = MAX_FILES }) {
    const files = new Set();
    const skipped = [];
    let truncated = false;

    const consider = (path) => {
        if (!EXTENSIONS.some((ext) => path.endsWith(ext)) || files.has(path)) return;
        if (isExcluded(path)) return;
        if (files.size >= maxFiles) {
            truncated = true;
            return;
        }
        let size;
        try {
            size = statSync(path).size;
        } catch {
            return;
        }
        if (size > MAX_BYTES) {
            skipped.push({ path, reason: "larger than 256 KB — treated as generated" });
            return;
        }
        files.add(path);
    };

    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;
            if (entry.name.startsWith(".") && entry.isDirectory()) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) consider(full);
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
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile()) consider(full);
    }

    return { files: [...files].sort((a, b) => a.localeCompare(b)), skipped, truncated };
}
