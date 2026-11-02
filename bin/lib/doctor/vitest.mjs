/**
 * The Vitest config check for `tempest doctor`.
 *
 * Every SDK component module imports its own stylesheet, and Vitest hands an ESM
 * package from `node_modules` to plain Node, which has no loader for `.css`. A
 * consumer suite that imports the SDK therefore dies before running with
 * `Unknown file extension ".css"` unless the config inlines the SDK — which is what
 * `tempestVitest()` does, and what `createViteConfig` includes. Measured in #548
 * with the 0.81.0 tarball on Vitest 4.1.12: an own `vitest.config.ts`, a plain
 * `vite.config.ts` and no config at all fail; only the plugin passes.
 *
 * The check is a text heuristic over the config file Vitest would load, not an
 * evaluation of it: running the user's config would execute their code and pull
 * their plugins in, which a health check has no business doing. The markers are the
 * plugin and helper names, an explicit `inline: true` (which inlines everything,
 * the SDK included), and an inline list naming the package — the three shapes that
 * make the suite pass.
 */

/**
 * Config file names Vitest looks for, in the order it prefers them.
 *
 * Ported from Vitest 4.1.12's `configFiles` (`CONFIG_NAMES` × `CONFIG_EXTENSIONS`
 * in `dist/chunks/constants.*.js`, not exported): a `vitest.config.*` wins over a
 * `vite.config.*`, and within each the extensions are tried in this order. The
 * test reads the installed Vitest and fails when the list drifts.
 */
export const VITEST_CONFIG_FILES = [
    "vitest.config.ts",
    "vitest.config.mts",
    "vitest.config.cts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vitest.config.cjs",
    "vite.config.ts",
    "vite.config.mts",
    "vite.config.cts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cjs",
];

/** Text that, once comments are gone, means the config already inlines the SDK. */
const INLINES_SDK = [
    /\btempestVitest\b/,
    /\bcreateViteConfig\b/,
    /\binline\s*:\s*true\b/,
    /\binline\s*:\s*\[[^\]]*["'`]tempest-react-sdk["'`]/,
];

/** An import of the project's own `vite.config`, as `mergeConfig` setups do. */
const IMPORTS_VITE_CONFIG = /from\s*["']\.\/vite\.config(?:\.[cm]?[jt]s)?["']/;

/**
 * Drop JavaScript comments so a marker that only appears in prose does not count.
 *
 * A line comment is only removed when `//` is not preceded by `:`, which keeps
 * `https://` inside a string intact; a missed edge case here costs one false "ok",
 * never a crash.
 *
 * @param {string} text - Source text of a config file.
 * @returns {string} The text without block and line comments.
 */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Whether a config file's text makes Vitest inline the SDK.
 *
 * @param {string} text - Source text of the config.
 * @returns {boolean} Whether one of the passing shapes is present.
 */
function inlinesSdk(text) {
    const code = stripComments(text);
    return INLINES_SDK.some((marker) => marker.test(code));
}

/**
 * Audit whether the project's Vitest setup can import the SDK.
 *
 * Vitest loads the first `vitest.config.*`, else the first `vite.config.*`, else
 * runs with defaults; this mirrors that choice and judges only the file it would
 * load. A `vitest.config.*` that imports `./vite.config` (the `mergeConfig`
 * pattern) passes when that `vite.config.*` does, so a project using
 * `createViteConfig` there is not flagged.
 *
 * @param {object} params
 * @param {boolean} params.vitestInstalled - Whether `vitest` resolves in the project.
 * @param {Record<string, string>} params.configs - Text of each config file present,
 *   keyed by its name from {@link VITEST_CONFIG_FILES}.
 * @returns {Array<[status: string, label: string, detail?: string]>} Check rows;
 *   empty when the project does not use Vitest.
 */
export function checkVitest({ vitestInstalled, configs }) {
    if (!vitestInstalled) return [];

    const loaded = VITEST_CONFIG_FILES.find((name) => name in configs);
    const fix =
        "add `plugins: [tempestVitest()]` from tempest-react-sdk/vite, or build the config " +
        "with createViteConfig — otherwise any test importing the SDK fails with " +
        '`Unknown file extension ".css"`';

    if (!loaded) {
        return [["warn", "Vitest runs with no config", fix]];
    }

    const text = configs[loaded];
    const viaViteConfig =
        loaded.startsWith("vitest.") &&
        IMPORTS_VITE_CONFIG.test(stripComments(text)) &&
        VITEST_CONFIG_FILES.some(
            (name) => name.startsWith("vite.") && name in configs && inlinesSdk(configs[name]),
        );

    if (inlinesSdk(text) || viaViteConfig) {
        return [["ok", `${loaded} lets Vitest load the SDK`]];
    }
    return [["warn", `${loaded} does not inline the SDK for Vitest`, fix]];
}
