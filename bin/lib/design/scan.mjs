// The rules. Each one answers a question from docs/design — "is this file too
// big to read whole", "does this component fetch", "is an error being swallowed"
// — and each one is measured on the mask, never on the raw text.
import { finding, LIMITS } from "./findings.mjs";
import { findFunctions, findPropsTypes } from "./functions.mjs";
import { countCodeLines, lineAt, maskSource } from "./mask.mjs";
import { isWaived, parseMarkers } from "./markers.mjs";

/** `any` in a type position. `unknown`, `anyOf` and `Company` must not match. */
const ANY_TYPE = /(?<![\w$])any(?![\w$])/g;

/** A `catch` block whose body is empty once comments are masked away. */
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;

/** `fetch(`/`axios` — transport inside a component file. */
const TRANSPORT = /\b(?:fetch\s*\(|axios\b)/g;

/**
 * An inline `style={{ … }}` carrying a literal colour. Matched on the raw source,
 * not the mask: the colour lives inside a string, and the mask exists to hide
 * exactly that.
 */
const INLINE_STYLE_COLOR = /style\s*=\s*\{\{[^}]*#[0-9a-fA-F]{3,8}\b/g;

/**
 * Whether a masked slice looks like a type annotation rather than a value.
 * Filters `[key: string]: any` (a real finding) from `anyOf` and from the string
 * `"any"` — already masked — while skipping `as any` casts, counted separately.
 *
 * @param {string} masked
 * @param {number} index - Offset of the `any` token.
 * @returns {boolean}
 */
function isTypePosition(masked, index) {
    const before = masked.slice(Math.max(0, index - 24), index);
    return /[:<|&(,[]\s*$|\bas\s+$/.test(before);
}

/**
 * Analyze one already-read source file.
 *
 * @param {object} params
 * @param {string} params.file - Project-relative path, used verbatim in findings.
 * @param {string} params.source - Raw contents.
 * @param {object} [params.limits] - Overrides for {@link LIMITS}.
 * @returns {{ findings: object[], waivers: Array<{ code: string, reason: string }>,
 *   codeLines: number }}
 */
export function scanFile({ file, source, limits = {} }) {
    const max = { ...LIMITS, ...limits };
    const { masked, commentText } = maskSource(source);
    const markers = parseMarkers(commentText);
    const isTsx = file.endsWith(".tsx");
    const isTest = /\.(test|spec)\./.test(file);
    const findings = [];

    const push = (code, line, message) => {
        if (isWaived(markers, code)) return;
        findings.push(finding(code, { file, line, message }));
    };

    for (const id of markers.unexplained) {
        findings.push(
            finding("marker-without-reason", {
                file,
                line: 1,
                message: `@tempest-limits ${id} has no reason — write why the limit does not fit here`,
            }),
        );
    }

    const codeLines = countCodeLines(masked);
    if (!isTest) {
        const fileMax = isTsx ? max.componentFileLines : max.moduleFileLines;
        if (codeLines > fileMax) {
            push(
                "file-lines",
                1,
                `${codeLines} lines of code (limit ${fileMax}) — extract a sub-component, a hook or a pure function`,
            );
        }
    }

    const propsTypes = findPropsTypes(masked);
    for (const [name, info] of propsTypes) {
        if (info.count > max.props) {
            push(
                "props-count",
                info.line,
                `${name} has ${info.count} props (limit ${max.props}) — likely two components in one`,
            );
        }
    }

    if (!isTest) {
        for (const fn of findFunctions(masked, { isTsx })) {
            const bodyMax = fn.kind === "hook" ? max.hookLines : max.functionLines;
            const code = fn.kind === "hook" ? "hook-lines" : "function-lines";
            if (fn.bodyLines > bodyMax) {
                push(
                    code,
                    fn.line,
                    `${fn.name} body is ${fn.bodyLines} lines (limit ${bodyMax}) — ${
                        fn.kind === "hook"
                            ? "split into smaller hooks"
                            : "extract a pure function or a hook"
                    }`,
                );
            }
            if (fn.exported && fn.params.length > max.params) {
                push(
                    "param-count",
                    fn.line,
                    `${fn.name} takes ${fn.params.length} parameters (limit ${max.params}) — pass one named object`,
                );
            }
            if (fn.kind === "component" && fn.destructuredProps > max.props) {
                push(
                    "props-count",
                    fn.line,
                    `${fn.name} destructures ${fn.destructuredProps} props (limit ${max.props}) — likely two components in one`,
                );
            }
        }
    }

    findings.push(...typeEscapes({ file, source, masked, commentText, markers, isTest }));
    findings.push(...behaviourRules({ file, source, masked, markers, isTsx, isTest }));

    const waivers = [...markers.reasons].map(([code, reason]) => ({ code, reason }));
    return { findings: findings.filter(Boolean), waivers, codeLines };
}

/**
 * Whether an `eslint-disable` for `no-explicit-any` already covers a line.
 *
 * Re-reporting what the author waived through the standard mechanism is the
 * fastest way to make a tool ignorable, so the existing pragma wins. The
 * `@tempest-limits` marker exists for the same reason at file scope.
 *
 * @param {string[]} lines - Raw source lines.
 * @param {number} line - 1-based line of the `any` token.
 * @returns {boolean}
 */
function hasEslintWaiver(lines, line) {
    const own = lines[line - 1] ?? "";
    const previous = lines[line - 2] ?? "";
    const pragma = /eslint-disable(?:-next-line|-line)?[^\n]*no-explicit-any/;
    return pragma.test(own) || pragma.test(previous);
}

/**
 * `any` and `@ts-ignore` — the two ways to turn the compiler off. Reported in
 * test files too: a type hole in a test is a test that proves less than it looks.
 *
 * @returns {object[]}
 */
function typeEscapes({ file, source, masked, commentText, markers, isTest }) {
    const out = [];
    if (!isWaived(markers, "explicit-any")) {
        const lines = source.split("\n");
        for (const match of masked.matchAll(ANY_TYPE)) {
            if (!isTypePosition(masked, match.index)) continue;
            const line = lineAt(masked, match.index);
            if (hasEslintWaiver(lines, line)) continue;
            out.push(
                finding("explicit-any", {
                    file,
                    line,
                    message: isTest
                        ? "`any` in a test — the mock proves less than it looks"
                        : "`any` turns the compiler off — use `unknown` plus validation",
                    extra: isTest ? { severity: "info" } : {},
                }),
            );
        }
    }
    if (!isWaived(markers, "ts-ignore") && /@ts-(?:ignore|nocheck)/.test(commentText)) {
        out.push(
            finding("ts-ignore", {
                file,
                line: 1,
                message: "@ts-ignore hides the error instead of fixing it — narrow the type",
            }),
        );
    }
    return out;
}

/**
 * The three anti-patterns cheap enough to detect reliably: transport in a
 * component, a swallowed error, and a colour hardcoded in an inline style.
 *
 * @returns {object[]}
 */
function behaviourRules({ file, source, masked, markers, isTsx, isTest }) {
    const out = [];
    const add = (code, index, message, text = masked) => {
        if (isWaived(markers, code)) return;
        out.push(finding(code, { file, line: lineAt(text, index), message }));
    };

    if (isTsx && !isTest) {
        for (const match of masked.matchAll(TRANSPORT)) {
            add(
                "fetch-in-component",
                match.index,
                "a component must not call the network — move it to a service and read it with useQuery",
            );
            break;
        }
    }
    for (const match of masked.matchAll(EMPTY_CATCH)) {
        add(
            "empty-catch",
            match.index,
            "empty catch swallows the error — handle it or let it reach the ErrorBoundary",
        );
    }
    for (const match of source.matchAll(INLINE_STYLE_COLOR)) {
        add(
            "inline-style-literal",
            match.index,
            "hardcoded colour in an inline style — use a --tempest-* token in a CSS Module",
            source,
        );
    }
    return out;
}
