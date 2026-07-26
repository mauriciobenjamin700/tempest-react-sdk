// Read a project's tsconfig.json the way `tsc` does: JSONC comments allowed and
// the `extends` chain merged — without normalizing option values.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";

const MAX_EXTENDS_DEPTH = 16;

/**
 * Parse one tsconfig file into its raw JSON object.
 *
 * Prefers `ts.readConfigFile`, which accepts the JSONC dialect `tsc` accepts
 * (comments, trailing commas). Falls back to `JSON.parse` so a project without
 * TypeScript installed still gets the previous behavior instead of nothing.
 *
 * @param {string} path - Absolute path to a tsconfig file.
 * @param {object | null} ts - The `typescript` module, or `null`.
 * @returns {object | null} The raw config object, or `null` when unreadable.
 */
function parseConfigFile(path, ts) {
    if (ts) {
        const { config, error } = ts.readConfigFile(path, (p) => {
            try {
                return readFileSync(p, "utf8");
            } catch {
                return undefined;
            }
        });
        return error || !config ? null : config;
    }
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return null;
    }
}

/**
 * Resolve an `extends` entry to an absolute file path.
 *
 * Handles the two forms `tsc` supports: a relative/absolute path (with the
 * `.json` extension optional) and a bare package specifier such as
 * `@tsconfig/vite-react/tsconfig.json`, resolved from the extending file's
 * directory.
 *
 * @param {string} spec - The `extends` value.
 * @param {string} fromDir - Directory of the config that declares it.
 * @returns {string | null} Absolute path, or `null` when it cannot be resolved.
 */
function resolveExtends(spec, fromDir) {
    if (spec.startsWith(".") || isAbsolute(spec)) {
        const base = resolve(fromDir, spec);
        for (const candidate of [base, `${base}.json`, join(base, "tsconfig.json")]) {
            if (existsSync(candidate)) return candidate;
        }
        return null;
    }
    try {
        return createRequire(join(fromDir, "package.json")).resolve(spec);
    } catch {
        try {
            return createRequire(join(fromDir, "package.json")).resolve(
                join(spec, "tsconfig.json"),
            );
        } catch {
            return null;
        }
    }
}

/**
 * Read a project's tsconfig with its `extends` chain merged.
 *
 * `compilerOptions` are merged shallowly with the extending file winning, which
 * matches `tsc` for the scalar options this CLI reads. Path-valued options
 * (`baseUrl`, `paths`) are kept together with the directory of the file that
 * declared them, because `tsc` resolves them relative to *that* file — not to
 * the leaf config.
 *
 * Values are returned raw (`"bundler"`, `"react-jsx"`), never the numeric enums
 * `ts.parseJsonConfigFileContent` would produce, so callers can compare strings.
 *
 * @param {object} params
 * @param {string} params.root - Project root.
 * @param {object | null} params.ts - The `typescript` module, or `null`.
 * @param {string} [params.fileName] - Config file name. Default `"tsconfig.json"`.
 * @returns {{ path: string, dir: string, compilerOptions: object, pathsBaseDir: string } | null}
 *   `null` when the file is absent or unparseable.
 */
export function readTsconfig({ root, ts, fileName = "tsconfig.json" }) {
    const path = resolve(root, fileName);
    if (!existsSync(path)) return null;

    const chain = [];
    let current = path;
    let depth = 0;
    while (current && depth++ < MAX_EXTENDS_DEPTH) {
        const config = parseConfigFile(current, ts);
        if (!config) break;
        chain.push({ dir: dirname(current), config });
        const next = config.extends;
        if (typeof next !== "string") break;
        current = resolveExtends(next, dirname(current));
    }
    if (!chain.length) return null;

    const compilerOptions = {};
    let pathsBaseDir = dirname(path);
    for (const { dir, config } of chain.reverse()) {
        const co = config.compilerOptions;
        if (!co || typeof co !== "object") continue;
        if (co.paths || co.baseUrl) pathsBaseDir = dir;
        Object.assign(compilerOptions, co);
    }
    return { path, dir: dirname(path), compilerOptions, pathsBaseDir };
}
