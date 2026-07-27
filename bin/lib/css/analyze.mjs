// The whole CSS analysis in one call: collect, parse, diagnose per file,
// diagnose across files. `doctor` renders the summary, `fix` applies the subset
// that is provably safe, and both read the same result — there is no second
// implementation that can disagree with the first.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";

import { collectStylesheets, customPropertiesInSources, looksMinified } from "./collect.mjs";
import { countBySeverity, sortFindings } from "./findings.mjs";
import { fixCss } from "./fix.mjs";
import { parseCss } from "./parse.mjs";
import { repetitionFindings } from "./repetition.mjs";
import { analyzeParsed, definedCustomProperties } from "./semantic.mjs";
import { loadTokens } from "./tokens.mjs";

/**
 * Analyze every stylesheet under `targets`.
 *
 * @param {object} params
 * @param {string} params.root - Project root.
 * @param {string[]} [params.targets] - Positional paths from the command line.
 * @param {string} params.selfDir - Directory of the running CLI, to locate the token table.
 * @param {number} [params.maxFiles]
 * @returns {{
 *   sheets: Array<{ path: string, file: string, text: string, isModule: boolean, parsed: object }>,
 *   findings: Array<object>,
 *   groups: Array<object>,
 *   skipped: Array<{ file: string, reason: string }>,
 *   truncated: boolean,
 *   counts: { error: number, warn: number, info: number },
 *   stats: { files: number, rules: number, declarations: number },
 *   tokens: { source: string | null, names: Set<string>, byValue: Map<string, string[]>, utilities: Set<string> },
 * }}
 */
export function analyzeCss({ root, targets = ["."], selfDir, maxFiles }) {
    const tokens = loadTokens({ root, selfDir });
    const collected = collectStylesheets({ root, targets, maxFiles });
    const skipped = collected.skipped.map((s) => ({
        file: relative(root, s.path),
        reason: s.reason,
    }));

    const sheets = [];
    for (const path of collected.files) {
        let text;
        try {
            text = readFileSync(path, "utf8");
        } catch (err) {
            skipped.push({ file: relative(root, path), reason: String(err?.message ?? err) });
            continue;
        }
        if (looksMinified(text)) {
            skipped.push({ file: relative(root, path), reason: "minified" });
            continue;
        }
        sheets.push({
            path,
            file: relative(root, path),
            text,
            isModule: path.endsWith(".module.css"),
            parsed: parseCss(text),
        });
    }

    const definedVars = new Set(tokens.names);
    for (const sheet of sheets) {
        for (const name of definedCustomProperties(sheet.parsed)) definedVars.add(name);
    }
    if (sheets.length > 0) {
        for (const name of customPropertiesInSources({ root })) definedVars.add(name);
    }

    const findings = [];
    let rules = 0;
    let declarations = 0;
    for (const sheet of sheets) {
        findings.push(
            ...analyzeParsed({
                file: sheet.file,
                parsed: sheet.parsed,
                tokens,
                definedVars,
                isModule: sheet.isModule,
            }),
        );
        for (const block of sheet.parsed.blocks) {
            if (block.kind === "rule") rules += 1;
            declarations += block.decls.length;
        }
    }

    const repetition = repetitionFindings({ sheets, utilities: tokens.utilities });
    findings.push(...repetition.findings);

    const sorted = sortFindings(findings);
    return {
        sheets,
        findings: sorted,
        groups: repetition.groups,
        skipped,
        truncated: collected.truncated,
        counts: countBySeverity(sorted),
        stats: { files: sheets.length, rules, declarations },
        tokens,
    };
}

/**
 * Apply the safe subset of the analysis to disk.
 *
 * A sheet with a syntax error is left untouched — `fixCss` refuses it, because an
 * offset taken from a sheet the parser had to guess its way through is not an
 * offset worth splicing. Fix the error, run again.
 *
 * @param {object} params
 * @param {ReturnType<typeof analyzeCss>} params.analysis
 * @param {boolean} [params.dryRun] - Report the edits without writing them.
 * @returns {{
 *   files: Array<{ file: string, changes: Array<{ code: string, line: number, message: string }> }>,
 *   total: number,
 *   errors: Array<{ file: string, message: string }>,
 * }}
 */
export function applyCssFixes({ analysis, dryRun = false }) {
    const files = [];
    const errors = [];
    let total = 0;

    for (const sheet of analysis.sheets) {
        const result = fixCss({
            text: sheet.text,
            parsed: sheet.parsed,
            isModule: sheet.isModule,
        });
        if (result.changes.length === 0) continue;
        if (!dryRun) {
            try {
                writeFileSync(sheet.path, result.text);
            } catch (err) {
                errors.push({ file: sheet.file, message: String(err?.message ?? err) });
                continue;
            }
        }
        files.push({ file: sheet.file, changes: result.changes });
        total += result.changes.length;
    }

    return { files, total, errors };
}
