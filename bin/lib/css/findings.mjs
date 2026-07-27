// The finding vocabulary: every code the CSS analysis can emit, and how loud it
// is. Kept in one table so `doctor`, `fix` and the tests agree on what counts as
// broken CSS versus a suggestion somebody may reasonably decline.
//
// `error` means the browser drops something the author wrote. `warn` means the
// CSS is valid but a declaration is dead, shadowed or pointing at a name that
// does not exist. `info` is advice — a token or a shared class that would say
// the same thing better — and never fails a command.

/** Severity of each finding code. */
export const SEVERITY = {
    "unterminated-comment": "error",
    "unterminated-string": "error",
    "unterminated-paren": "error",
    "unclosed-block": "error",
    "unexpected-brace": "error",
    "missing-brace": "error",
    "missing-colon": "error",
    "missing-property": "error",
    "missing-semicolon": "error",
    "empty-value": "error",
    "empty-selector": "error",
    "declaration-outside-rule": "error",
    "unknown-at-rule": "warn",
    "unknown-property": "warn",
    "unknown-token": "warn",
    "undefined-var": "warn",
    "duplicate-declaration": "warn",
    "overridden-declaration": "warn",
    "duplicate-selector": "warn",
    "duplicate-rule": "warn",
    "empty-rule": "warn",
    "hardcoded-token-value": "info",
    "global-candidate": "info",
    "utility-candidate": "info",
};

/**
 * Build a finding.
 *
 * @param {string} code - A key of {@link SEVERITY}.
 * @param {object} params
 * @param {string} params.file - Path as it should be reported (project-relative).
 * @param {number} params.line - 1-based line.
 * @param {string} params.message - What is wrong, and what to do about it.
 * @param {boolean} [params.fixable] - Whether `tempest fix` rewrites it.
 * @param {object} [params.extra] - Extra fields carried through to the reporter.
 * @returns {{ code: string, severity: string, file: string, line: number, message: string, fixable: boolean }}
 */
export function finding(code, { file, line, message, fixable = false, extra = {} }) {
    return {
        code,
        severity: SEVERITY[code] ?? "warn",
        file,
        line,
        message,
        fixable,
        ...extra,
    };
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
    const counts = { error: 0, warn: 0, info: 0 };
    for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
}
