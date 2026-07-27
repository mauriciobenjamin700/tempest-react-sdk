// Cross-file analysis: the same block of declarations, written again and again
// in different CSS Modules.
//
// This is the check CSS Modules cannot do for you. Scoping guarantees `.card` in
// one module never collides with `.card` in another, and the price is that
// nothing tells you the two are byte-identical — the duplication is invisible by
// design. Finding it needs a pass over every sheet at once, which is what this is.
//
// It suggests, it never rewrites: whether five identical blocks become one
// global class, one utility or stay as they are is a design call about coupling
// between screens, and the CLI is not entitled to make it.
import { finding } from "./findings.mjs";
import { declSignature } from "./semantic.mjs";

/** A repeated block is only worth reporting from this many declarations up. */
const MIN_DECLS = 3;

/** Occurrences needed before a repeated block is reported. */
const MIN_OCCURRENCES = 3;

/**
 * Layout idioms `utilities.css` already ships, most specific first.
 *
 * `require` maps a property to the value it must have (`null` = any value, which
 * is how a gap of `8px`, `var(--tempest-space-2)` or `1rem` all count as the same
 * idiom). `forbid` rules out the neighbours: a column flex container is a stack,
 * not a row, and both start with the same two declarations.
 */
const UTILITIES = [
    {
        name: "tempest-center",
        require: {
            display: /^flex$/,
            "align-items": /^center$/,
            "justify-content": /^center$/,
        },
    },
    {
        name: "tempest-spread",
        require: {
            display: /^flex$/,
            "align-items": /^center$/,
            "justify-content": /^space-between$/,
        },
    },
    {
        name: "tempest-cluster",
        require: {
            display: /^flex$/,
            "flex-wrap": /^wrap$/,
            "align-items": /^center$/,
            gap: null,
        },
    },
    {
        name: "tempest-stack",
        require: { display: /^flex$/, "flex-direction": /^column$/, gap: null },
    },
    {
        name: "tempest-row",
        require: { display: /^flex$/, "align-items": /^center$/, gap: null },
        forbid: { "flex-direction": /^column/, "flex-wrap": /^wrap$/ },
    },
    {
        name: "tempest-truncate",
        require: {
            overflow: /^hidden$/,
            "text-overflow": /^ellipsis$/,
            "white-space": /^nowrap$/,
        },
    },
    {
        name: "tempest-grid-auto",
        require: { display: /^grid$/, "grid-template-columns": /auto-fi[lt]l?/, gap: null },
    },
    {
        name: "tempest-card",
        require: {
            background: null,
            border: null,
            "border-radius": null,
            "box-shadow": null,
            padding: null,
        },
    },
];

/** Lowercased property → value map of a block's declarations. */
function declMap(block) {
    const map = new Map();
    for (const decl of block.decls) {
        map.set(decl.prop.toLowerCase(), decl.value.replace(/\s+/g, " ").trim().toLowerCase());
    }
    return map;
}

/**
 * The utility a rule re-implements, if any.
 *
 * @param {{ decls: Array<{ prop: string, value: string }> }} block
 * @returns {string | null} Utility class name, without the dot.
 */
export function matchUtility(block) {
    const map = declMap(block);
    for (const utility of UTILITIES) {
        const required = Object.entries(utility.require);
        const ok = required.every(([prop, pattern]) => {
            const value = map.get(prop);
            if (value === undefined) return false;
            return pattern ? pattern.test(value) : true;
        });
        if (!ok) continue;
        const forbidden = Object.entries(utility.forbid ?? {}).some(([prop, pattern]) => {
            const value = map.get(prop);
            return value !== undefined && pattern.test(value);
        });
        if (!forbidden) return utility.name;
    }
    return null;
}

/** Short human list of the declarations a repeated block shares. */
function describe(block, max = 3) {
    const parts = block.decls
        .slice(0, max)
        .map((d) => `${d.prop}: ${d.value.replace(/\s+/g, " ")}`);
    const rest = block.decls.length - parts.length;
    return `${parts.join("; ")}${rest > 0 ? `; …+${rest}` : ""}`;
}

/** `a.css`, `b.css` and 2 more — file list for a report line. */
function fileList(files, max = 3) {
    const shown = files.slice(0, max).join(", ");
    return files.length > max ? `${shown} and ${files.length - max} more` : shown;
}

/**
 * Find declaration blocks that repeat across the project.
 *
 * @param {object} params
 * @param {Array<{ file: string, isModule: boolean, parsed: ReturnType<import("./parse.mjs").parseCss> }>} params.sheets
 * @param {Set<string>} [params.utilities] - Utility classes the installed SDK ships.
 * @returns {{ findings: Array<ReturnType<typeof finding>>, groups: Array<object> }}
 */
export function repetitionFindings({ sheets, utilities = new Set() }) {
    const bySignature = new Map();
    const byUtility = new Map();

    for (const sheet of sheets) {
        for (const block of sheet.parsed.blocks) {
            if (block.kind !== "rule" || block.decls.length < MIN_DECLS) continue;
            // A `.tempest-*` rule is the shared class, not a copy of it: counting
            // `utilities.css` as one of the duplicates would tell the SDK's own
            // stylesheet to stop re-implementing itself.
            if (block.prelude.includes(".tempest-")) continue;

            const signature = declSignature(block);
            const group = bySignature.get(signature) ?? { occurrences: [], block };
            group.occurrences.push({ file: sheet.file, line: block.line, prelude: block.prelude });
            bySignature.set(signature, group);

            const utility = matchUtility(block);
            if (!utility || !utilities.has(utility)) continue;
            const uGroup = byUtility.get(utility) ?? { occurrences: [] };
            uGroup.occurrences.push({ file: sheet.file, line: block.line });
            byUtility.set(utility, uGroup);
        }
    }

    const findings = [];
    const groups = [];

    for (const [, group] of bySignature) {
        const { occurrences, block } = group;
        const files = [...new Set(occurrences.map((o) => o.file))];
        if (occurrences.length < MIN_OCCURRENCES) continue;
        if (files.length < 2 && occurrences.length < MIN_OCCURRENCES + 1) continue;
        const first = occurrences[0];
        groups.push({ kind: "block", occurrences, files, sample: describe(block) });
        findings.push(
            finding("global-candidate", {
                file: first.file,
                line: first.line,
                message:
                    `${occurrences.length} rules in ${files.length} file(s) declare the same ${block.decls.length} ` +
                    `properties (${describe(block)}) — one global class beats ${occurrences.length} local copies. ` +
                    `In: ${fileList(files)}`,
                extra: { occurrences: occurrences.length, files: files.length },
            }),
        );
    }

    for (const [utility, group] of byUtility) {
        const { occurrences } = group;
        const files = [...new Set(occurrences.map((o) => o.file))];
        if (occurrences.length < MIN_OCCURRENCES || files.length < 2) continue;
        const first = occurrences[0];
        groups.push({ kind: "utility", utility, occurrences, files });
        findings.push(
            finding("utility-candidate", {
                file: first.file,
                line: first.line,
                message:
                    `${occurrences.length} rules in ${files.length} file(s) re-implement \`.${utility}\` from ` +
                    'utilities.css — import "tempest-react-sdk/utilities.css" once and use the class ' +
                    `(keep the rule for whatever is genuinely local). In: ${fileList(files)}`,
                extra: { occurrences: occurrences.length, files: files.length, utility },
            }),
        );
    }

    return { findings, groups };
}
