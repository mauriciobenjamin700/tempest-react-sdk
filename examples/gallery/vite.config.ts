import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const galleryReact = fileURLToPath(new URL("./node_modules/react", import.meta.url));
const galleryReactDom = fileURLToPath(new URL("./node_modules/react-dom", import.meta.url));

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
        ],
        dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
        // Force re-prebundle when alias targets change.
        force: true,
    },
});
