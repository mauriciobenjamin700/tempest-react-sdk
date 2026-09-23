import {
    createViteConfig,
    tempestCsp,
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
//  - tempestCsp        — writes the Content-Security-Policy into index.html, in dev
//    and build alike; `connect-src` comes from every URL-valued VITE_* variable, so
//    an origin the app calls at runtime has to live in `.env` or in
//    `tempestCsp({ connect: [...] })`.
export default createViteConfig({
    // proxy: { "/api": "http://127.0.0.1:8000" },
    plugins: [
        tempestPwaIcons({ source: "public/icon.svg", appleSplash: true }),
        tempestPwaManifest({ additionalUrls: ["/manifest.webmanifest", "/icon.svg"] }),
        tempestPwaDevSw(),
        tempestCsp(),
    ],
});
