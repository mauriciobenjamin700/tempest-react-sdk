// The finding vocabulary of the design analysis, and how loud each one is.
//
// Nothing here is `error`, and that is deliberate. A size limit is a heuristic:
// `Calendar` and `ImageCropper` in this very SDK exceed 150 lines for a reason
// written in their JSDoc. Failing `tempest doctor`'s exit code on a heuristic
// would make the command unusable in CI for any existing project, and the first
// fix people reach for is silencing the tool. `warn` shows up, someone decides.
//
// The hard gates stay where they belong: `no-explicit-any` as an ESLint `error`
// and `tsc --noEmit` in CI.

/** Severity of each finding code. */
export const SEVERITY = {
    "file-lines": "warn",
    "function-lines": "warn",
    "hook-lines": "warn",
    "props-count": "warn",
    "param-count": "warn",
    "explicit-any": "warn",
    "ts-ignore": "warn",
    "fetch-in-component": "warn",
    "empty-catch": "warn",
    "inline-style-literal": "warn",
    "marker-without-reason": "warn",
    acknowledged: "info",
};

/** Default thresholds — the numbers documented in docs/design/limits.md. */
export const LIMITS = {
    componentFileLines: 150,
    moduleFileLines: 200,
    functionLines: 80,
    hookLines: 100,
    props: 7,
    params: 3,
};

/**
 * Build a finding.
 *
 * @param {string} code - A key of {@link SEVERITY}.
 * @param {object} params
 * @param {string} params.file - Path as it should be reported (project-relative).
 * @param {number} params.line - 1-based line.
 * @param {string} params.message - What is over the line, and what to do about it.
 * @param {object} [params.extra] - Extra fields carried through to the reporter.
 * @returns {{ code: string, severity: string, file: string, line: number, message: string }}
 */
export function finding(code, { file, line, message, extra = {} }) {
    return { code, severity: SEVERITY[code] ?? "warn", file, line, message, ...extra };
}

/** Sort findings by severity, then file, then line — the reporting order. */
export function sortFindings(findings) {
    const rank = { error: 0, warn: 1, info: 2 };
    return [...findings].sort(
        (a, b) =>
            (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) ||
            a.file.localeCompare(b.file) ||
            a.line - b.line ||
            a.code.localeCompare(b.code),
    );
}

/** Count findings per severity. */
export function countBySeverity(findings) {
    const counts = { warn: 0, info: 0 };
    for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
}
