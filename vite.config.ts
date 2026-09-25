import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { CompilerState, ExtractorConfig } from "@microsoft/api-extractor";
import type { IExtractorInvokeOptions } from "@microsoft/api-extractor";
import ts from "typescript";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

const LIB_ENTRIES: Record<string, string> = {
    "tempest-react-sdk": resolve(__dirname, "src/index.ts"),
    testing: resolve(__dirname, "src/testing/index.ts"),
    vite: resolve(__dirname, "src/vite/index.ts"),
    // Service-worker-context helpers only (push/notification/skip-waiting).
    // Pure, React-free — safe to bundle into a consuming app's `sw.ts`.
    sw: resolve(__dirname, "src/sw/index.ts"),
    // Recharts wrappers — `recharts` is an optional peer, externalized.
    charts: resolve(__dirname, "src/charts/index.ts"),
    // Rich text editor — tiptap is an optional peer, externalized.
    editor: resolve(__dirname, "src/editor/index.ts"),
    // Browser image processing for PWAs — canvas only, no deps.
    // Kept off the root entry so an app that never touches photos
    // does not pay for it.
    imaging: resolve(__dirname, "src/imaging/index.ts"),
    // Tabular inference — scikit-learn models exported to ONNX and
    // run in the browser. Shares the optional `onnxruntime-web`
    // peer with `vision`, externalized the same way.
    tabular: resolve(__dirname, "src/tabular/index.ts"),
    // Vision inference (vendored ort-vision-sdk-web) — onnxruntime-web
    // is an optional peer, externalized. Entry is `public.ts`, which
    // re-exports the vendored `index.ts` plus the SDK camera/luminance
    // hooks, so re-vendoring never clobbers the hook exports.
    vision: resolve(__dirname, "src/vision/public.ts"),
    // Brazilian locations + clickable UF map. Bundles the names
    // dataset + a simplified UF GeoJSON — kept off the root entry so
    // apps that don't need it pay nothing.
    br: resolve(__dirname, "src/br/index.ts"),
    // Icon-by-slug. The 25 generated shards are reachable only through
    // the dynamic imports in `generated/loaders.ts`, so they stay async
    // chunks in the consuming app instead of dragging ~2000 named
    // lucide imports into whatever imports `Icon`.
    icons: resolve(__dirname, "src/icons/index.ts"),
    // The static-registry module. Ships as a real, empty module so
    // `tempest-react-sdk/icons/virtual` resolves in every runner;
    // the `tempestIcons()` plugin overrides it with the generated
    // table when it is installed.
    "icons-virtual": resolve(__dirname, "src/icons/virtual.ts"),
};

let sharedCompilerState: CompilerState | undefined;

/**
 * Builds the `invokeOptions` handed to API Extractor so every entry's
 * declaration rollup reuses one TypeScript program.
 *
 * `vite-plugin-dts` (through `unplugin-dts`) rolls up each of the 12 lib
 * entries with its own `Extractor.invoke`, scheduled through `runParallel`
 * with `os.availableParallelism()` slots. `invoke` is synchronous, but every
 * entry parks on `await import("@microsoft/api-extractor")` first, so all the
 * invokes run back to back and each `ExtractorResult` keeps its
 * `compilerState.program` alive until the continuations drain: 12 programs
 * over every `.d.ts` under the repo root held at once. On a 12-core machine
 * that peaked at 7.8 GB RSS and needed an 8 GB heap (issue #387).
 *
 * API Extractor supports one shared `CompilerState` built with
 * `additionalEntryPoints` for exactly this case. The state is created lazily
 * through a getter because the entry `.d.ts` files only exist once the plugin
 * has written them; `unplugin-dts` spreads `invokeOptions` at invoke time, which
 * reads the getter then. The program mirrors the one the plugin would build:
 * same project folder, the `tsconfig.json` compiler options as override, and
 * the entries as analysis roots.
 *
 * @param root - Project root, used as the API Extractor project folder.
 * @param outDir - Directory holding the emitted entry declarations.
 * @returns The invoke options with a lazy, build-scoped `compilerState`.
 */
function sharedCompilerStateOptions(root: string, outDir: string): IExtractorInvokeOptions {
    return {
        get compilerState(): CompilerState {
            if (sharedCompilerState) return sharedCompilerState;
            const tsconfigPath = resolve(root, "tsconfig.json");
            const tsconfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile).config as {
                compilerOptions: Record<string, unknown>;
            };
            const [main, ...rest] = Object.keys(LIB_ENTRIES).map((name) =>
                resolve(outDir, `${name}.d.ts`),
            );
            const config = ExtractorConfig.prepare({
                configObject: {
                    projectFolder: root,
                    mainEntryPointFilePath: main as string,
                    compiler: {
                        tsconfigFilePath: tsconfigPath,
                        overrideTsconfig: {
                            $schema: "http://json.schemastore.org/tsconfig",
                            compilerOptions: tsconfig.compilerOptions,
                        },
                    },
                },
                configObjectFullPath: resolve(root, "api-extractor.json"),
                packageJsonFullPath: resolve(root, "package.json"),
            });
            sharedCompilerState = CompilerState.create(config, {
                additionalEntryPoints: rest,
                typescriptCompilerFolder: dirname(
                    createRequire(import.meta.url).resolve("typescript/package.json"),
                ),
            });
            return sharedCompilerState;
        },
    };
}

/**
 * Drops the shared API Extractor program at the start of every build, so
 * `vite build --watch` rolls up the declarations of the current rebuild rather
 * than the first one.
 *
 * @returns The Vite plugin that resets the cached `CompilerState`.
 */
function resetSharedCompilerState(): Plugin {
    return {
        name: "tempest:reset-dts-compiler-state",
        buildStart(): void {
            sharedCompilerState = undefined;
        },
    };
}

export default defineConfig({
    plugins: [
        react(),
        resetSharedCompilerState(),
        dts({
            tsconfigPath: "./tsconfig.json",
            insertTypesEntry: true,
            bundleTypes: {
                invokeOptions: sharedCompilerStateOptions(__dirname, resolve(__dirname, "dist")),
            },
            include: ["src"],
        }),
    ],
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    css: {
        modules: {
            localsConvention: "camelCaseOnly",
            generateScopedName: "tempest_[local]_[hash:base64:5]",
        },
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        cssCodeSplit: false,
        lib: {
            entry: LIB_ENTRIES,
            name: "TempestReactSdk",
            formats: ["es", "cjs"],
            fileName: (format, entryName) => {
                const ext = format === "es" ? "js" : "cjs";
                return `${entryName}.${ext}`;
            },
        },
        rollupOptions: {
            external: [
                "react",
                "react-dom",
                "react/jsx-runtime",
                "react/jsx-dev-runtime",
                "zod",
                "zustand",
                "zustand/middleware",
                "@tanstack/react-query",
                "lucide-react",
                "dexie",
                "fflate",
                "react-hook-form",
                "react-router",
                "recharts",
                "@tiptap/react",
                "@tiptap/starter-kit",
                "@tiptap/core",
                "@tiptap/pm",
                "onnxruntime-web",
                // Optional peer for the geo module's Leaflet tile layer (lazy).
                "leaflet",
                // `tempest-react-sdk/vite` is a Node-only config helper — keep
                // vite + its react plugin (and node builtins) out of the bundle.
                "vite",
                "@vitejs/plugin-react",
                "esbuild",
                "node:path",
                "node:url",
                "node:fs",
                "node:fs/promises",
                "node:crypto",
            ],
            output: [
                { format: "es", entryFileNames: "[name].js" },
                { format: "cjs", entryFileNames: "[name].cjs" },
            ].map(({ format, entryFileNames }) => ({
                format: format as "es" | "cjs",
                // One output file per source module instead of one bundled blob.
                // Without it the whole barrel lands in a single file whose
                // statements a consumer's bundler cannot prove side-effect-free,
                // so importing `cn` alone dragged in ~8.5 KB gzip of unrelated
                // components. Preserving the module graph drops that floor to
                // ~0.4 KB and lets `sideEffects` in package.json do its job.
                preserveModules: true,
                entryFileNames,
                globals: {
                    react: "React",
                    "react-dom": "ReactDOM",
                    "react/jsx-runtime": "jsxRuntime",
                    zod: "Zod",
                    zustand: "Zustand",
                    "@tanstack/react-query": "ReactQuery",
                    "lucide-react": "LucideReact",
                },
                assetFileNames: (assetInfo: { name?: string }) => {
                    if (assetInfo.name === "style.css" || assetInfo.name?.endsWith(".css")) {
                        return "styles.css";
                    }
                    return assetInfo.name ?? "[name][extname]";
                },
            })),
        },
    },
});
