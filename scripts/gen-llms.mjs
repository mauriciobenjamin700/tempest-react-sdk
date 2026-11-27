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
 * Excludes `*.en.md` translation files and `internal/`, the rules for
 * working on the SDK: `mkdocs.yml` leaves it out of the site, so an index
 * entry for it would point a reader at a 404. Returns absolute paths.
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
            if (entry === "internal") continue;
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
 * Whether a trimmed line opens a block that is not the page's prose: a
 * heading, quote, admonition, table, list, image or raw HTML.
 *
 * @param {string} line - The trimmed line.
 * @returns {boolean} `true` when the line is not running prose.
 */
function isNonProse(line) {
    return /^(#|>|!!!|\?\?\?|\||- |\* |\d+\. |!\[|<)/.test(line);
}

/**
 * Reduce Markdown inline syntax to plain text: code spans, emphasis, links
 * and emoji go, whitespace collapses.
 *
 * @param {string} text - The Markdown text.
 * @returns {string} Plain text.
 */
function plain(text) {
    return text
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The `description:` declared in a page's YAML front matter.
 *
 * Only the single-line form (`description: Texto.`) is read, optionally
 * quoted — the form the docs use.
 *
 * @param {string} content - The Markdown content.
 * @returns {string | undefined} The description, or `undefined` when none is declared.
 */
export function frontMatterDescription(content) {
    const block = /^---\n([\s\S]*?)\n---\n/.exec(content);
    const line = block?.[1].split("\n").find((entry) => entry.startsWith("description:"));
    if (!line) return undefined;
    return line
        .slice("description:".length)
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * The first sentence of a paragraph that is at least `minLength` long.
 *
 * A sentence ends at `.`, `!` or `?` followed by a space — not at `:`,
 * which in these docs introduces a list or a code block. Shorter
 * openings ("Veja abaixo.") keep the next sentence, so the index never
 * shows a fragment. A paragraph with no sentence end is returned whole.
 *
 * @param {string} text - The paragraph, as plain text.
 * @param {number} [minLength] - Shortest sentence worth stopping at.
 * @returns {string} The leading sentence(s).
 */
export function firstSentence(text, minLength = 40) {
    const ends = /[.!?](?=\s)/g;
    for (let match = ends.exec(text); match; match = ends.exec(text)) {
        if (match.index + 1 >= minLength) return text.slice(0, match.index + 1);
    }
    return text;
}

/**
 * Extract the one-sentence description of a page for `llms.txt`.
 *
 * A `description:` in the page's front matter wins — it is also the page's
 * `<meta name="description">` on the site. Pages that open with a hook
 * ("Este campo parece certo:") instead of a summary declare one. Otherwise
 * it reads the first prose paragraph after the H1 — every line of it, since
 * the docs wrap paragraphs across lines — skipping fenced code and the
 * indented body of admonitions, then keeps its first full sentence. Reading
 * only the first line, and not skipping admonitions, left 48 of 118 entries
 * ending mid-sentence or describing a warning box instead of the page.
 *
 * @param {string} content - The Markdown content.
 * @returns {string} A plain-text description (empty when the page has no prose).
 */
export function extractDescription(content) {
    const declared = frontMatterDescription(content);
    if (declared) return declared;
    const lines = content.split("\n");
    let seenH1 = false;
    let fenced = false;
    let inAdmonition = false;
    /** @type {string[]} */
    const paragraph = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!seenH1) {
            seenH1 = line.startsWith("# ");
            continue;
        }
        if (line.startsWith("```")) {
            fenced = !fenced;
            if (paragraph.length > 0) break;
            continue;
        }
        if (fenced) continue;
        if (inAdmonition && (raw.startsWith("    ") || line === "")) continue;
        inAdmonition = false;
        if (line === "") {
            if (paragraph.length > 0) break;
            continue;
        }
        if (isNonProse(line)) {
            if (paragraph.length > 0) break;
            inAdmonition = /^(!!!|\?\?\?)/.test(line);
            continue;
        }
        paragraph.push(line);
    }
    return firstSentence(plain(paragraph.join(" ")));
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

/**
 * Write `docs/llms.txt` and `docs/llms-full.txt` from the base pages.
 *
 * @returns {void}
 */
function main() {
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

    const indexParts = ["# tempest-react-sdk", "", `> ${SUMMARY}`, ""];
    /** @type {Array<keyof typeof sections>} */
    const sectionOrder = ["Documentação", "Componentes", "Receitas"];
    for (const name of sectionOrder) {
        if (sections[name].length === 0) continue;
        indexParts.push(`## ${name}`, "", ...sections[name], "");
    }
    const indexText = `${indexParts.join("\n").trimEnd()}\n`;

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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
