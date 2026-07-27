// `tempest fix --extract-css` — move a declaration block that repeats across CSS
// Modules into the project's global stylesheet, and rewrite the JSX that pointed
// at the local copies.
//
// Opt-in, and it stays opt-in. The other passes of `fix` remove things that are
// provably dead; this one makes a **design** decision — that N screens should now
// share one class, and therefore change together. That is a call about coupling,
// so it happens only when somebody asks for it by name.
//
// Everything here is refusal-first. A group is extracted only when every one of
// these holds, and each refusal is reported with its reason rather than skipped
// in silence:
//
//   - every occurrence is a lone class selector (`.row`), outside any at-rule;
//   - no other rule in that module mentions the class (a `:hover`, a descendant
//     selector or a `@media` override would stay behind and lose its subject);
//   - the module keeps at least one other rule, so its import does not become
//     dead and take the remaining styles down with it;
//   - the class is only ever read as `styles.row` / `styles["row"]`, never
//     through a computed key or by handing the whole object around;
//   - the target global sheet exists AND some source file imports it, because
//     appending to a stylesheet nobody loads is a silent no-op;
//   - the new global name collides with nothing already in that sheet.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { discoverAlias } from "../alias/discover.mjs";
import { loadTypeScript, typeScriptUnavailableReason } from "../alias/typescript.mjs";
import { collectSources, indexClassUses, resolveSpecifier } from "./references.mjs";
import { parseCss } from "./parse.mjs";
import { declSignature } from "./semantic.mjs";

/** A repeated block is only worth extracting from this many declarations up. */
const MIN_DECLS = 3;

/** Stylesheets treated as "the project's global sheet", in order of preference. */
const TARGET_CANDIDATES = [
    "src/styles/globals.css",
    "src/styles/global.css",
    "src/globals.css",
    "src/global.css",
    "src/index.css",
    "src/app.css",
    "app/globals.css",
    "styles/globals.css",
    "index.css",
];

/** `.row` → `row`, or `null` when the selector is anything more than one class. */
export function loneClass(prelude) {
    const match = /^\.([A-Za-z_][A-Za-z0-9_-]*)$/.exec(prelude.trim());
    return match ? match[1] : null;
}

/** `cardHeader` → `card-header`. */
export function kebab(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[_\s]+/g, "-")
        .toLowerCase();
}

/** Class names a stylesheet already defines, at any depth. */
export function classNamesIn(parsed) {
    const names = new Set();
    for (const block of parsed.blocks) {
        for (const match of block.prelude.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
            names.add(match[1]);
        }
    }
    return names;
}

/**
 * Pick the global stylesheet to append to, and prove somebody imports it.
 *
 * @param {object} params
 * @param {string} params.root
 * @param {string} [params.explicit] - Path from `--css-target`.
 * @param {{ prefix: string, baseDir: string } | null} params.alias
 * @returns {{ path: string, file: string } | { error: string }}
 */
export function findGlobalSheet({ root, explicit, alias }) {
    const candidates = explicit ? [explicit] : TARGET_CANDIDATES;
    const found = candidates.map((rel) => join(root, rel)).find(existsSync);
    if (!found) {
        return {
            error: explicit
                ? `--css-target "${explicit}" não existe`
                : `nenhuma folha global encontrada (procurei ${TARGET_CANDIDATES.join(", ")}) — passe --css-target <arquivo>`,
        };
    }
    if (found.endsWith(".module.css")) {
        return {
            error: `${relative(root, found)} é um CSS Module — a folha alvo tem que ser global`,
        };
    }

    const imported = collectSources({ root }).some((file) => {
        let text;
        try {
            text = readFileSync(file, "utf8");
        } catch {
            return false;
        }
        if (!text.includes(".css")) return false;
        for (const match of text.matchAll(/["']([^"']+\.css)["']/g)) {
            const target = resolveSpecifier({ specifier: match[1], fromFile: file, alias });
            if (target === found) return true;
        }
        return false;
    });
    if (!imported) {
        return {
            error: `${relative(root, found)} não é importada por nenhum arquivo do projeto — o que fosse movido pra lá não carregaria`,
        };
    }
    return { path: found, file: relative(root, found) };
}

/** Group the analysed sheets by identical declaration block. */
function groupBySignature(sheets) {
    const groups = new Map();
    for (const sheet of sheets) {
        if (!sheet.isModule) continue;
        for (const block of sheet.parsed.blocks) {
            if (block.kind !== "rule" || block.decls.length < MIN_DECLS) continue;
            const signature = declSignature(block);
            const group = groups.get(signature) ?? { signature, entries: [] };
            group.entries.push({ sheet, block });
            groups.set(signature, group);
        }
    }
    return [...groups.values()];
}

/**
 * Why this occurrence cannot be extracted, or `null` when it can.
 *
 * @returns {string | null}
 */
function occurrenceRefusal({ sheet, block, className, uses, opaqueModules }) {
    if (block.context.length > 0) {
        return `está dentro de \`${block.context.join(" › ")}\` — mover pra fora mudaria quando a regra vale`;
    }
    if (!className) return `\`${block.prelude}\` não é uma classe simples`;

    const mentions = sheet.parsed.blocks.filter(
        (other) =>
            other !== block && new RegExp(`\\.${className}(?![A-Za-z0-9_-])`).test(other.prelude),
    );
    if (mentions.length > 0) {
        return `outra regra na mesma folha usa \`.${className}\` (linha ${mentions[0].line}) e ficaria sem sujeito`;
    }

    const remaining = sheet.parsed.blocks.filter(
        (other) => other !== block && other.kind === "rule",
    );
    if (remaining.length === 0) {
        return "é a única regra do módulo — o import viraria código morto e levaria a folha inteira";
    }

    const opaque = opaqueModules.get(sheet.path);
    if (opaque) {
        return `o módulo é usado de forma não estática em ${opaque.file}:${opaque.line} — ${opaque.reason}`;
    }

    if (!uses || uses.length === 0) {
        return `nenhum \`styles.${className}\` no código — a classe já é código morto, e mover não conserta isso`;
    }
    return null;
}

/**
 * Build the extraction plan.
 *
 * @param {object} params
 * @param {ReturnType<import("./analyze.mjs").analyzeCss>} params.analysis
 * @param {string} params.root
 * @param {string} [params.target] - Path from `--css-target`.
 * @param {string} [params.prefix] - Prefix for the new global class names.
 * @returns {{
 *   status: "ok" | "no-typescript" | "no-target",
 *   message?: string,
 *   target?: { path: string, file: string },
 *   groups: Array<object>,
 *   refusals: Array<{ file: string, line: number, reason: string }>,
 * }}
 */
export function planExtraction({ analysis, root, target, prefix = "u-" }) {
    const ts = loadTypeScript(root);
    if (!ts) {
        return {
            status: "no-typescript",
            message: `a reescrita do TSX precisa do compilador do projeto: ${typeScriptUnavailableReason(root)}`,
            groups: [],
            refusals: [],
        };
    }
    const alias = discoverAlias({ root, ts });
    const sheet = findGlobalSheet({ root, explicit: target, alias });
    if (sheet.error) {
        return { status: "no-target", message: sheet.error, groups: [], refusals: [] };
    }

    const modulePaths = analysis.sheets.filter((s) => s.isModule).map((s) => s.path);
    const { byModule, opaqueModules } = indexClassUses({ root, ts, modulePaths, alias });

    const targetText = readFileSync(sheet.path, "utf8");
    const taken = classNamesIn(parseCss(targetText));
    const groups = [];
    const refusals = [];

    for (const group of groupBySignature(analysis.sheets)) {
        if (group.entries.length < 2) continue;

        const eligible = [];
        for (const entry of group.entries) {
            const className = loneClass(entry.block.prelude);
            const uses = className ? byModule.get(entry.sheet.path)?.get(className) : null;
            const refusal = occurrenceRefusal({ ...entry, className, uses, opaqueModules });
            if (refusal) {
                refusals.push({ file: entry.sheet.file, line: entry.block.line, reason: refusal });
                continue;
            }
            eligible.push({ ...entry, className, uses });
        }

        const files = new Set(eligible.map((e) => e.sheet.file));
        if (eligible.length < 2 || files.size < 2) continue;

        const name = `${prefix}${kebab(commonName(eligible))}`;
        if (taken.has(name)) {
            refusals.push({
                file: sheet.file,
                line: 1,
                reason: `\`.${name}\` já existe na folha global — renomeie a classe local ou use --css-prefix`,
            });
            continue;
        }
        taken.add(name);

        groups.push({
            name,
            decls: eligible[0].block.decls.map((d) => ({ prop: d.prop, value: d.value })),
            occurrences: eligible.map((e) => ({
                path: e.sheet.path,
                file: e.sheet.file,
                line: e.block.line,
                className: e.className,
                start: e.block.start,
                end: e.block.end,
                sites: e.uses.map((u) => ({
                    path: u.file,
                    file: relative(root, u.file),
                    line: u.line,
                    start: u.start,
                    end: u.end,
                })),
            })),
        });
    }

    return { status: "ok", target: sheet, groups, refusals };
}

/**
 * The name for the extracted class: the local name the codebase already uses
 * most, by modules first and call sites second.
 *
 * A tie is the normal case — the copies live in different modules precisely
 * because nobody agreed on a name — so the order of the occurrences breaks it,
 * which keeps the result deterministic across runs. The chosen name is printed
 * before anything is written; `--css-prefix` is there for when it needs a
 * namespace rather than a different word.
 */
function commonName(eligible) {
    const counts = new Map();
    for (const entry of eligible) {
        const current = counts.get(entry.className) ?? { modules: 0, sites: 0 };
        counts.set(entry.className, {
            modules: current.modules + 1,
            sites: current.sites + entry.uses.length,
        });
    }
    return [...counts.entries()].sort(
        (a, b) => b[1].modules - a[1].modules || b[1].sites - a[1].sites,
    )[0][0];
}

/** Render the extracted rule for the global sheet. */
export function renderRule({ name, decls, occurrences }) {
    const body = decls.map((d) => `    ${d.prop}: ${d.value};`).join("\n");
    return [
        `/* extraído por \`tempest fix --extract-css\` de ${occurrences.length} CSS Modules */`,
        `.${name} {`,
        body,
        "}",
        "",
    ].join("\n");
}

/**
 * Grow a removal range over the leading indentation and the trailing newline.
 * Same rule as the dedupe pass, so a removed rule leaves no blank indented line.
 */
function expandRange(text, start, end) {
    let from = start;
    while (from > 0 && (text[from - 1] === " " || text[from - 1] === "\t")) from -= 1;
    if (from > 0 && text[from - 1] !== "\n") from = start;
    let to = end;
    while (to < text.length && (text[to] === " " || text[to] === "\t")) to += 1;
    if (text[to] === "\r") to += 1;
    if (text[to] === "\n") to += 1;
    return { start: from, end: to };
}

/** Apply text edits back-to-front. */
function splice(text, edits) {
    let out = text;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, edit.start) + (edit.text ?? "") + out.slice(edit.end);
    }
    return out;
}

/**
 * Apply an extraction plan to disk.
 *
 * @param {object} params
 * @param {ReturnType<typeof planExtraction>} params.plan
 * @param {boolean} [params.dryRun]
 * @returns {{
 *   moved: number,
 *   rules: number,
 *   files: Array<{ file: string, changes: string[] }>,
 *   errors: Array<{ file: string, message: string }>,
 * }}
 */
export function applyExtraction({ plan, dryRun = false }) {
    const result = { moved: 0, rules: 0, files: [], errors: [] };
    if (plan.status !== "ok" || plan.groups.length === 0) return result;

    const edits = new Map();
    const changes = new Map();
    const record = (file, message) => {
        changes.set(file, [...(changes.get(file) ?? []), message]);
    };
    const push = (path, edit) => {
        edits.set(path, [...(edits.get(path) ?? []), edit]);
    };

    let appended = "";
    for (const group of plan.groups) {
        appended += `\n${renderRule(group)}`;
        result.rules += 1;
        for (const occurrence of group.occurrences) {
            let text;
            try {
                text = readFileSync(occurrence.path, "utf8");
            } catch (err) {
                result.errors.push({
                    file: occurrence.file,
                    message: String(err?.message ?? err),
                });
                continue;
            }
            push(occurrence.path, expandRange(text, occurrence.start, occurrence.end));
            record(
                occurrence.file,
                `removida \`.${occurrence.className}\` (linha ${occurrence.line}) → \`.${group.name}\` em ${plan.target.file}`,
            );
            result.moved += 1;
            for (const site of occurrence.sites) {
                push(site.path, { start: site.start, end: site.end, text: `"${group.name}"` });
                record(
                    site.file,
                    `\`styles.${occurrence.className}\` → \`"${group.name}"\` (linha ${site.line})`,
                );
            }
        }
    }

    if (!dryRun) {
        for (const [path, fileEdits] of edits) {
            let text;
            try {
                text = readFileSync(path, "utf8");
                writeFileSync(path, splice(text, fileEdits));
            } catch (err) {
                result.errors.push({ file: path, message: String(err?.message ?? err) });
            }
        }
        try {
            const current = readFileSync(plan.target.path, "utf8");
            writeFileSync(plan.target.path, `${current.replace(/\s*$/, "\n")}${appended}`);
        } catch (err) {
            result.errors.push({ file: plan.target.file, message: String(err?.message ?? err) });
        }
    }
    record(plan.target.file, `+${result.rules} classe(s) global(is)`);

    result.files = [...changes.entries()].map(([file, list]) => ({ file, changes: list }));
    return result;
}
