// Work out which path alias a project uses (`@/*` → `src/*`) and where its base
// directory is, so the codemod rewrites to the project's own convention.
import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { readTsconfig } from "./tsconfig.mjs";

/** True when `path` exists and is a directory. */
function isDir(path) {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Pick the first usable `<prefix>/*` → `<dir>/*` mapping from tsconfig `paths`.
 *
 * Entries are skipped rather than guessed at when they are ambiguous: more than
 * one target (the compiler tries each in order, so there is no single directory
 * to rewrite to), a non-wildcard key, or a target whose directory is missing.
 * Insertion order decides between several usable entries, so the result is
 * stable across runs.
 *
 * @param {object} paths - Raw `compilerOptions.paths`.
 * @param {string} baseDir - Directory the targets resolve against.
 * @returns {{ prefix: string, baseDir: string } | null}
 */
function fromPaths(paths, baseDir) {
    for (const [key, targets] of Object.entries(paths)) {
        if (!key.endsWith("/*") || !Array.isArray(targets) || targets.length !== 1) continue;
        const target = targets[0];
        if (typeof target !== "string" || !target.endsWith("/*")) continue;
        const dir = resolve(baseDir, target.slice(0, -2));
        if (!isDir(dir)) continue;
        return { prefix: key.slice(0, -2), baseDir: dir };
    }
    return null;
}

/**
 * Discover the alias prefix and its base directory for a project.
 *
 * The tsconfig `paths` entry is the *only* accepted source, deliberately: it is
 * what the type-checker honors, so an alias found there is one `tsc --noEmit`
 * will accept afterwards. Inferring `@` → `src` from the directory layout was
 * tried and rejected — a project can perfectly well have a `src/` and no alias
 * at all (the SDK's own `examples/gallery` is one), and rewriting its imports
 * would produce specifiers that resolve nowhere.
 *
 * `extends` chains and JSONC comments are handled by `readTsconfig`, so a project
 * that keeps `paths` in a shared base config is still recognized.
 *
 * Returning `null` is a normal outcome, not an error: the caller reports it and
 * leaves the source untouched rather than inventing a convention.
 *
 * @param {object} params
 * @param {string} params.root - Project root.
 * @param {object | null} params.ts - The `typescript` module, or `null`.
 * @returns {{ prefix: string, baseDir: string, source: "tsconfig" } | null}
 */
export function discoverAlias({ root, ts }) {
    const tsconfig = readTsconfig({ root, ts });
    const paths = tsconfig?.compilerOptions?.paths;
    if (!paths || typeof paths !== "object") return null;

    const baseUrl = tsconfig.compilerOptions.baseUrl;
    const pathsBase =
        typeof baseUrl === "string"
            ? isAbsolute(baseUrl)
                ? baseUrl
                : resolve(tsconfig.pathsBaseDir, baseUrl)
            : tsconfig.pathsBaseDir;
    const found = fromPaths(paths, pathsBase);
    return found ? { ...found, source: "tsconfig" } : null;
}
