// Per-file CSS analysis: what the parser flagged as broken syntax, plus what is
// syntactically fine and still wrong — a declaration the next one kills, a
// property name nobody implements, a `var()` pointing at a token that does not
// exist.
import { finding } from "./findings.mjs";
import { maskValue, normalizeSelectors } from "./parse.mjs";
import { isCheckableProperty, KNOWN_AT_RULES, KNOWN_PROPERTIES, nearest } from "./properties.mjs";
import { tokenForValue } from "./tokens.mjs";

/** Human text for each parser-level code. */
const SYNTAX_MESSAGES = {
    "unterminated-comment": "unterminated `/*` comment — everything after it is swallowed",
    "unterminated-string": "unterminated string — the rest of the line is parsed as part of it",
    "unterminated-paren": "unbalanced `(` — the rest of the sheet is parsed as part of the value",
    "unclosed-block": "block opened here is never closed with `}`",
    "unexpected-brace": "stray `}` with no block open",
    "missing-brace": "selector with no `{ … }` block",
    "missing-colon": "declaration without `:`",
    "missing-property": "declaration with no property name before `:`",
    "empty-value": "declaration with an empty value — the browser drops it",
    "empty-selector": "`{` with no selector before it",
    "declaration-outside-rule": "declaration outside any rule — the browser drops it",
};

/** Properties whose literal values are worth suggesting a token for. */
const TOKENIZABLE = new Set([
    "color",
    "background",
    "background-color",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "fill",
    "stroke",
    "box-shadow",
    "border-radius",
    "font-size",
    "font-family",
    "font-weight",
    "line-height",
    "gap",
    "row-gap",
    "column-gap",
    "padding",
    "margin",
    "z-index",
    "transition-duration",
]);

/**
 * True when a second declaration of the same property is the progressive-
 * enhancement idiom rather than a mistake.
 *
 * The pattern is deliberate and everywhere: write a value old browsers
 * understand, then the modern one they will ignore. Flagging it would train
 * people to ignore the whole check, so anything that smells like the modern half
 * — a vendor prefix, a function call, a viewport unit, an `!important` escalation
 * — exempts the pair.
 *
 * @param {{ value: string }} earlier
 * @param {{ value: string }} later
 * @returns {boolean}
 */
function isProgressiveFallback(earlier, later) {
    const modern = /\b(var|env|clamp|min|max|calc|color-mix|light-dark|oklch|lab)\(/i;
    const units = /\b\d+(\.\d+)?(dvh|svh|lvh|dvw|svw|lvw|cqw|cqh|cqi|cqb)\b/i;
    const prefixed = /(^|\s)-(webkit|moz|ms|o)-/;
    if (modern.test(later.value) || units.test(later.value) || prefixed.test(later.value)) {
        return true;
    }
    if (prefixed.test(earlier.value)) return true;
    return /!\s*important/i.test(later.value) && !/!\s*important/i.test(earlier.value);
}

/** `var(--name[, fallback])` references in a value. */
function varReferences(value) {
    const out = [];
    const re = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(,)?/g;
    let match;
    while ((match = re.exec(value))) out.push({ name: match[1], hasFallback: Boolean(match[2]) });
    return out;
}

/** Key that makes two rules comparable: same selector list, same at-rule context. */
export function ruleKey(block) {
    return `${block.context.join(" › ")}|${normalizeSelectors(block.prelude).join(", ")}`;
}

/** Normalized `prop:value` signature of a block's declarations. */
export function declSignature(block) {
    return block.decls
        .map((d) => `${d.prop.toLowerCase()}:${d.value.replace(/\s+/g, " ").toLowerCase()}`)
        .sort()
        .join(";");
}

/**
 * Analyze one stylesheet.
 *
 * @param {object} params
 * @param {string} params.file - Path to report findings against.
 * @param {ReturnType<import("./parse.mjs").parseCss>} params.parsed
 * @param {{ names: Set<string>, byValue: Map<string, string[]> }} params.tokens
 * @param {Set<string>} params.definedVars - Custom properties defined anywhere in the project.
 * @param {boolean} [params.isModule] - Whether the file is a CSS Module.
 * @returns {Array<ReturnType<typeof finding>>}
 */
export function analyzeParsed({ file, parsed, tokens, definedVars, isModule = false }) {
    const findings = [];
    const at = (code, line, message, fixable = false, extra = {}) =>
        findings.push(finding(code, { file, line, message, fixable, extra }));

    for (const error of parsed.errors) {
        const detail = error.text ? ` — \`${truncate(error.text)}\`` : "";
        at(error.code, error.line, `${SYNTAX_MESSAGES[error.code] ?? error.code}${detail}`);
    }

    for (const { line, prop } of missingSemicolons(parsed)) {
        at(
            "missing-semicolon",
            line,
            `the value of \`${prop}\` swallows the declaration(s) below it — a \`;\` is missing, ` +
                "so the browser drops all of them",
        );
    }

    for (const statement of parsed.statements) {
        checkAtRule(statement.name, statement.line, at);
    }

    const byKey = new Map();

    for (const block of parsed.blocks) {
        if (block.kind === "at") {
            checkAtRule(/^@([\w-]+)/.exec(block.prelude)?.[1]?.toLowerCase() ?? "", block.line, at);
        }

        if (block.decls.length === 0 && block.children === 0 && !block.invalid) {
            at(
                "empty-rule",
                block.line,
                isModule
                    ? `\`${truncate(block.prelude)}\` is empty — dead unless your JS uses it as a marker class, ` +
                          "so it is reported but never removed automatically"
                    : `\`${truncate(block.prelude)}\` is empty — dead code`,
                !isModule,
            );
        }

        const seen = new Map();
        for (const decl of block.decls) {
            const prop = decl.prop.toLowerCase();
            const previous = seen.get(prop);
            if (previous) {
                const sameValue =
                    previous.value.replace(/\s+/g, " ").toLowerCase() ===
                    decl.value.replace(/\s+/g, " ").toLowerCase();
                if (sameValue) {
                    at(
                        "duplicate-declaration",
                        decl.line,
                        `\`${prop}\` is declared twice with the same value (also on line ${previous.line}) — ` +
                            "the first one is dead",
                        true,
                    );
                } else if (!isProgressiveFallback(previous, decl)) {
                    at(
                        "overridden-declaration",
                        decl.line,
                        `\`${prop}: ${truncate(decl.value)}\` overrides \`${truncate(previous.value)}\` from ` +
                            `line ${previous.line} in the same rule — one of them is a mistake`,
                    );
                }
            }
            seen.set(prop, decl);

            checkDecl({ decl, prop, tokens, definedVars, at });
        }

        if (block.kind !== "rule") continue;
        const key = ruleKey(block);
        const previous = byKey.get(key);
        if (previous) {
            reportDuplicateRule({ block, previous, at });
        } else {
            byKey.set(key, block);
        }
    }

    return findings;
}

/** Report a selector declared twice in the same file. */
function reportDuplicateRule({ block, previous, at }) {
    const identical = declSignature(block) === declSignature(previous) && block.decls.length > 0;
    if (identical) {
        at(
            "duplicate-rule",
            block.line,
            `\`${truncate(block.prelude)}\` repeats line ${previous.line} declaration for declaration — ` +
                "the first copy has no effect",
            true,
        );
        return;
    }
    const props = new Set(previous.decls.map((d) => d.prop.toLowerCase()));
    const shadowed = block.decls.map((d) => d.prop.toLowerCase()).filter((p) => props.has(p));
    at(
        "duplicate-selector",
        block.line,
        shadowed.length > 0
            ? `\`${truncate(block.prelude)}\` is declared again (first on line ${previous.line}) and re-declares ` +
                  `${shadowed.slice(0, 4).join(", ")} — the earlier value is dead; merge the rules`
            : `\`${truncate(block.prelude)}\` is declared in two places (line ${previous.line} and here) — ` +
                  "merge them so the rule reads in one place",
    );
}

/**
 * The family a token name belongs to: everything up to the last segment.
 *
 * `--tempest-primary-soft` → `--tempest-primary`. Returns `null` when nothing is
 * left after the prefix, which is what keeps two-segment names like
 * `--tempest-tx` out of the family check: their family is the bare prefix, and
 * that matches every token there is.
 *
 * @param {string} name - A custom property name.
 * @returns {string | null} The family, or null when the name has no family.
 */
function familyOf(name) {
    const family = name.slice(0, name.lastIndexOf("-"));
    return family === "--tempest" || !family.startsWith("--tempest-") ? null : family;
}

/** Per-name-set cache, so the families are derived once per run and not per declaration. */
const FAMILY_CACHE = new WeakMap();

/**
 * The families the SDK's own tokens form, derived once per token set.
 *
 * @param {Set<string>} names - Declared SDK token names.
 * @returns {Set<string>} Every family with at least one declared member.
 */
function familiesOf(names) {
    const cached = FAMILY_CACHE.get(names);
    if (cached) return cached;
    const families = new Set();
    for (const name of names) {
        const family = familyOf(name);
        if (family) families.add(family);
    }
    FAMILY_CACHE.set(names, families);
    return families;
}

/**
 * Property-level and value-level checks for a single declaration.
 *
 * A `var()` **with a fallback** is *almost* never reported. That is the SDK's own
 * knob idiom — `var(--tempest-card-padding, var(--tempest-space-5))` is a
 * component offering an override nobody is required to set — so "this name is
 * not a token" would fire on the pattern the docs teach. Without a fallback the
 * same declaration resolves to nothing, which is a real defect and is reported.
 *
 * The exception is the one case where a knob and a typo stop being
 * indistinguishable: **the family already exists.** `--tempest-primary-contrast`
 * is undeclared, but `--tempest-primary-*` has twelve declared siblings, so the
 * name reads as a member of a real family that is missing — a misspelling.
 * `--tempest-card-padding` has no declared `--tempest-card-*` sibling at all, so
 * it reads as what it is, a knob this component invented.
 *
 * Measured over the SDK's own `src/` when the rule was written: five hits, five
 * real defects, no false positive. Two weaker signals were measured and dropped
 * — matching on the *last* segment instead (`--tempest-font-size-sm` looks like
 * `--tempest-text-sm`) fired on sixteen names of which three were real, because
 * every layout knob in `utilities.css` ends in `-gap` or `-width`.
 */
function checkDecl({ decl, prop, tokens, definedVars, at }) {
    if (isCheckableProperty(prop) && !KNOWN_PROPERTIES.has(prop)) {
        const suggestion = nearest(prop, KNOWN_PROPERTIES);
        if (suggestion) {
            at(
                "unknown-property",
                decl.line,
                `\`${prop}\` is not a CSS property — did you mean \`${suggestion}\`? The browser drops the declaration`,
            );
        }
    }

    const families = familiesOf(tokens.names);
    for (const ref of varReferences(decl.value)) {
        if (definedVars.has(ref.name) || tokens.names.has(ref.name)) continue;
        if (ref.hasFallback) {
            if (!ref.name.startsWith("--tempest-") || tokens.names.size === 0) continue;
            const family = familyOf(ref.name);
            if (!family || !families.has(family)) continue;
            const suggestion = nearest(ref.name, tokens.names, 3);
            at(
                "token-family-typo",
                decl.line,
                `\`${ref.name}\` is not a token, but \`${family}-*\` is a real family — the fallback ` +
                    `hides the misspelling instead of failing${suggestion ? `. Did you mean \`${suggestion}\`?` : ""}`,
            );
            continue;
        }
        if (ref.name.startsWith("--tempest-")) {
            if (tokens.names.size === 0) continue;
            const suggestion = nearest(ref.name, tokens.names, 3);
            at(
                "unknown-token",
                decl.line,
                `\`${ref.name}\` is not an SDK token, nothing in this project defines it, and it has no ` +
                    `fallback${suggestion ? ` — did you mean \`${suggestion}\`?` : ""}`,
            );
            continue;
        }
        at(
            "undefined-var",
            decl.line,
            `\`${ref.name}\` is never defined in this project and has no fallback — ` +
                "the declaration resolves to nothing",
        );
    }

    if (!TOKENIZABLE.has(prop) || decl.value.includes("var(")) return;
    const token = tokenForValue(decl.value, tokens.byValue);
    if (token) {
        at(
            "hardcoded-token-value",
            decl.line,
            `\`${prop}: ${truncate(decl.value)}\` is exactly \`${token}\` — use \`var(${token})\` so ` +
                "the theme and dark mode follow it",
        );
    }
}

/** Flag an at-rule name the browser will not recognize. */
function checkAtRule(name, line, at) {
    if (!name || KNOWN_AT_RULES.has(name)) return;
    if (!/^[a-z][a-z-]*$/.test(name)) return;
    const suggestion = nearest(name, KNOWN_AT_RULES);
    at(
        "unknown-at-rule",
        line,
        `\`@${name}\` is not a CSS at-rule${suggestion ? ` — did you mean \`@${suggestion}\`?` : ""}; ` +
            "the browser skips the whole block",
    );
}

/** Shorten a snippet for a one-line report. */
function truncate(text, max = 60) {
    const flat = String(text).replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Custom properties **defined** by a parsed sheet (`--x: …`, at any depth). */
export function definedCustomProperties(parsed) {
    const out = new Set();
    for (const block of parsed.blocks) {
        for (const decl of block.decls) if (decl.prop.startsWith("--")) out.add(decl.prop);
    }
    return out;
}

/**
 * Declarations whose value spans a `;` the author forgot.
 *
 * The parser cannot know: `color: red` followed by a newline and
 * `background: blue` with no semicolon between them is one syntactically valid
 * declaration with a nonsense value, and the browser drops both. It reads as a
 * formatting slip and costs an afternoon.
 *
 * @param {ReturnType<import("./parse.mjs").parseCss>} parsed
 * @returns {Array<{ line: number, prop: string }>}
 */
export function missingSemicolons(parsed) {
    const out = [];
    for (const block of parsed.blocks) {
        for (const decl of block.decls) {
            if (!decl.value.includes("\n")) continue;
            const mask = maskValue(decl.value);
            if (/\n[^\S\n]*[-a-zA-Z][\w-]*[^\S\n]*:/.test(mask)) {
                out.push({ line: decl.line, prop: decl.prop });
            }
        }
    }
    return out;
}
