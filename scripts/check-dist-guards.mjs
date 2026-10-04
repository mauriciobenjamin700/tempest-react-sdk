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
 * Four invariants, checked after every build:
 *
 * 1. `dist/utils/dev-mode.js` still contains the live `process.env.NODE_ENV`
 *    read — the expression the *consumer's* bundler replaces.
 * 2. Every file that calls `console.*` either routes through `isDevBuild()` or
 *    is listed below with a reason. An ungated console call is either noise in
 *    someone's production console or, if it was meant to be gated, dead code.
 * 3. `<Icon>` does not reach the 2024-slug list, and naming an icon does not
 *    reach the shard loader index (issue #173). That the runtime
 *    and the catalogue are separable is only true because no module on the
 *    `Icon` path imports `generated/icon-names.js` — one convenience import
 *    inside `use-icon` or `shard-cache` would add ~6 KB brotli to every app that
 *    renders a single icon, and nothing in the source would look wrong.
 * 4. Every CSS-module key the source reads exists in the published module
 *    (issue #405) — see the section above `cssModuleImports`.
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

/** The shard loader index, which naming an icon must not require. */
const SHARD_INDEX = "icons/generated/loaders.js";

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
    [
        "vision/normalization",
        "vendored ort-vision-sdk: warns when mean/std contradict an Ultralytics export, " +
            "which degrades accuracy in production too, not only in dev",
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

const namingGraph = staticGraph(join(DIST, "icons", "normalize-icon-name.js"));

if (namingGraph.has(SHARD_INDEX)) {
    problems.push(
        `dist/icons/normalize-icon-name.js now reaches ${SHARD_INDEX}. Cleaning up a ` +
            "slug is what a form does before submitting, and it must not depend on the " +
            "45 shard modules that exist to *render* one. Keep alias resolution in " +
            "icons/alias.js, which is why that module was split out of shard-cache.",
    );
}

/**
 * Node builtins Vite silently replaced with a browser stub.
 *
 * A builtin missing from `rollupOptions.external` is not left alone and is not an
 * error either: Vite rewrites it to `__vite-browser-external`, whose every export
 * is undefined. The module still builds, still imports, and fails only when the
 * function is called — `(0, a.readFileSync) is not a function`, in the consumer's
 * build, from a plugin that is Node-only by design. `node:fs` reached `dist/vite/`
 * exactly that way. Nothing in `dist/` should ever reach the stub.
 */
const BROWSER_STUB = "__vite-browser-external";

for (const file of collect(DIST)) {
    if (!file.endsWith(".js") && !file.endsWith(".cjs")) continue;
    if (!readFileSync(file, "utf8").includes(BROWSER_STUB)) continue;
    problems.push(
        `${relative(DIST, file)} imports ${BROWSER_STUB}: a Node builtin it uses is ` +
            "missing from `rollupOptions.external` in vite.config.ts, so Vite swapped it " +
            "for a stub whose exports are all undefined. It builds and throws at call time.",
    );
}

/**
 * CSS-module keys the source reads but the published module does not export.
 *
 * The build runs CSS modules with `localsConvention: "camelCaseOnly"`, so
 * `.marker-primary` is published as the key `markerPrimary` and `.size2xl` as
 * `size2Xl`; the raw spelling is gone. A lookup by the raw spelling is
 * `undefined`, `cn()` drops it, and the element renders unstyled — the `Timeline`
 * marker shipped transparent and `Modal size="2xl"` at the default width that way
 * (issue #405). The unit suite cannot see it: Vitest does not process CSS by
 * default and answers *every* key of a CSS module with the key itself, so
 * `styles["marker-primary"]` and `styles.connector` (a rule that never existed)
 * were both classes in every test. Only the artifact knows the real keys.
 *
 * Two checks per `import x from "./Y.module.css"` in `src/`, against the
 * default-export object of `dist/…/Y.module.js`:
 *
 * 1. every `x.name` and `x["literal"]` is a key that object has;
 * 2. no `x[\`…${…}…\`]` template carries `-` or `_` in its fixed text — the
 *    convention strips both, so such a lookup cannot match any published key.
 *
 * A computed lookup by a variable (`x[size]`) is out of reach statically; those
 * are typed by a union whose members are plain identifiers, which is the
 * convention the `Record` maps (`Timeline`'s `MARKER_CLASS`) make explicit.
 */
const SRC = join(ROOT, "src");
const CSS_MODULE_IMPORT = /\bimport\s+(\w+)\s+from\s+"(\.{1,2}\/[^"]+\.module\.css)"/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(^|[^:"'`\\])\/\/.*$/gm;

/**
 * Collect every source module that can import a CSS module.
 *
 * @param {string} dir - Directory to walk.
 * @param {string[]} found - Accumulator.
 * @returns {string[]} Absolute paths of `.ts`/`.tsx` files, tests and `.d.ts` excluded.
 */
function collectSource(dir, found = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) collectSource(full, found);
        else if (/\.tsx?$/.test(entry) && !/\.(test|d)\.tsx?$/.test(entry)) found.push(full);
    }
    return found;
}

/**
 * Read the keys of a published CSS module's default export.
 *
 * The default object is what `import styles from "…"` binds, so it is the set
 * read — not the named exports, which the source never imports.
 *
 * @param {string} file - Absolute path of a `dist/**\/*.module.js`.
 * @returns {Set<string> | undefined} The keys, or `undefined` when the shape is unrecognised.
 */
function publishedKeys(file) {
    const source = readFileSync(file, "utf8");
    const binding = source.match(/\bexport\s*\{[^}]*?\b([\w$]+)\s+as\s+default\b/)?.[1];
    if (binding === undefined) return undefined;
    const escaped = binding.replace(/\$/g, "\\$");
    const body = source.match(new RegExp(`(?:^|[\\s,;])${escaped}\\s*=\\s*\\{([^}]*)\\}`))?.[1];
    if (body === undefined) return undefined;
    return new Set([...body.matchAll(/([\w$]+)\s*:/g)].map((match) => match[1]));
}

let cssModuleImports = 0;
let cssModuleLookups = 0;

for (const file of collectSource(SRC)) {
    const raw = readFileSync(file, "utf8");
    if (!raw.includes(".module.css")) continue;
    const code = raw.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "$1");
    const where = relative(ROOT, file).replace(/\\/g, "/");

    for (const [, binding, specifier] of code.matchAll(CSS_MODULE_IMPORT)) {
        cssModuleImports += 1;
        const published = join(DIST, relative(SRC, join(file, "..", specifier))).replace(
            /\.css$/,
            ".js",
        );
        const shown = relative(ROOT, published).replace(/\\/g, "/");
        let keys;
        try {
            keys = publishedKeys(published);
        } catch {
            problems.push(`${where} imports ${specifier}, but ${shown} was not emitted`);
            continue;
        }
        if (keys === undefined || keys.size === 0) {
            problems.push(
                `${shown} has no default-export object this guard can read, so the ` +
                    "CSS-module key check proves nothing for it. Update publishedKeys().",
            );
            continue;
        }

        const dotted = new RegExp(`\\b${binding}\\.([A-Za-z_$][\\w$]*)`, "g");
        for (const [, key] of code.matchAll(dotted)) {
            cssModuleLookups += 1;
            if (keys.has(key)) continue;
            problems.push(
                `${where} reads ${binding}.${key}, which ${shown} does not export — it is ` +
                    "undefined in every app. Published keys are camelCase only " +
                    '(`localsConvention: "camelCaseOnly"`); use the key as published, or ' +
                    "drop the reference if the rule does not exist.",
            );
        }

        const computed = new RegExp(
            `\\b${binding}\\[\\s*(["'\`])((?:(?!\\1)[\\s\\S])*)\\1\\s*\\]`,
            "g",
        );
        for (const [, quote, literal] of code.matchAll(computed)) {
            cssModuleLookups += 1;
            const isTemplate = quote === "`" && literal.includes("${");
            const fixed = isTemplate ? literal.replace(/\$\{[^}]*\}/g, "") : literal;
            if (isTemplate ? !/[-_]/.test(fixed) : keys.has(literal)) continue;
            problems.push(
                `${where} reads ${binding}[${quote}${literal}${quote}], which cannot match any ` +
                    `key of ${shown}: published keys are camelCase only, so a \`-\` or \`_\` ` +
                    "never survives. Map the values to keys with a typed Record instead.",
            );
        }
    }
}

if (cssModuleImports === 0) {
    problems.push(
        'found no `import x from "./Y.module.css"` in src/, so the CSS-module key ' +
            "check proves nothing. Update CSS_MODULE_IMPORT to the import form in use.",
    );
}

if (problems.length > 0) {
    console.error("check-dist-guards: FAIL");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log(
    "check-dist-guards: ok (live dev guard present, no ungated console calls, " +
        `Icon reaches ${iconGraph.size} modules and none is the slug list, ` +
        `${cssModuleLookups} CSS-module lookups in ${cssModuleImports} imports all resolve)`,
);
