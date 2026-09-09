#!/usr/bin/env node
// @ts-check

/**
 * Make every component module import its own stylesheet.
 *
 * `split-css.mjs` cuts `styles.css` into one sheet per component, but nothing
 * links the JavaScript to the CSS: the app has to import each sheet by hand, or
 * run `tempestStyles()` to have the list written for it. Both work and neither is
 * what a consumer expects — `import { Button }` should bring the button's CSS the
 * way it brings the button's markup.
 *
 * Vite's library mode will not do this on its own. Measured with
 * `cssCodeSplit: true`: it emits one stylesheet per CSS module and injects the
 * import into none of them, because in an app build that link becomes a `<link>`
 * tag in the HTML instead. So the link is written here, after the split, against
 * the same mapping the split already computes.
 *
 * The import goes in `*.module.js` rather than the component's own chunk, because
 * that file is the one the CSS belongs to and every consumer of those class names
 * already imports it. `sideEffects: ["**\/*.css"]` in `package.json` is what keeps
 * a bundler from dropping it.
 *
 * The CommonJS twin is linked from the ESM file's mapping rather than read on its
 * own: the `.cjs` output carries no `//#region` comment to recover the source path
 * from, and deriving it from the file name instead would be a second, weaker
 * mapping that could disagree with the first.
 *
 * Usage:
 *   node scripts/link-component-css.mjs
 *   node scripts/link-component-css.mjs --check   # write nothing; exit 1 if anything differs
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DIST = join(REPO_ROOT, "dist");
const STYLES_DIR = join(DIST, "styles");

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
 * The stylesheet name `split-css.mjs` gave a CSS module.
 *
 * Kept identical to that script's `componentFor` on purpose: the two names have to
 * agree, and the run below fails loudly when they stop agreeing rather than
 * silently linking to a file that is not there.
 *
 * The sheet is taken from `styles/component/`, never the `styles/<Component>.css`
 * shim beside it: two component names collide case-insensitively with a group sheet
 * (`Chat`/`chat`, `Layout`/`layout`), and on macOS a module importing the shim would
 * load the whole group instead of itself.
 *
 * @param {string} source - Source path of the CSS module, e.g. `src/components/Button/Button.module.css`.
 * @returns {string} Stylesheet base name, e.g. `Button`.
 */
function sheetFor(source) {
    return (source.split("/").at(-1) ?? "").replace(/\.module\.css$/, "");
}

/**
 * Rewrite one module file so it loads its stylesheet first.
 *
 * The statement goes on a line of its own above the code, which shifts every
 * mapped line down by one — so the sibling source map is shifted with it. A source
 * map has one `;`-separated group per output line, and these files are minified to
 * a couple of long lines, so a wrong offset does not misattribute a column: it
 * points the whole file at the wrong line.
 *
 * @param {string} file - Absolute path of a module file in `dist/`.
 * @param {string} statement - The load statement to inject, without its newline.
 * @param {boolean} check - Report without writing.
 * @returns {boolean} Whether the file differs from what is on disk.
 */
function link(file, statement, check) {
    const text = readFileSync(file, "utf8");
    if (text.startsWith(statement)) return false;
    if (!check) {
        writeFileSync(file, `${statement}\n${text}`, "utf8");
        const map = `${file}.map`;
        if (existsSync(map)) {
            /** @type {{ mappings?: string }} */
            const parsed = JSON.parse(readFileSync(map, "utf8"));
            if (typeof parsed.mappings === "string") {
                parsed.mappings = `;${parsed.mappings}`;
                writeFileSync(map, JSON.stringify(parsed), "utf8");
            }
        }
    }
    return true;
}

/**
 * Entry point.
 *
 * @returns {void}
 */
function main() {
    const check = process.argv.includes("--check");
    if (!existsSync(STYLES_DIR)) {
        throw new Error("dist/styles missing — run `npm run build` first");
    }

    /** @type {string[]} */
    const missing = [];
    let changed = 0;
    let linked = 0;

    for (const file of walk(DIST, ".module.js")) {
        const text = readFileSync(file, "utf8");
        const source = /\/\/#region (\S+\.module\.css)/.exec(text)?.[1];
        if (!source) continue;
        const sheet = join(STYLES_DIR, "component", `${sheetFor(source)}.css`);
        if (!existsSync(sheet)) {
            missing.push(`${relative(DIST, file)} → styles/component/${sheetFor(source)}.css`);
            continue;
        }
        const raw = relative(dirname(file), sheet).split("\\").join("/");
        const specifier = raw.startsWith(".") ? raw : `./${raw}`;
        linked += 1;
        changed += link(file, `import "${specifier}";`, check) ? 1 : 0;

        const cjs = file.replace(/\.module\.js$/, ".module.cjs");
        if (existsSync(cjs)) {
            changed += link(cjs, `require("${specifier}");`, check) ? 1 : 0;
        } else {
            missing.push(`${relative(DIST, cjs)} (CommonJS twin of ${relative(DIST, file)})`);
        }
    }

    if (missing.length > 0) {
        console.error(
            `link-component-css: ${missing.length} module(s) have no stylesheet to import, so ` +
                "importing the component would leave it unstyled. `sheetFor` here and " +
                "`componentFor` in split-css.mjs have to agree:",
        );
        for (const row of missing) console.error(`  ${row}`);
        process.exitCode = 1;
        return;
    }

    console.log(
        `link-component-css: ${linked} module(s) load their own stylesheet, ESM and CommonJS`,
    );

    if (check && changed > 0) {
        console.error(`link-component-css: ${changed} file(s) differ — run \`npm run build\``);
        process.exitCode = 1;
    }
}

main();
