/**
 * ESM loader hooks that resolve a stylesheet import to an empty module.
 *
 * Runs on the loader thread, which is why it is a separate file from the
 * `register()` call in `css-loader.mjs`.
 */

const STYLESHEET = /\.(css|scss|sass|less)$/;

/**
 * Resolve a stylesheet specifier without asking Node to identify its format.
 *
 * @param {string} specifier - The import specifier.
 * @param {{ parentURL?: string }} context - Resolution context.
 * @param {Function} next - The next hook in the chain.
 * @returns {object} The resolution result.
 */
export function resolve(specifier, context, next) {
    if (!STYLESHEET.test(specifier)) return next(specifier, context);
    const url = context.parentURL
        ? new URL(specifier, context.parentURL).href
        : new URL(specifier, "file:///").href;
    return { url, format: "module", shortCircuit: true };
}

/**
 * Load a stylesheet as an empty ES module.
 *
 * @param {string} url - The resolved URL.
 * @param {object} context - Load context.
 * @param {Function} next - The next hook in the chain.
 * @returns {object} The load result.
 */
export function load(url, context, next) {
    if (!STYLESHEET.test(new URL(url).pathname)) return next(url, context);
    return { format: "module", source: "", shortCircuit: true };
}
