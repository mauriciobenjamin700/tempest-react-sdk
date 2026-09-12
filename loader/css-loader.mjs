/**
 * Let Node import this SDK without a bundler.
 *
 * Every component module imports its own stylesheet, which is what lets a bundler
 * ship the CSS of the components an app mounts and drop the rest. Node has no
 * loader for `.css`, so importing the package in plain Node — a script, a Jest
 * suite with no stylesheet transform, anything reading the surface for
 * introspection — fails at import time with:
 *
 *     TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".css"
 *
 * This registers the missing loader, for ESM and CommonJS both, and resolves every
 * stylesheet to an empty module. Nothing about the styles is emulated: it makes the
 * import a no-op, which is the correct answer in a context that paints nothing.
 *
 * Use it before importing the SDK:
 *
 *     node --import tempest-react-sdk/node-css-loader your-script.mjs
 *
 * Or from inside a script, before the first import of the package:
 *
 *     import "tempest-react-sdk/node-css-loader";
 *     const sdk = await import("tempest-react-sdk");
 *
 * A bundler needs none of this — it is the tool that has the CSS loader. Vitest
 * handles stylesheets on its own too. This is for plain Node.
 */

import { createRequire, register } from "node:module";

register("./css-loader-hooks.mjs", import.meta.url);

/**
 * Teach `require` the same thing, for a CommonJS consumer.
 *
 * `register()` covers the ESM graph only; `require("…/Button.css")` would still
 * reach the CommonJS extension table, which tries to parse the file as JavaScript.
 */
const require = createRequire(import.meta.url);
/** @type {{ _extensions: Record<string, (module: { exports: unknown }, filename: string) => void> }} */
const Module = require("node:module");
for (const extension of [".css", ".scss", ".sass", ".less"]) {
    Module._extensions[extension] = (module) => {
        module.exports = {};
    };
}
