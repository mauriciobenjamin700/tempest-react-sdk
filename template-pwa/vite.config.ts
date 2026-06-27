import {
    createViteConfig,
    tempestPwaDevSw,
    tempestPwaIcons,
    tempestPwaManifest,
} from "tempest-react-sdk/vite";

// `createViteConfig` wires `@vitejs/plugin-react`, the `@` → `src` alias and
// dev-server defaults. The three PWA plugins (order matters):
//  - tempestPwaIcons   — rasterizes public/icon.svg into the PNG icon set (sharp).
//  - tempestPwaManifest — emits dist/precache-manifest.json (it sees the icons
//    above because they're emitted first), for offline app-shell precaching.
//  - tempestPwaDevSw   — serves /sw.js (and an empty manifest) under `npm run dev`.
export default createViteConfig({
    // proxy: { "/api": "http://127.0.0.1:8000" },
    plugins: [
        tempestPwaIcons({ source: "public/icon.svg" }),
        tempestPwaManifest({ additionalUrls: ["/manifest.webmanifest", "/icon.svg"] }),
        tempestPwaDevSw(),
    ],
});
