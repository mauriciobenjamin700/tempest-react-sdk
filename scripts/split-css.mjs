#!/usr/bin/env node
// @ts-check

/**
 * Split the built stylesheet into per-component and per-group entries.
 *
 * The JS a consumer imports is tree-shaken; the CSS is not. `styles.css` carries
 * every component the SDK ships, so an app using thirteen of them downloads the
 * other hundred and forty. Measured on a real consumer: 28.05 kB brotli for the
 * whole sheet against 6.95 kB for the rules its bundle can actually reach.
 *
 * The split is exact rather than heuristic, and that is the reason it is safe to
 * do at all. Every class name is hashed per CSS module
 * (`tempest_[local]_[hash]`), and every emitted `dist/**\/*.module.js` carries
 * both its source path and the hashed names that module owns. Attributing a rule
 * to a component is therefore a lookup, not a guess — and the run asserts that no
 * rule names classes from two modules, which is what would make it a guess.
 *
 * Runs after the Vite build, over `dist/`, so the class names it reads are the
 * ones actually shipped. `styles.css` is left exactly as it was: this only adds.
 *
 * Usage:
 *   node scripts/split-css.mjs
 *   node scripts/split-css.mjs --check   # write nothing; exit 1 if anything differs
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DIST = join(REPO_ROOT, "dist");
const OUT_DIR = join(DIST, "styles");
const SHEET = join(DIST, "styles.css");

/**
 * Documentation category → CSS group.
 *
 * The categories come from `docs/components/`, which is already the curated
 * grouping a reader navigates, and every exported component has a heading there
 * (`test/docs-guard.test.ts` keeps that true). Collapsing them here is what turns
 * fourteen doc pages into the handful of aggregates worth publishing.
 */
const CATEGORY_GROUP = {
    actions: "actions",
    identity: "identity",
    inputs: "forms",
    layout: "layout",
    "advanced-layout": "layout",
    navigation: "navigation",
    "advanced-navigation": "navigation",
    feedback: "feedback",
    overlay: "overlay",
    data: "data",
    "advanced-data": "data",
    "advanced-essentials": "advanced",
    "advanced-chat": "chat",
    utility: "utility",
};

/**
 * Modules whose group the documentation cannot decide.
 *
 * `Layout.module.css` holds `Container`, `Stack` and `Grid` at once, so its file
 * name matches no single heading; the media capture components are documented
 * under the pages of the hooks that drive them.
 */
const GROUP_OVERRIDES = {
    "components/Layout/Layout.module.css": "layout",
    "components/AudioPlayer/AudioPlayer.module.css": "media",
    "components/VideoPlayer/VideoPlayer.module.css": "media",
    "components/AudioRecorder/AudioRecorder.module.css": "media",
    "components/BarcodeScanner/BarcodeScanner.module.css": "media",
    "components/NotificationCenter/NotificationCenter.module.css": "feedback",
};

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
 * Map every hashed class name to the CSS module that declared it.
 *
 * @returns {Map<string, string>} Class name → source path, repo-relative.
 */
function readClassMap() {
    /** @type {Map<string, string>} */
    const map = new Map();
    for (const file of walk(DIST, ".module.js")) {
        const text = readFileSync(file, "utf8");
        const source = /\/\/#region (\S+\.module\.css)/.exec(text)?.[1];
        if (!source) continue;
        for (const match of text.matchAll(/"(tempest_[A-Za-z0-9_-]+)"/g)) {
            if (!map.has(match[1])) map.set(match[1], source.replace(/^src\//, ""));
        }
    }
    return map;
}

/**
 * Split a stylesheet into its top-level blocks, preserving the source text.
 *
 * A brace counter is enough here and a full parser would not be better: the input
 * is the compiler's own output, already valid, and the goal is to move bytes
 * around without rewriting them.
 *
 * @param {string} css - The stylesheet.
 * @returns {string[]} Top-level blocks and statements, trimmed.
 */
function splitTopLevel(css) {
    /** @type {string[]} */
    const out = [];
    let depth = 0;
    let start = 0;
    /** @type {string | null} */
    let quote = null;

    for (let i = 0; i < css.length; i += 1) {
        const char = css[i];
        if (quote) {
            if (char === quote && css[i - 1] !== "\\") quote = null;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === "{") depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                out.push(css.slice(start, i + 1));
                start = i + 1;
            }
        } else if (char === ";" && depth === 0) {
            out.push(css.slice(start, i + 1));
            start = i + 1;
        }
    }
    if (start < css.length && css.slice(start).trim()) out.push(css.slice(start));
    return out.map((block) => block.trim()).filter(Boolean);
}

/**
 * Read the documentation category of every documented component.
 *
 * @returns {Map<string, string>} Component name → category slug.
 */
function readCategories() {
    const dir = join(REPO_ROOT, "docs", "components");
    /** @type {Map<string, string>} */
    const categories = new Map();
    for (const page of readdirSync(dir).filter((f) => f.endsWith(".md") && !f.endsWith(".en.md"))) {
        const category = page.replace(/\.md$/, "");
        for (const match of readFileSync(join(dir, page), "utf8").matchAll(
            /^#{2,3}\s+`?<?([A-Z][A-Za-z0-9]*)/gm,
        )) {
            if (!categories.has(match[1])) categories.set(match[1], category);
        }
    }
    return categories;
}

/**
 * Resolve the group a CSS module belongs to.
 *
 * @param {string} source - Source path, relative to `src/`.
 * @param {Map<string, string>} categories - Component → documentation category.
 * @returns {string | null} The group, or `null` when nothing decides it.
 */
function groupFor(source, categories) {
    if (source in GROUP_OVERRIDES) return GROUP_OVERRIDES[source];
    const top = source.split("/")[0] ?? "";
    if (top !== "components") return top;
    const name = (source.split("/").at(-1) ?? "").replace(/\.module\.css$/, "");
    const category = categories.get(name);
    return category ? (CATEGORY_GROUP[category] ?? null) : null;
}

/** The component name a CSS module styles, used as its own entry file name. */
function componentFor(source) {
    return (source.split("/").at(-1) ?? "").replace(/\.module\.css$/, "");
}

/**
 * Write a file only when its bytes differ, reporting what happened.
 *
 * @param {string} path - Destination.
 * @param {string} text - Content.
 * @param {boolean} check - Report without writing.
 * @returns {boolean} Whether the file differs from what is on disk.
 */
function writeIfChanged(path, text, check) {
    const bytes = Buffer.from(text, "utf8");
    if (existsSync(path) && readFileSync(path).equals(bytes)) return false;
    if (!check) writeFileSync(path, bytes);
    return true;
}

/**
 * Entry point.
 *
 * @returns {void}
 */
function main() {
    const check = process.argv.includes("--check");
    if (!existsSync(SHEET)) throw new Error("dist/styles.css missing — run `npm run build` first");

    const classMap = readClassMap();
    const categories = readCategories();
    const css = readFileSync(SHEET, "utf8");
    const blocks = splitTopLevel(css);

    /** @type {Map<string, string[]>} */
    const byComponent = new Map();
    /** @type {string[]} */
    const core = [];
    /** @type {string[]} */
    const ambiguous = [];
    /** @type {Set<string>} */
    const ungrouped = new Set();
    /** @type {Map<string, Set<string>>} */
    const groupMembers = new Map();

    for (const block of blocks) {
        /** @type {Set<string>} */
        const owners = new Set();
        for (const match of block.matchAll(/\b(tempest_[A-Za-z0-9_-]+)/g)) {
            const source = classMap.get(match[1]);
            if (source) owners.add(source);
        }
        if (owners.size === 0) {
            core.push(block);
            continue;
        }
        if (owners.size > 1) {
            ambiguous.push(`${[...owners].join(" + ")} :: ${block.slice(0, 80)}`);
            continue;
        }
        const source = [...owners][0] ?? "";
        const group = groupFor(source, categories);
        if (group === null) ungrouped.add(source);
        const component = componentFor(source);
        if (!byComponent.has(component)) byComponent.set(component, []);
        byComponent.get(component)?.push(block);
        if (group !== null) {
            if (!groupMembers.has(group)) groupMembers.set(group, new Set());
            groupMembers.get(group)?.add(component);
        }
    }

    if (ambiguous.length > 0) {
        console.error(
            `split-css: ${ambiguous.length} rule(s) name classes from more than one module, so the split would be a guess:`,
        );
        for (const row of ambiguous) console.error(`  ${row}`);
        process.exitCode = 1;
        return;
    }
    if (ungrouped.size > 0) {
        console.error(
            `split-css: ${ungrouped.size} module(s) belong to no group — document the component, or add it to GROUP_OVERRIDES:`,
        );
        for (const source of ungrouped) console.error(`  ${source}`);
        process.exitCode = 1;
        return;
    }

    if (!check) {
        rmSync(OUT_DIR, { recursive: true, force: true });
        mkdirSync(OUT_DIR, { recursive: true });
    }

    const banner = "/* Generated by scripts/split-css.mjs — do not edit. */\n";
    let changed = 0;

    changed += writeIfChanged(join(OUT_DIR, "core.css"), banner + core.join("\n") + "\n", check)
        ? 1
        : 0;
    for (const [component, rules] of byComponent) {
        changed += writeIfChanged(
            join(OUT_DIR, `${component}.css`),
            banner + rules.join("\n") + "\n",
            check,
        )
            ? 1
            : 0;
    }
    for (const [group, members] of groupMembers) {
        const rules = [...members].sort().flatMap((component) => byComponent.get(component) ?? []);
        changed += writeIfChanged(
            join(OUT_DIR, `${group}.css`),
            banner + rules.join("\n") + "\n",
            check,
        )
            ? 1
            : 0;
    }

    const size = (text) => `${(brotliCompressSync(Buffer.from(text)).length / 1024).toFixed(2)} kB`;
    console.log(
        `split-css: ${blocks.length} rules → core (${size(core.join("\n"))}) + ` +
            `${byComponent.size} components + ${groupMembers.size} groups`,
    );
    console.log(`split-css: whole sheet ${size(css)} · core alone ${size(core.join("\n"))}`);

    if (check && changed > 0) {
        console.error(`split-css: ${changed} file(s) differ — run \`npm run build\``);
        process.exitCode = 1;
    }
}

main();
