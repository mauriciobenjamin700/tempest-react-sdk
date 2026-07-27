// Find the stylesheets to analyze — and, just as important, the ones to leave
// alone: a vendored or already-minified sheet is not the author's code, and
// reporting 400 findings in `normalize.min.css` buries the two that are theirs.
import { readdirSync, readFileSync, statSync } from "node:fs";
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

/** Above this size a stylesheet is treated as generated, not authored. */
const MAX_BYTES = 512 * 1024;

/** Cap on files opened, so `tempest doctor` stays fast on a huge tree. */
const MAX_FILES = 600;

/** True when a sheet looks minified: few newlines for a lot of bytes. */
export function looksMinified(text) {
    if (text.length < 2000) return false;
    const lines = text.split("\n").length;
    return text.length / lines > 400;
}

/**
 * Collect the project's own `.css` files.
 *
 * @param {object} params
 * @param {string} params.root - Project root; relative targets resolve against it.
 * @param {string[]} [params.targets] - Positional paths from the command line.
 * @param {number} [params.maxFiles]
 * @returns {{ files: string[], skipped: Array<{ path: string, reason: string }>, truncated: boolean }}
 */
export function collectStylesheets({ root, targets = ["."], maxFiles = MAX_FILES }) {
    const files = new Set();
    const skipped = [];
    let truncated = false;

    const consider = (path) => {
        if (!path.endsWith(".css") || files.has(path)) return;
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
            skipped.push({ path, reason: "larger than 512 KB — treated as generated" });
            return;
        }
        if (/\.min\.css$/.test(path)) {
            skipped.push({ path, reason: "minified" });
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

/**
 * Custom-property names mentioned anywhere in the project's TS/JS/HTML.
 *
 * Without this the "never defined" check reports every token an app sets from
 * JavaScript — `style.setProperty("--row-height", …)` is how a CSS variable is
 * meant to be driven at runtime, and calling that a bug would be the loudest
 * false positive in the tool.
 *
 * @param {object} params
 * @param {string} params.root
 * @param {number} [params.maxFiles]
 * @returns {Set<string>}
 */
export function customPropertiesInSources({ root, maxFiles = 1500 }) {
    const found = new Set();
    const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".svg"];
    let budget = maxFiles;

    const walk = (dir) => {
        if (budget <= 0) return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (budget <= 0) return;
            if (SKIP_DIRS.has(entry.name)) continue;
            if (entry.name.startsWith(".") && entry.isDirectory()) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!exts.some((ext) => entry.name.endsWith(ext))) continue;
            budget -= 1;
            let text;
            try {
                text = readFileSync(full, "utf8");
            } catch {
                continue;
            }
            for (const match of text.matchAll(/(--[a-zA-Z][a-zA-Z0-9_-]*)/g)) found.add(match[1]);
        }
    };

    walk(root);
    return found;
}
