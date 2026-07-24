import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const galleryReact = fileURLToPath(new URL("./node_modules/react", import.meta.url));
const galleryReactDom = fileURLToPath(new URL("./node_modules/react-dom", import.meta.url));

/**
 * Packages that keep state in a React context and therefore break when two
 * physical copies end up in the bundle: the provider from copy A is invisible
 * to the hooks from copy B ("No QueryClient set…"). The SDK is linked with
 * `file:..` and ships its own `node_modules`, so each of these must be pinned
 * to the gallery's single copy the same way React is.
 */
const SINGLETONS = ["@tanstack/react-query", "react-hook-form"] as const;

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: "127.0.0.1",
    },
    resolve: {
        // SDK is linked via `file:..` and ships its own `node_modules/react`.
        // Force every consumer (SDK + gallery + transient deps like React Query)
        // to the gallery's single physical React copy — otherwise React refuses
        // to mount with "Invalid hook call".
        alias: [
            { find: /^react$/, replacement: galleryReact },
            { find: /^react-dom$/, replacement: galleryReactDom },
            {
                find: /^react\/jsx-runtime$/,
                replacement: `${galleryReact}/jsx-runtime`,
            },
            {
                find: /^react\/jsx-dev-runtime$/,
                replacement: `${galleryReact}/jsx-dev-runtime`,
            },
            {
                find: /^react-dom\/client$/,
                replacement: `${galleryReactDom}/client`,
            },
            ...SINGLETONS.map((name) => ({
                find: new RegExp(`^${name.replace(/[/@]/g, "\\$&")}$`),
                replacement: fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url)),
            })),
        ],
        dedupe: ["react", "react-dom", ...SINGLETONS],
    },
    optimizeDeps: {
        // Force re-prebundle when alias targets change.
        force: true,
    },
});
