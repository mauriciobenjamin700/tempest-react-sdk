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
 * The result is discriminated rather than nullable on purpose. A rule that
 * produces no output is indistinguishable from one dropped deliberately when both
 * are `null`, and the difference is the whole safety of this script: the first is
 * a selector shape the rewriter does not handle, which vanishes from the scoped
 * sheet and takes its declarations with it. The bare `:focus-visible` is exactly
 * that shape — no element to prefix — so this is not hypothetical.
 *
 * @param {string} selector - The selector list.
 * @returns {{kind: "scoped", selector: string} | {kind: "dropped", reason: string}
 *   | {kind: "unreachable", reason: string}} What became of the selector.
 */
function scopeSelector(selector) {
    const parts = splitSelectorList(selector);
    if (parts.every((part) => DOCUMENT_SELECTORS.has(part))) {
        return { kind: "dropped", reason: "document" };
    }

    /** @type {string[]} */
    const out = [];
    for (const part of parts) {
        if (DOCUMENT_SELECTORS.has(part)) continue;
        out.push(`${SCOPE} ${part}`);
        const self = scopeSelf(part);
        if (self) out.push(self);
    }
    if (!out.length) return { kind: "unreachable", reason: selector };
    return { kind: "scoped", selector: out.join(",\n") };
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
 * Properties that belong to the document and are therefore not republished.
 *
 * Each one comes from a rule in `DOCUMENT_SELECTORS`: there is no `html` inside a
 * component to carry `tab-size`, and `body`'s background is the app's to paint.
 * The list is written out so the parity check below can be exact — "some
 * properties are missing on purpose" is not a check, it is an excuse.
 */
const DOCUMENT_PROPERTIES = new Set([
    "tab-size",
    "-moz-tab-size",
    "text-size-adjust",
    "-webkit-text-size-adjust",
    "background-color",
    "height",
]);

/**
 * Fail when a declaration of the reset has no counterpart in the scoped sheet.
 *
 * The selector guard catches a rule that produced nothing; this catches the
 * subtler half — a rule that produced *something* while losing a declaration on
 * the way, which no amount of eyeballing the output finds. Together they are why
 * this file can be generated at all: the alternative to a check is trusting a
 * regex rewrite with the SDK's box model.
 *
 * @param {string} source - The reset stylesheet.
 * @param {string} generated - The whole generated sheet, hand-written header
 *   included: `box-sizing` is republished there, and checking only the rewritten
 *   rules would report it lost.
 * @returns {void}
 * @throws If a property is republished nowhere and is not document-level.
 */
function assertNoPropertyLost(source, generated) {
    const properties = (css) =>
        new Set([...css.matchAll(/(?:^|[{;])\s*(-?[a-z][a-z0-9-]*)\s*:/gi)].map((m) => m[1]));
    const lost = [...properties(source)].filter(
        (name) => !DOCUMENT_PROPERTIES.has(name) && !properties(generated).has(name),
    );
    if (lost.length === 0) return;
    throw new Error(
        `gen-scoped-reset: reset.css declares ${lost.join(", ")}, and the scoped sheet ` +
            "declares them nowhere. A component written against that declaration would " +
            'lose it silently under `reset: "scoped"`. Add the property to ' +
            "DOCUMENT_PROPERTIES only if it genuinely belongs to the document.",
    );
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
    /** @type {string[]} */
    const unreachable = [];
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
                    const result = scopeSelector(nested.slice(0, at).trim());
                    if (result.kind === "unreachable") unreachable.push(result.reason);
                    if (result.kind !== "scoped") return null;
                    const indented = result.selector
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
        const result = scopeSelector(selector);
        if (result.kind === "unreachable") unreachable.push(result.reason);
        if (result.kind === "scoped") rules.push(`${result.selector} ${body}`);
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

    if (unreachable.length > 0) {
        console.error(
            `gen-scoped-reset: ${unreachable.length} selector(s) produced no scoped form, so ` +
                "their declarations would be missing from scoped.css without any sign:",
        );
        for (const selector of unreachable) console.error(`  ${selector}`);
        console.error(
            "  Teach scopeSelf() the shape, or add the selector to DOCUMENT_SELECTORS " +
                "if dropping it is deliberate.",
        );
        process.exitCode = 1;
        return;
    }

    const text = `${header}\n${rules.join("\n\n")}\n`;
    assertNoPropertyLost(css, text);
    const stale = !existsSync(OUT) || readFileSync(OUT, "utf8") !== text;
    if (!check) writeFileSync(OUT, text);

    console.log(`gen-scoped-reset: ${rules.length + 1} rules → src/styles/scoped.css`);
    if (check && stale) {
        console.error("gen-scoped-reset: scoped.css is stale — run `npm run build`");
        process.exitCode = 1;
    }
}

main();
