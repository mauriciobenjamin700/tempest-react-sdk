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
