#!/usr/bin/env node
// @ts-check

/**
 * Put the gallery screenshots inside the component documentation, and keep them
 * in sync with the sections they come from.
 *
 * The pictures are captured by `scripts/docs-shots.mjs`; this script is what
 * makes them visible where the reader actually is — under the heading of the
 * component, not on a separate page nobody opens. It rewrites a marked block so
 * re-running is idempotent and a renamed section shows up as a diff instead of
 * as a broken image discovered months later.
 *
 * One image per gallery section per page: the block is inserted under the first
 * component of that section on that page, because repeating the same screenshot
 * under five headings on one page is noise, not documentation.
 *
 * Usage:
 *   npm run docs:gallery            # insert or refresh the blocks
 *   npm run docs:gallery -- --check # write nothing; exit 1 if anything is stale
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DOCS_DIR = join(REPO_ROOT, "docs");
const COMPONENTS_DIR = join(DOCS_DIR, "components");
const REGISTRY = join(REPO_ROOT, "examples", "gallery", "src", "sections", "registry.tsx");
const SHOTS_DIR = join(DOCS_DIR, "assets", "gallery");

const BLOCK_START = "<!-- gallery:";
const BLOCK_END = "<!-- /gallery -->";

/**
 * Component → gallery section, for the pairs the `keywords` field cannot decide.
 *
 * Two kinds of entry live here. The first is disambiguation: a component named
 * by several sections is pinned to the one where it is the subject rather than
 * a bystander — `Toggle` belongs to `form-primitives`, not to the feedback
 * section that happens to use one. The second is the components the keywords
 * never mention, found by grepping the section sources.
 */
const SECTION_OVERRIDES = {
    AIChatComposer: "aichat",
    AIChatTurn: "aichat",
    AudioPlayer: "audio-capture",
    AudioRecorder: "audio-capture",
    BarcodeScanner: "device-capture",
    Chat: "chat",
    ChatComposer: "chat",
    Markdown: "markdown",
    RadioGroup: "form-primitives",
    SyncStatusBadge: "pwa",
    Toggle: "form-primitives",
    ToggleGroupItem: "feedback-extra",
    UpdatePrompt: "pwa",
};

/**
 * Components with no gallery section, and why.
 *
 * An exemption is a promise that the absence is deliberate. Everything here is
 * either a piece of a composed component that the parent's section already
 * shows, or a provider with nothing to render. `Kanban` is the exception worth
 * fixing: it shipped in P1 and never got a section.
 */
const WITHOUT_SECTION = {
    FormActions: "rendered by the form recipes, never on its own",
    FormRow: "layout piece of <FormField>, shown through it",
    FormSection: "layout piece of <FormField>, shown through it",
    Kanban: "no gallery section yet — tracked in the docs-visual issue",
    NProgressBar: "top-of-page progress bar, invisible in a static capture",
    OfflineIndicator: "needs a real offline transition to show anything",
    QRCapacityError: "an error type, not a rendered component",
    ToastProvider: "a provider; the toasts it renders are in the feedback section",
};

/**
 * Documentation page → gallery sections it should show, for the sections that
 * document a hook, a recipe or a foundation rather than a component.
 *
 * Component pages find their capture through the component name; these pages
 * have nothing to match on, and leaving them out would mean a third of the
 * captures are taken and never shown. The block lands right before the first
 * `##` heading, so the reader sees the thing before reading about it.
 */
const PAGE_SECTIONS = {
    "audio.md": ["audio-capture", "voice-chain"],
    "auth.md": ["recipe-auth"],
    "br-pagamentos.md": ["br-payments"],
    "br.md": ["brazil-map"],
    "charts.md": ["dataviz-scales"],
    "device-capture.md": ["device-capture"],
    "forms-br.md": ["br-forms"],
    "geo.md": ["geo"],
    "hooks.md": ["hooks-state", "hooks-dom"],
    "http.md": ["recipe-http"],
    "icons.md": ["icons"],
    "passkeys.md": ["recipe-passkeys"],
    "query.md": ["recipe-query"],
    "resumable-upload.md": ["recipe-resumable-upload"],
    "sse.md": ["recipe-realtime"],
    "share.md": ["meta"],
    "push.md": ["notification-center", "integrations"],
    "styles.md": ["utilities-css"],
    "utilities.md": ["utils"],
    "webrtc.md": ["peer-mesh"],
};

/**
 * Insert the blocks a non-component page asks for, before its first `##`.
 *
 * @param {string} text - The page content, already stripped of old blocks.
 * @param {{ id: string, label: string }[]} wanted - Sections to show, in order.
 * @param {boolean} english - Whether to write the English caption.
 * @returns {string} The page content with the blocks in place.
 */
function insertPageBlocks(text, wanted, english) {
    const lines = text.split("\n");
    const at = lines.findIndex((line) => line.startsWith("## "));
    const blocks = wanted.flatMap((section) => [renderBlock(section, english, ""), ""]);
    const where = at === -1 ? lines.length : at;
    lines.splice(where, 0, ...blocks);
    return lines.join("\n");
}

/**
 * Read the gallery section registry.
 *
 * @returns {{ id: string, label: string, group: string, words: Set<string> }[]} Sections in display order.
 */
function readSections() {
    const source = readFileSync(REGISTRY, "utf8");
    const body = source.slice(source.indexOf("export const SECTIONS"));
    const sections = [];
    for (const match of body.matchAll(
        /id:\s*"([^"]+)",\s*label:\s*"([^"]*)",\s*keywords:\s*\n?\s*"([\s\S]*?)",\s*group:\s*"([^"]+)"/g,
    )) {
        sections.push({
            id: match[1],
            label: match[2],
            group: match[4],
            words: new Set(
                match[3]
                    .replace(/"\s*\+?\s*\n?\s*"/g, " ")
                    .split(/\s+/)
                    .filter(Boolean),
            ),
        });
    }
    return sections;
}

/**
 * Resolve which gallery section documents a component.
 *
 * @param {string} component - The exported component name.
 * @param {{ id: string, words: Set<string> }[]} sections - Sections in display order.
 * @returns {string | null} The section id, or `null` when the component is exempt.
 */
function sectionFor(component, sections) {
    if (component in WITHOUT_SECTION) return null;
    if (component in SECTION_OVERRIDES) return SECTION_OVERRIDES[component];
    const hit = sections.find((section) => section.words.has(component.toLowerCase()));
    return hit ? hit.id : null;
}

/**
 * Build the marked block shown under a component heading.
 *
 * The image is wrapped in a link to the gallery page because the gallery is a
 * local app: the picture is what the reader gets here, and the link is how they
 * get the interactive version.
 *
 * @param {{ id: string, label: string }} section - The section being shown.
 * @param {boolean} english - Whether to write the English caption.
 * @param {string} prefix - Path prefix from the page to `docs/`, `""` at the root.
 * @returns {string} The block.
 */
function renderBlock(section, english, prefix) {
    const alt = english ? `${section.label} in the gallery` : `${section.label} na gallery`;
    const caption = english
        ? `*Section \`${section.id}\` of the [gallery](${prefix}gallery.md) — run it locally to interact.*`
        : `*Seção \`${section.id}\` da [gallery](${prefix}gallery.md) — rode localmente para interagir.*`;
    return [
        `${BLOCK_START}${section.id} -->`,
        `[![${alt}](${prefix}assets/gallery/${section.id}.webp)](${prefix}gallery.md)`,
        "",
        caption,
        BLOCK_END,
    ].join("\n");
}

/**
 * Replace the body of a named generated block, keeping the markers.
 *
 * @param {string} text - The page content.
 * @param {string} name - Block name, as in `<!-- gallery:<name> -->`.
 * @param {string} content - The replacement body.
 * @returns {string} The page with the block filled.
 */
function fillNamedBlock(text, name, content) {
    const open = `${BLOCK_START}${name} -->`;
    const start = text.indexOf(open);
    if (start === -1) throw new Error(`missing block marker: ${open}`);
    const end = text.indexOf(BLOCK_END, start);
    if (end === -1) throw new Error(`unterminated block: ${open}`);
    return text.slice(0, start + open.length) + "\n" + content + "\n" + text.slice(end);
}

/**
 * Render the table of gallery sections straight from the registry.
 *
 * The hand-maintained version of this table said "22 sections" while the app
 * had 63, which is the failure mode a generated table removes.
 *
 * @param {{ id: string, label: string, group: string }[]} sections - Sections in display order.
 * @param {boolean} english - Whether to write English headers.
 * @returns {string} The Markdown table.
 */
function renderSectionsTable(sections, english) {
    const head = english ? ["#", "Section", "Anchor", "Group"] : ["#", "Seção", "Âncora", "Grupo"];
    const rows = sections.map(
        (section, index) =>
            `| ${index + 1} | ${section.label} | \`#${section.id}\` | ${section.group} |`,
    );
    return [`| ${head.join(" | ")} |`, "| --- | --- | --- | --- |", ...rows].join("\n");
}

/**
 * Render the screenshot showcase for the gallery page.
 *
 * Only sections captured in both themes appear: a light/dark pair is what makes
 * this page worth scrolling, and putting all 63 captures here would cost several
 * megabytes to say the same thing.
 *
 * @param {{ id: string, label: string }[]} sections - Sections in display order.
 * @param {boolean} english - Whether to write the English prose.
 * @returns {string} The Markdown body.
 */
function renderScreenshots(sections, english) {
    const shots = new Set(readdirSync(SHOTS_DIR).filter((file) => file.endsWith(".webp")));
    const paired = sections.filter((section) => shots.has(`${section.id}.dark.webp`));
    const note = english
        ? `Every section has its own capture next to the component it documents; the pairs below are the ones where the theme is the point. All ${shots.size} images are regenerated by \`npm run docs:shots\`.`
        : `Cada seção tem a própria captura ao lado do componente que documenta; os pares abaixo são aqueles em que o tema é o assunto. As ${shots.size} imagens são regeneradas por \`npm run docs:shots\`.`;
    const blocks = paired.map((section) => {
        const light = english ? "light" : "claro";
        const dark = english ? "dark" : "escuro";
        return [
            `### ${section.label}`,
            "",
            `![${section.label} — ${light}](assets/gallery/${section.id}.webp)`,
            "",
            `![${section.label} — ${dark}](assets/gallery/${section.id}.dark.webp)`,
        ].join("\n");
    });
    return [note, "", ...blocks.join("\n\n").split("\n")].join("\n");
}

/**
 * Strip every generated block from a page.
 *
 * @param {string} text - The page content.
 * @returns {string} The content without generated blocks.
 */
function stripBlocks(text) {
    const lines = text.split("\n");
    /** @type {string[]} */
    const kept = [];
    let inside = false;
    for (const line of lines) {
        if (line.startsWith(BLOCK_START)) {
            inside = true;
            if (kept.at(-1) === "") kept.pop();
            continue;
        }
        if (line === BLOCK_END) {
            inside = false;
            continue;
        }
        if (!inside) kept.push(line);
    }
    return kept.join("\n");
}

/**
 * Insert one block under the first heading of each section covered by a page.
 *
 * @param {string} text - The page content, already stripped of old blocks.
 * @param {Map<string, { id: string, label: string }>} byComponent - Component → section.
 * @param {boolean} english - Whether to write the English caption.
 * @returns {string} The page content with the blocks in place.
 */
function insertBlocks(text, byComponent, english) {
    const lines = text.split("\n");
    /** @type {string[]} */
    const out = [];
    const seen = new Set();
    for (let i = 0; i < lines.length; i += 1) {
        out.push(lines[i]);
        const heading = /^#{2,3}\s+`?<?([A-Z][A-Za-z0-9]*)/.exec(lines[i]);
        if (!heading) continue;
        const section = byComponent.get(heading[1]);
        if (!section || seen.has(section.id)) continue;
        seen.add(section.id);
        while (lines[i + 1] === "") i += 1;
        out.push("", renderBlock(section, english, "../"), "");
    }
    return out.join("\n");
}

/**
 * Collect the component names exported by `src/components`.
 *
 * @returns {Set<string>} Value exports whose name starts with an uppercase letter.
 */
function readComponents() {
    const barrel = readFileSync(join(REPO_ROOT, "src", "components", "index.ts"), "utf8");
    /** @type {Set<string>} */
    const components = new Set();
    for (const match of barrel.matchAll(/export\s+\{([^}]*)\}/g)) {
        if (/export\s+type\s*\{/.test(match[0])) continue;
        for (const raw of match[1].split(",")) {
            const name = raw
                .trim()
                .replace(/^type\s+/, "")
                .split(/\s+as\s+/)
                .pop()
                ?.trim();
            if (name && /^[A-Z]/.test(name)) components.add(name);
        }
    }
    return components;
}

/**
 * Entry point.
 *
 * @returns {void}
 */
function main() {
    const check = process.argv.includes("--check");
    const sections = readSections();
    const byId = new Map(sections.map((section) => [section.id, section]));

    /** @type {Map<string, { id: string, label: string }>} */
    const byComponent = new Map();
    /** @type {string[]} */
    const unresolved = [];
    for (const component of readComponents()) {
        const id = sectionFor(component, sections);
        if (id === null) {
            if (!(component in WITHOUT_SECTION)) unresolved.push(component);
            continue;
        }
        const section = byId.get(id);
        if (!section) {
            unresolved.push(`${component} -> unknown section "${id}"`);
            continue;
        }
        byComponent.set(component, section);
    }

    if (unresolved.length > 0) {
        console.error(
            `docs-gallery: ${unresolved.length} component(s) map to no gallery section and are not exempt:`,
        );
        for (const name of unresolved) console.error(`  ${name}`);
        process.exitCode = 1;
        return;
    }

    let stale = 0;
    for (const file of readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith(".md"))) {
        const path = join(COMPONENTS_DIR, file);
        const before = readFileSync(path, "utf8");
        const after = insertBlocks(stripBlocks(before), byComponent, file.endsWith(".en.md"));
        if (after === before) continue;
        stale += 1;
        if (!check) writeFileSync(path, after);
        console.log(`docs-gallery: ${check ? "stale" : "updated"} ${file}`);
    }

    for (const [file, ids] of Object.entries(PAGE_SECTIONS)) {
        for (const name of [file, file.replace(/\.md$/, ".en.md")]) {
            const path = join(DOCS_DIR, name);
            const before = readFileSync(path, "utf8");
            const wanted = ids.map((id) => byId.get(id)).filter(Boolean);
            const after = insertPageBlocks(
                stripBlocks(before),
                /** @type {{ id: string, label: string }[]} */ (wanted),
                name.endsWith(".en.md"),
            );
            if (after === before) continue;
            stale += 1;
            if (!check) writeFileSync(path, after);
            console.log(`docs-gallery: ${check ? "stale" : "updated"} ${name}`);
        }
    }

    for (const file of ["gallery.md", "gallery.en.md"]) {
        const path = join(DOCS_DIR, file);
        const before = readFileSync(path, "utf8");
        const english = file.endsWith(".en.md");
        let after = fillNamedBlock(before, "sections", renderSectionsTable(sections, english));
        after = fillNamedBlock(after, "screenshots", renderScreenshots(sections, english));
        if (after === before) continue;
        stale += 1;
        if (!check) writeFileSync(path, after);
        console.log(`docs-gallery: ${check ? "stale" : "updated"} ${file}`);
    }

    console.log(
        `docs-gallery: ${byComponent.size} components mapped, ${Object.keys(WITHOUT_SECTION).length} exempt, ${stale} page(s) ${check ? "stale" : "updated"}`,
    );
    if (check && stale > 0) {
        console.error("docs-gallery: run `npm run docs:gallery`");
        process.exitCode = 1;
    }
}

main();
