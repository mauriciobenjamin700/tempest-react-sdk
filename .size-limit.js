/**
 * Size budgets, with the per-slice CSS excluded from the JavaScript numbers.
 *
 * The limits themselves live in `.size-limit.checks.json`; this file is only the
 * measurement fix, and it exists because of one thing esbuild does not do.
 *
 * Since every `*.module.js` imports its own stylesheet, a bundler has to decide
 * whether an unreached module's CSS import can go. `sideEffects: ["**\/*.css"]` in
 * `package.json` is what tells it the JavaScript is free of side effects, so the
 * import goes with the module — measured in a real app: `{ cn }` builds to 436 B
 * with no stylesheet emitted at all, and mounting `Button`, `Card` and `Badge`
 * emits the CSS of those three and no other.
 *
 * These checks import `./dist/...` by path rather than by package name, so nothing
 * resolves through `node_modules` and esbuild never reads that `sideEffects` field.
 * Every CSS import therefore survives, and the same `{ cn }` measured 25.19 kB — a
 * number about the whole sheet, not about `cn`. The plugin below loads a stylesheet
 * as an empty module for the JavaScript checks, which restores what they have always
 * measured. The CSS is budgeted by the `styles*` checks, which point at the
 * stylesheets directly.
 */

import { readFileSync } from "node:fs";

const checks = JSON.parse(
    readFileSync(new URL("./.size-limit.checks.json", import.meta.url), "utf8"),
);

/** Resolve every stylesheet import to an empty module. */
const dropCss = {
    name: "size-limit-drop-css",
    setup(build) {
        build.onResolve({ filter: /\.css$/ }, (args) => ({
            path: args.path,
            namespace: "size-limit-empty-css",
        }));
        build.onLoad({ filter: /.*/, namespace: "size-limit-empty-css" }, () => ({
            contents: "",
            loader: "js",
        }));
    },
};

/**
 * Whether a check measures stylesheets rather than JavaScript.
 *
 * @param {{ path?: string | string[] }} check - One size-limit entry.
 * @returns {boolean} True when every path it names is a stylesheet.
 */
function measuresCss(check) {
    const paths = Array.isArray(check.path) ? check.path : [check.path];
    return paths.every((path) => typeof path === "string" && path.endsWith(".css"));
}

export default checks.map((check) =>
    measuresCss(check)
        ? check
        : {
              ...check,
              modifyEsbuildConfig(config) {
                  config.plugins = [...(config.plugins ?? []), dropCss];
                  return config;
              },
          },
);
