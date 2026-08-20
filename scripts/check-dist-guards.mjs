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
 * Three invariants, checked after every build:
 *
 * 1. `dist/utils/dev-mode.js` still contains the live `process.env.NODE_ENV`
 *    read — the expression the *consumer's* bundler replaces.
 * 2. Every file that calls `console.*` either routes through `isDevBuild()` or
 *    is listed below with a reason. An ungated console call is either noise in
 *    someone's production console or, if it was meant to be gated, dead code.
 * 3. `<Icon>` does not reach the 2024-slug list (issue #173). That the runtime
 *    and the catalogue are separable is only true because no module on the
 *    `Icon` path imports `generated/icon-names.js` — one convenience import
 *    inside `use-icon` or `shard-cache` would add ~6 KB brotli to every app that
 *    renders a single icon, and nothing in the source would look wrong.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const DEV_MODE_FILE = join(DIST, "utils", "dev-mode.js");
const LIVE_GUARD = "process.env.NODE_ENV";

/** The catalogue module that must stay off the `<Icon>` path. */
const SLUG_LIST = "icons/generated/icon-names.js";

/**
 * `import … from "x"`, `export … from "x"`, and the bare `import "x"`.
 *
 * The middle is `[^'"]*` rather than `[\s\S]*?` on purpose: a lazy catch-all
 * walks past a bare import's own specifier to find the `from` of the *next*
 * statement, swallowing the bare import whole. Refusing to cross a quote keeps
 * each match inside one statement — which is what makes the side-effect import
 * form visible at all.
 */
const STATIC_IMPORT =
    /\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;

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

/**
 * The static import graph reachable from one dist module.
 *
 * `preserveModules` keeps one output file per source module, so a module's
 * static imports *are* its real dependencies — no bundler needed to answer what
 * a given export drags in. Dynamic imports are deliberately not followed: an
 * icon shard is a separate chunk fetched on demand, which is the whole design.
 *
 * @param {string} entry - Absolute path of the dist module to start from.
 * @returns {Set<string>} Dist-relative paths, POSIX separators, entry included.
 */
function staticGraph(entry) {
    const seen = new Set();
    const queue = [entry];

    while (queue.length > 0) {
        const file = queue.pop();
        const key = relative(DIST, file).replace(/\\/g, "/");
        if (seen.has(key)) continue;
        seen.add(key);

        let source;
        try {
            source = readFileSync(file, "utf8");
        } catch {
            continue;
        }
        for (const match of source.matchAll(STATIC_IMPORT)) {
            const specifier = match[1] ?? match[2];
            if (specifier === undefined || !specifier.startsWith(".")) continue;
            queue.push(join(file, "..", specifier));
        }
    }
    return seen;
}

const iconGraph = staticGraph(join(DIST, "icons", "Icon.js"));
const validatorGraph = staticGraph(join(DIST, "icons", "is-icon-name.js"));

if (iconGraph.has(SLUG_LIST)) {
    problems.push(
        `dist/icons/Icon.js now reaches ${SLUG_LIST} through static imports. ` +
            "That list is ~6 KB brotli of catalogue data only a picker needs, and it " +
            "would land in every app that renders one icon. Reach it from a module the " +
            "runtime does not import, the way is-icon-name.js does.",
    );
}

if (!validatorGraph.has(SLUG_LIST)) {
    problems.push(
        `dist/icons/is-icon-name.js no longer reaches ${SLUG_LIST}, so the check above ` +
            "proves nothing. Point SLUG_LIST at wherever the slug list moved.",
    );
}

if (problems.length > 0) {
    console.error("check-dist-guards: FAIL");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log(
    "check-dist-guards: ok (live dev guard present, no ungated console calls, " +
        `Icon reaches ${iconGraph.size} modules and none is the slug list)`,
);
