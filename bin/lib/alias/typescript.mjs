// Resolve the *project's own* TypeScript install — the alias codemod parses app
// source, so it must agree with the compiler that type-checks it.
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Load `typescript` from the project's `node_modules`.
 *
 * Resolution is anchored at `root` (not at this file) so the CLI never falls
 * back to a copy bundled with the SDK: parsing app source with a different
 * compiler version than the one that type-checks it would let syntax the app
 * accepts fail here.
 *
 * @param {string} root - Project root, the directory holding `node_modules`.
 * @returns {object | null} The `typescript` module, or `null` when not installed.
 */
export function loadTypeScript(root) {
    try {
        return createRequire(join(root, "package.json"))("typescript");
    } catch {
        return null;
    }
}
