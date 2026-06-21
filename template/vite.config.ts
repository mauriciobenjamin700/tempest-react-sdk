import { createViteConfig } from "tempest-react-sdk/vite";

// One call wires `@vitejs/plugin-react`, the `@` → `src` alias and dev-server
// defaults. Override anything (proxy, port, build target) inline.
export default createViteConfig({
    // proxy: { "/api": "http://127.0.0.1:8000" },
});
