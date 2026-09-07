#!/usr/bin/env node
// @ts-check

/**
 * Derive the scoped reset from the global one.
 *
 * The SDK's components are written against the reset, not merely alongside it:
 * `.tempest_button` assumes `button { background: none; border: 0; padding: 0 }`,
 * every component's width maths assumes `box-sizing: border-box`, and the inputs
 * assume `font-family: inherit`. Dropping `reset.css` therefore does not cost an
 * app polish — it costs the components their layout, which is what "removed the
 * import and some components lost all styling" actually was.
 *
 * Keeping it is the other bad option: the same file claims `html`, `body` and
 * `#root`, so an app with its own layout gets its document surface taken over.
 *
 * This writes the third option. Every rule that dresses an element the SDK renders
 * is republished under `:where([class*="tempest_"])`, which reaches those elements
 * inside a component and nothing outside one. `:where()` is what keeps it a
 * republish rather than a stronger rule: it contributes zero specificity, so each
 * selector weighs exactly what it weighed globally and an app override that used
 * to win still wins.
 *
 * Rules about the document itself are dropped instead of scoped — there is no
 * `html` inside a component, and an app that wants those takes `reset.css` whole.
 *
 * Usage:
 *   node scripts/gen-scoped-reset.mjs
 *   node scripts/gen-scoped-reset.mjs --check   # write nothing; exit 1 if stale
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SOURCE = join(REPO_ROOT, "src", "styles", "reset.css");
const OUT = join(REPO_ROOT, "src", "styles", "scoped.css");

/** The scope every republished selector is nested under. */
const SCOPE = ':where([class*="tempest_"])';

/**
 * Selectors dropped rather than scoped: they address the document, not a component.
 *
 * Matched against the whole selector text, comma-separated parts included, because
 * each of these is written as its own rule upstream.
 */
const DOCUMENT_SELECTORS = new Set(["html", "body", ":where(html, body, #root)"]);

/**
 * Declaration whose rule is republished by hand in the header.
 *
 * The universal box-model reset is the one rule that has to name the scope root
 * itself as well as its descendants, which no mechanical rewrite of `*` produces.
 * Every other universal rule — `prefers-reduced-motion` among them — is scoped
 * like any other.
 */
const HAND_WRITTEN = "box-sizing";

/**
 * Split a comma-separated selector list without cutting inside parentheses.
 *
 * A naive `split(",")` tears `:where(html, body, #root)` into three fragments, two
 * of which are not selectors at all — and the result still parses, so the damage
 * is silent.
 *
 * @param {string} selector - The selector list.
 * @returns {string[]} The parts, trimmed.
 */
function splitSelectorList(selector) {
    /** @type {string[]} */
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selector.length; i += 1) {
        const char = selector[i];
        if (char === "(") depth += 1;
        else if (char === ")") depth -= 1;
        else if (char === "," && depth === 0) {
            parts.push(selector.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(selector.slice(start));
    return parts.map((part) => part.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/**
 * Split a stylesheet into top-level blocks, preserving source text.
 *
 * @param {string} css - The stylesheet.
 * @returns {string[]} Top-level blocks, trimmed.
 */
function splitTopLevel(css) {
    /** @type {string[]} */
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < css.length; i += 1) {
        const char = css[i];
        if (char === "{") depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                out.push(css.slice(start, i + 1));
                start = i + 1;
            }
        }
    }
    return out.map((block) => block.trim()).filter(Boolean);
}

/**
 * Rewrite one selector list so every part is scoped to the SDK subtree.
 *
 * Both shapes are emitted for a bare element selector, because a component's root
 * node carries the hashed class itself: `.tempest_x button` reaches a `<button>`
 * rendered inside `<Card>`, and `button.tempest_x` reaches `<Button>` itself.
 *
 * @param {string} selector - The selector list.
 * @returns {string | null} The scoped selector list, or `null` when it addresses
 *   the document and should be dropped.
 */
function scopeSelector(selector) {
    const parts = splitSelectorList(selector);
    if (parts.every((part) => DOCUMENT_SELECTORS.has(part))) return null;

    /** @type {string[]} */
    const out = [];
    for (const part of parts) {
        if (DOCUMENT_SELECTORS.has(part)) continue;
        out.push(`${SCOPE} ${part}`);
        const self = scopeSelf(part);
        if (self) out.push(self);
    }
    return out.length ? out.join(",\n") : null;
}

/**
 * Scope a selector to the component's own root node, rather than its descendants.
 *
 * A component's root carries the hashed class itself, so `<Button>` is the
 * `<button>` that matches — a descendant-only rewrite would leave it unstyled. The
 * scope is spliced in before any pseudo-element, because nothing may follow one:
 * `button::-moz-focus-inner:where(...)` parses as invalid and the browser drops the
 * whole rule.
 *
 * Combinators are excluded: for `a > b` the node that carries the class is `a`,
 * which the descendant form already covers.
 *
 * @param {string} part - One selector part.
 * @returns {string | null} The self-scoped selector, or `null` when it does not apply.
 */
function scopeSelf(part) {
    if (/[\s>+~]/.test(part)) return null;
    if (!/^[a-z:[]/i.test(part)) return null;
    const pseudo = part.search(/::/);
    return pseudo === -1
        ? `${part}${SCOPE}`
        : `${part.slice(0, pseudo)}${SCOPE}${part.slice(pseudo)}`;
}

/**
 * Entry point.
 *
 * @returns {void}
 */
function main() {
    const check = process.argv.includes("--check");
    const css = readFileSync(SOURCE, "utf8");

    /** @type {string[]} */
    const rules = [];
    for (const block of splitTopLevel(css)) {
        const open = block.indexOf("{");
        const selector = block
            .slice(0, open)
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .trim();
        const body = block.slice(open);

        if (selector.startsWith("@")) {
            const inner = splitTopLevel(body.slice(1, -1).trim())
                .map((nested) => {
                    const at = nested.indexOf("{");
                    const scoped = scopeSelector(nested.slice(0, at).trim());
                    if (!scoped) return null;
                    const indented = scoped
                        .split("\n")
                        .map((line) => `    ${line}`)
                        .join("\n");
                    return `${indented} ${nested.slice(at)}`;
                })
                .filter(Boolean);
            if (inner.length) rules.push(`${selector} {\n${inner.join("\n")}\n}`);
            continue;
        }

        if (body.includes(HAND_WRITTEN)) continue;
        const scoped = scopeSelector(selector);
        if (scoped) rules.push(`${scoped} ${body}`);
    }

    const header = `/**
 * Scoped reset — generated by scripts/gen-scoped-reset.mjs. Do not edit.
 *
 * The rules of \`reset.css\` that dress the elements a Tempest component renders,
 * republished under \`:where([class*="tempest_"])\` so they reach inside a component
 * and nowhere else. Import this instead of \`reset.css\` when the app owns its own
 * document styling: the components keep the box model, button and control
 * normalisation they are written against, and \`html\`, \`body\` and \`#root\` are left
 * to the app.
 *
 * \`:where()\` contributes no specificity, so every selector here weighs what it
 * weighed globally.
 */

${SCOPE},
${SCOPE} *,
${SCOPE} *::before,
${SCOPE} *::after {
    box-sizing: border-box;
}
`;

    const text = `${header}\n${rules.join("\n\n")}\n`;
    const stale = !existsSync(OUT) || readFileSync(OUT, "utf8") !== text;
    if (!check) writeFileSync(OUT, text);

    console.log(`gen-scoped-reset: ${rules.length + 1} rules → src/styles/scoped.css`);
    if (check && stale) {
        console.error("gen-scoped-reset: scoped.css is stale — run `npm run build`");
        process.exitCode = 1;
    }
}

main();
