#!/usr/bin/env node
/**
 * Copy the standalone CSS assets into `dist/`.
 *
 * Vite's library build is configured with `cssCodeSplit: false`, so every
 * stylesheet reachable from the entries is merged into a single `dist/styles.css`.
 * That is what we want for the component styles — and exactly what we do *not*
 * want for an opt-in layer: `utilities.css` must stay a separate file that an app
 * imports on purpose, so it cannot be folded into the bundle.
 *
 * Hence a copy step instead of an import: the file never enters the module graph.
 *
 * Run automatically by `npm run build`.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Files copied verbatim from `src/` to `dist/`, as `[from, to]` pairs.
 *
 * `icons/virtual-id.d.ts` rides along for the same reason: it declares the legacy
 * `virtual:tempest-icons` module id, so it must reach `dist/` as a standalone
 * ambient declaration. The dts rollup would otherwise inline or drop it —
 * nothing imports it.
 */
const ASSETS = [
    ["src/styles/utilities.css", "dist/utilities.css"],
    ["src/icons/virtual-id.d.ts", "dist/icons-virtual-id.d.ts"],
];

/**
 * Declaration files that get a reference to the legacy virtual module id.
 *
 * An ambient `declare module "virtual:tempest-icons"` cannot live inside either
 * file: both have top-level exports, which makes the block a *module
 * augmentation*, and augmenting a module no resolver can find is an error. A
 * `/// <reference path>` line reaches the same declaration from a global file.
 *
 * Prepended here rather than written in `src/` because the dts rollup rewrites
 * both files from scratch on every build.
 */
const VIRTUAL_ID_REFERENCE = ["dist/icons.d.ts", "dist/icons-virtual.d.ts"];

const REFERENCE_LINE = '/// <reference path="./icons-virtual-id.d.ts" />';

async function main() {
    await mkdir(join(ROOT, "dist"), { recursive: true });

    for (const [from, to] of ASSETS) {
        await copyFile(join(ROOT, from), join(ROOT, to));
        console.log(`copy-css-assets: ${from} → ${to}`);
    }

    for (const target of VIRTUAL_ID_REFERENCE) {
        const path = join(ROOT, target);
        const contents = await readFile(path, "utf8");
        if (contents.includes(REFERENCE_LINE)) continue;
        await writeFile(path, `${REFERENCE_LINE}\n${contents}`);
        console.log(`copy-css-assets: referenced icons-virtual-id.d.ts from ${target}`);
    }
}

main().catch((error) => {
    console.error("copy-css-assets failed:", error);
    process.exit(1);
});
