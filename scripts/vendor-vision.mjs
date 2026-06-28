#!/usr/bin/env node
// Re-vendor `src/vision/` from the local `ort-vision-sdk` repo's web package.
//
// The vision subpath ships a COPY of `@mauriciobenjamin700/ort-vision-sdk-web`
// (no npm dependency). Run this after the upstream repo updates to pull the
// latest source in:
//
//   npm run vendor:vision
//   # or point at a different checkout:
//   ORT_VISION_SRC=/path/to/ort-vision-sdk/sdk-js-web node scripts/vendor-vision.mjs
//
// It copies the source tree into src/vision/, drops the `.js` import extensions,
// stamps the provenance header (with the upstream version), and runs eslint+
// prettier. Files not present upstream (e.g. vision.test.ts) are preserved.
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = resolve(
    REPO_ROOT,
    process.env.ORT_VISION_SRC ?? "../ort-vision-sdk/sdk-js-web",
);
const SRC = join(PKG_DIR, "src");
const DST = join(REPO_ROOT, "src", "vision");

function header(version) {
    return `/**
 * \`tempest-react-sdk/vision\` — browser computer-vision inference with ONNX
 * Runtime Web (classification, detection, segmentation).
 *
 * Vendored from \`@mauriciobenjamin700/ort-vision-sdk-web@${version}\` (MIT, same
 * author) so it ships inside this SDK without an extra package install.
 * \`onnxruntime-web\` stays an optional peer dependency — install it (and ship
 * the matching \`.wasm\` files) only when you use this subpath.
 *
 * Do not hand-edit — regenerate with \`npm run vendor:vision\`.
 */`;
}

/** Recursively copy every file under `srcDir` into `dstDir` (overwriting). */
async function copyTree(srcDir, dstDir) {
    await mkdir(dstDir, { recursive: true });
    for (const entry of await readdir(srcDir, { withFileTypes: true })) {
        const from = join(srcDir, entry.name);
        const to = join(dstDir, entry.name);
        if (entry.isDirectory()) await copyTree(from, to);
        else await cp(from, to);
    }
}

/** Collect every `.ts` file under `dir`. */
async function listTs(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await listTs(full, out);
        else if (entry.name.endsWith(".ts")) out.push(full);
    }
    return out;
}

async function main() {
    if (!existsSync(SRC)) {
        console.error(`✗ ort-vision-sdk web source not found at ${SRC}`);
        console.error("  Clone it next to this repo, or set ORT_VISION_SRC.");
        process.exit(1);
    }
    const version = JSON.parse(await readFile(join(PKG_DIR, "package.json"), "utf8")).version;

    console.log(`→ vendoring ort-vision-sdk-web@${version} from ${relative(REPO_ROOT, SRC)}`);
    await copyTree(SRC, DST);

    for (const file of await listTs(DST)) {
        let code = await readFile(file, "utf8");
        // Drop `.js` extensions from relative import/export specifiers.
        code = code.replace(/(from\s+"\.{1,2}\/[^"]*)\.js"/g, '$1"');
        // Stamp the provenance header onto the entry barrel.
        if (file === join(DST, "index.ts")) {
            code = code.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
            code = `${header(version)}\n\n${code}`;
        }
        await writeFile(file, code);
    }

    console.log("→ eslint --fix + prettier on src/vision");
    execSync("npx eslint src/vision --fix", { cwd: REPO_ROOT, stdio: "inherit" });
    execSync("npx prettier --write src/vision", { cwd: REPO_ROOT, stdio: "inherit" });
    console.log(`✓ vendored vision @${version}. Review the diff, then commit.`);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
