import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig({
    plugins: [
        react(),
        dts({
            tsconfigPath: "./tsconfig.json",
            insertTypesEntry: true,
            rollupTypes: true,
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
            entry: {
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
                // Vision inference (vendored ort-vision-sdk-web) — onnxruntime-web
                // is an optional peer, externalized. Entry is `public.ts`, which
                // re-exports the vendored `index.ts` plus the SDK camera/luminance
                // hooks, so re-vendoring never clobbers the hook exports.
                vision: resolve(__dirname, "src/vision/public.ts"),
                // Brazilian locations + clickable UF map. Bundles the names
                // dataset + a simplified UF GeoJSON — kept off the root entry so
                // apps that don't need it pay nothing.
                br: resolve(__dirname, "src/br/index.ts"),
            },
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
                "react-hook-form",
                "react-router",
                "react-router-dom",
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
                "node:fs/promises",
            ],
            output: {
                globals: {
                    react: "React",
                    "react-dom": "ReactDOM",
                    "react/jsx-runtime": "jsxRuntime",
                    zod: "Zod",
                    zustand: "Zustand",
                    "@tanstack/react-query": "ReactQuery",
                    "lucide-react": "LucideReact",
                },
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name === "style.css" || assetInfo.name?.endsWith(".css")) {
                        return "styles.css";
                    }
                    return assetInfo.name ?? "[name][extname]";
                },
            },
        },
    },
});
