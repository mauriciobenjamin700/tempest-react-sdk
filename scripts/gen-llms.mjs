#!/usr/bin/env node
// @ts-check

/**
 * Generate llms.txt + llms-full.txt for the tempest-react-sdk docs.
 *
 * Follows the llmstxt.org convention:
 *  - `docs/llms.txt`      — a curated, link-based index of the documentation.
 *  - `docs/llms-full.txt` — the full corpus (every base `.md` concatenated).
 *
 * Reads the PT-BR docs (the base `.md` files under `docs/`), excluding any
 * `*.en.md` translations. The output is deterministic (files are sorted), so
 * re-running the script produces byte-stable files unless the docs change.
 *
 * Usage:
 *   node scripts/gen-llms.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DOCS_DIR = join(REPO_ROOT, "docs");
const SITE_BASE = "https://mauriciobenjamin700.github.io/tempest-react-sdk";

/** One-line summary used for the `>` blockquote in `llms.txt`. */
const SUMMARY =
    "Blocos de construção React/TypeScript compartilhados pelos frontends da Tempest: componentes de UI, hooks, cliente HTTP, store de auth, formulários (zod), transportes em tempo real (SSE/WebSocket/Web Push), tema, i18n, telemetria, feature flags, storage offline e roteamento.";

/**
 * Recursively collect every base Markdown file under a directory.
 *
 * Excludes `*.en.md` translation files. Returns absolute paths.
 *
 * @param {string} dir - The directory to walk.
 * @returns {string[]} Absolute paths of the collected `.md` files.
 */
function collectMarkdown(dir) {
    /** @type {string[]} */
    const files = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            files.push(...collectMarkdown(full));
        } else if (entry.endsWith(".md") && !entry.endsWith(".en.md")) {
            files.push(full);
        }
    }
    return files;
}

/**
 * Derive the published site slug from a doc file's path.
 *
 * MkDocs maps `docs/routing.md` -> `routing/` and `docs/components/advanced.md`
 * -> `components/advanced/`. `docs/index.md` maps to the site root (`""`).
 *
 * @param {string} absPath - Absolute path to the `.md` file.
 * @returns {string} The slug (no leading slash), or `""` for the index.
 */
function toSlug(absPath) {
    const rel = relative(DOCS_DIR, absPath).split("\\").join("/");
    const noExt = rel.replace(/\.md$/, "");
    if (noExt === "index") return "";
    return `${noExt}/`;
}

/**
 * Extract the first H1 (`# Title`) from Markdown content.
 *
 * Falls back to the relative path when no H1 is present.
 *
 * @param {string} content - The Markdown content.
 * @param {string} fallback - Title to use when no H1 is found.
 * @returns {string} The page title.
 */
function extractTitle(content, fallback) {
    for (const line of content.split("\n")) {
        const match = line.match(/^#\s+(.+?)\s*$/);
        if (match) return match[1].trim();
    }
    return fallback;
}

/**
 * Extract a one-line description from Markdown content.
 *
 * Uses the first non-empty paragraph after the H1, with Markdown emphasis and
 * inline code markers stripped and whitespace collapsed. Truncated to a single
 * sentence/line so the index stays concise.
 *
 * @param {string} content - The Markdown content.
 * @returns {string} A short plain-text description (may be empty).
 */
function extractDescription(content) {
    const lines = content.split("\n");
    let seenH1 = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (!seenH1) {
            if (line.startsWith("# ")) seenH1 = true;
            continue;
        }
        if (line === "") continue;
        if (line.startsWith("#")) continue;
        if (line.startsWith(">")) continue;
        // First real paragraph line: clean it up.
        let text = line
            .replace(/`([^`]+)`/g, "$1")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/[➡️✅⚠️💡🚀🤖]/gu, "")
            .replace(/\s+/g, " ")
            .trim();
        // Keep just the first sentence to stay one-line.
        const dot = text.indexOf(". ");
        if (dot > 40) text = text.slice(0, dot + 1);
        return text;
    }
    return "";
}

/**
 * Classify a doc file into an `llms.txt` H2 section.
 *
 * @param {string} slug - The site slug for the file.
 * @returns {"Componentes" | "Receitas" | "Documentação"} The section name.
 */
function sectionFor(slug) {
    if (slug.startsWith("components")) return "Componentes";
    if (slug === "release/" || slug === "gallery/") return "Receitas";
    return "Documentação";
}

const allFiles = collectMarkdown(DOCS_DIR).sort((a, b) => a.localeCompare(b));

/** @type {{ Documentação: string[]; Componentes: string[]; Receitas: string[] }} */
const sections = { Documentação: [], Componentes: [], Receitas: [] };

for (const file of allFiles) {
    const content = readFileSync(file, "utf8");
    const rel = relative(DOCS_DIR, file).split("\\").join("/");
    const slug = toSlug(file);
    const title = extractTitle(content, rel);
    const description = extractDescription(content);
    const url = `${SITE_BASE}/${slug}`;
    const suffix = description ? `: ${description}` : "";
    sections[sectionFor(slug)].push(`- [${title}](${url})${suffix}`);
}

// --- Build docs/llms.txt (curated index) ---
const indexParts = ["# tempest-react-sdk", "", `> ${SUMMARY}`, ""];
/** @type {Array<keyof typeof sections>} */
const sectionOrder = ["Documentação", "Componentes", "Receitas"];
for (const name of sectionOrder) {
    if (sections[name].length === 0) continue;
    indexParts.push(`## ${name}`, "", ...sections[name], "");
}
const indexText = `${indexParts.join("\n").trimEnd()}\n`;

// --- Build docs/llms-full.txt (full corpus) ---
const fullParts = [];
for (const file of allFiles) {
    const content = readFileSync(file, "utf8");
    const rel = relative(DOCS_DIR, file).split("\\").join("/");
    fullParts.push(`\n\n---\n\n# ${rel}\n\n${content.trimEnd()}`);
}
const fullText = `${fullParts.join("").trimStart()}\n`;

const indexPath = join(DOCS_DIR, "llms.txt");
const fullPath = join(DOCS_DIR, "llms-full.txt");
writeFileSync(indexPath, indexText, "utf8");
writeFileSync(fullPath, fullText, "utf8");

const indexBytes = Buffer.byteLength(indexText, "utf8");
const fullBytes = Buffer.byteLength(fullText, "utf8");

console.log(`gen-llms: scanned ${allFiles.length} markdown files`);
console.log(`gen-llms: wrote docs/llms.txt (${indexBytes} bytes)`);
console.log(`gen-llms: wrote docs/llms-full.txt (${fullBytes} bytes)`);
