import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Standalone build that bundles `src/sw.ts` (and the `tempest-react-sdk/sw`
 * helpers it imports) into a single classic service worker at `dist/sw.js`.
 *
 * Run after the app build via the `build:sw` script — `emptyOutDir: false`
 * keeps the app's `dist/` intact. The IIFE format produces a worker with no
 * `import`/`export` tokens, so it registers as a classic worker (no
 * `type: "module"` needed).
 */
export default defineConfig({
    build: {
        emptyOutDir: false,
        sourcemap: true,
        lib: {
            entry: resolve(__dirname, "src/sw.ts"),
            formats: ["iife"],
            name: "sw",
            fileName: () => "sw.js",
        },
        rollupOptions: {
            output: { entryFileNames: "sw.js", inlineDynamicImports: true },
        },
    },
});
