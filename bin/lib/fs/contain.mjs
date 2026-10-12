// Where a CLI write really lands. Every pass that writes into the user's project
// (`gen *`, `fix`'s alias and CSS passes) asks these before touching a path, so a
// symlink planted in a cloned repository cannot carry a write out of it.
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";

/**
 * `lstat` that answers `null` for a missing path instead of throwing.
 *
 * @param {string} path - Absolute path.
 * @returns {import("node:fs").Stats | null}
 */
export function lstatOrNull(path) {
    try {
        return lstatSync(path);
    } catch {
        return null;
    }
}

/**
 * Whether `path` lands inside `root` once symlinks are resolved.
 *
 * Resolves the nearest ancestor that exists through `realpath`, so `../x`, an
 * absolute path and an ancestor that is a symlink to somewhere else
 * (`src/components -> /elsewhere`) are all seen where they really land. The walk
 * stops at the nearest ancestor `lstat` sees, so a dangling symlink on the way is
 * not skipped over: its `realpath` throws and the path counts as outside, since
 * `mkdir` or `writeFile` would create whatever the link names.
 *
 * @param {string} root - Project root.
 * @param {string} path - Absolute path, existing or about to be created.
 * @returns {boolean}
 */
export function landsInside(root, path) {
    let existing = path;
    while (lstatOrNull(existing) === null && dirname(existing) !== existing) {
        existing = dirname(existing);
    }
    let real;
    let realRoot;
    try {
        real = realpathSync(existing);
        realRoot = realpathSync(root);
    } catch {
        return false;
    }
    const rel = relative(realRoot, real);
    return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}
