#!/usr/bin/env node
// @ts-check

/**
 * Emit `dist/styles/manifest.json`: the stylesheets each public export needs.
 *
 * `scripts/split-css.mjs` cuts `styles.css` into one sheet per component, but
 * leaves the consumer to decide which sheets to import. That decision is not the
 * one it looks like: a component pulls in the CSS of every SDK component it
 * renders internally, so importing `AppShell.css` because the app writes
 * `<AppShell>` under-serves it by however many components `AppShell` composes.
 * The manifest resolves that transitive closure once, at build time, over the
 * module graph actually shipped.
 *
 * Reads `dist/` rather than `src/` for the same reason `split-css.mjs` does: the
 * graph there is the one the consumer's bundler will walk, `preserveModules`
 * keeps it one file per source module, and its imports are already normalised.
 *
 * Usage:
 *   node scripts/gen-style-manifest.mjs
 *   node scripts/gen-style-manifest.mjs --check   # write nothing; exit 1 if stale
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DIST = join(REPO_ROOT, "dist");
const BARREL = join(DIST, "tempest-react-sdk.js");
const OUT = join(DIST, "styles", "manifest.json");

/**
 * Walk a directory for files whose name ends in a suffix.
 *
 * @param {string} dir - Directory to walk.
 * @param {string} suffix - Required file-name ending.
 * @param {string[]} out - Accumulator.
 * @returns {string[]} Absolute paths.
 */
function walk(dir, suffix, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path, suffix, out);
        else if (entry.name.endsWith(suffix)) out.push(path);
    }
    return out;
}

/**
 * Map every emitted module to the stylesheet it owns, when it owns one.
 *
 * A `*.module.js` is the compiled class-name table of one `*.module.css`, and the
 * sheet `split-css.mjs` writes is named after that source file — so the mapping is
 * a rename, not a guess.
 *
 * @returns {Map<string, string>} Dist-relative module path → sheet file name.
 */
function readSheetOwners() {
    /** @type {Map<string, string>} */
    const owners = new Map();
    for (const file of walk(DIST, ".module.js")) {
        const source = /\/\/#region (\S+\.module\.css)/.exec(readFileSync(file, "utf8"))?.[1];
        if (!source) continue;
        const name = (source.split("/").at(-1) ?? "").replace(/\.module\.css$/, "");
        owners.set(relative(DIST, file), `${name}.css`);
    }
    return owners;
}

/**
 * Read the local import specifiers of an emitted module.
 *
 * Only relative specifiers matter: a bare one is React, a peer, or a direct
 * dependency, and none of those carry SDK stylesheets.
 *
 * @param {string} distPath - Dist-relative module path.
 * @returns {string[]} Dist-relative paths of the modules it imports.
 */
function localImports(distPath) {
    const code = readFileSync(join(DIST, distPath), "utf8");
    /** @type {string[]} */
    const out = [];
    for (const match of code.matchAll(/(?:^|[\s;])(?:import|export)[^"';]*?["'](\.[^"']+)["']/gm)) {
        out.push(relative(DIST, resolve(join(DIST, dirname(distPath)), match[1])));
    }
    for (const match of code.matchAll(/\bimport\(\s*["'](\.[^"']+)["']\s*\)/g)) {
        out.push(relative(DIST, resolve(join(DIST, dirname(distPath)), match[1])));
    }
    return out;
}

/**
 * Resolve every stylesheet reachable from a module, itself included.
 *
 * @param {string} entry - Dist-relative module path.
 * @param {Map<string, string>} owners - Module → sheet.
 * @param {Map<string, string[]>} graph - Module → imported modules.
 * @param {Map<string, string[]>} memo - Resolved closures, keyed by module.
 * @returns {string[]} Sheet file names, sorted.
 */
function closure(entry, owners, graph, memo) {
    const cached = memo.get(entry);
    if (cached) return cached;

    /** @type {Set<string>} */
    const sheets = new Set();
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {string[]} */
    const stack = [entry];

    while (stack.length) {
        const current = /** @type {string} */ (stack.pop());
        if (seen.has(current)) continue;
        seen.add(current);
        const sheet = owners.get(current);
        if (sheet) sheets.add(sheet);
        for (const next of graph.get(current) ?? []) stack.push(next);
    }

    const result = [...sheets].sort();
    memo.set(entry, result);
    return result;
}

/**
 * Map each name the root entry exports to the module that defines it.
 *
 * The barrel binds every re-export to a minified local first
 * (`import { Button as t } from "./components/Button/Button.js"`) and renames it
 * back in one trailing `export {}`. Both halves are needed: the import gives the
 * module, the export gives the public name.
 *
 * @returns {Map<string, string>} Public export name → dist-relative module path.
 */
function readBarrelExports() {
    const code = readFileSync(BARREL, "utf8");
    /** @type {Map<string, string>} */
    const moduleOfLocal = new Map();

    for (const match of code.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/gm)) {
        const target = relative(DIST, resolve(DIST, match[2]));
        for (const part of match[1].split(",")) {
            const local = part
                .trim()
                .split(/\s+as\s+/)
                .at(-1);
            if (local) moduleOfLocal.set(local, target);
        }
    }

    /** @type {Map<string, string>} */
    const exports = new Map();
    for (const match of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
        for (const part of match[1].split(",")) {
            const [local, exported] = part.trim().split(/\s+as\s+/);
            const name = exported ?? local;
            const target = moduleOfLocal.get(local);
            if (name && target) exports.set(name, target);
        }
    }
    return exports;
}

/**
 * Entry point.
 *
 * @returns {void}
 */
function main() {
    const check = process.argv.includes("--check");
    if (!existsSync(BARREL)) throw new Error("dist/ missing — run `npm run build` first");

    const owners = readSheetOwners();
    /** @type {Map<string, string[]>} */
    const graph = new Map();
    for (const file of walk(DIST, ".js")) {
        const key = relative(DIST, file);
        graph.set(key, localImports(key));
    }

    /** @type {Map<string, string[]>} */
    const memo = new Map();
    /** @type {Record<string, string[]>} */
    const components = {};
    for (const [name, target] of readBarrelExports()) {
        const sheets = closure(target, owners, graph, memo);
        if (sheets.length) components[name] = sheets;
    }

    const manifest = {
        note: "Generated by scripts/gen-style-manifest.mjs — do not edit.",
        core: "core.css",
        components: Object.fromEntries(
            Object.entries(components).sort(([a], [b]) => (a < b ? -1 : 1)),
        ),
    };
    const text = `${JSON.stringify(manifest, null, 2)}\n`;

    const stale = !existsSync(OUT) || readFileSync(OUT, "utf8") !== text;
    if (!check) writeFileSync(OUT, text);

    const sheets = new Set(Object.values(components).flat());
    console.log(
        `gen-style-manifest: ${Object.keys(components).length} exports → ${sheets.size} sheets`,
    );
    if (check && stale) {
        console.error("gen-style-manifest: manifest.json is stale — run `npm run build`");
        process.exitCode = 1;
    }
}

main();
