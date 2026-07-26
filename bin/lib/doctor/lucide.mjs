// The `lucide-react` single-instance check for `tempest doctor`.
//
// Kept out of the generic stateful-deps check on purpose: two copies of React or
// of react-query break hooks and context, which is a different failure from what
// two copies of lucide cause. Lucide is stateless, so nothing "breaks" at
// runtime — instead the bytes are duplicated and, far worse, the generated slug
// tables behind `tempest-react-sdk/icons` can reference exports the second copy
// does not have.

/** Major version number from a semver string or range, or null. */
function major(spec) {
    if (!spec) return null;
    const match = /(\d+)\./.exec(String(spec).replace(/^[^\d]*/, ""));
    return match ? Number(match[1]) : null;
}

/**
 * Audit how many copies of `lucide-react` a project will end up with.
 *
 * @param {object} params
 * @param {string | null} params.appSpec - Range the app declares, or `null`.
 * @param {string | null} params.sdkSpec - Range the installed SDK declares, or `null`.
 * @param {string | null} params.installedVersion - Version resolved at the app root, or `null`.
 * @param {boolean} params.nestedCopy - Whether a copy exists under the SDK's own `node_modules`.
 * @returns {Array<[status: string, label: string, detail?: string]>} Check rows.
 */
export function checkLucide({ appSpec, sdkSpec, installedVersion, nestedCopy }) {
    const rows = [];

    // The SDK not declaring it means this project does not use the icons surface
    // at all (or the SDK is not installed) — there is nothing to audit.
    if (!sdkSpec) return rows;

    if (nestedCopy) {
        rows.push([
            "warn",
            "two copies of lucide-react",
            "nested copy under tempest-react-sdk — duplicated bytes, and the generated " +
                "icon slug tables may not match it; run `npm dedupe` or drop lucide-react " +
                "from your package.json (the SDK ships it)",
        ]);
    }

    if (appSpec) {
        const sameRange = appSpec === sdkSpec;
        rows.push([
            sameRange ? "info" : "warn",
            "lucide-react declared by the app",
            sameRange
                ? `matches the SDK's ${sdkSpec} so a single copy installs — the declaration is ` +
                  "redundant, but harmless (npm/yarn resolve it from the SDK without it)"
                : `you declare ${appSpec}, the SDK declares ${sdkSpec} — two copies install. ` +
                  "Run `npm uninstall lucide-react`; only declare it under pnpm, and then " +
                  `use ${sdkSpec}`,
        ]);
    }

    const installedMajor = major(installedVersion);
    const requiredMajor = major(sdkSpec);
    if (installedMajor !== null && requiredMajor !== null && installedMajor < requiredMajor) {
        rows.push([
            "fail",
            `lucide-react v${installedVersion} is older than the SDK needs`,
            `the icon slug tables are generated against ${sdkSpec}, so exports they ` +
                "reference can be missing — the build fails with `… is not exported by " +
                "lucide-react` pointing inside the SDK",
        ]);
    }

    if (rows.length === 0) {
        rows.push(["ok", "single lucide-react instance", `from the SDK — ${sdkSpec}`]);
    }
    return rows;
}
