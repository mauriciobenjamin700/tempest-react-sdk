#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "template");

/** Files renamed on copy so they ship inside the npm tarball. */
const RENAME_ON_COPY = { _gitignore: ".gitignore", "_env.example": ".env.example" };

const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
};

function isValidName(name) {
    return /^[a-z0-9._-]+$/i.test(name) && !name.startsWith(".");
}

async function prompt(question, fallback) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
        const answer = (await rl.question(question)).trim();
        return answer || fallback;
    } finally {
        rl.close();
    }
}

async function isEmptyDir(dir) {
    if (!existsSync(dir)) return true;
    const entries = await readdir(dir);
    return entries.length === 0;
}

/** Walk the template and rename underscore-prefixed dotfiles after copy. */
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

async function main() {
    console.log(`\n${c.bold}${c.cyan}create-tempest-app${c.reset}\n`);

    let target = process.argv[2];
    if (!target) {
        target = await prompt(`Project name ${c.dim}(my-tempest-app)${c.reset}: `, "my-tempest-app");
    }

    if (!isValidName(target)) {
        console.error(`${c.red}✗ Invalid project name: "${target}"${c.reset}`);
        process.exit(1);
    }

    const destDir = resolve(process.cwd(), target);
    if (!(await isEmptyDir(destDir))) {
        console.error(`${c.red}✗ Directory "${target}" exists and is not empty.${c.reset}`);
        process.exit(1);
    }

    if (!existsSync(TEMPLATE_DIR) || !(await stat(TEMPLATE_DIR)).isDirectory()) {
        console.error(`${c.red}✗ Template not found at ${TEMPLATE_DIR}${c.reset}`);
        process.exit(1);
    }

    console.log(`${c.dim}Scaffolding into ${destDir}…${c.reset}`);
    await mkdir(destDir, { recursive: true });
    await cp(TEMPLATE_DIR, destDir, { recursive: true });
    await fixDotfiles(destDir);

    // Stamp the project name into package.json.
    const pkgPath = join(destDir, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    pkg.name = target;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    console.log(`\n${c.green}✓ Done!${c.reset} Next steps:\n`);
    console.log(`  ${c.bold}cd ${target}${c.reset}`);
    console.log(`  ${c.bold}npm install${c.reset}`);
    console.log(`  ${c.bold}npm run dev${c.reset}\n`);
}

main().catch((err) => {
    console.error(`${c.red}✗ ${err instanceof Error ? err.message : String(err)}${c.reset}`);
    process.exit(1);
});
