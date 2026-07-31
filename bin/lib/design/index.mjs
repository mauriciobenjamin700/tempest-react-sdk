// Public surface of the design analysis: read the project's sources, run the
// rules over each one, and report the numbers the caller needs to say something
// useful — how big the median file is, what went over a limit, and which limits
// were waived on purpose.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { collectSources } from "./collect.mjs";
import { countBySeverity, LIMITS, sortFindings } from "./findings.mjs";
import { scanFile } from "./scan.mjs";

export { LIMITS, SEVERITY } from "./findings.mjs";
export { scanFile } from "./scan.mjs";

/** Median of a numeric list, or 0 when empty. */
function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * Run the design analysis over a project.
 *
 * @param {object} params
 * @param {string} params.root - Project root.
 * @param {string[]} [params.targets] - Paths to analyze (default: `src`, `app`).
 * @param {object} [params.limits] - Overrides for {@link LIMITS}.
 * @param {number} [params.maxFiles]
 * @returns {{
 *   findings: object[],
 *   waivers: Array<{ file: string, code: string, reason: string }>,
 *   counts: { warn: number, info: number },
 *   stats: { files: number, codeLines: number, medianLines: number, largest: { file: string, lines: number } | null },
 *   skipped: Array<{ file: string, reason: string }>,
 *   truncated: boolean
 * }}
 */
export function analyzeDesign({ root, targets, limits = {}, maxFiles } = {}) {
    const collected = collectSources({ root, targets, maxFiles });
    const findings = [];
    const waivers = [];
    const lineCounts = [];
    let largest = null;
    let codeLines = 0;

    for (const path of collected.files) {
        const file = relative(root, path) || path;
        let source;
        try {
            source = readFileSync(path, "utf8");
        } catch {
            continue;
        }
        const result = scanFile({ file, source, limits });
        findings.push(...result.findings);
        waivers.push(...result.waivers.map((w) => ({ file, ...w })));
        lineCounts.push(result.codeLines);
        codeLines += result.codeLines;
        if (!largest || result.codeLines > largest.lines) {
            largest = { file, lines: result.codeLines };
        }
    }

    const sorted = sortFindings(findings);
    return {
        findings: sorted,
        waivers,
        counts: countBySeverity(sorted),
        stats: {
            files: collected.files.length,
            codeLines,
            medianLines: median(lineCounts),
            largest,
        },
        skipped: collected.skipped.map((s) => ({ file: relative(root, s.path), reason: s.reason })),
        truncated: collected.truncated,
    };
}
