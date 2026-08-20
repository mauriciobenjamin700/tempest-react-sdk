/**
 * Guard the published artifact against dev-only code that cannot run.
 *
 * A library cannot ask `import.meta.env.DEV` whether the app is in
 * development: Vite answers that question while building *this package*, so the
 * published file carries a constant and every guard behind it becomes dead code
 * (issue #164 — `<Icon>`'s unknown-slug warning never fired, in any app). The
 * class of bug is invisible in the source, where the wrong form reads exactly
 * like the right one, and invisible to the test suite, which runs before the
 * bundler folds anything. It is only visible here, in `dist`.
 *
 * Two invariants, checked after every build:
 *
 * 1. `dist/utils/dev-mode.js` still contains the live `process.env.NODE_ENV`
 *    read — the expression the *consumer's* bundler replaces.
 * 2. Every file that calls `console.*` either routes through `isDevBuild()` or
 *    is listed below with a reason. An ungated console call is either noise in
 *    someone's production console or, if it was meant to be gated, dead code.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const DEV_MODE_FILE = join(DIST, "utils", "dev-mode.js");
const LIVE_GUARD = "process.env.NODE_ENV";

/**
 * Files whose `console` calls are the product, not a dev-time diagnostic.
 *
 * Keyed by dist-relative path without extension, so the ESM and CJS copies of
 * the same module share one entry.
 */
const ALLOWED = new Map([
    ["logger/logger", "consoleSink is the default sink; the level gate is createLogger's"],
    [
        "telemetry/console-adapter",
        "the console *is* this adapter's destination, opted into by name",
    ],
    [
        "vision/core/session",
        "vendored ort-vision-sdk: warns about model metadata at runtime, not in dev only",
    ],
    [
        "vision/core/graph",
        "vendored ort-vision-sdk: warns when the model overrides a requested input size",
    ],
]);

const CONSOLE_CALL = /console\s*[.[]/;
const problems = [];

/**
 * Collect every JavaScript file the build emitted.
 *
 * @param {string} dir - Directory to walk.
 * @param {string[]} found - Accumulator.
 * @returns {string[]} Absolute paths of `.js` and `.cjs` files.
 */
function collect(dir, found = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) collect(full, found);
        else if (/\.(js|cjs)$/.test(entry)) found.push(full);
    }
    return found;
}

let devMode;
try {
    devMode = readFileSync(DEV_MODE_FILE, "utf8");
} catch {
    problems.push(
        `missing ${relative(ROOT, DEV_MODE_FILE)} — run \`npm run build\` before this check`,
    );
}

if (devMode !== undefined && !devMode.includes(LIVE_GUARD)) {
    problems.push(
        `${relative(ROOT, DEV_MODE_FILE)} no longer reads \`${LIVE_GUARD}\`. ` +
            "Whatever replaced it was resolved while building this package, so every " +
            "dev-only guard in the SDK is now dead code in the published artifact.",
    );
}

for (const file of collect(DIST)) {
    const source = readFileSync(file, "utf8");
    if (!CONSOLE_CALL.test(source)) continue;

    const key = relative(DIST, file)
        .replace(/\\/g, "/")
        .replace(/\.(js|cjs)$/, "");
    if (ALLOWED.has(key)) continue;
    if (source.includes("dev-mode") || source.includes(LIVE_GUARD)) continue;

    problems.push(
        `dist/${key} calls console.* without going through isDevBuild(). ` +
            "Gate it with `isDevBuild()` from src/utils, or add it to ALLOWED in " +
            "scripts/check-dist-guards.mjs with the reason it always speaks.",
    );
}

if (problems.length > 0) {
    console.error("check-dist-guards: FAIL");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log("check-dist-guards: ok (live dev guard present, no ungated console calls)");
