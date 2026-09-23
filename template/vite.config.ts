import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

// One call wires `@vitejs/plugin-react`, the `@` → `src` alias and dev-server
// defaults. Override anything (proxy, port, build target) inline.
//
// `tempestCsp()` writes a Content-Security-Policy into index.html, in dev and in
// the build alike. Its `connect-src` comes from every URL-valued VITE_* variable
// (VITE_API_URL, …), so an origin you call at runtime has to live in `.env` or
// in `tempestCsp({ connect: [...] })` — a missing one fails as
// `TypeError: Failed to fetch`, with a CSP error in the browser console.
export default createViteConfig({
    // proxy: { "/api": "http://127.0.0.1:8000" },
    plugins: [tempestCsp()],
});
