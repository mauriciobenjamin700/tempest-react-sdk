// Resolve the *project's own* TypeScript install — the alias codemod parses app
// source, so it must agree with the compiler that type-checks it.
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * The classic-API members every codemod in this CLI needs.
 *
 * TypeScript 7 is the native port: its package still installs under the name
 * `typescript`, but the `.` export is a version stub — the JS API moved behind
 * `typescript/unstable/*` with a different shape. So "the module resolved" no
 * longer implies "the API is there", and calling into it blew up with
 * `ts.readConfigFile is not a function` — a stack trace out of `tempest doctor`,
 * which is the command people run first.
 */
const REQUIRED_API = ["readConfigFile", "createSourceFile", "forEachChild"];

/** True when the resolved module exposes the classic compiler API. */
function hasClassicApi(module) {
    return Boolean(module) && REQUIRED_API.every((name) => typeof module[name] === "function");
}

/**
 * Load `typescript` from the project's `node_modules`.
 *
 * Resolution is anchored at `root` (not at this file) so the CLI never falls
 * back to a copy bundled with the SDK: parsing app source with a different
 * compiler version than the one that type-checks it would let syntax the app
 * accepts fail here.
 *
 * Returns `null` both when TypeScript is absent and when the install does not
 * expose the classic API, because callers treat the two the same way — report it
 * and leave the source untouched. Use {@link describeTypeScript} to say which of
 * the two happened.
 *
 * @param {string} root - Project root, the directory holding `node_modules`.
 * @returns {object | null} The `typescript` module, or `null`.
 */
export function loadTypeScript(root) {
    try {
        const module = createRequire(join(root, "package.json"))("typescript");
        return hasClassicApi(module) ? module : null;
    } catch {
        return null;
    }
}

/**
 * What the project's TypeScript install is, so a message can say the truth
 * instead of "not installed" about a package that is right there.
 *
 * @param {string} root - Project root.
 * @returns {{ status: "ok" | "missing" | "api-unavailable", version: string | null }}
 */
export function describeTypeScript(root) {
    let resolve_;
    try {
        resolve_ = createRequire(join(root, "package.json"));
    } catch {
        return { status: "missing", version: null };
    }
    let version = null;
    try {
        version = resolve_("typescript/package.json")?.version ?? null;
    } catch {
        return { status: "missing", version: null };
    }
    try {
        return {
            status: hasClassicApi(resolve_("typescript")) ? "ok" : "api-unavailable",
            version,
        };
    } catch {
        return { status: "api-unavailable", version };
    }
}

/**
 * One line explaining why a codemod cannot run, or `null` when it can.
 *
 * @param {string} root - Project root.
 * @returns {string | null}
 */
export function typeScriptUnavailableReason(root) {
    const { status, version } = describeTypeScript(root);
    if (status === "ok") return null;
    if (status === "missing") return "typescript não instalado (npm i -D typescript)";
    return (
        `typescript ${version ?? "?"} não expõe a API clássica do compilador — o 7 publica só ` +
        "`typescript/unstable/*`, com outra forma. Pra usar os codemods, tenha o TypeScript 6 " +
        "instalado; o resto do comando segue normal"
    );
}
