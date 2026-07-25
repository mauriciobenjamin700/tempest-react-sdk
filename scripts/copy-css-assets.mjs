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
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Files copied verbatim from `src/` to `dist/`, as `[from, to]` pairs. */
const ASSETS = [["src/styles/utilities.css", "dist/utilities.css"]];

async function main() {
    await mkdir(join(ROOT, "dist"), { recursive: true });

    for (const [from, to] of ASSETS) {
        await copyFile(join(ROOT, from), join(ROOT, to));
        console.log(`copy-css-assets: ${from} → ${to}`);
    }
}

main().catch((error) => {
    console.error("copy-css-assets failed:", error);
    process.exit(1);
});
