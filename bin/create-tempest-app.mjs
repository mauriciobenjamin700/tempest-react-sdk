#!/usr/bin/env node
// create-tempest-app — ships inside tempest-react-sdk.
//
//   npx create-tempest-app my-app         → scaffold a brand-new project folder
//   npx create-tempest-app .              → scaffold into the current directory
//   npx create-tempest-app                → same as "." (merge into the current dir)
//   npx create-tempest-app my-app --pwa   → also wire installability + web-push
//
// In merge mode, files the user already has are left untouched and an existing
// package.json has the Tempest scripts/deps merged in (your name/version are
// preserved). A symlink already in the destination is never written through:
// it is skipped and reported, so a link to a folder outside the project cannot
// redirect the template there. The `--pwa` flag overlays the PWA template
// (manifest, service worker, push-subscribe wiring) on top of the base.
import { cp, lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const TEMPLATE_DIR = join(PKG_ROOT, "template");
const TEMPLATE_PWA_DIR = join(PKG_ROOT, "template-pwa");

/** Files renamed on copy so they ship inside the npm tarball. */
const RENAME_ON_COPY = {
    _gitignore: ".gitignore",
    "_env.example": ".env.example",
    "_prettierrc.json": ".prettierrc.json",
};

const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
};

function isValidName(name) {
    return /^[a-z0-9._-]+$/i.test(name) && !name.startsWith(".");
}

/** Final on-disk name for a template entry (dotfiles are unprefixed on copy). */
function finalName(entryName) {
    return RENAME_ON_COPY[entryName] ?? entryName;
}

/** Recursively collect existing file paths under `dir`, relative to it. */
async function listFiles(dir, relBase = "", out = new Set()) {
    if (!existsSync(dir)) return out;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const rel = join(relBase, entry.name);
        if (entry.isDirectory()) {
            await listFiles(join(dir, entry.name), rel, out);
        } else {
            out.add(rel);
        }
    }
    return out;
}

async function isEmptyDir(dir) {
    if (!existsSync(dir)) return true;
    const entries = await readdir(dir);
    return entries.filter((e) => e !== ".git").length === 0;
}

/**
 * Read the SDK's own version so the generated app pins a matching range.
 *
 * This is why `template/package.json` deliberately does **not** list
 * `tempest-react-sdk` in its dependencies: every write path below stamps the
 * live version over whatever is there, so a literal range in the template is a
 * dead value that only drifts (it sat at `^0.27.0` fifteen minors after the
 * fact) and misleads whoever reads the file. `test/scaffold-template.test.ts`
 * keeps it out.
 */
async function readSdkVersion() {
    try {
        const pkg = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8"));
        return pkg.version ?? "latest";
    } catch {
        return "latest";
    }
}

/**
 * Whether `path` exists in the destination as a symbolic link.
 *
 * Checked with `lstat`, which does not follow the link: `mkdir(recursive)` and
 * `cp` both would, and that is how a `src -> ../elsewhere` link turned a merge
 * into writes outside the project (#436).
 *
 * @param {string} path - Absolute destination path.
 * @returns {Promise<boolean>}
 */
async function isSymlink(path) {
    try {
        return (await lstat(path)).isSymbolicLink();
    } catch {
        return false;
    }
}

/**
 * Whether the real location of `path`'s parent directory sits inside `root`.
 *
 * Second line behind {@link isSymlink}: it catches a link that appears in an
 * ancestor the copy did not create itself. A folder whose name merely starts
 * with two dots (`..cache`) is inside; only `..` itself or a `../` prefix is not.
 *
 * Both checks run immediately before each `mkdir`/`cp`, but nothing makes the
 * check and the write one atomic step: a process that swaps a folder for a
 * symlink in that window can still redirect the write. Node offers no
 * `openat`/`O_NOFOLLOW` walk to close it, and the attacker would need to be
 * racing the scaffold inside the user's own project folder, so this residual
 * TOCTOU window is an accepted risk.
 *
 * @param {string} realRoot - `realpath` of the destination root.
 * @param {string} path - Absolute destination path about to be written.
 * @returns {Promise<boolean>}
 */
async function parentInside(realRoot, path) {
    const parent = await realpath(dirname(path));
    const rel = relative(realRoot, parent);
    return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

/**
 * Copy a template tree into `destDir`. `package.json` is handled separately;
 * any path already present in `protect` (the user's own files) is skipped and
 * recorded, and so is any symlink in the destination, which is never written
 * through. Everything else is overwritten, so a later overlay wins over the
 * base it sits on.
 *
 * Template entries are written straight under their final name
 * (`_gitignore` → `.gitignore`), so no rename pass over the destination is
 * needed; the one that existed renamed the user's own `_gitignore` files too.
 */
async function copyTree(srcDir, destDir, protect, skipped, realRoot, relBase = "") {
    const entries = await readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const rel = join(relBase, finalName(entry.name));
        const from = join(srcDir, entry.name);
        const to = join(destDir, finalName(entry.name));
        if (entry.name === "package.json" && !entry.isDirectory()) continue;
        if ((await isSymlink(to)) || !(await parentInside(realRoot, to))) {
            skipped.add(rel);
            continue;
        }
        if (entry.isDirectory()) {
            await mkdir(to, { recursive: true });
            await copyTree(from, to, protect, skipped, realRoot, rel);
        } else if (protect.has(rel)) {
            skipped.add(rel);
        } else {
            await cp(from, to);
        }
    }
}

/** Stamp the SDK version into a fresh package.json. */
async function writeFreshPackageJson(destDir, name, sdkVersion) {
    const pkg = JSON.parse(await readFile(join(TEMPLATE_DIR, "package.json"), "utf8"));
    pkg.name = name;
    pkg.dependencies["tempest-react-sdk"] = `^${sdkVersion}`;
    await writeFile(join(destDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}

/** Merge Tempest scripts + deps into an existing package.json (non-destructive). */
async function mergePackageJson(destDir, sdkVersion) {
    const tpl = JSON.parse(await readFile(join(TEMPLATE_DIR, "package.json"), "utf8"));
    const target = JSON.parse(await readFile(join(destDir, "package.json"), "utf8"));

    target.type ??= "module";
    target.scripts = { ...tpl.scripts, ...(target.scripts ?? {}) };
    target.dependencies = { ...(target.dependencies ?? {}), ...tpl.dependencies };
    target.dependencies["tempest-react-sdk"] = `^${sdkVersion}`;
    target.devDependencies = { ...(target.devDependencies ?? {}), ...tpl.devDependencies };

    await writeFile(join(destDir, "package.json"), JSON.stringify(target, null, 2) + "\n");
}

/**
 * Fold the PWA package.json patch into the just-written one: PWA scripts win
 * (e.g. `build` also bundles the service worker), deps/devDeps are added.
 */
async function applyPwaPackageJson(destDir) {
    const patch = JSON.parse(await readFile(join(TEMPLATE_PWA_DIR, "package.json"), "utf8"));
    const target = JSON.parse(await readFile(join(destDir, "package.json"), "utf8"));

    target.scripts = { ...(target.scripts ?? {}), ...(patch.scripts ?? {}) };
    target.dependencies = { ...(target.dependencies ?? {}), ...(patch.dependencies ?? {}) };
    target.devDependencies = {
        ...(target.devDependencies ?? {}),
        ...(patch.devDependencies ?? {}),
    };

    await writeFile(join(destDir, "package.json"), JSON.stringify(target, null, 2) + "\n");
}

function parseArgs(argv) {
    const rest = argv.slice(2);
    const flags = new Set(rest.filter((a) => a.startsWith("--")));
    const positionals = rest.filter((a) => !a.startsWith("--"));
    return { name: positionals[0], pwa: flags.has("--pwa") };
}

async function main() {
    console.log(`\n${c.bold}${c.cyan}create-tempest-app${c.reset}\n`);

    if (!existsSync(TEMPLATE_DIR)) {
        console.error(`${c.red}✗ Template not found at ${TEMPLATE_DIR}${c.reset}`);
        process.exit(1);
    }

    const { name: arg, pwa } = parseArgs(process.argv);

    if (pwa && !existsSync(TEMPLATE_PWA_DIR)) {
        console.error(`${c.red}✗ PWA template not found at ${TEMPLATE_PWA_DIR}${c.reset}`);
        process.exit(1);
    }

    const sdkVersion = await readSdkVersion();
    const mergeMode = arg === "." || arg === undefined;

    // Resolve destination + validate.
    let destDir;
    if (mergeMode) {
        destDir = process.cwd();
        console.log(`${c.dim}Scaffolding into the current directory…${c.reset}`);
    } else {
        if (!isValidName(arg)) {
            console.error(`${c.red}✗ Invalid project name: "${arg}"${c.reset}`);
            process.exit(1);
        }
        destDir = resolve(process.cwd(), arg);
        if (!(await isEmptyDir(destDir))) {
            console.error(`${c.red}✗ Directory "${arg}" exists and is not empty.${c.reset}`);
            console.error(
                `${c.dim}  Use "create-tempest-app ." to merge into the current directory.${c.reset}`,
            );
            process.exit(1);
        }
        await mkdir(destDir, { recursive: true });
        console.log(`${c.dim}Scaffolding into ${destDir}…${c.reset}`);
    }
    if (pwa) console.log(`${c.dim}PWA mode: installability + web-push wiring.${c.reset}`);

    // Snapshot the user's own files so neither copy pass clobbers them.
    const protect = await listFiles(destDir);
    const hadPkg = protect.has("package.json");
    const skipped = new Set();
    const realRoot = await realpath(destDir);

    await copyTree(TEMPLATE_DIR, destDir, protect, skipped, realRoot);
    if (pwa) await copyTree(TEMPLATE_PWA_DIR, destDir, protect, skipped, realRoot);

    const pkgIsLink = await isSymlink(join(destDir, "package.json"));
    if (pkgIsLink) {
        skipped.add("package.json");
    } else if (hadPkg) {
        await mergePackageJson(destDir, sdkVersion);
        console.log(`${c.dim}Merged scripts + deps into existing package.json.${c.reset}`);
    } else {
        const name = mergeMode ? (destDir.split("/").pop() || "tempest-app").toLowerCase() : arg;
        await writeFreshPackageJson(destDir, name, sdkVersion);
    }
    if (pwa && !pkgIsLink) await applyPwaPackageJson(destDir);

    if (skipped.size) {
        console.log(`\n${c.yellow}Skipped ${skipped.size} existing file(s):${c.reset}`);
        for (const f of skipped) console.log(`  ${c.dim}· ${f}${c.reset}`);
    }

    console.log(`\n${c.green}✓ Done!${c.reset} Next steps:\n`);
    if (!mergeMode) console.log(`  ${c.bold}cd ${arg}${c.reset}`);
    console.log(`  ${c.bold}npm install${c.reset}`);
    if (!protect.has(".env")) console.log(`  ${c.bold}cp .env.example .env${c.reset}`);
    console.log(`  ${c.bold}npm run dev${c.reset}`);
    if (pwa) {
        console.log(
            `\n${c.dim}PWA: set VITE_VAPID_PUBLIC_KEY in .env, then test installability${c.reset}`,
        );
        console.log(
            `${c.dim}and push with a production build: ${c.reset}${c.bold}npm run build && npm run preview${c.reset}`,
        );
    }
    console.log();
}

main().catch((err) => {
    console.error(`${c.red}✗ ${err instanceof Error ? err.message : String(err)}${c.reset}`);
    process.exit(1);
});
