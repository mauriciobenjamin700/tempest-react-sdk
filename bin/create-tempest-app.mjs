#!/usr/bin/env node
// create-tempest-app — ships inside tempest-react-sdk.
//
//   npx create-tempest-app my-app   → scaffold a brand-new project folder
//   npx create-tempest-app .        → scaffold into the current directory
//   npx create-tempest-app          → same as "." (merge into the current dir)
//
// In merge mode, existing files are left untouched and an existing package.json
// has the Tempest scripts/deps merged in (your name/version are preserved).
import { cp, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const TEMPLATE_DIR = join(PKG_ROOT, "template");

/** Files renamed on copy so they ship inside the npm tarball. */
const RENAME_ON_COPY = { _gitignore: ".gitignore", "_env.example": ".env.example" };

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

async function isEmptyDir(dir) {
    if (!existsSync(dir)) return true;
    const entries = await readdir(dir);
    return entries.filter((e) => e !== ".git").length === 0;
}

/** Read the SDK's own version so the generated app pins a matching range. */
async function readSdkVersion() {
    try {
        const pkg = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8"));
        return pkg.version ?? "latest";
    } catch {
        return "latest";
    }
}

/** Recursively rename underscore-prefixed dotfiles after a directory copy. */
async function fixDotfiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            await fixDotfiles(full);
        } else if (RENAME_ON_COPY[entry.name]) {
            await rename(full, join(dir, RENAME_ON_COPY[entry.name]));
        }
    }
}

/** Recursively copy template files, skipping any that already exist in dest. */
async function mergeCopy(srcDir, destDir, skipped, relBase = "") {
    const entries = await readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const rel = join(relBase, RENAME_ON_COPY[entry.name] ?? entry.name);
        const from = join(srcDir, entry.name);
        const to = join(destDir, RENAME_ON_COPY[entry.name] ?? entry.name);
        if (entry.isDirectory()) {
            await mkdir(to, { recursive: true });
            await mergeCopy(from, to, skipped, rel);
        } else if (entry.name === "package.json") {
            // handled separately by mergePackageJson
        } else if (existsSync(to)) {
            skipped.push(rel);
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

async function main() {
    console.log(`\n${c.bold}${c.cyan}create-tempest-app${c.reset}\n`);

    if (!existsSync(TEMPLATE_DIR)) {
        console.error(`${c.red}✗ Template not found at ${TEMPLATE_DIR}${c.reset}`);
        process.exit(1);
    }

    const sdkVersion = await readSdkVersion();
    const arg = process.argv[2];

    // Merge mode: "." or no arg → scaffold into the current directory.
    if (arg === "." || arg === undefined) {
        const destDir = process.cwd();
        const hasPkg = existsSync(join(destDir, "package.json"));
        console.log(`${c.dim}Scaffolding into the current directory…${c.reset}`);

        const skipped = [];
        await mergeCopy(TEMPLATE_DIR, destDir, skipped);
        await fixDotfiles(destDir);

        if (hasPkg) {
            await mergePackageJson(destDir, sdkVersion);
            console.log(`${c.dim}Merged scripts + deps into existing package.json.${c.reset}`);
        } else {
            const name = (destDir.split("/").pop() || "tempest-app").toLowerCase();
            await writeFreshPackageJson(destDir, name, sdkVersion);
        }

        if (skipped.length) {
            console.log(`\n${c.yellow}Skipped ${skipped.length} existing file(s):${c.reset}`);
            for (const f of skipped) console.log(`  ${c.dim}· ${f}${c.reset}`);
        }

        console.log(`\n${c.green}✓ Done!${c.reset} Next steps:\n`);
        console.log(`  ${c.bold}npm install${c.reset}`);
        console.log(`  ${c.bold}npm run dev${c.reset}\n`);
        return;
    }

    // New-project mode: scaffold a fresh folder from the given name.
    if (!isValidName(arg)) {
        console.error(`${c.red}✗ Invalid project name: "${arg}"${c.reset}`);
        process.exit(1);
    }

    const destDir = resolve(process.cwd(), arg);
    if (!(await isEmptyDir(destDir))) {
        console.error(`${c.red}✗ Directory "${arg}" exists and is not empty.${c.reset}`);
        console.error(
            `${c.dim}  Use "create-tempest-app ." to merge into the current directory.${c.reset}`,
        );
        process.exit(1);
    }

    console.log(`${c.dim}Scaffolding into ${destDir}…${c.reset}`);
    await mkdir(destDir, { recursive: true });
    await cp(TEMPLATE_DIR, destDir, { recursive: true });
    await fixDotfiles(destDir);
    await writeFreshPackageJson(destDir, arg, sdkVersion);

    console.log(`\n${c.green}✓ Done!${c.reset} Next steps:\n`);
    console.log(`  ${c.bold}cd ${arg}${c.reset}`);
    console.log(`  ${c.bold}npm install${c.reset}`);
    console.log(`  ${c.bold}npm run dev${c.reset}\n`);
}

main().catch((err) => {
    console.error(`${c.red}✗ ${err instanceof Error ? err.message : String(err)}${c.reset}`);
    process.exit(1);
});
